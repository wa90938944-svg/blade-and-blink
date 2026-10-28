const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const G = require('./public/shared.js');
const { createStore, rankOf, OWNER_NAME, OWNER_KEY } = require('./store.js');

const PORT = process.env.PORT || 3000;
const WIN_ROUNDS = 5;

const store = createStore(process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/blade_and_blink');

const app = express();
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
const server = http.createServer(app);
const io = new Server(server);

// ---------- Matchmaking & State ----------
let queue = [];
const rooms = new Map();
const parties = new Map();

// Slither.io style persistent 24/7 drop-in/drop-out FFA World
const ffaWorld = {
  id: 'ffa_world',
  users: [],
  m: G.createFFA(),
  inp: [],
  meta: [],
  mode: 'ffa',
  ffa: true
};
rooms.set(ffaWorld.id, ffaWorld);

function generatePartyCode() {
  var code;
  do {
    code = 'INK-' + Math.floor(100 + Math.random() * 900);
  } while (parties.has(code));
  return code;
}

function tryMatch() {
  const now = Date.now();
  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i], b = queue[j];
      const waited = Math.max(now - a.since, now - b.since) / 1000;
      if (Math.abs(a.mmr - b.mmr) <= 100 + 50 * waited) {
        queue.splice(j, 1); queue.splice(i, 1);
        startRoom([a, b], '1v1', false);
        return tryMatch();
      }
    }
  }
}
setInterval(tryMatch, 1000);

async function startRoom(users, mode, unranked) {
  const id = crypto.randomBytes(4).toString('hex');
  const winRounds = mode === '2v2' ? 5 : WIN_ROUNDS;
  const matchObj = mode === '2v2' ? G.create2v2(winRounds) : G.create(winRounds);
  const inps = users.map(() => ({}));
  const room = { id, users, m: matchObj, inp: inps, done: false, mode: mode || '1v1', unranked: !!unranked };
  rooms.set(id, room);

  const names = users.map(u => u.name);
  const ranks = users.map(u => rankOf(u.mmr, u.name));
  const mmrs = users.map(u => u.mmr);
  const looks = [];
  for (let i = 0; i < users.length; i++) {
    const prof = await store.profile(users[i].key);
    looks.push((prof && prof.equipped && prof.equipped.look) || 'none');
    if (room.m.p[i]) {
      room.m.p[i].isOwner = prof.isOwner;
      room.m.p[i].isAdmin = prof.isAdmin;
    }
  }

  const teams = mode === '2v2' ? [0, 0, 1, 1] : [0, 1];
  const info = { id, names, ranks, mmrs, looks, mode: room.mode, unranked: room.unranked, teams };

  users.forEach((u, i) => {
    u.s.join(id);
    u.s.data.room = room;
    u.s.data.idx = i;
    u.s.emit('match', Object.assign({ you: i }, info));
  });
  console.log(`[room ${id}] ${mode} started: ${names.join(', ')}`);
}

