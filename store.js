'use strict';
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

// Changed LOSS_MMR to 0 so players lose no MMR on a ranked loss
const START_MMR = 300, WIN_MMR = 25, LOSS_MMR = 0;
const RESERVED = new Set(['bot', 'bots', 'you', 'p1', 'p2', 'admin', 'server', 'system', '__proto__']);
const OWNER_NAME = 'MASTERTETANUS';
const OWNER_KEY = 'mastertetanus';

const RANK_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Owner'];
const COSMETICS = { look: { none: 'Bronze', bronze: 'Silver', silver: 'Silver', gold: 'Gold', platinum: 'Platinum', diamond: 'Diamond' } };
// 'mastertetanus' is never handed out by rank: only the owner account gets it
const ALL_LOOKS = ['none', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'mastertetanus'];
const LOOK_ORDER = ['none', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];   // owner-only look is deliberately not here
const topLook = (unlocked) => { let t = 'none'; for (const id of LOOK_ORDER) if (unlocked.includes(id)) t = id; return t; };

const isOwnerAccount = (rawName) => rawName === OWNER_NAME;

const rankOf = (mmr, name) => {
  if (isOwnerAccount(name)) return 'Owner';
  return (mmr >= 2000 ? 'Diamond' : mmr >= 1500 ? 'Platinum' : mmr >= 1000 ? 'Gold' : mmr >= 500 ? 'Silver' : 'Bronze');
};

const unlocksFor = (peak, name) => {
  if (isOwnerAccount(name)) return ALL_LOOKS.slice();
  const r = RANK_NAMES.indexOf(rankOf(peak, name)), out = [];
  if (r < 0) return ['none'];
  for (const slot of Object.keys(COSMETICS)) {
    for (const id of Object.keys(COSMETICS[slot])) {
      const req = RANK_NAMES.indexOf(COSMETICS[slot][id]);
      if (req >= 0 && req <= r) out.push(id);
    }
  }
  return out;
};

function normalizeName(raw) {
  const name = String(raw == null ? '' : raw).normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!/^[\w \-]{2,16}$/.test(name)) return { err: 'Use 2-16 letters, numbers, spaces, - or _' };
  const key = name.toLowerCase();
  if (key === OWNER_KEY && name !== OWNER_NAME) return { err: 'That name is reserved' };
  if (key !== OWNER_KEY && RESERVED.has(key)) return { err: 'That name is reserved' };
  return { name, key };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(key, 'hex'));
}

