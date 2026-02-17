/**
 * Security note: This client-only mock backend uses localStorage and bcryptjs.
 * It is NOT secure for production—password hashing must happen on a server with
 * proper salts, auth tokens, rate-limiting, and input validation. Image uploads
 * should be stored on secure server storage with malware scanning and ACLs.
 */
import bcrypt from 'bcryptjs';

const STORAGE_KEY = 'greengrid-db';
const SESSION_KEY = 'greengrid-session';
const SCHEMA_VERSION = 1;

const latency = (value, ms = 220) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

const baseState = () => ({
  version: SCHEMA_VERSION,
  users: [],
  spots: [],
  logs: [],
  settings: {
    theme: 'system',
    aiApprovalRate: 0.7,
    nowOffsetDays: 0
  }
});

const migrations = {
  1: (db) => ({
    ...baseState(),
    ...db,
    version: 1
  })
};

const migrateSchema = (db) => {
  let next = { ...baseState(), ...db };
  const startVersion = Number(next.version || 0);
  for (let v = startVersion + 1; v <= SCHEMA_VERSION; v += 1) {
    if (migrations[v]) {
      next = migrations[v](next);
    }
  }
  next.version = SCHEMA_VERSION;
  return next;
};

const loadDb = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = seedAdmin(baseState());
    saveDb(seeded);
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw);
    const migrated = migrateSchema(parsed);
    saveDb(migrated);
    return migrated;
  } catch (error) {
    const fallback = seedAdmin(baseState());
    saveDb(fallback);
    return fallback;
  }
};

const saveDb = (db) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
};

const seedAdmin = (db) => {
  if (db.users.length) return db;
  const passwordHash = bcrypt.hashSync('admin123', 10);
  const admin = {
    id: crypto.randomUUID(),
    name: 'Admin',
    email: 'admin@greengrid.com',
    passwordHash,
    role: 'admin',
    isPremium: true,
    banned: false,
    points: 500,
    streak: 4,
    lastCleanupAt: null,
    createdAt: new Date().toISOString(),
    cleanups: []
  };
  db.users.push(admin);
  db.logs.push({ id: crypto.randomUUID(), at: new Date().toISOString(), message: 'Seeded admin account.' });
  return db;
};

const sanitizeUser = (user) => {
  const { passwordHash, ...safe } = user;
  return safe;
};

const getNow = (db) => {
  const offsetDays = db.settings?.nowOffsetDays || 0;
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return now;
};

const applyDecay = (db) => {
  const now = getNow(db);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 7);
  db.spots = db.spots.map((spot) => {
    if (spot.updatedAt && new Date(spot.updatedAt) < cutoff) {
      return { ...spot, status: 'unverified' };
    }
    return spot;
  });
};

const persistSession = (session) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

const getSession = () => {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

export const createUser = async ({ name, email, password }) => {
  const db = loadDb();
  const normalized = email.trim().toLowerCase();
  if (db.users.some((user) => user.email === normalized)) {
    throw new Error('Email already registered.');
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalized,
    passwordHash,
    role: 'user',
    isPremium: false,
    banned: false,
    points: 0,
    streak: 0,
    lastCleanupAt: null,
    createdAt: getNow(db).toISOString(),
    cleanups: []
  };
  db.users.push(user);
  db.logs.push({ id: crypto.randomUUID(), at: getNow(db).toISOString(), message: `User created: ${user.email}` });
  saveDb(db);
  return latency(sanitizeUser(user));
};

export const loginUser = async ({ email, password }) => {
  const db = loadDb();
  const normalized = email.trim().toLowerCase();
  const user = db.users.find((item) => item.email === normalized);
  if (!user) {
    throw new Error('No account found for this email.');
  }
  if (user.banned) {
    throw new Error('This account is banned. Contact support.');
  }
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) {
    throw new Error('Incorrect password.');
  }
  const session = { userId: user.id, role: user.role, loggedInAt: getNow(db).toISOString() };
  persistSession(session);
  return latency({ session, user: sanitizeUser(user) });
};

export const getUserById = async (id) => {
  const db = loadDb();
  const user = db.users.find((item) => item.id === id);
  if (!user) return latency(null);
  return latency(sanitizeUser(user));
};

export const updateUser = async (id, updates) => {
  const db = loadDb();
  const idx = db.users.findIndex((item) => item.id === id);
  if (idx === -1) throw new Error('User not found.');
  db.users[idx] = { ...db.users[idx], ...updates };
  db.logs.push({ id: crypto.randomUUID(), at: getNow(db).toISOString(), message: `User updated: ${db.users[idx].email}` });
  saveDb(db);
  return latency(sanitizeUser(db.users[idx]));
};

export const banUser = async (id, banned = true) => {
  const db = loadDb();
  const idx = db.users.findIndex((item) => item.id === id);
  if (idx === -1) throw new Error('User not found.');
  db.users[idx].banned = banned;
  db.logs.push({
    id: crypto.randomUUID(),
    at: getNow(db).toISOString(),
    message: `${banned ? 'Banned' : 'Unbanned'} user: ${db.users[idx].email}`
  });
  saveDb(db);
  return latency(sanitizeUser(db.users[idx]));
};

export const upgradeToPremium = async (id) => {
  const db = loadDb();
  const idx = db.users.findIndex((item) => item.id === id);
  if (idx === -1) throw new Error('User not found.');
  db.users[idx].isPremium = true;
  db.logs.push({ id: crypto.randomUUID(), at: getNow(db).toISOString(), message: `Upgraded to premium: ${db.users[idx].email}` });
  saveDb(db);
  return latency(sanitizeUser(db.users[idx]));
};

