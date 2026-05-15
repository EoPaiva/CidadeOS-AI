import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
export const SERVER_DIR = path.dirname(__filename);
export const ROOT_DIR = path.resolve(SERVER_DIR, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

export function ensureRuntimeDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

export function nowIso() {
  return new Date().toISOString();
}

export function uuid(prefix = '') {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function normalizeText(value) {
  return String(value ?? '').trim();
}

export function toSlug(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

export function parseJsonBody(req, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = '';
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('Payload muito grande.'), { status: 413 }));
        req.destroy();
        return;
      }
      raw += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('JSON inválido.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

export function sendError(res, status, message, details = undefined) {
  sendJson(res, status, {
    ok: false,
    error: message,
    ...(details ? { details } : {})
  });
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export function isImageDataUrl(dataUrl) {
  return /^data:image\/(png|jpe?g|webp);base64,/i.test(String(dataUrl || ''));
}

export function saveDataUrlImage(dataUrl, prefix = 'occurrence') {
  if (!dataUrl) return null;
  if (!isImageDataUrl(dataUrl)) {
    const error = new Error('Anexo inválido. Envie PNG, JPG, JPEG ou WEBP.');
    error.status = 400;
    throw error;
  }

  const match = String(dataUrl).match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  const ext = match[1].toLowerCase().replace('jpeg', 'jpg');
  const content = Buffer.from(match[2], 'base64');
  const maxBytes = 1.5 * 1024 * 1024;
  if (content.length > maxBytes) {
    const error = new Error('Imagem muito grande. Limite recomendado: 1.5 MB.');
    error.status = 413;
    throw error;
  }

  ensureRuntimeDirs();
  const fileName = `${prefix}-${crypto.randomUUID()}.${ext}`;
  const filePath = path.join(ATTACHMENTS_DIR, fileName);
  fs.writeFileSync(filePath, content);
  return {
    fileName,
    fileUrl: `/uploads/${fileName}`,
    fileType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    sizeBytes: content.length
  };
}

export function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.ico': 'image/x-icon'
  };
  return map[ext] || 'application/octet-stream';
}

export function safeFileJoin(baseDir, requestedPath) {
  const cleanPath = requestedPath.split('?')[0].replace(/^\/+/, '');
  const target = path.resolve(baseDir, cleanPath);
  if (!target.startsWith(path.resolve(baseDir))) return null;
  return target;
}

export function monthKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysBetween(startIso, endIso = nowIso()) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86400000));
}
