'use strict';
// Accounts, passwords, sessions and save data.
//  - passwords are hashed with scrypt (memory-hard, built into Node, no native add-on to compile) with a random salt per account
//  - a successful login/registration issues a random session token; only its SHA-256 is stored, so a leaked save file cannot be replayed
//  - saves are atomic (temp file + rename), keep a .bak, and the file is private to the server user (mode 600)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const START_MMR = 300, WIN_MMR = 25, LOSS_MMR = 20;
const SESSION_MS = 30 * 24 * 3600 * 1000, MAX_SESSIONS = 8;
const RESERVED = new Set(['bot', 'bots', 'you', 'p1', 'p2', 'admin', 'server', 'system', '__proto__']);
const RANK_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
// The "look" slot: reaching a rank unlocks the look. 'none' is always available.
// slot -> { cosmetic id: rank needed to unlock it }
const COSMETICS = { look: { none: 'Bronze', bronze: 'Silver', silver: 'Silver', gold: 'Gold', platinum: 'Platinum', diamond: 'Diamond' } };
const LOOK_ORDER = ['none', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];
const topLook = (unlocked) => { let t = 'none'; for (const id of LOOK_ORDER) if (unlocked.includes(id)) t = id; return t; };
// OWASP's scrypt option "N=2^15, r=8, p=3". Parameters are stored inside every hash, so they can be raised later.
const SCRYPT = { N: 1 << 15, r: 8, p: 3, keylen: 32 };

// Bronze 0-499, Silver 500-999, Gold 1000-1499, Platinum 1500-1999, Diamond 2000+
const rankOf = (mmr) => (mmr >= 2000 ? 'Diamond' : mmr >= 1500 ? 'Platinum' : mmr >= 1000 ? 'Gold' : mmr >= 500 ? 'Silver' : 'Bronze');
const unlocksFor = (peak) => {
  const r = RANK_NAMES.indexOf(rankOf(peak)), out = [];
  if (r < 0) return ['none'];
  for (const slot of Object.keys(COSMETICS)) {
    for (const id of Object.keys(COSMETICS[slot])) {
      const req = RANK_NAMES.indexOf(COSMETICS[slot][id]);
      if (req >= 0 && req <= r) out.push(id);
    }
  }
  return out;
};
const isCosmetic = (id) => Object.keys(COSMETICS).some((s) => Object.prototype.hasOwnProperty.call(COSMETICS[s], id));

function normalizeName(raw) {
  const name = String(raw == null ? '' : raw).normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!/^[\w \-]{2,16}$/.test(name)) return { err: 'Use 2-16 letters, numbers, spaces, - or _' };
  const key = name.toLowerCase();
  if (RESERVED.has(key)) return { err: 'That name is reserved' };
  return { name, key };
}
function checkPassword(pw, key) {
  if (typeof pw !== 'string' || !pw) return 'Enter a password';
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 128) return 'Password is too long (128 characters max)';
  if (pw.toLowerCase() === key) return 'Password cannot be your username';
  if (/^(.)\1+$/.test(pw)) return 'That password is too simple';
  return null;
}

