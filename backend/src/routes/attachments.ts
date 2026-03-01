import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { requireAuth } from '../middleware/require-auth.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';

const UPLOADS_DIR = path.resolve('uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg':   [[0xFF, 0xD8, 0xFF]],
  'image/png':    [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/gif':    [[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]],
  'image/webp':   [[0x52, 0x49, 0x46, 0x46]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'application/msword':                                         [[0xD0, 0xCF, 0x11, 0xE0]],
  'application/vnd.ms-excel':                                   [[0xD0, 0xCF, 0x11, 0xE0]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4B, 0x03, 0x04]],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       [[0x50, 0x4B, 0x03, 0x04]],
};

function verifyMagicBytes(filePath: string, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return true; // text types: no check
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  return signatures.some(sig => sig.every((byte, i) => buf[i] === byte));
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

const attachmentIdSchema = z.object({
  attachmentId: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  linkedEntityType: z.string().trim().max(40).optional(),
  linkedEntityId: z.coerce.number().int().positive().optional(),
});

export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

// List attachments for an entity (e.g., task)
attachmentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { linkedEntityType, linkedEntityId } = listQuerySchema.parse(req.query);

    const where: Record<string, unknown> = {};
    if (linkedEntityType) where.linkedEntityType = linkedEntityType;
    if (linkedEntityId) where.linkedEntityId = linkedEntityId;

    const items = await prisma.attachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ items, total: items.length });
  })
);

// Upload a new attachment
attachmentsRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }

    const userId = req.session.userId ?? null;
    const linkedEntityType = (req.body?.linkedEntityType as string) ?? null;
    const linkedEntityId = req.body?.linkedEntityId ? Number(req.body.linkedEntityId) : null;

    if (!verifyMagicBytes(file.path, file.mimetype)) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ error: { code: 'INVALID_FILE_TYPE', message: 'File content does not match declared type' } });
    }

    // Calculate checksum
    const fileBuffer = fs.readFileSync(file.path);
    const checksum = createHash('sha256').update(fileBuffer).digest('hex');

    const attachment = await prisma.attachment.create({
      data: {
        ownerUserId: userId,
        fileName: file.originalname,
        filePath: file.filename,
        contentType: file.mimetype,
        byteSize: file.size,
        checksum,
        linkedEntityType,
        linkedEntityId,
      },
    });

    res.status(201).json(attachment);
  })
);

// Download an attachment
attachmentsRouter.get(
  '/:attachmentId/download',
  asyncHandler(async (req, res) => {
    const { attachmentId } = attachmentIdSchema.parse(req.params);

    const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) {
      return res.status(404).json({ error: { code: 'ATTACHMENT_NOT_FOUND', message: 'Attachment not found' } });
    }

    const fullPath = path.resolve(UPLOADS_DIR, attachment.filePath);
    if (!fullPath.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
      return res.status(400).json({ error: { code: 'INVALID_PATH', message: 'Invalid file path' } });
    }
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: { code: 'FILE_MISSING', message: 'File not found on disk' } });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName}"`);
    res.setHeader('Content-Type', attachment.contentType ?? 'application/octet-stream');
    res.sendFile(fullPath);
  })
);

// Delete an attachment
attachmentsRouter.delete(
  '/:attachmentId',
  asyncHandler(async (req, res) => {
    const { attachmentId } = attachmentIdSchema.parse(req.params);

    const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) {
      return res.status(404).json({ error: { code: 'ATTACHMENT_NOT_FOUND', message: 'Attachment not found' } });
    }

    // Delete the file from disk
    const fullPath = path.resolve(UPLOADS_DIR, attachment.filePath);
    if (!fullPath.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
      return res.status(400).json({ error: { code: 'INVALID_PATH', message: 'Invalid file path' } });
    }
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    await prisma.attachment.delete({ where: { id: attachmentId } });
    res.status(204).send();
  })
);
