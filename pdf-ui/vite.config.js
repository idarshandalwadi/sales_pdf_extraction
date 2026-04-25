import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.resolve(__dirname, 'src/users.json');

const sanitizeUser = (user) => ({
  username: user.username,
  role: user.role,
  pdf_limit: Number(user.pdf_limit ?? 0),
  paid: Boolean(user.paid),
  paid_date: user.paid_date,
  current_count: Number(user.current_count ?? 0)
});

async function readUsers() {
  const raw = await fs.readFile(usersFilePath, 'utf8');
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

  await fs.writeFile(usersFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function collectJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function hasAdminAccess(req) {
  const roleHeader = req.headers['x-auth-role'];
  const usernameHeader = req.headers['x-auth-username'];
  return roleHeader === 'admin' && typeof usernameHeader === 'string' && usernameHeader.length > 0;
}

function createApiMiddleware() {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) {
      return next();
    }

    res.setHeader('Content-Type', 'application/json');

    try {
      if (req.method === 'POST' && req.url === '/api/login') {
        const { username, password } = await collectJsonBody(req);
        const users = await readUsers();
        const user = users.find((u) => u.username === username && u.password === password);

        if (!user) {
          res.statusCode = 401;
          return res.end(JSON.stringify({ error: 'Invalid credentials' }));
        }

        return res.end(JSON.stringify({ user: sanitizeUser(user) }));
      }

      const usagePathMatch = req.url.match(/^\/api\/users\/([^/]+)\/usage$/);
      if (req.method === 'GET' && usagePathMatch) {
        const username = decodeURIComponent(usagePathMatch[1]);
        const users = await readUsers();
        const user = users.find((u) => u.username === username);

        if (!user) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'User not found' }));
        }

        const pdf_limit = Number(user.pdf_limit ?? 0);
        const current_count = Number(user.current_count ?? 0);
        return res.end(JSON.stringify({
          username,
          pdf_limit,
          current_count,
          remaining: Math.max(pdf_limit - current_count, 0),
          hasReachedLimit: current_count >= pdf_limit
        }));
      }

      const incrementPathMatch = req.url.match(/^\/api\/users\/([^/]+)\/increment-usage$/);
      if (req.method === 'POST' && incrementPathMatch) {
        const username = decodeURIComponent(incrementPathMatch[1]);
        const users = await readUsers();
        const userIndex = users.findIndex((u) => u.username === username);

        if (userIndex === -1) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'User not found' }));
        }

        const user = users[userIndex];
        const pdf_limit = Number(user.pdf_limit ?? 0);
        const current_count = Number(user.current_count ?? 0);

        if (current_count >= pdf_limit) {
          res.statusCode = 403;
          return res.end(JSON.stringify({
            error: `Upload limit reached. You have used ${current_count}/${pdf_limit} PDFs.`,
            pdf_limit,
            current_count
          }));
        }

        const updated = { ...user, current_count: current_count + 1 };
        users[userIndex] = updated;
        await writeUsers(users);

        return res.end(JSON.stringify({
          username,
          pdf_limit: Number(updated.pdf_limit ?? 0),
          current_count: Number(updated.current_count ?? 0),
          remaining: Math.max(Number(updated.pdf_limit ?? 0) - Number(updated.current_count ?? 0), 0),
          hasReachedLimit: Number(updated.current_count ?? 0) >= Number(updated.pdf_limit ?? 0)
        }));
      }

      if (req.method === 'GET' && req.url === '/api/admin/users') {
        if (!hasAdminAccess(req)) {
          res.statusCode = 403;
          return res.end(JSON.stringify({ error: 'Admin access required' }));
        }

        const users = await readUsers();
        return res.end(JSON.stringify({
          users: users.map((user) => sanitizeUser(user))
        }));
      }

      const adminUpdatePathMatch = req.url.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (req.method === 'PUT' && adminUpdatePathMatch) {
        if (!hasAdminAccess(req)) {
          res.statusCode = 403;
          return res.end(JSON.stringify({ error: 'Admin access required' }));
        }

        const username = decodeURIComponent(adminUpdatePathMatch[1]);
        const payload = await collectJsonBody(req);
        const users = await readUsers();
        const userIndex = users.findIndex((u) => u.username === username);

        if (userIndex === -1) {
          res.statusCode = 404;
          return res.end(JSON.stringify({ error: 'User not found' }));
        }

        const existingUser = users[userIndex];
        const nextPdfLimit = Number(payload.pdf_limit ?? existingUser.pdf_limit ?? 0);
        const nextCurrentCount = Number(payload.current_count ?? existingUser.current_count ?? 0);
        const nextPaid = typeof payload.paid === 'boolean' ? payload.paid : Boolean(existingUser.paid);
        const nextPaidDate = nextPaid ? (payload.paid_date ?? existingUser.paid_date ?? null) : null;

        if (!Number.isFinite(nextPdfLimit) || nextPdfLimit < 0) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'pdf_limit must be a non-negative number' }));
        }

        if (!Number.isFinite(nextCurrentCount) || nextCurrentCount < 0) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'current_count must be a non-negative number' }));
        }

        const updatedUser = {
          ...existingUser,
          pdf_limit: nextPdfLimit,
          current_count: nextCurrentCount,
          paid: nextPaid,
          paid_date: nextPaidDate
        };

        users[userIndex] = updatedUser;
        await writeUsers(users);

        return res.end(JSON.stringify({
          user: sanitizeUser(updatedUser)
        }));
      }

      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Not found' }));
    } catch (error) {
      res.statusCode = 500;
      return res.end(JSON.stringify({
        error: 'Server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  preview: {
    port: 4173
  },
  plugins: [
    react(),
    {
      name: 'users-json-api',
      configureServer(server) {
        server.middlewares.use(createApiMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(createApiMiddleware());
      }
    }
  ]
})
