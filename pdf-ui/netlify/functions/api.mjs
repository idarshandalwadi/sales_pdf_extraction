import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const runtimeUsersPath = '/tmp/sales-pdf-users.json';
const seedUsersPathCandidates = [
  path.resolve(process.cwd(), 'netlify/functions/lib/seed-users.json'),
  path.resolve(process.cwd(), 'pdf-ui/netlify/functions/lib/seed-users.json')
];

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

async function ensureRuntimeUsersFile() {
  try {
    await fs.access(runtimeUsersPath);
  } catch {
    let seedRaw = null;
    for (const candidatePath of seedUsersPathCandidates) {
      try {
        seedRaw = await fs.readFile(candidatePath, 'utf8');
        break;
      } catch {
        // Try next candidate path.
      }
    }

    if (!seedRaw) {
      throw new Error('Unable to locate seed-users.json in Netlify runtime.');
    }

    await fs.writeFile(runtimeUsersPath, seedRaw, 'utf8');
  }
}

async function readUsers() {
  await ensureRuntimeUsersFile();
  const raw = await fs.readFile(runtimeUsersPath, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed?.users ?? [];
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

function getApiPath(eventPath = '') {
  if (eventPath.startsWith('/api/')) return eventPath;
  if (eventPath === '/api') return '/api';
  if (eventPath.startsWith('/.netlify/functions/api/')) {
    return `/api/${eventPath.replace('/.netlify/functions/api/', '')}`;
  }
  if (eventPath === '/.netlify/functions/api') return '/api';
  return eventPath;
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

function parseBody(rawBody) {
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
}

export async function handler(event) {
  const method = event.httpMethod;
  const routePath = getApiPath(event.path);
  const body = parseBody(event.body);

  try {
    if (method === 'POST' && routePath === '/api/login') {
      const { username, password } = body;
      const users = await readUsers();
      const normalizedUsername = String(username ?? '').trim().toLowerCase();
      const userIndex = users.findIndex((u) => String(u.username ?? '').toLowerCase() === normalizedUsername);
      const user = userIndex >= 0 ? users[userIndex] : null;

      if (!user) return response(401, { error: 'Invalid credentials' });
      if (!isUserActive(user)) return response(403, { error: 'User is disabled. Please contact administrator.' });

      let isValidPassword = await bcrypt.compare(String(password ?? ''), String(user.password ?? ''));
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
    return response(500, {
      error: 'Server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