// Slither-style immediate drop-in
async function joinFFA(user) {
  const m = ffaWorld.m;
  const prof = await store.profile(user.key);
  const look = (prof && prof.equipped && prof.equipped.look) || 'none';
  const rx = 100 + Math.random() * (G.FFA_W - 200);
  const ry = 100 + Math.random() * (G.FFA_H - 200);

  let slot = -1;
  for (let i = 0; i < ffaWorld.users.length; i++) {
    if (!ffaWorld.users[i]) { slot = i; break; }
  }

  if (slot === -1) {
    slot = ffaWorld.users.length;
    ffaWorld.users.push(user);
    ffaWorld.inp.push({});
    ffaWorld.meta.push({ name: user.name, mmr: user.mmr, look, rank: rankOf(user.mmr, user.name) });
    m.p.push(null);
  } else {
    ffaWorld.users[slot] = user;
    ffaWorld.inp[slot] = {};
    ffaWorld.meta[slot] = { name: user.name, mmr: user.mmr, look, rank: rankOf(user.mmr, user.name) };
  }

  const newP = {
    i: slot, x: rx, y: ry, fa: Math.random() * 6.283, ch: 3, rc: 0, st: 0, sw: -1, hs: [],
    pa: -1, bc: 0, sc: 0, bw: 0, bdx: 0, bdy: 0, dead: false, ix: 0, iy: 0, spd: 200,
    team: slot, extract: 0, points: 0, kills: 0, parries: 0, blinks: 0,
    god: false, noCd: false, isMinion: false, ownerIdx: -1, at: 0, ax: 0, ay: 0,
    r: 13, reach: 56, tier: 'player', scale: 1.0, maxLives: 1, maxHearts: 1, lives: 1, hearts: 1,
    unparryable: false, bossTelegraph: 0, isOwner: prof.isOwner, isAdmin: prof.isAdmin
  };
  m.p[slot] = newP;

  user.s.join(ffaWorld.id);
  user.s.data.room = ffaWorld;
  user.s.data.idx = slot;

  broadcastFFAMeta();
  console.log(`[FFA Drop-in] ${user.name} joined slot ${slot} (${G.FFA_W}x${G.FFA_H})`);
}

function broadcastFFAMeta() {
  const meta = ffaWorld.meta.map(m => m || { name: 'Fighter', look: 'none', rank: 'Bronze' });
  io.to(ffaWorld.id).emit('ffa_meta', {
    names: meta.map(m => m.name),
    looks: meta.map(m => m.look),
    ranks: meta.map(m => m.rank),
    boundW: G.FFA_W,
    boundH: G.FFA_H
  });
}

function leaveFFA(user, extracted, points) {
  const idx = user.s.data.idx;
  if (user.s.data.room !== ffaWorld || idx === undefined) return;
  user.s.leave(ffaWorld.id);
  user.s.data.room = null;
  user.s.data.idx = undefined;

  if (ffaWorld.m.p[idx]) ffaWorld.m.p[idx].dead = true;
  ffaWorld.users[idx] = null;
  ffaWorld.meta[idx] = null;

  broadcastFFAMeta();
}

async function finish(room, winner, forfeit, quit) {
  if (room.done) return;
  room.done = true;
  rooms.delete(room.id);

  if (room.unranked) {
    room.users.forEach(async (u) => {
      if (!u) return;
      u.s.leave(room.id);
      u.s.data.room = null;
      const prof = await store.profile(u.key);
      u.s.emit('end', {
        unranked: true, mode: room.mode, winner, you: u.s.data.idx, forfeit: !!forfeit, quit,
        delta: 0, oldRank: prof.rank, score: room.m.score, profile: prof
      });
    });
    return;
  }

  const wKey = room.users[winner].key;
  const lKey = room.users[1 - winner].key;
  const res = await store.record(wKey, lKey);
  await store.flush();

  room.users.forEach(async (u, i) => {
    if (!u) return;
    const r = i === winner ? res.win : res.lose;
    u.s.leave(room.id);
    u.s.data.room = null;
    const prof = await store.profile(u.key);
    u.s.emit('end', {
      winner, you: i, forfeit: !!forfeit, quit, delta: r.delta, oldRank: r.oldRank,
      score: room.m.score, profile: prof
    });
  });
}

// 60 FPS authoritative game loop
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  for (const room of rooms.values()) {
    const ev = G.tick(room.m, room.inp, dt);
    room.inp.forEach((u) => { if (u) { u.sw = u.pa = u.bl = false; } });
    io.to(room.id).emit('s', { m: room.m, ev });

    (ev || []).forEach(async (e) => {
      if (e.t === 'extract') {
        const u = room.users[e.i];
        if (u) {
          const res = await store.bankExtracted(u.key, e.points);
          const prof = await store.profile(u.key);
          leaveFFA(u, true, e.points);
          u.s.emit('end', {
            mode: 'ffa', you: e.i, extracted: true, points: e.points,
            delta: res ? res.delta : 0, oldRank: res ? res.oldRank : prof.rank, profile: prof
          });
        }
      } else if (e.t === 'kill' && room.ffa) {
        const victim = room.users[e.i];
        if (victim) {
          const prof = await store.profile(victim.key);
          leaveFFA(victim, false, 0);
          victim.s.emit('end', {
            mode: 'ffa', you: e.i, extracted: false, points: 0,
            delta: 0, oldRank: prof.rank, profile: prof
          });
        }
      }
    });

    if (room.m.phase === 'over' && !room.ffa) {
      finish(room, room.m.winner, false);
    }
  }
}, 1000 / 60);