export const createSpot = async ({ lat, lng, reportedBy }) => {
  const db = loadDb();
  const spot = {
    id: crypto.randomUUID(),
    lat,
    lng,
    status: 'unverified',
    reportedBy,
    createdAt: getNow(db).toISOString(),
    updatedAt: getNow(db).toISOString(),
    beforeImage: null,
    afterImage: null,
    verifiedBy: null,
    premiumCleanup: false
  };
  db.spots.push(spot);
  db.logs.push({ id: crypto.randomUUID(), at: getNow(db).toISOString(), message: `Spot created at ${lat}, ${lng}` });
  saveDb(db);
  return latency(spot);
};

export const updateSpot = async (id, updates) => {
  const db = loadDb();
  const idx = db.spots.findIndex((item) => item.id === id);
  if (idx === -1) throw new Error('Spot not found.');
  db.spots[idx] = { ...db.spots[idx], ...updates, updatedAt: getNow(db).toISOString() };
  saveDb(db);
  return latency(db.spots[idx]);
};

export const resetMapData = async () => {
  const db = loadDb();
  db.spots = [];
  db.logs.push({ id: crypto.randomUUID(), at: getNow(db).toISOString(), message: 'Reset all map data.' });
  saveDb(db);
  return latency(true);
};

export const recordCleanup = async ({ spotId, userId, beforeImage, afterImage, approved, aiReason }) => {
  const db = loadDb();
  const spotIdx = db.spots.findIndex((item) => item.id === spotId);
  const userIdx = db.users.findIndex((item) => item.id === userId);
  if (spotIdx === -1 || userIdx === -1) throw new Error('Spot or user not found.');
  const user = db.users[userIdx];
  const spot = db.spots[spotIdx];
  if (!approved) {
    db.logs.push({ id: crypto.randomUUID(), at: getNow(db).toISOString(), message: `Cleanup rejected for spot ${spotId}: ${aiReason}` });
    saveDb(db);
    return latency({ approved: false, reason: aiReason });
  }
  const basePoints = 50;
  const multiplier = user.isPremium ? 2 : 1;
  const earned = basePoints * multiplier;
  user.points += earned;
  user.streak += 1;
  user.lastCleanupAt = getNow(db).toISOString();
  user.cleanups.push({
    id: crypto.randomUUID(),
    spotId,
    points: earned,
    premium: user.isPremium,
    at: getNow(db).toISOString()
  });
  db.spots[spotIdx] = {
    ...spot,
    status: user.isPremium ? 'premium' : 'verified',
    verifiedBy: user.id,
    premiumCleanup: user.isPremium,
    beforeImage,
    afterImage,
    updatedAt: getNow(db).toISOString()
  };
  db.logs.push({ id: crypto.randomUUID(), at: getNow(db).toISOString(), message: `Cleanup approved for ${user.email} (+${earned} pts).` });
  saveDb(db);
  return latency({ approved: true, points: earned, spot: db.spots[spotIdx], user: sanitizeUser(user) });
};

export const getLeaderboard = async () => {
  const db = loadDb();
  const list = [...db.users]
    .filter((user) => !user.banned)
    .sort((a, b) => b.points - a.points)
    .map(sanitizeUser);
  return latency(list);
};

export const getStats = async () => {
  const db = loadDb();
  applyDecay(db);
  const totalTrash = db.spots.filter((spot) => spot.status !== 'unverified').length;
  const newUsers = db.users.filter((user) => user.role !== 'admin').length;
  const premiumCount = db.users.filter((user) => user.isPremium).length;
  const logs = db.logs.slice(-10);
  saveDb(db);
  return latency({ totalTrash, newUsers, premiumCount, logs });
};

export const simulateNow = async (offsetDays) => {
  const db = loadDb();
  db.settings.nowOffsetDays = Number(offsetDays);
  db.logs.push({ id: crypto.randomUUID(), at: getNow(db).toISOString(), message: `Simulated time offset: ${offsetDays} days.` });
  saveDb(db);
  return latency(getNow(db).toISOString());
};

export const setAiApprovalRate = async (rate) => {
  const db = loadDb();
  db.settings.aiApprovalRate = Math.min(1, Math.max(0, Number(rate)));
  db.logs.push({ id: crypto.randomUUID(), at: getNow(db).toISOString(), message: `AI approval rate set to ${db.settings.aiApprovalRate}` });
  saveDb(db);
  return latency(db.settings.aiApprovalRate);
};

export const getSettings = async () => {
  const db = loadDb();
  return latency(db.settings);
};

export const updateThemeSetting = async (theme) => {
  const db = loadDb();
  db.settings.theme = theme;
  saveDb(db);
  return latency(db.settings.theme);
};

export const getAllSpots = async () => {
  const db = loadDb();
  applyDecay(db);
  saveDb(db);
  return latency(db.spots);
};

export const getSessionInfo = async () => latency(getSession());

export const logout = async () => {
  clearSession();
  return latency(true);
};

export const resetAllData = async () => {
  const fresh = seedAdmin(baseState());
  saveDb(fresh);
  clearSession();
  return latency(true);
};

export const getSchemaVersion = async () => latency(SCHEMA_VERSION);
export { migrateSchema };
