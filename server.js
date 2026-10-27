const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const G = require('./public/shared.js');
const { createStore, rankOf } = require('./store.js');

const PORT = process.env.PORT || 3000;
const WIN_ROUNDS = 5; // first to 5 = best of 9

// Use MongoDB connection string from environment variable (falls back to local mongo if unset)
const store = createStore(process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/blade_and_blink');

const app = express();
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
const server = http.createServer(app);
const io = new Server(server);

// ---------- matchmaking ----------
let queue = [];
const rooms = new Map();

function tryMatch() {
  const now = Date.now();
  for (let i = 0; i < queue.length; i++) {
    for (let j = i + 1; j < queue.length; j++) {
      const a = queue[i], b = queue[j];
      const waited = Math.max(now - a.since, now - b.since) / 1000;
      if (Math.abs(a.mmr - b.mmr) <= 100 + 50 * waited) {
        queue.splice(j, 1); queue.splice(i, 1);
        startRoom(a, b);
        return tryMatch();
      }
    }
  }
}
setInterval(tryMatch, 1000);

async function startRoom(a, b) {
  const id = crypto.randomBytes(4).toString('hex');
  const room = { id, users: [a, b], m: G.create(WIN_ROUNDS), inp: [{}, {}], done: false };
  rooms.set(id, room);
  const pA = await store.profile(a.key);
  const pB = await store.profile(b.key);
  const lookA = (pA && pA.equipped && pA.equipped.look) || 'none';
  const lookB = (pB && pB.equipped && pB.equipped.look) || 'none';
  const info = {
    names: [a.name, b.name],
    ranks: [rankOf(a.mmr), rankOf(b.mmr)],
    mmrs: [a.mmr, b.mmr],
    looks: [lookA, lookB]
  };
  [a, b].forEach((u, i) => {
    u.s.join(id);
    u.s.data.room = room;
    u.s.data.idx = i;
    u.s.emit('match', Object.assign({ id, you: i }, info));
  });
  console.log(`room ${id}: ${a.name} (${a.mmr}) vs ${b.name} (${b.mmr})`);
}

async function finish(room, winner, forfeit, quit) {
  if (room.done) return;
  room.done = true;
  rooms.delete(room.id);
  const res = await store.record(room.users[winner].key, room.users[1 - winner].key);
  await store.flush();
  room.users.forEach(async (u, i) => {
    const r = i === winner ? res.win : res.lose;
    u.s.leave(room.id);
    u.s.data.room = null;
    const prof = await store.profile(u.key);
    u.s.emit('end', { winner, you: i, forfeit: !!forfeit, quit, delta: r.delta, oldRank: r.oldRank,
                      score: room.m.score, profile: prof });
  });
}

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const room of rooms.values()) {
    const ev = G.tick(room.m, room.inp, dt);
    room.inp.forEach((u) => { u.sw = u.pa = u.bl = false; });
    io.to(room.id).emit('s', { m: room.m, ev });
    if (room.m.phase === 'over') finish(room, room.m.winner, false);
  }
}, 1000 / 60);

setInterval(() => io.emit('stats', { online: io.engine.clientsCount, queue: queue.length }), 5000);

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
    enter(s, r);
    cb({ ok: true, profile: await store.profile(r.key), token: d.token });
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

  s.on('in', (d) => {
    const room = s.data.room;
    if (!room || !okIn()) return;
    d = d || {};
    const u = room.inp[s.data.idx];
    u.x = num(d.x, -1, 1);
    u.y = num(d.y, -1, 1);
    u.aim = Number.isFinite(+d.aim) && d.aim !== null ? +d.aim : undefined;
  });

  s.on('act', (k) => {
    const room = s.data.room;
    if (!room || !okAct() || !['sw', 'pa', 'bl'].includes(k)) return;
    room.inp[s.data.idx][k] = true;
  });

  s.on('forfeit', () => {
    const room = s.data.room;
    if (room) finish(room, 1 - s.data.idx, true, s.data.idx);
  });

  s.on('top', async (cb) => { if (typeof cb === 'function') cb(await store.top(10)); });
  s.on('pg', (cb) => { if (typeof cb === 'function') cb(); });

  s.on('disconnect', () => {
    queue = queue.filter((q) => q.s !== s);
    const room = s.data.room;
    if (room) finish(room, 1 - s.data.idx, true, s.data.idx);
  });
});

function bye() { store.flush(); process.exit(0); }
process.on('SIGTERM', bye);
process.on('SIGINT', bye);

server.listen(PORT, () => console.log(`Blade & Blink running on http://localhost:${PORT}`));