setInterval(() => {
  const ffaCount = ffaWorld.users.filter(Boolean).length;
  io.emit('stats', { online: io.engine.clientsCount, queue: queue.length, ffa: ffaCount });
}, 5000);

const num = (v, lo, hi) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; };
function limiter(max, ms) {
  ms = ms || 1000;
  let n = 0, t = Date.now();
  return () => { const now = Date.now(); if (now - t >= ms) { t = now; n = 0; } return ++n <= max; };
}
function ipOf(s) {
  const h = s.handshake || {}, xf = h.headers && h.headers['x-forwarded-for'];
  if (xf && (process.env.RENDER || process.env.TRUST_PROXY)) return String(xf).split(',').pop().trim();
  return h.address || 'unknown';
}

const authed = (s, token) => !!s.data.key && store.sessionValid(s.data.sh, s.data.key) && (token === undefined || store.tokenMatches(token, s.data.sh));

async function getPriv(s) {
  if (!s.data.key) return { o: false, a: false };
  const p = await store.profile(s.data.key);
  return p ? { o: p.isOwner, a: p.isOwner || p.isAdmin } : { o: false, a: false };
}

function enter(s, r) {
  for (const other of io.sockets.sockets.values()) {
    if (other !== s && other.data.key === r.key) { other.emit('kicked'); other.disconnect(true); }
  }
  queue = queue.filter((q) => q.s !== s);
  s.data.key = r.key; s.data.sh = r.sh;
}

function handle(cb, fn) {
  if (typeof cb !== 'function') return;
  Promise.resolve().then(fn).catch((e) => { console.error(e); cb({ err: 'Server error, please try again' }); });
}

