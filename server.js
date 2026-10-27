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
let ffaQueue = [];
const rooms = new Map();
const parties = new Map();

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

  if (ffaQueue.length >= 2) {
    const batch = ffaQueue.splice(0, 4);
    startFFARoom(batch);
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

async function startFFARoom(users) {
  const id = crypto.randomBytes(4).toString('hex');
  const matchObj = G.createFFA(users);
  const inps = users.map(() => ({}));
  const room = { id, users, m: matchObj, inp: inps, done: false, mode: 'ffa', ffa: true };
  rooms.set(id, room);

  const names = users.map(u => u.name);
  const ranks = users.map(u => rankOf(u.mmr, u.name));
  const mmrs = users.map(u => u.mmr);
  const looks = [];
  for (let i = 0; i < users.length; i++) {
    const prof = await store.profile(users[i].key);
    looks.push((prof && prof.equipped && prof.equipped.look) || 'none');
  }

  const info = { id, names, ranks, mmrs, looks, mode: 'ffa', shrines: matchObj.shrines };
  users.forEach((u, i) => {
    u.s.join(id);
    u.s.data.room = room;
    u.s.data.idx = i;
    u.s.emit('match', Object.assign({ you: i }, info));
  });
  console.log(`[FFA ${id}] extraction arena started with ${names.length} fighters`);
}

async function finish(room, winner, forfeit, quit) {
  if (room.done) return;
  room.done = true;
  rooms.delete(room.id);

  if (room.ffa) {
    room.users.forEach(async (u, i) => {
      const p = room.m.p[i];
      const banked = p && !p.rip && p.extract >= G.EXTRACT_TIME;
      const pts = (banked && p) ? (p.points || 0) : 0;
      let res = null;
      if (pts > 0) res = await store.bankExtracted(u.key, pts);
      const prof = await store.profile(u.key);
      u.s.leave(room.id);
      u.s.data.room = null;
      u.s.emit('end', {
        mode: 'ffa', you: i, winner: winner, extracted: banked, points: pts,
        delta: res ? res.delta : 0, oldRank: res ? res.oldRank : prof.rank, profile: prof
      });
    });
    return;
  }

  if (room.unranked) {
    room.users.forEach(async (u, i) => {
      u.s.leave(room.id);
      u.s.data.room = null;
      const prof = await store.profile(u.key);
      u.s.emit('end', {
        unranked: true, mode: room.mode, winner, you: i, forfeit: !!forfeit, quit,
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
    room.inp.forEach((u) => { u.sw = u.pa = u.bl = false; });
    io.to(room.id).emit('s', { m: room.m, ev });

    (ev || []).forEach(async (e) => {
      if (e.t === 'extract') {
        const u = room.users[e.i];
        if (u) {
          const res = await store.bankExtracted(u.key, e.points);
          const prof = await store.profile(u.key);
          u.s.leave(room.id);
          u.s.data.room = null;
          u.s.emit('end', {
            mode: 'ffa', you: e.i, extracted: true, points: e.points,
            delta: res ? res.delta : 0, oldRank: res ? res.oldRank : prof.rank, profile: prof
          });
        }
      }
    });

    if (room.m.phase === 'over') {
      finish(room, room.m.winner, false);
    }
  }
}, 1000 / 60);

setInterval(() => {
  io.emit('stats', { online: io.engine.clientsCount, queue: queue.length, ffa: ffaQueue.length });
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

async function isOwnerSocket(s) {
  if (!s.data.key) return false;
  const p = await store.profile(s.data.key);
  return !!(p && p.isOwner);
}

function enter(s, r) {
  for (const other of io.sockets.sockets.values()) {
    if (other !== s && other.data.key === r.key) { other.emit('kicked'); other.disconnect(true); }
  }
  queue = queue.filter((q) => q.s !== s);
  ffaQueue = ffaQueue.filter((q) => q.s !== s);
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
    if (s.data.room) return done({ err: 'Finish your match first' });
    if (s.data.sh) store.logout(s.data.sh);
    queue = queue.filter((q) => q.s !== s);
    ffaQueue = ffaQueue.filter((q) => q.s !== s);
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

  s.on('queueFFA', async () => {
    if (s.data.room || ffaQueue.some((q) => q.s === s)) return;
    if (!authed(s)) { s.emit('unauth'); return; }
    const p = await store.profile(s.data.key);
    ffaQueue.push({ s, key: s.data.key, name: p.name, mmr: p.mmr, since: Date.now() });
    tryMatch();
  });

  s.on('unqueueFFA', () => { ffaQueue = ffaQueue.filter((q) => q.s !== s); });

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
  s.on('admin_get_users', async (cb) => handle(cb, async () => {
    if (!(await isOwnerSocket(s))) return cb({ err: 'Unauthorized' });
    cb({ ok: true, users: await store.adminGetUsers() });
  }));

  s.on('admin_set_ban', async (d, cb) => handle(cb, async () => {
    if (!(await isOwnerSocket(s))) return cb({ err: 'Unauthorized' });
    d = d || {};
    const res = await store.adminSetBan(d.key, d.banned);
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

  s.on('admin_set_mmr', async (d, cb) => handle(cb, async () => {
    if (!(await isOwnerSocket(s))) return cb({ err: 'Unauthorized' });
    d = d || {};
    const res = await store.adminSetMmr(d.key, d.mmr);
    if (res.err) return cb({ err: res.err });
    cb({ ok: true, mmr: res.mmr, rank: res.rank });
  }));

  s.on('admin_match_kill_enemies', () => {
    const room = s.data.room;
    if (!room || !isOwnerSocket(s)) return;
    const myIdx = s.data.idx;
    room.m.p.forEach((p, idx) => {
      if (idx !== myIdx && !p.dead && !p.isMinion) {
        p.dead = true;
      }
    });
  });

  s.on('admin_match_toggle_god', (cb) => {
    const room = s.data.room;
    if (!room || !isOwnerSocket(s)) return;
    const p = room.m.p[s.data.idx];
    if (p) {
      p.god = !p.god;
      if (typeof cb === 'function') cb({ god: p.god });
    }
  });

  s.on('admin_match_toggle_nocd', (cb) => {
    const room = s.data.room;
    if (!room || !isOwnerSocket(s)) return;
    const p = room.m.p[s.data.idx];
    if (p) {
      p.noCd = !p.noCd;
      if (typeof cb === 'function') cb({ noCd: p.noCd });
    }
  });

  s.on('admin_spawn_bodyguard', (cb) => {
    const room = s.data.room;
    if (!room || !isOwnerSocket(s)) return;
    const myIdx = s.data.idx;
    const ev = [];
    const minion = G.spawnBodyguard(room.m, myIdx, ev);
    if (minion) {
      room.inp.push({});
      io.to(room.id).emit('s', { m: room.m, ev: ev });
      if (typeof cb === 'function') cb({ ok: true, count: room.m.p.filter(x => x.isMinion && x.ownerIdx === myIdx && !x.dead).length });
    }
  });

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
    if (room) finish(room, 1 - s.data.idx, true, s.data.idx);
  });

  s.on('top', async (cb) => { if (typeof cb === 'function') cb(await store.top(10)); });
  s.on('pg', (cb) => { if (typeof cb === 'function') cb(); });

  s.on('disconnect', () => {
    queue = queue.filter((q) => q.s !== s);
    ffaQueue = ffaQueue.filter((q) => q.s !== s);
    leaveParty(s);
    const room = s.data.room;
    if (room) finish(room, 1 - s.data.idx, true, s.data.idx);
  });
});

function bye() { store.flush(); process.exit(0); }
process.on('SIGTERM', bye);
process.on('SIGINT', bye);

server.listen(PORT, () => console.log(`Blade & Blink running on http://localhost:${PORT}`));