'use strict';
// Player records: ratings, stats and name ownership.
//  - atomic saves (write temp file, then rename) with a rolling .bak backup
//  - corrupt-file recovery (falls back to the backup, then to the old players.json)
//  - names are unique (case-insensitive) and owned by a secret token kept in the player's browser
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const START_MMR = 300, WIN_MMR = 25, LOSS_MMR = 20;
const RESERVED = new Set(['bot', 'bots', 'you', 'p1', 'p2', 'admin', 'server', 'system']);

const rankOf = (mmr) => (mmr >= 1001 ? 'Gold' : mmr >= 501 ? 'Silver' : 'Bronze');

function normalizeName(raw) {
  const name = String(raw == null ? '' : raw).normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!/^[\w \-]{2,16}$/.test(name)) return { err: 'Use 2-16 letters, numbers, spaces, - or _' };
  const key = name.toLowerCase();
  if (RESERVED.has(key)) return { err: 'That name is reserved' };
  return { name, key };
}

function hashToken(token) {
  return crypto.createHash('sha256').update('bb1|' + token).digest('hex');
}
function sameHash(a, b) {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function createStore(dir, legacyFile) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'players.json');
  const bak = file + '.bak', tmp = file + '.tmp';
  const players = Object.create(null);
  let timer = null, dirty = false;

  const num = (v) => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
  function migrate(key, p) {
    p = p && typeof p === 'object' ? p : {};
    const mmr = Number.isFinite(+p.mmr) ? num(p.mmr) : START_MMR;
    const wins = num(p.wins), losses = num(p.losses);
    return {
      name: String(p.name || key).slice(0, 16), mmr, peak: Math.max(num(p.peak), mmr),
      wins, losses, games: Math.max(num(p.games), wins + losses), streak: num(p.streak),
      th: typeof p.th === 'string' ? p.th : undefined,
      created: num(p.created) || Date.now(), seen: num(p.seen) || Date.now(),
    };
  }

  function readFile(f) {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const src = d && d.players ? d.players : d;
    if (!src || typeof src !== 'object') throw new Error('unexpected format');
    return src;
  }
  function load() {
    for (const f of [file, bak, legacyFile]) {
      if (!f) continue;
      try {
        const src = readFile(f);
        for (const k of Object.keys(src)) if (k !== '__proto__') players[k] = migrate(k, src[k]);
        console.log('loaded ' + Object.keys(players).length + ' players from ' + f);
        if (f !== file) { dirty = true; }
        return;
      } catch (e) {
        if (e.code !== 'ENOENT') console.error('could not read ' + f + ': ' + e.message);
      }
    }
  }
  load();

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty) return true;
    try {
      fs.writeFileSync(tmp, JSON.stringify({ v: 2, players }));
      try { JSON.parse(fs.readFileSync(file, 'utf8')); fs.copyFileSync(file, bak); } catch (e) { /* no good file to back up */ }
      fs.renameSync(tmp, file);
      dirty = false;
      return true;
    } catch (e) {
      console.error('save failed: ' + e.message);
      return false;
    }
  }
  function save() {
    dirty = true;
    if (!timer) { timer = setTimeout(flush, 2000); if (timer.unref) timer.unref(); }
  }
  if (dirty) flush();

  // Claims a new name, or logs into an existing one if the token matches.
  function login(rawName, token) {
    const n = normalizeName(rawName);
    if (n.err) return n;
    if (typeof token !== 'string' || token.length < 16 || token.length > 64) {
      return { err: 'Account token missing, reload the page' };
    }
    const th = hashToken(token);
    let p = players[n.key];
    if (!p) p = players[n.key] = migrate(n.key, { name: n.name, th, mmr: START_MMR });
    else if (!p.th) p.th = th; // account from the old save format: first login claims it
    else if (!sameHash(p.th, th)) return { err: 'That name belongs to another player' };
    p.seen = Date.now();
    save();
    return { ok: true, key: n.key };
  }

  function profile(key) {
    const p = players[key];
    return { name: p.name, mmr: p.mmr, rank: rankOf(p.mmr), wins: p.wins, losses: p.losses,
             streak: p.streak, peak: p.peak, games: p.games };
  }

  function record(winKey, loseKey) {
    const w = players[winKey], l = players[loseKey];
    const w0 = w.mmr, l0 = l.mmr, wr = rankOf(w0), lr = rankOf(l0);
    w.mmr += WIN_MMR; l.mmr = Math.max(0, l.mmr - LOSS_MMR);
    w.wins++; l.losses++; w.games++; l.games++;
    w.streak++; l.streak = 0;
    w.peak = Math.max(w.peak, w.mmr);
    save();
    return { win: { delta: w.mmr - w0, oldRank: wr }, lose: { delta: l.mmr - l0, oldRank: lr } };
  }

  function top(n) {
    return Object.values(players).filter((p) => p.games > 0)
      .sort((a, b) => b.mmr - a.mmr || b.wins - a.wins).slice(0, n)
      .map((p) => ({ name: p.name, mmr: p.mmr, rank: rankOf(p.mmr), wins: p.wins, losses: p.losses }));
  }

  return { login, profile, record, top, flush, file };
}

module.exports = { createStore, rankOf, normalizeName, START_MMR, WIN_MMR, LOSS_MMR };
