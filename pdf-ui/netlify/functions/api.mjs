import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import bcrypt from 'bcryptjs';
// Bundled into the function (no disk read at init). Keeps Netlify from breaking on `import.meta.url` paths.
import seedUsersFile from './lib/seed-users.json' with { type: 'json' };

const runtimeUsersPath = '/tmp/sales-pdf-users.json';
const usersDataVersionPath = '/tmp/sales-pdf-users-data-version';
/** Increment when `seed-users.json` changes and production `/tmp` must re-merge (passwords, limits, etc.) */
const USERS_DATA_VERSION = 3;

const defaultSeedUsers = {
  users: [
    {
      username: 'admin',
      password: '$2b$10$Ccrqip1wQBx5.lbLHuodmOtDcek8OrVq1CUKob5mNYmZG.4B1zgza',
      role: 'admin',
      pdf_limit: 999999,
      paid: true,
      paid_date: '2026-04-25',
      current_count: 0,
      is_active: true
    },
    {
      username: 'darshan',
      password: '$2b$10$IpUCX51w7eFYhkGKxi4aQ.K8IElEFthXyp3JYQhlXfRkUWu11Fooy',
      role: 'user',
      email: 'dalwadidarshan83@gmail.com',
      pdf_limit: 2,
      paid: false,
      paid_date: null,
      current_count: 0,
      is_active: true
    },
    {
      username: 'jay',
      password: '$2b$10$GYGhfdpY6o51lNZEHKZVuu5j2eaUpmCS4qzSPvBDJvW3rNs0OpYuq',
      role: 'user',
      email: 'jay@gmail.com',
      pdf_limit: 10,
      paid: false,
      paid_date: null,
      current_count: 1,
      is_active: true
    },
    {
      username: 'Anushree',
      password: '$2b$10$houqcquaP3MQyN/o7NZMVOiXbTJ.CjA67LoOBI/T7nLTH5JEr/E/i',
      role: 'user',
      pdf_limit: 3,
      paid: false,
      paid_date: null,
      current_count: 0,
      email: 'anu@gmail.com',
      is_active: true
    },
    {
      username: 'guest',
      password: '$2b$10$nCezzS6vFc11UVCa0PUhhufLVZKA1PnBh21RJFOKtWt4ZGHJ47pMC',
      role: 'user',
      pdf_limit: 2,
      paid: false,
      paid_date: null,
      current_count: 0,
      email: 'guest@gmail.com',
      is_active: true
    }
  ]
};

function userKeyFromRecord(u) {
  return String(u?.username ?? '').toLowerCase();
}

const jsonHeaders = { 'Content-Type': 'application/json' };

const sanitizeUser = (user) => ({
  username: user.username,
  role: user.role,
  pdf_limit: Number(user.pdf_limit ?? 0),
  paid: Boolean(user.paid),
  paid_date: user.paid_date,
  current_count: Number(user.current_count ?? 0),
  is_active: user.is_active !== false
});

const isUserActive = (user) => user?.is_active !== false;

function getSeedDataFromModule() {
  if (Array.isArray(seedUsersFile?.users) && seedUsersFile.users.length) {
    return seedUsersFile;
  }
  return defaultSeedUsers;
}

/**
 * Netlify reuses /tmp; once `sales-pdf-users.json` exists, editing `seed-users.json` in git has no
 * effect until this version is bumped, which re-merges seed (passwords, etc.) and preserves
 * `current_count` and any users not listed in the seed.
 */
