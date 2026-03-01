import bcrypt from 'bcrypt';
import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/require-auth.js';
import { requireRole } from '../middleware/require-role.js';
import { asyncHandler } from '../utils/async-handler.js';

export const authRouter = Router();

const SALT_ROUNDS = 12;
const ROLES = ['ADMIN', 'MEMBER', 'VIEWER'] as const;

/* ─── Schemas ─── */

const passwordSchema = z.string().min(8).max(128)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const registerSchema = z.object({
  username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_ -]+$/, 'Username may only contain letters, numbers, spaces, hyphens, and underscores'),
  email: z.string().email().optional(),
  password: passwordSchema,
  role: z.enum(ROLES).default('MEMBER'),
});

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  email: z.string().email().nullable().optional(),
  timezone: z.string().max(60).optional(),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

/* ─── Public user shape ─── */

function publicUser(user: { id: number; username: string; email: string | null; role: string; timezone: string; colorHex: string | null; createdAt: Date }) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    timezone: user.timezone,
    colorHex: user.colorHex,
    createdAt: user.createdAt.toISOString(),
  };
}

/* ─── POST /register ─── */

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const payload = registerSchema.parse(req.body ?? {});

    // Block registration once any active user exists (bootstrap only)
    const activeUserCount = await prisma.user.count({
      where: { deletedAt: null, NOT: { passwordHash: '!disabled!' } },
    });
    if (activeUserCount > 0) {
      return res.status(403).json({
        error: {
          code: 'REGISTRATION_DISABLED',
          message: 'Registration is disabled. Ask an administrator to create an account for you.',
        },
      });
    }

    // Check username uniqueness
    const existingUsername = await prisma.user.findUnique({ where: { username: payload.username } });
    if (existingUsername) {
      return res.status(409).json({ error: { code: 'USERNAME_TAKEN', message: 'Username already taken' } });
    }

    // Check email uniqueness if provided
    if (payload.email) {
      const existingEmail = await prisma.user.findUnique({ where: { email: payload.email } });
      if (existingEmail) {
        return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email already in use' } });
      }
    }

    // If this is the first real user, check if default admin exists and upgrade
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0 || (userCount === 1 && (await prisma.user.findFirst({ where: { passwordHash: '!disabled!' } })));

    const passwordHash = await bcrypt.hash(payload.password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        username: payload.username,
        email: payload.email ?? null,
        passwordHash,
        role: isFirstUser ? 'ADMIN' : payload.role,
      },
    });

    // Set session
    req.session.userId = user.id;
    req.session.role = user.role;

    res.status(201).json(publicUser(user));
  })
);

/* ─── POST /login ─── */

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body ?? {});

    const user = await prisma.user.findUnique({ where: { username: payload.username } });

    if (!user || user.deletedAt) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } });
    }

    // Disabled password hash means the account can't be logged into
    if (user.passwordHash === '!disabled!') {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } });
    }

    const valid = await bcrypt.compare(payload.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } });
    }

    // Update lastLoginAt
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    // Set session
    req.session.userId = user.id;
    req.session.role = user.role;

    res.json(publicUser(user));
  })
);

/* ─── POST /logout ─── */

authRouter.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: { code: 'LOGOUT_FAILED', message: 'Failed to logout' } });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out' });
  });
});

/* ─── GET /me ─── */

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });

    if (!user || user.deletedAt) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: { code: 'SESSION_INVALID', message: 'User not found' } });
    }

    // Keep session role in sync with DB role (fixes stale sessions)
    if (req.session.role !== user.role) {
      req.session.role = user.role;
    }

    res.json(publicUser(user));
  })
);

/* ─── PATCH /me ─── */

authRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = updateProfileSchema.parse(req.body ?? {});

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No changes provided' } });
    }

    // Check email uniqueness if changing
    if (payload.email) {
      const existing = await prisma.user.findFirst({
        where: { email: payload.email, id: { not: req.session.userId } },
      });
      if (existing) {
        return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email already in use' } });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.session.userId },
      data: payload,
    });

    res.json(publicUser(user));
  })
);

/* ─── POST /me/password ─── */

authRouter.post(
  '/me/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = changePasswordSchema.parse(req.body ?? {});

    const user = await prisma.user.findUnique({ where: { id: req.session.userId } });
    if (!user) {
      return res.status(401).json({ error: { code: 'SESSION_INVALID', message: 'User not found' } });
    }

    const valid = await bcrypt.compare(payload.currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(403).json({ error: { code: 'WRONG_PASSWORD', message: 'Current password is incorrect' } });
    }

    const newHash = await bcrypt.hash(payload.newPassword, SALT_ROUNDS);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

    res.json({ message: 'Password changed' });
  })
);

/* ─── GET /users (admin only) ─── */

authRouter.get(
  '/users',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        timezone: true,
        colorHex: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    res.json({ items: users, total: users.length });
  })
);

/* ─── POST /users (admin-side user creation) ─── */

const adminCreateUserSchema = z.object({
  username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9_ -]+$/, 'Username may only contain letters, numbers, spaces, hyphens, and underscores'),
  email: z.string().email().optional(),
  password: passwordSchema,
  role: z.enum(ROLES).default('MEMBER'),
});

authRouter.post(
  '/users',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const payload = adminCreateUserSchema.parse(req.body ?? {});

    const existingUsername = await prisma.user.findUnique({ where: { username: payload.username } });
    if (existingUsername) {
      return res.status(409).json({ error: { code: 'USERNAME_TAKEN', message: 'Username already taken' } });
    }

    if (payload.email) {
      const existingEmail = await prisma.user.findUnique({ where: { email: payload.email } });
      if (existingEmail) {
        return res.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'Email already in use' } });
      }
    }

    const passwordHash = await bcrypt.hash(payload.password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        username: payload.username,
        email: payload.email ?? null,
        passwordHash,
        role: payload.role,
      },
    });

    res.status(201).json(publicUser(user));
  })
);

/* ─── PATCH /users/:userId/role (admin only) ─── */

const updateRoleSchema = z.object({
  role: z.enum(ROLES),
});

authRouter.patch(
  '/users/:userId/role',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid user ID' } });
    }

    const payload = updateRoleSchema.parse(req.body ?? {});

    // Prevent changing own role
    if (userId === req.session.userId) {
      return res.status(400).json({ error: { code: 'SELF_ROLE_CHANGE', message: 'You cannot change your own role' } });
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.deletedAt) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role: payload.role },
    });

    res.json(publicUser(updated));
  })
);

/* ─── POST /users/:userId/reset-password (admin only) ─── */

const adminResetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

authRouter.post(
  '/users/:userId/reset-password',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid user ID' } });
    }

    const payload = adminResetPasswordSchema.parse(req.body ?? {});

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.deletedAt) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const newHash = await bcrypt.hash(payload.newPassword, SALT_ROUNDS);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });

    res.json({ message: 'Password reset successfully' });
  })
);

/* ─── DELETE /users/:userId (admin only – soft delete) ─── */

authRouter.delete(
  '/users/:userId',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid user ID' } });
    }

    // Prevent self-deletion
    if (userId === req.session.userId) {
      return res.status(400).json({ error: { code: 'SELF_DELETE', message: 'You cannot delete your own account' } });
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.deletedAt) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    res.json({ message: 'User deleted' });
  })
);