function createStore(uri) {
  let client, db, users;
  const activeSessions = new Map();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  if (!process.env.DATABASE_URL) {
    console.warn('WARNING: DATABASE_URL is not set. Falling back to ' + uri + ' - logins will fail unless MongoDB runs there.');
  }

  // Keeps retrying in the background, so a slow or temporarily blocked database recovers by itself.
  function connectWithRetry() {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    client.connect().then(() => {
      db = client.db();
      users = db.collection('users');
      users.createIndex({ key: 1 }, { unique: true }).catch(() => {});
      console.log('Connected to MongoDB successfully.');
    }).catch((err) => {
      console.error('MongoDB connection error (retrying in 5s):', err && err.message ? err.message : err);
      client.close().catch(() => {});
      setTimeout(connectWithRetry, 5000);
    });
  }
  connectWithRetry();

  // Waits briefly for the database, then fails with a clear error instead of hanging forever.
  async function waitForDb() {
    const start = Date.now();
    while (!users) {
      if (Date.now() - start > 8000) { const e = new Error('Database unavailable'); e.dbDown = true; throw e; }
      await sleep(50);
    }
  }

  function createSession(key) {
    const token = crypto.randomBytes(32).toString('hex');
    const sh = crypto.createHash('sha256').update(token).digest('hex');
    const tokenHash = crypto.createHash('sha256').update('bb1|' + token).digest('hex');
    activeSessions.set(sh, { key, tokenHash });
    return { token, sh };
  }

  function sessionValid(sh, key) { const s = activeSessions.get(sh); return s && s.key === key; }
  function tokenMatches(token, sh) {
    const s = activeSessions.get(sh);
    if (!s) return false;
    const h = crypto.createHash('sha256').update('bb1|' + token).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(s.tokenHash, 'hex'));
  }
  function logout(sh) { activeSessions.delete(sh); }

  async function register(rawName, password) {
    const n = normalizeName(rawName);
    if (n.err) return n;
    if (typeof password !== 'string' || password.length < 8) return { err: 'Password must be at least 8 characters' };
    await waitForDb();
    const existing = await users.findOne({ key: n.key });
    if (existing) return { err: 'That name is already taken' };

    const isOwner = isOwnerAccount(n.name);
    const passwordHash = hashPassword(password);
    const earned = isOwner ? ALL_LOOKS.slice() : unlocksFor(START_MMR, n.name);
    const doc = {
      key: n.key, name: n.name, passwordHash,
      mmr: isOwner ? 9999 : START_MMR, peak: isOwner ? 9999 : START_MMR,
      wins: 0, losses: 0, games: 0, streak: 0,
      unlocked: earned, equipped: { look: isOwner ? 'diamond' : 'none' },
      isOwner: isOwner, isAdmin: false, banned: false, banReason: '', beatTetanus: false,
      created: Date.now(), seen: Date.now()
    };
    try {
      await users.insertOne(doc);
      const sess = createSession(n.key);
      return { ok: true, key: n.key, token: sess.token, sh: sess.sh };
    } catch (e) { return { err: 'That name is already taken' }; }
  }

  async function login(rawName, password) {
    const n = normalizeName(rawName);
    if (n.err) return n;
    await waitForDb();
    const user = await users.findOne({ key: n.key });
    if (!user) return { err: 'Account not found. Please register first.' };
    if (user.banned) return { err: 'This account has been banned: ' + (user.banReason || 'No reason provided') };
    if (!verifyPassword(password, user.passwordHash)) return { err: 'Incorrect password' };
    await users.updateOne({ key: n.key }, { $set: { seen: Date.now() } });
    const sess = createSession(n.key);
    return { ok: true, key: n.key, token: sess.token, sh: sess.sh };
  }

  function resume(token) {
    if (typeof token !== 'string' || token.length < 16) return { err: 'Invalid token' };
    const tokenHash = crypto.createHash('sha256').update('bb1|' + token).digest('hex');
    for (const [sh, s] of activeSessions.entries()) {
      if (crypto.timingSafeEqual(Buffer.from(s.tokenHash, 'hex'), Buffer.from(tokenHash, 'hex'))) return { key: s.key, sh };
    }
    return { err: 'Session expired, please log in again' };
  }

  async function claim(token, password) { return register(token, password); }

  async function profile(key) {
    await waitForDb();
    const user = await users.findOne({ key });
    if (!user || user.banned) return null;
    const isOwner = isOwnerAccount(user.name);
    const earned = unlocksFor(user.peak || user.mmr, user.name);
    const unlocked = isOwner ? ALL_LOOKS.slice() : Array.from(new Set((Array.isArray(user.unlocked) ? user.unlocked : []).concat(earned)));
    const look = (user.equipped && user.equipped.look) || user.activeLook || 'none';
    return {
      name: user.name, mmr: user.mmr, rank: rankOf(user.mmr, user.name),
      wins: user.wins, losses: user.losses, streak: user.streak, peak: user.peak, games: user.games,
      unlocked: unlocked, equipped: { look: unlocked.includes(look) ? look : topLook(unlocked) },
      isOwner: isOwner, isAdmin: !!user.isAdmin, banned: !!user.banned, savedAt: user.seen || Date.now(),
      beatTetanus: isOwner || !!user.beatTetanus
    };
  }

  async function equip(key, id) {
    await waitForDb();
    const prof = await profile(key);
    if (!prof) return { err: 'No such account' };
    if (!prof.unlocked.includes(id)) return { err: 'That look is still locked' };
    await users.updateOne({ key }, { $set: { 'equipped.look': id, activeLook: id, seen: Date.now() } });
    return { ok: true };
  }

  async function saveData(key, equipped) {
    await waitForDb();
    if (equipped && typeof equipped === 'object' && equipped.look) return equip(key, equipped.look);
    return { ok: true, savedAt: Date.now() };
  }

  async function record(winKey, loseKey) {
    await waitForDb();
    const w = await users.findOne({ key: winKey });
    const l = await users.findOne({ key: loseKey });
    if (!w || !l) return { win: { delta: WIN_MMR, oldRank: rankOf(START_MMR, '') }, lose: { delta: -LOSS_MMR, oldRank: rankOf(START_MMR, '') } };
    const w0 = w.mmr, l0 = l.mmr, wr = rankOf(w0, w.name), lr = rankOf(l0, l.name);
    const newWMMR = w0 + WIN_MMR;
    const newPeak = Math.max(w.peak || START_MMR, newWMMR);
    const earned = unlocksFor(newPeak, w.name);
    const newUnlocked = isOwnerAccount(w.name) ? ALL_LOOKS.slice() : Array.from(new Set((Array.isArray(w.unlocked) ? w.unlocked : []).concat(earned)));
    await users.updateOne({ key: winKey }, { $inc: { mmr: WIN_MMR, wins: 1, games: 1, streak: 1 }, $set: { peak: newPeak, unlocked: newUnlocked, seen: Date.now() } });
    await users.updateOne({ key: loseKey }, { $inc: { mmr: -LOSS_MMR, losses: 1, games: 1 }, $set: { streak: 0, seen: Date.now() } });
    // Note: delta is properly negated here to fix the +20 MMR bug on losses
    return { win: { delta: WIN_MMR, oldRank: wr }, lose: { delta: -LOSS_MMR, oldRank: lr } };
  }

  async function bankExtracted(key, points, kills) {
    if (kills === undefined) kills = 0;
    await waitForDb();
    const user = await users.findOne({ key });
    if (!user) return null;
    const oldMmr = user.mmr, oldRank = rankOf(oldMmr, user.name);
    
    // MMR gained is strictly Kills x 40
    const delta = kills * 40; 
    
    if (delta <= 0) return { delta: 0, oldRank: oldRank, newMmr: oldMmr };
    const newMmr = oldMmr + delta, newPeak = Math.max(user.peak || START_MMR, newMmr);
    const earned = unlocksFor(newPeak, user.name);
    const newUnlocked = isOwnerAccount(user.name) ? ALL_LOOKS.slice() : Array.from(new Set((Array.isArray(user.unlocked) ? user.unlocked : []).concat(earned)));
    await users.updateOne({ key }, { $inc: { mmr: delta }, $set: { peak: newPeak, unlocked: newUnlocked, seen: Date.now() } });
    return { delta: delta, oldRank: oldRank, newMmr: newMmr };
  }

  async function ffaDeathPenalty(key, kills) {
    if (kills >= 5) return { delta: 0 };
    await waitForDb();
    const user = await users.findOne({ key });
    if (!user || user.banned) return { delta: 0 };
    const penalty = -150;
    const newMmr = Math.max(0, user.mmr + penalty);
    await users.updateOne({ key }, { $set: { mmr: newMmr, seen: Date.now() } });
    return { delta: penalty, oldRank: rankOf(user.mmr, user.name), newMmr };
  }

  async function top(n) {
    await waitForDb();
    const list = await users.find({ games: { $gt: 0 }, banned: { $ne: true } }).sort({ mmr: -1, wins: -1 }).limit(n).toArray();
    return list.map(p => ({ name: p.name, mmr: p.mmr, rank: rankOf(p.mmr, p.name), wins: p.wins, losses: p.losses, isOwner: isOwnerAccount(p.name) }));
  }

  async function adminGetUsers(search) {
    await waitForDb();
    let query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    const list = await users.find(query).sort({ created: -1 }).limit(100).toArray();
    return list.map(u => ({
      key: u.key, name: u.name, mmr: u.mmr, rank: rankOf(u.mmr, u.name),
      wins: u.wins, losses: u.losses, banned: !!u.banned, isAdmin: !!u.isAdmin,
      isOwner: isOwnerAccount(u.name)
    }));
  }

  async function adminSetBan(targetKey, banned, reason) {
    await waitForDb();
    const target = await users.findOne({ key: targetKey });
    if (!target) return { err: 'Player not found' };
    if (isOwnerAccount(target.name)) return { err: 'Cannot ban the Owner' };
    await users.updateOne({ key: targetKey }, { $set: { banned: !!banned, banReason: banned ? (reason || '') : '' } });
    return { ok: true, banned: !!banned };
  }

  async function adminSetAdmin(targetKey, isAdmin) {
    await waitForDb();
    const target = await users.findOne({ key: targetKey });
    if (!target) return { err: 'Player not found' };
    if (isOwnerAccount(target.name)) return { err: 'Cannot modify Owner' };
    await users.updateOne({ key: targetKey }, { $set: { isAdmin: !!isAdmin } });
    return { ok: true, isAdmin: !!isAdmin };
  }

  async function adminGetBans() {
    await waitForDb();
    const list = await users.find({ banned: true }).sort({ seen: -1 }).toArray();
    return list.map(u => ({ key: u.key, name: u.name, reason: u.banReason || 'No reason provided' }));
  }

  async function adminSetMmr(targetKey, newMmr) {
    await waitForDb();
    newMmr = Math.max(0, parseInt(newMmr, 10) || 0);
    const target = await users.findOne({ key: targetKey });
    if (!target) return { err: 'Player not found' };
    const newPeak = Math.max(target.peak || 0, newMmr);
    const earned = unlocksFor(newPeak, target.name);
    const newUnlocked = isOwnerAccount(target.name) ? ALL_LOOKS.slice() : Array.from(new Set((Array.isArray(target.unlocked) ? target.unlocked : []).concat(earned)));
    await users.updateOne({ key: targetKey }, { $set: { mmr: newMmr, peak: newPeak, unlocked: newUnlocked } });
    return { ok: true, mmr: newMmr, rank: rankOf(newMmr, target.name) };
  }

  async function setBeatTetanus(key) {
    await waitForDb();
    await users.updateOne({ key }, { $set: { beatTetanus: true, seen: Date.now() } });
    return { ok: true };
  }

  async function flush() { return true; }

  return {
    register, login, resume, claim, sessionValid, tokenMatches, logout,
    saveData, equip, profile, record, bankExtracted, ffaDeathPenalty, top, flush,
    adminGetUsers, adminSetBan, adminSetMmr, adminSetAdmin, adminGetBans, setBeatTetanus
  };
}

module.exports = { createStore, rankOf, normalizeName, START_MMR, WIN_MMR, LOSS_MMR, RANK_NAMES, COSMETICS, topLook, OWNER_NAME, OWNER_KEY, ALL_LOOKS };