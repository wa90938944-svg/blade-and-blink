'use strict';
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

const START_MMR = 300, WIN_MMR = 25, LOSS_MMR = 20;
const RESERVED = new Set(['bot', 'bots', 'you', 'p1', 'p2', 'admin', 'server', 'system', '__proto__']);
const OWNER_KEY = 'mastertetanus';

const RANK_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Owner'];
const COSMETICS = { look: { none: 'Bronze', bronze: 'Silver', silver: 'Silver', gold: 'Gold', platinum: 'Platinum', diamond: 'Diamond' } };
const ALL_LOOKS = ['none', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];
const LOOK_ORDER = ['none', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];
const topLook = (unlocked) => { let t = 'none'; for (const id of LOOK_ORDER) if (unlocked.includes(id)) t = id; return t; };

const rankOf = (mmr, key) => {
  if (key && key.toLowerCase() === OWNER_KEY) return 'Owner';
  return (mmr >= 2000 ? 'Diamond' : mmr >= 1500 ? 'Platinum' : mmr >= 1000 ? 'Gold' : mmr >= 500 ? 'Silver' : 'Bronze');
};

const unlocksFor = (peak, key) => {
  if (key && key.toLowerCase() === OWNER_KEY) return ALL_LOOKS.slice();
  const r = RANK_NAMES.indexOf(rankOf(peak, key)), out = [];
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
  const client = new MongoClient(uri);
  let db, users;
  const activeSessions = new Map();

  client.connect().then(() => {
    db = client.db();
    users = db.collection('users');
    users.createIndex({ key: 1 }, { unique: true }).catch(() => {});
    console.log('Connected to MongoDB Atlas successfully.');
  }).catch(err => {
    console.error('MongoDB connection error:', err);
  });

  async function waitForDb() {
    while (!users) { await new Promise(r => setTimeout(r, 50)); }
  }

  function createSession(key) {
    const token = crypto.randomBytes(32).toString('hex');
    const sh = crypto.createHash('sha256').update(token).digest('hex');
    const tokenHash = crypto.createHash('sha256').update('bb1|' + token).digest('hex');
    activeSessions.set(sh, { key, tokenHash });
    return { token, sh };
  }

  function sessionValid(sh, key) {
    const s = activeSessions.get(sh);
    return s && s.key === key;
  }

  function tokenMatches(token, sh) {
    const s = activeSessions.get(sh);
    if (!s) return false;
    const h = crypto.createHash('sha256').update('bb1|' + token).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(s.tokenHash, 'hex'));
  }

  function logout(sh) {
    activeSessions.delete(sh);
  }

  async function register(rawName, password) {
    const n = normalizeName(rawName);
    if (n.err) return n;
    if (typeof password !== 'string' || password.length < 8) {
      return { err: 'Password must be at least 8 characters' };
    }
    await waitForDb();

    const existing = await users.findOne({ key: n.key });
    if (existing) return { err: 'That name is already taken' };

    const isOwner = (n.key === OWNER_KEY);
    const passwordHash = hashPassword(password);
    const earned = isOwner ? ALL_LOOKS.slice() : unlocksFor(START_MMR, n.key);
    const doc = {
      key: n.key,
      name: n.name,
      passwordHash,
      mmr: isOwner ? 9999 : START_MMR,
      peak: isOwner ? 9999 : START_MMR,
      wins: 0,
      losses: 0,
      games: 0,
      streak: 0,
      unlocked: earned,
      equipped: { look: isOwner ? 'diamond' : 'none' },
      isOwner: isOwner,
      created: Date.now(),
      seen: Date.now()
    };

    try {
      await users.insertOne(doc);
      const sess = createSession(n.key);
      return { ok: true, key: n.key, token: sess.token, sh: sess.sh };
    } catch (e) {
      return { err: 'That name is already taken' };
    }
  }

  async function login(rawName, password) {
    const n = normalizeName(rawName);
    if (n.err) return n;
    await waitForDb();

    const user = await users.findOne({ key: n.key });
    if (!user) return { err: 'Account not found. Please register first.' };

    if (!verifyPassword(password, user.passwordHash)) {
      return { err: 'Incorrect password' };
    }

    await users.updateOne({ key: n.key }, { $set: { seen: Date.now() } });
    const sess = createSession(n.key);
    return { ok: true, key: n.key, token: sess.token, sh: sess.sh };
  }

  function resume(token) {
    if (typeof token !== 'string' || token.length < 16) return { err: 'Invalid token' };
    const tokenHash = crypto.createHash('sha256').update('bb1|' + token).digest('hex');
    for (const [sh, s] of activeSessions.entries()) {
      if (crypto.timingSafeEqual(Buffer.from(s.tokenHash, 'hex'), Buffer.from(tokenHash, 'hex'))) {
        return { key: s.key, sh };
      }
    }
    return { err: 'Session expired, please log in again' };
  }

  async function claim(token, password) {
    return register(token, password);
  }

  async function profile(key) {
    await waitForDb();
    const user = await users.findOne({ key });
    if (!user) return null;
    const isOwner = (key === OWNER_KEY || !!user.isOwner);
    const earned = unlocksFor(user.peak || user.mmr, key);
    const unlocked = isOwner ? ALL_LOOKS.slice() : Array.from(new Set((Array.isArray(user.unlocked) ? user.unlocked : []).concat(earned)));
    const look = (user.equipped && user.equipped.look) || user.activeLook || 'none';
    return {
      name: user.name,
      mmr: user.mmr,
      rank: rankOf(user.mmr, key),
      wins: user.wins,
      losses: user.losses,
      streak: user.streak,
      peak: user.peak,
      games: user.games,
      unlocked: unlocked,
      equipped: { look: unlocked.includes(look) ? look : topLook(unlocked) },
      isOwner: isOwner,
      savedAt: user.seen || Date.now()
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
    if (equipped && typeof equipped === 'object' && equipped.look) {
      return equip(key, equipped.look);
    }
    return { ok: true, savedAt: Date.now() };
  }

  async function record(winKey, loseKey) {
    await waitForDb();
    const w = await users.findOne({ key: winKey });
    const l = await users.findOne({ key: loseKey });
    if (!w || !l) return { win: { delta: WIN_MMR, oldRank: rankOf(START_MMR, winKey) }, lose: { delta: LOSS_MMR, oldRank: rankOf(START_MMR, loseKey) } };

    const w0 = w.mmr, l0 = l.mmr, wr = rankOf(w0, winKey), lr = rankOf(l0, loseKey);
    const newWMMR = w0 + WIN_MMR;
    const newPeak = Math.max(w.peak || START_MMR, newWMMR);
    const earned = unlocksFor(newPeak, winKey);
    const newUnlocked = (winKey === OWNER_KEY) ? ALL_LOOKS.slice() : Array.from(new Set((Array.isArray(w.unlocked) ? w.unlocked : []).concat(earned)));

    await users.updateOne({ key: winKey }, {
      $inc: { mmr: WIN_MMR, wins: 1, games: 1, streak: 1 },
      $set: { peak: newPeak, unlocked: newUnlocked, seen: Date.now() }
    });

    await users.updateOne({ key: loseKey }, {
      $inc: { mmr: -LOSS_MMR, losses: 1, games: 1 },
      $set: { streak: 0, seen: Date.now() }
    });

    return { win: { delta: WIN_MMR, oldRank: wr }, lose: { delta: LOSS_MMR, oldRank: lr } };
  }

  async function bankExtracted(key, points) {
    if (!points || points <= 0) return null;
    await waitForDb();
    const user = await users.findOne({ key });
    if (!user) return null;
    const oldMmr = user.mmr;
    const oldRank = rankOf(oldMmr, key);
    const delta = Math.floor(points / 10);
    const newMmr = oldMmr + delta;
    const newPeak = Math.max(user.peak || START_MMR, newMmr);
    const earned = unlocksFor(newPeak, key);
    const newUnlocked = (key === OWNER_KEY) ? ALL_LOOKS.slice() : Array.from(new Set((Array.isArray(user.unlocked) ? user.unlocked : []).concat(earned)));

    await users.updateOne({ key }, {
      $inc: { mmr: delta },
      $set: { peak: newPeak, unlocked: newUnlocked, seen: Date.now() }
    });
    return { delta: delta, oldRank: oldRank, newMmr: newMmr };
  }

  async function top(n) {
    await waitForDb();
    const list = await users.find({ games: { $gt: 0 } })
      .sort({ mmr: -1, wins: -1 })
      .limit(n)
      .toArray();
    return list.map(p => ({
      name: p.name,
      mmr: p.mmr,
      rank: rankOf(p.mmr, p.key),
      wins: p.wins,
      losses: p.losses,
      isOwner: p.key === OWNER_KEY || !!p.isOwner
    }));
  }

  async function flush() {
    return true;
  }

  return { register, login, resume, claim, sessionValid, tokenMatches, logout, saveData, equip, profile, record, bankExtracted, top, flush };
}

module.exports = { createStore, rankOf, normalizeName, START_MMR, WIN_MMR, LOSS_MMR, RANK_NAMES, COSMETICS, topLook, OWNER_KEY, ALL_LOOKS };