const sha = (prefix, t) => crypto.createHash('sha256').update(prefix + t).digest('hex');
const hashToken = (t) => sha('bb1|', t);      // old pre-password accounts (browser-generated token)
const hashSession = (t) => sha('bs1|', t);    // session tokens issued by this server
function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex');
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}
const scryptP = (pw, salt, N, r, p, keylen) => new Promise((res, rej) =>
  crypto.scrypt(pw, salt, keylen, { N, r, p, maxmem: 256 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));

function createStore(dir, legacyFile, opts) {
  opts = opts || {};
  const SC = Object.assign({}, SCRYPT, opts.scrypt);
  const now = opts.now || Date.now;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'players.json');
  const bak = file + '.bak', tmp = file + '.tmp';
  const players = Object.create(null);
  const sessions = Object.create(null);   // sha256(token) -> { key, exp, created }
  const legacy = new Map();                // old-token hash -> account key (accounts with no password yet)
  let timer = null, dirty = false, dummy = null;

  const num = (v) => (Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : 0);
  function migrate(key, p) {
    p = p && typeof p === 'object' ? p : {};
    const mmr = Number.isFinite(+p.mmr) ? num(p.mmr) : START_MMR;
    const wins = num(p.wins), losses = num(p.losses), peak = Math.max(num(p.peak), mmr);
    const earned = unlocksFor(peak);
    const unlocked = Array.from(new Set((Array.isArray(p.unlocked) ? p.unlocked : []).filter(isCosmetic).concat(earned)));
    const want = p.equipped && p.equipped.look;
    const equipped = { look: typeof want === 'string' && Object.prototype.hasOwnProperty.call(COSMETICS.look, want) && unlocked.includes(want) ? want : topLook(unlocked) };
    return {
      name: String(p.name || key).slice(0, 16), mmr, peak, wins, losses, games: Math.max(num(p.games), wins + losses),
      streak: num(p.streak), ph: typeof p.ph === 'string' ? p.ph : undefined, th: typeof p.th === 'string' ? p.th : undefined,
      unlocked, equipped, savedAt: num(p.savedAt), created: num(p.created) || now(), seen: num(p.seen) || now(),
    };
  }

  function readFile(f) {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!d || typeof d !== 'object') throw new Error('unexpected format');
    return { src: d.players || d, ses: d.sessions || {} };
  }
  function load() {
    for (const f of [file, bak, legacyFile]) {
      if (!f) continue;
      try {
        const { src, ses } = readFile(f);
        for (const k of Object.keys(src)) if (k !== '__proto__') players[k] = migrate(k, src[k]);
        for (const h of Object.keys(ses)) {
          const s = ses[h];
          if (/^[0-9a-f]{64}$/.test(h) && s && players[s.key] && num(s.exp) > now()) sessions[h] = { key: s.key, exp: num(s.exp), created: num(s.created) };
        }
        console.log('loaded ' + Object.keys(players).length + ' players from ' + f);
        if (f !== file) dirty = true;
        return;
      } catch (e) {
        if (e.code !== 'ENOENT') console.error('could not read ' + f + ': ' + e.message);
      }
    }
  }
  load();
  for (const k of Object.keys(players)) if (players[k].th && !players[k].ph) legacy.set(players[k].th, k);

  function prune() { for (const h of Object.keys(sessions)) if (sessions[h].exp <= now()) delete sessions[h]; }
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty) return true;
    try {
      prune();
      fs.writeFileSync(tmp, JSON.stringify({ v: 3, players, sessions }), { mode: 0o600 });
      try { JSON.parse(fs.readFileSync(file, 'utf8')); fs.copyFileSync(file, bak); } catch (e) { /* no good file to back up yet */ }
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

  // ----- passwords -----
  async function hashPassword(pw) {
    const salt = crypto.randomBytes(16);
    const k = await scryptP(pw, salt, SC.N, SC.r, SC.p, SC.keylen);
    return ['scrypt', SC.N, SC.r, SC.p, salt.toString('base64'), k.toString('base64')].join('$');
  }
  async function verifyPassword(pw, stored) {
    const parts = String(stored).split('$');
    if (parts[0] !== 'scrypt' || parts.length !== 6) return false;
    const [N, r, p] = parts.slice(1, 4).map(Number), salt = Buffer.from(parts[4], 'base64'), want = Buffer.from(parts[5], 'base64');
    try {
      const k = await scryptP(pw, salt, N, r, p, want.length);
      return k.length === want.length && crypto.timingSafeEqual(k, want);
    } catch (e) { return false; }
  }
  const getDummy = () => dummy || (dummy = hashPassword('dummy-password-for-constant-time'));
  getDummy().catch(() => {});

  // ----- brute-force limits (in memory) -----
  const fails = new Map(), signups = new Map();
  const lockedFor = (id) => { const f = fails.get(id); return f && f.until > now() ? Math.ceil((f.until - now()) / 1000) : 0; };
  function fail(id, max) {
    if (fails.size > 5000) fails.clear();
    let f = fails.get(id);
    if (!f || now() - f.first > 600000) f = { n: 0, first: now(), until: 0 };
    if (++f.n >= max) f.until = now() + 300000;
    fails.set(id, f);
  }
  function signupLimited(ip) {
    if (signups.size > 5000) signups.clear();
    const list = (signups.get(ip) || []).filter((t) => now() - t < 3600000);
    if (list.length >= 5) { signups.set(ip, list); return true; }
    list.push(now()); signups.set(ip, list);
    return false;
  }

  // ----- sessions -----
  function issue(key) {
    const token = crypto.randomBytes(32).toString('hex'), sh = hashSession(token);
    sessions[sh] = { key, exp: now() + SESSION_MS, created: now() };
    const mine = Object.keys(sessions).filter((h) => sessions[h].key === key).sort((a, b) => sessions[a].created - sessions[b].created);
    while (mine.length > MAX_SESSIONS) delete sessions[mine.shift()];
    save();
    return { ok: true, key, token, sh };
  }
  const sessionValid = (sh, key) => { const s = sessions[sh]; return !!s && s.key === key && s.exp > now() && !!players[key]; };
  const tokenMatches = (token, sh) => typeof token === 'string' && sameHex(hashSession(token), sh);
  function logout(sh) { if (sessions[sh]) { delete sessions[sh]; save(); } }

  function resume(token) {
    if (typeof token !== 'string' || token.length < 16 || token.length > 128) return { err: 'Please log in' };
    const sh = hashSession(token), s = sessions[sh];
    if (s && s.exp > now() && players[s.key]) { s.exp = now() + SESSION_MS; save(); return { ok: true, key: s.key, sh }; }
    if (s) { delete sessions[sh]; save(); }
    const lk = legacy.get(hashToken(token));
    if (lk && players[lk] && !players[lk].ph) return { legacy: true, name: players[lk].name };
    return { err: 'Please log in' };
  }

  // ----- accounts -----
  async function register(rawName, password, ip) {
    const n = normalizeName(rawName);
    if (n.err) return n;
    const pe = checkPassword(password, n.key);
    if (pe) return { err: pe };
    let p = players[n.key];
    if (p && p.ph) return { err: 'That name is already taken' };
    if (p && p.th) return { err: 'That name belongs to an existing player. Open the game in the browser you played on to secure it.' };
    if (signupLimited(ip)) return { err: 'Too many sign-ups from this network. Try again later.' };
    const ph = await hashPassword(password);
    p = players[n.key];
    if (p && (p.ph || p.th)) return { err: 'That name is already taken' };
    if (!p) p = players[n.key] = migrate(n.key, { name: n.name, mmr: START_MMR });
    p.ph = ph; p.seen = now();
    return issue(n.key);
  }
  async function login(rawName, password, ip) {
    const generic = { err: 'Wrong username or password' };
    const n = normalizeName(rawName);
    const acct = n.err ? null : 'acct:' + n.key, addr = 'ip:' + ip;
    const wait = Math.max(lockedFor(addr), acct ? lockedFor(acct) : 0);
    if (wait) return { err: 'Too many attempts. Try again in ' + Math.ceil(wait / 60) + ' min.' };
    if (typeof password !== 'string' || password.length > 128) { fail(addr, 20); return generic; }
    const p = n.err ? null : players[n.key];
    const good = await verifyPassword(password, p && p.ph ? p.ph : await getDummy());
    if (!(p && p.ph && good)) { fail(addr, 20); if (acct) fail(acct, 5); return generic; }
    fails.delete(acct); p.seen = now();
    return issue(n.key);
  }
  async function claim(oldToken, password, ip) {
    const lk = typeof oldToken === 'string' ? legacy.get(hashToken(oldToken)) : null;
    if (!lk || !players[lk] || players[lk].ph) return { err: 'Please log in' };
    const pe = checkPassword(password, lk);
    if (pe) return { err: pe };
    const ph = await hashPassword(password);
    const p = players[lk];
    if (!p || p.ph) return { err: 'Please log in' };
    p.ph = ph; p.th = undefined; legacy.delete(hashToken(oldToken)); p.seen = now();
    return issue(lk);
  }

  // ----- profile, results, leaderboard, save data -----
  function profile(key) {
    const p = players[key];
    return { name: p.name, mmr: p.mmr, rank: rankOf(p.mmr), wins: p.wins, losses: p.losses, streak: p.streak, peak: p.peak,
             games: p.games, unlocked: p.unlocked.slice(), equipped: Object.assign({}, p.equipped), savedAt: p.savedAt };
  }
  function record(winKey, loseKey) {
    const w = players[winKey], l = players[loseKey];
    const w0 = w.mmr, l0 = l.mmr, wr = rankOf(w0), lr = rankOf(l0);
    w.mmr += WIN_MMR; l.mmr = Math.max(0, l.mmr - LOSS_MMR);
    w.wins++; l.losses++; w.games++; l.games++;
    w.streak++; l.streak = 0;
    w.peak = Math.max(w.peak, w.mmr);
    const prevTop = topLook(w.unlocked);
    w.unlocked = Array.from(new Set(w.unlocked.concat(unlocksFor(w.peak))));
    if (w.equipped.look === prevTop && topLook(w.unlocked) !== prevTop) w.equipped.look = topLook(w.unlocked);
    save();
    return { win: { delta: w.mmr - w0, oldRank: wr }, lose: { delta: l.mmr - l0, oldRank: lr } };
  }
  function top(n) {
    return Object.values(players).filter((p) => p.games > 0)
      .sort((a, b) => b.mmr - a.mmr || b.wins - a.wins).slice(0, n)
      .map((p) => ({ name: p.name, mmr: p.mmr, rank: rankOf(p.mmr), wins: p.wins, losses: p.losses }));
  }
  function saveData(key, equipped) {
    const p = players[key];
    if (!p) return { err: 'No such account' };
    if (equipped && typeof equipped === 'object') {
      for (const slot of Object.keys(COSMETICS)) {
        const id = equipped[slot];
        if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(COSMETICS[slot], id) && p.unlocked.includes(id)) p.equipped[slot] = id;
      }
    }
    p.savedAt = now();
    dirty = true;
    if (!flush()) return { err: 'Could not write to disk' };
    return { ok: true, savedAt: p.savedAt };
  }

  function equip(key, id) {
    const p = players[key];
    if (!p) return { err: 'No such account' };
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(COSMETICS.look, id) || !p.unlocked.includes(id)) return { err: 'That look is still locked' };
    p.equipped.look = id;
    save();
    return { ok: true };
  }

  return { register, login, claim, resume, logout, sessionValid, tokenMatches, profile, record, top, saveData, equip, flush, file };
}

module.exports = { createStore, rankOf, normalizeName, checkPassword, unlocksFor, topLook, RANK_NAMES, COSMETICS, START_MMR, WIN_MMR, LOSS_MMR };