async function ensureRuntimeUsersFile() {
  let hasRuntime = true;
  try {
    await fs.access(runtimeUsersPath);
  } catch {
    hasRuntime = false;
  }
  let recordVersion = 0;
  try {
    recordVersion = Number((await fs.readFile(usersDataVersionPath, 'utf8')).trim());
  } catch {
    recordVersion = 0;
  }
  const upToDate = hasRuntime && recordVersion >= USERS_DATA_VERSION;
  if (upToDate) {
    return;
  }

  const seedData = getSeedDataFromModule();
  const seedUsers = Array.isArray(seedData?.users) && seedData.users.length ? seedData.users : defaultSeedUsers.users;
  let oldUsers = [];
  if (hasRuntime) {
    try {
      const raw = await fs.readFile(runtimeUsersPath, 'utf8');
      oldUsers = JSON.parse(raw).users ?? [];
    } catch {
      oldUsers = [];
    }
  }
  const oldByKey = new Map(oldUsers.map((u) => [userKeyFromRecord(u), u]));
  const keyInSeed = new Set(seedUsers.map((u) => userKeyFromRecord(u)));
  const merged = seedUsers.map((fromSeed) => {
    const prev = oldByKey.get(userKeyFromRecord(fromSeed));
    if (!prev) return { ...fromSeed };
    return { ...prev, ...fromSeed, current_count: Number(prev.current_count ?? 0) };
  });
  for (const prev of oldUsers) {
    if (!keyInSeed.has(userKeyFromRecord(prev))) merged.push(prev);
  }
  const payload = {
    users: merged.map((user) => ({
      ...user,
      current_count: Number(user.current_count ?? 0)
    }))
  };
  await fs.writeFile(runtimeUsersPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.writeFile(usersDataVersionPath, String(USERS_DATA_VERSION), 'utf8');
}

function cloneUserRow(user) {
  return { ...user };
}

async function readUsers() {
  const fromDisk = async () => {
    await ensureRuntimeUsersFile();
    const raw = await fs.readFile(runtimeUsersPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.users)) {
      throw new Error('Invalid users in runtime store');
    }
    return parsed.users;
  };
  try {
    return await fromDisk();
  } catch (e) {
    console.error('readUsers', e);
    try {
      await fs.rm(runtimeUsersPath, { force: true });
      await fs.rm(usersDataVersionPath, { force: true });
    } catch (rmErr) {
      console.error('readUsers rm /tmp', rmErr);
    }
    try {
      return await fromDisk();
    } catch (e2) {
      console.error('readUsers after /tmp reset', e2);
      return defaultSeedUsers.users.map((u) => cloneUserRow(u));
    }
  }
}

async function writeUsers(users) {
  const payload = {
    users: users.map((user) => ({
      ...user,
      current_count: Number(user.current_count ?? 0)
    }))
  };
  await fs.writeFile(runtimeUsersPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function getEventPathString(event) {
  if (event?.rawUrl) {
    try {
      return new URL(event.rawUrl).pathname;
    } catch {
      /* fall through */
    }
  }
  const p = event?.path ?? event?.rawPath ?? event?.requestContext?.http?.path ?? event?.requestContext?.path;
  if (p == null) return '';
  return String(p).split('?')[0];
}

function getApiPath(eventPath = '') {
  const pathForRoute = String(eventPath).split('?')[0];
  if (pathForRoute.startsWith('/api/')) return pathForRoute;
  if (pathForRoute === '/api') return '/api';
  if (pathForRoute.startsWith('/.netlify/functions/api/')) {
    return `/api/${pathForRoute.replace('/.netlify/functions/api/', '')}`;
  }
  if (pathForRoute === '/.netlify/functions/api') return '/api';
  return pathForRoute;
}

function hasAdminAccess(headers = {}) {
  const roleHeader = headers['x-auth-role'] ?? headers['X-Auth-Role'];
  const usernameHeader = headers['x-auth-username'] ?? headers['X-Auth-Username'];
  return roleHeader === 'admin' && typeof usernameHeader === 'string' && usernameHeader.length > 0;
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body)
  };
}

