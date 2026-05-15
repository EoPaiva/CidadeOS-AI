import crypto from 'node:crypto';

const DEFAULT_SECRET = 'dev-only-secret-change-me';

function secret() {
  return process.env.AUTH_SECRET || DEFAULT_SECRET;
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expected] = storedHash.split(':');
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}

function base64Url(input) {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createToken(user) {
  const header = { alg: 'HS256', typ: 'JWT-lite' };
  const payload = {
    sub: user.id,
    role: user.role,
    cityId: user.cityId || null,
    name: user.name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12
  };
  const unsigned = `${base64Url(header)}.${base64Url(payload)}`;
  return `${unsigned}.${sign(unsigned)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = sign(unsigned);
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function tokenFromRequest(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  CITY_ADMIN: 'CITY_ADMIN',
  DEPARTMENT_MANAGER: 'DEPARTMENT_MANAGER',
  AGENT: 'AGENT',
  HEALTH_AGENT: 'HEALTH_AGENT',
  CITIZEN: 'CITIZEN'
};

export function can(role, allowedRoles) {
  return allowedRoles.includes(role);
}