io.on('connection', (s) => {
  const okIn = limiter(120), okAct = limiter(30);
  const okAuth = limiter(10, 60000), okSave = limiter(5), okEquip = limiter(8);

  s.on('register', (d, cb) => handle(cb, async () => {
    if (!okAuth()) return cb({ err: 'Slow down for a moment' });
    if (s.data.room) return cb({ err: 'Finish your match first' });
    d = d || {};
    const r = await store.register(d.name, d.password, ipOf(s));
    if (r.err) return cb({ err: r.err });
    enter(s, r);
    cb({ ok: true, profile: await store.profile(r.key), token: r.token });
  }));

  s.on('login', (d, cb) => handle(cb, async () => {
    if (!okAuth()) return cb({ err: 'Slow down for a moment' });
    if (s.data.room) return cb({ err: 'Finish your match first' });
    d = d || {};
    if (d.password === undefined && d.token !== undefined) return cb({ err: 'Your game page is out of date. Hard refresh with Ctrl+Shift+R.' });
    const r = await store.login(d.name, d.password, ipOf(s));
    if (r.err) return cb({ err: r.err });
    enter(s, r);
    cb({ ok: true, profile: await store.profile(r.key), token: r.token });
  }));

  s.on('resume', (d, cb) => handle(cb, async () => {
    if (!okAuth()) return cb({ err: 'Slow down for a moment' });
    if (s.data.room) return cb({ err: 'Finish your match first' });
    d = d || {};
    const r = store.resume(d.token);
    if (r.legacy) return cb({ legacy: true, name: r.name });
    if (r.err) return cb({ err: r.err });
    const p = await store.profile(r.key);
    if (!p) return cb({ err: 'Account unavailable or banned' });
    enter(s, r);
    cb({ ok: true, profile: p, token: d.token });
  }));

  s.on('claim', (d, cb) => handle(cb, async () => {
    if (!okAuth()) return cb({ err: 'Slow down for a moment' });
    d = d || {};
    const r = await store.claim(d.token, d.password, ipOf(s));
    if (r.err) return cb({ err: r.err });
    enter(s, r);
    cb({ ok: true, profile: await store.profile(r.key), token: r.token });
  }));

  s.on('logout', (cb) => {
    const done = typeof cb === 'function' ? cb : () => {};
    if (s.data.room && s.data.room !== ffaWorld) return done({ err: 'Finish your match first' });
    if (s.data.room === ffaWorld) leaveFFA({ s }, false, 0);
    if (s.data.sh) store.logout(s.data.sh);
    queue = queue.filter((q) => q.s !== s);
    leaveParty(s);
    s.data.key = s.data.sh = undefined;
    done({ ok: true });
  });

  s.on('save', (d, cb) => handle(cb, async () => {
    if (!okSave()) return cb({ err: 'Slow down for a moment' });
    d = d || {};
    if (!authed(s, typeof d.token === 'string' ? d.token : '')) { s.emit('unauth'); return cb({ err: 'Please log in again' }); }
    const r = await store.saveData(s.data.key, d.equipped);
    if (r.err) return cb({ err: r.err });
    cb({ ok: true, savedAt: r.savedAt, profile: await store.profile(s.data.key) });
  }));

  s.on('equip', (d, cb) => handle(cb, async () => {
    if (!okEquip()) return cb({ err: 'Slow down for a moment' });
    if (!authed(s)) { s.emit('unauth'); return cb({ err: 'Please log in again' }); }
    const r = await store.equip(s.data.key, d && d.look);
    if (r.err) return cb({ err: r.err });
    cb({ ok: true, profile: await store.profile(s.data.key) });
  }));

  s.on('queue', async () => {
    if (s.data.room || queue.some((q) => q.s === s)) return;
    if (!authed(s)) { s.emit('unauth'); return; }
    const p = await store.profile(s.data.key);
    queue.push({ s, key: s.data.key, name: p.name, mmr: p.mmr, since: Date.now() });
    tryMatch();
  });

  s.on('unqueue', () => { queue = queue.filter((q) => q.s !== s); });

  // Direct drop-in to persistent Slither-style FFA
  s.on('joinFFA', async (cb) => handle(cb, async () => {
    if (s.data.room) return cb({ err: 'Already in a match' });
    if (!authed(s)) { s.emit('unauth'); return cb({ err: 'Please log in first' }); }
    const p = await store.profile(s.data.key);
    await joinFFA({ s, key: s.data.key, name: p.name, mmr: p.mmr });
    cb({ ok: true, idx: s.data.idx, boundW: G.FFA_W, boundH: G.FFA_H });
  }));

  // ---------- Private Parties ----------
  function broadcastParty(party) {
    const list = party.members.map(m => ({ name: m.name, key: m.key, ready: !!m.ready }));
    party.members.forEach(m => {
      m.s.emit('partyUpdate', { code: party.code, host: party.host === m.key, mode: party.mode, members: list });
    });
  }

  function leaveParty(socket) {
    for (const [code, party] of parties.entries()) {
      const idx = party.members.findIndex(m => m.s === socket);
      if (idx >= 0) {
        const leaving = party.members[idx];
        party.members.splice(idx, 1);
        if (party.members.length === 0) {
          parties.delete(code);
        } else {
          if (party.host === leaving.key) party.host = party.members[0].key;
          broadcastParty(party);
        }
        break;
      }
    }
  }

  s.on('partyCreate', async (d, cb) => handle(cb, async () => {
    if (!authed(s)) { s.emit('unauth'); return cb({ err: 'Log in first' }); }
    leaveParty(s);
    const p = await store.profile(s.data.key);
    const code = generatePartyCode();
    const mode = (d && d.mode === '2v2') ? '2v2' : '1v1';
    const party = { code, host: s.data.key, mode, members: [{ s, key: s.data.key, name: p.name, mmr: p.mmr, ready: true }] };
    parties.set(code, party);
    broadcastParty(party);
    cb({ ok: true, code });
  }));

  s.on('partyJoin', async (d, cb) => handle(cb, async () => {
    if (!authed(s)) { s.emit('unauth'); return cb({ err: 'Log in first' }); }
    d = d || {};
    const code = String(d.code || '').trim().toUpperCase();
    const party = parties.get(code);
    if (!party) return cb({ err: 'Party not found' });
    const max = party.mode === '2v2' ? 4 : 2;
    if (party.members.length >= max) return cb({ err: 'Party is full' });
    leaveParty(s);
    const p = await store.profile(s.data.key);
    party.members.push({ s, key: s.data.key, name: p.name, mmr: p.mmr, ready: false });
    broadcastParty(party);
    cb({ ok: true, code });
  }));

  s.on('partySetMode', (d) => {
    for (const party of parties.values()) {
      if (party.host === s.data.key) {
        party.mode = d && d.mode === '2v2' ? '2v2' : '1v1';
        broadcastParty(party);
        break;
      }
    }
  });

  s.on('partyToggleReady', () => {
    for (const party of parties.values()) {
      const m = party.members.find(x => x.s === s);
      if (m) {
        m.ready = !m.ready;
        broadcastParty(party);
        break;
      }
    }
  });

  s.on('partyStart', async (cb) => handle(cb, async () => {
    for (const [code, party] of parties.entries()) {
      if (party.host === s.data.key) {
        const need = party.mode === '2v2' ? 4 : 2;
        if (party.members.length !== need) return cb({ err: 'Need ' + need + ' players' });
        const ready = party.members.every(m => m.ready || m.key === party.host);
        if (!ready) return cb({ err: 'All players must be ready' });
        parties.delete(code);
        startRoom(party.members, party.mode, true);
        return cb({ ok: true });
      }
    }
  }));

  s.on('partyLeave', () => { leaveParty(s); });

  // ---------- Admin Operations ----------
  s.on('admin_get_users', async (d, cb) => handle(cb, async () => {
    const priv = await getPriv(s);
    if (!priv.a) return cb({ err: 'Unauthorized' });
    cb({ ok: true, users: await store.adminGetUsers(d && d.search) });
  }));

  s.on('admin_set_ban', async (d, cb) => handle(cb, async () => {
    const priv = await getPriv(s);
    if (!priv.a) return cb({ err: 'Unauthorized' });
    d = d || {};
    const res = await store.adminSetBan(d.key, d.banned, d.reason);
    if (res.err) return cb({ err: res.err });
    if (d.banned) {
      for (const other of io.sockets.sockets.values()) {
        if (other.data.key === d.key) {
          other.emit('kicked');
          other.disconnect(true);
        }
      }
    }
    cb({ ok: true, banned: res.banned });
  }));

  s.on('admin_set_admin', async (d, cb) => handle(cb, async () => {
    const priv = await getPriv(s);
    if (!priv.o) return cb({ err: 'Unauthorized (Owner Only)' });
    d = d || {};
    const res = await store.adminSetAdmin(d.key, d.isAdmin);
    if (res.err) return cb({ err: res.err });
    cb({ ok: true, isAdmin: res.isAdmin });
  }));

  s.on('admin_get_bans', async (cb) => handle(cb, async () => {
    const priv = await getPriv(s);
    if (!priv.a) return cb({ err: 'Unauthorized' });
    cb({ ok: true, bans: await store.adminGetBans() });
  }));

  s.on('admin_set_mmr', async (d, cb) => handle(cb, async () => {
    const priv = await getPriv(s);
    if (!priv.o) return cb({ err: 'Unauthorized' });
    d = d || {};
    const res = await store.adminSetMmr(d.key, d.mmr);
    if (res.err) return cb({ err: res.err });
    cb({ ok: true, mmr: res.mmr, rank: res.rank });
  }));

  s.on('admin_match_kill_enemies', async () => {
    const priv = await getPriv(s);
    const room = s.data.room;
    if (!room || !priv.a) return;
    const myIdx = s.data.idx;
    room.m.p.forEach((p, idx) => {
      if (idx !== myIdx && p && !p.dead && !p.isMinion && !p.isOwner) {
        p.dead = true;
      }
    });
  });

  s.on('admin_match_toggle_god', async (cb) => {
    const priv = await getPriv(s);
    const room = s.data.room;
    if (!room || !priv.o) return;
    const p = room.m.p[s.data.idx];
    if (p) {
      p.god = !p.god;
      if (typeof cb === 'function') cb({ god: p.god });
    }
  });

  s.on('admin_match_toggle_nocd', async (cb) => {
    const priv = await getPriv(s);
    const room = s.data.room;
    if (!room || !priv.o) return;
    const p = room.m.p[s.data.idx];
    if (p) {
      p.noCd = !p.noCd;
      if (typeof cb === 'function') cb({ noCd: p.noCd });
    }
  });

  s.on('admin_spawn_bodyguard', async (cb) => {
    const priv = await getPriv(s);
    const room = s.data.room;
    if (!room || !priv.a) return;
    const myIdx = s.data.idx;
    const ev = [];
    const minion = G.spawnBodyguard(room.m, myIdx, ev);
    if (minion) {
      room.inp.push({});
      io.to(room.id).emit('s', { m: room.m, ev: ev });
      if (typeof cb === 'function') cb({ ok: true, count: room.m.p.filter(x => x && x.isMinion && x.ownerIdx === myIdx && !x.dead).length });
    }
  });

  s.on('admin_become_tetanus', async (cb) => handle(cb, async () => {
    const priv = await getPriv(s);
    if (!priv.o) return cb({ err: 'Unauthorized' });
    const room = s.data.room;
    if (!room || !room.m) return;
    const p = room.m.p[s.data.idx];
    if (p) {
      p.tier = 'tetanus';
      p.maxLives = 3; p.lives = 3;
      p.maxHearts = 5; p.hearts = 5;
      p.reach = 92;
      p.scale = 2.2;
      p.r = 13 * 2.2;
      p.spd = 175;
      io.to(room.id).emit('s', { m: room.m, ev: [] });
      cb({ ok: true });
    }
  }));

  // ---------- Gameplay Inputs ----------
  s.on('in', (d) => {
    const room = s.data.room;
    if (!room || !okIn()) return;
    d = d || {};
    const u = room.inp[s.data.idx];
    if (!u) return;
    u.x = num(d.x, -1, 1);
    u.y = num(d.y, -1, 1);
    u.aim = Number.isFinite(+d.aim) && d.aim !== null ? +d.aim : undefined;
  });

  s.on('act', (k) => {
    const room = s.data.room;
    if (!room || !okAct() || !['sw', 'pa', 'bl'].includes(k)) return;
    if (room.inp[s.data.idx]) room.inp[s.data.idx][k] = true;
  });

  s.on('forfeit', () => {
    const room = s.data.room;
    if (room === ffaWorld) {
      leaveFFA({ s }, false, 0);
      s.emit('end', { mode: 'ffa', extracted: false, points: 0, delta: 0 });
      return;
    }
    if (room) finish(room, 1 - s.data.idx, true, s.data.idx);
  });

  s.on('top', async (cb) => { if (typeof cb === 'function') cb(await store.top(10)); });
  s.on('pg', (cb) => { if (typeof cb === 'function') cb(); });

  s.on('disconnect', () => {
    queue = queue.filter((q) => q.s !== s);
    leaveParty(s);
    if (s.data.room === ffaWorld) {
      leaveFFA({ s }, false, 0);
    } else if (s.data.room) {
      finish(s.data.room, 1 - s.data.idx, true, s.data.idx);
    }
  });
});

function bye() { store.flush(); process.exit(0); }
process.on('SIGTERM', bye);
process.on('SIGINT', bye);

server.listen(PORT, () => console.log(`Blade & Blink running on http://localhost:${PORT}`));