function parseJsonBodyString(raw) {
  if (raw == null || raw === '') return {};
  const s = typeof raw === 'string' ? raw : String(raw);
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/**
 * Some runtimes pass a JSON object for `body`; do not `JSON.parse` a non-string (throws → 502).
 */
function parseEventBody(event) {
  if (event?.body == null) return {};
  const b = event.body;
  if (Buffer.isBuffer(b)) {
    return parseJsonBodyString(b.toString('utf8'));
  }
  if (typeof b === 'object' && b !== null && !Array.isArray(b)) {
    return { ...b };
  }
  if (event.isBase64Encoded) {
    try {
      return parseJsonBodyString(Buffer.from(String(b), 'base64').toString('utf8'));
    } catch {
      return {};
    }
  }
  return parseJsonBodyString(String(b));
}

export async function handler(event) {
  try {
    const method = String(event?.httpMethod || event?.requestContext?.http?.method || 'GET').toUpperCase();
    const routePath = getApiPath(getEventPathString(event));
    const body = parseEventBody(event);
    if (method === 'POST' && routePath === '/api/login') {
      const { username, password } = body;
      const users = await readUsers();
      const normalizedUsername = String(username ?? '').trim().toLowerCase();
      const userIndex = users.findIndex((u) => String(u.username ?? '').toLowerCase() === normalizedUsername);
      const user = userIndex >= 0 ? users[userIndex] : null;

      if (!user) return response(401, { error: 'Invalid credentials' });
      if (!isUserActive(user)) return response(403, { error: 'User is disabled. Please contact administrator.' });

      let isValidPassword = false;
      try {
        isValidPassword = await bcrypt.compare(String(password ?? ''), String(user.password ?? ''));
      } catch (e) {
        console.error('bcrypt.compare', e);
        isValidPassword = false;
      }
      if (!isValidPassword && String(user.password ?? '') === String(password ?? '')) {
        const upgradedUser = { ...user, password: await bcrypt.hash(String(password ?? ''), 10) };
        users[userIndex] = upgradedUser;
        await writeUsers(users);
        isValidPassword = true;
      }
      if (!isValidPassword) return response(401, { error: 'Invalid credentials' });
      return response(200, { user: sanitizeUser(users[userIndex]) });
    }

    const usagePathMatch = routePath.match(/^\/api\/users\/([^/]+)\/usage$/);
    if (method === 'GET' && usagePathMatch) {
      const username = decodeURIComponent(usagePathMatch[1]);
      const users = await readUsers();
      const user = users.find((u) => u.username === username);

      if (!user) return response(404, { error: 'User not found' });
      if (!isUserActive(user)) return response(403, { error: 'User is disabled. Please contact administrator.' });

      const pdf_limit = Number(user.pdf_limit ?? 0);
      const current_count = Number(user.current_count ?? 0);
      return response(200, {
        username,
        pdf_limit,
        current_count,
        remaining: Math.max(pdf_limit - current_count, 0),
        hasReachedLimit: current_count >= pdf_limit
      });
    }

    const incrementPathMatch = routePath.match(/^\/api\/users\/([^/]+)\/increment-usage$/);
    if (method === 'POST' && incrementPathMatch) {
      const username = decodeURIComponent(incrementPathMatch[1]);
      const users = await readUsers();
      const userIndex = users.findIndex((u) => u.username === username);

      if (userIndex === -1) return response(404, { error: 'User not found' });

      const user = users[userIndex];
      if (!isUserActive(user)) return response(403, { error: 'User is disabled. Please contact administrator.' });

      const pdf_limit = Number(user.pdf_limit ?? 0);
      const current_count = Number(user.current_count ?? 0);
      if (current_count >= pdf_limit) {
        return response(403, {
          error: `Upload limit reached. You have used ${current_count}/${pdf_limit} PDFs.`,
          pdf_limit,
          current_count
        });
      }

      const updated = { ...user, current_count: current_count + 1 };
      users[userIndex] = updated;
      await writeUsers(users);

      return response(200, {
        username,
        pdf_limit: Number(updated.pdf_limit ?? 0),
        current_count: Number(updated.current_count ?? 0),
        remaining: Math.max(Number(updated.pdf_limit ?? 0) - Number(updated.current_count ?? 0), 0),
        hasReachedLimit: Number(updated.current_count ?? 0) >= Number(updated.pdf_limit ?? 0)
      });
    }

    if (method === 'GET' && routePath === '/api/admin/users') {
      if (!hasAdminAccess(event.headers)) return response(403, { error: 'Admin access required' });
      const users = await readUsers();
      return response(200, { users: users.map((user) => sanitizeUser(user)) });
    }

    if (method === 'POST' && routePath === '/api/admin/users') {
      if (!hasAdminAccess(event.headers)) return response(403, { error: 'Admin access required' });

      const username = String(body.username ?? '').trim();
      const plainPassword = String(body.password ?? '');
      if (!username) return response(400, { error: 'username is required' });
      if (!plainPassword) return response(400, { error: 'password is required' });

      const users = await readUsers();
      const normalizedUsername = username.toLowerCase();
      const alreadyExists = users.some((user) => String(user.username ?? '').toLowerCase() === normalizedUsername);
      if (alreadyExists) return response(409, { error: 'Username already exists' });

      const role = body.role === 'admin' ? 'admin' : 'user';
      const pdfLimit = Number(body.pdf_limit ?? 0);
      const currentCount = Number(body.current_count ?? 0);
      const paid = Boolean(body.paid);
      const paidDate = paid ? (body.paid_date ?? null) : null;
      const email = body.email ? String(body.email).trim() : undefined;

      if (!Number.isFinite(pdfLimit) || pdfLimit < 0) {
        return response(400, { error: 'pdf_limit must be a non-negative number' });
      }
      if (!Number.isFinite(currentCount) || currentCount < 0) {
        return response(400, { error: 'current_count must be a non-negative number' });
      }

      const passwordHash = await bcrypt.hash(plainPassword, 10);
      const newUser = {
        username,
        password: passwordHash,
        role,
        pdf_limit: pdfLimit,
        paid,
        paid_date: paidDate,
        current_count: currentCount,
        is_active: true
      };
      if (email) newUser.email = email;

      users.push(newUser);
      await writeUsers(users);
      return response(201, { user: sanitizeUser(newUser) });
    }

    const adminUpdatePathMatch = routePath.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (method === 'PUT' && adminUpdatePathMatch) {
      if (!hasAdminAccess(event.headers)) return response(403, { error: 'Admin access required' });

      const username = decodeURIComponent(adminUpdatePathMatch[1]);
      const users = await readUsers();
      const userIndex = users.findIndex((u) => u.username === username);
      if (userIndex === -1) return response(404, { error: 'User not found' });

      const existingUser = users[userIndex];
      const nextPdfLimit = Number(body.pdf_limit ?? existingUser.pdf_limit ?? 0);
      const nextCurrentCount = Number(body.current_count ?? existingUser.current_count ?? 0);
      const nextPaid = typeof body.paid === 'boolean' ? body.paid : Boolean(existingUser.paid);
      const nextPaidDate = nextPaid ? (body.paid_date ?? existingUser.paid_date ?? null) : null;
      const nextIsActive = typeof body.is_active === 'boolean' ? body.is_active : isUserActive(existingUser);

      if (!Number.isFinite(nextPdfLimit) || nextPdfLimit < 0) {
        return response(400, { error: 'pdf_limit must be a non-negative number' });
      }
      if (!Number.isFinite(nextCurrentCount) || nextCurrentCount < 0) {
        return response(400, { error: 'current_count must be a non-negative number' });
      }

      const updatedUser = {
        ...existingUser,
        pdf_limit: nextPdfLimit,
        current_count: nextCurrentCount,
        paid: nextPaid,
        paid_date: nextPaidDate,
        is_active: nextIsActive
      };

      users[userIndex] = updatedUser;
      await writeUsers(users);
      return response(200, { user: sanitizeUser(updatedUser) });
    }

    return response(404, { error: 'Not found' });
  } catch (error) {
    console.error('api handler', error);
    return response(500, {
      error: 'Server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
