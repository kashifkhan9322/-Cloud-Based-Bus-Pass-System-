const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 100;
const rateBuckets = new Map();

const ROUTES = [
  { id: 'R101', from: 'Central Station', to: 'Tech Park', duration: '35 min', baseFare: 25, frequency: 'Every 10 min', type: 'Express' },
  { id: 'R102', from: 'City Centre', to: 'Airport Road', duration: '50 min', baseFare: 40, frequency: 'Every 15 min', type: 'Airport' },
  { id: 'R103', from: 'University', to: 'Central Station', duration: '25 min', baseFare: 20, frequency: 'Every 8 min', type: 'City' },
  { id: 'R104', from: 'Lake View', to: 'Business District', duration: '40 min', baseFare: 30, frequency: 'Every 12 min', type: 'City' }
];
const PASS_TYPES = {
  single: { label: 'Single ride', multiplier: 1, validity: 'One ride' },
  day: { label: 'Day pass', multiplier: 3, validity: '24 hours' },
  weekly: { label: 'Weekly pass', multiplier: 14, validity: '7 days' }
};

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, '[]\n', { flag: 'wx' });
}
function readBookings() {
  ensureStorage();
  try {
    const parsed = JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error('Booking storage is unavailable or corrupted.');
  }
}
function writeBookings(bookings) {
  ensureStorage();
  const temp = `${BOOKINGS_FILE}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(bookings, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, BOOKINGS_FILE);
}
function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
}
function getClientKey(req) {
  // In production, use the trusted load balancer's client-IP header only after configuring proxy trust.
  return req.socket.remoteAddress || 'unknown';
}
function rateLimit(req, res) {
  const now = Date.now();
  const key = getClientKey(req);
  const current = rateBuckets.get(key);
  if (!current || now > current.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  if (current.count > RATE_MAX) {
    json(res, 429, { error: 'Too many requests. Please wait a moment and try again.' });
    return true;
  }
  return false;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}
function safeString(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
function makeTicketCode() {
  return `BP-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}
function publicBooking(booking) {
  const { id, ticketCode, passengerName, email, routeId, routeName, passType, passLabel, validity, travelDate, quantity, unitPrice, totalPrice, status, createdAt } = booking;
  return { id, ticketCode, passengerName, email, routeId, routeName, passType, passLabel, validity, travelDate, quantity, unitPrice, totalPrice, status, createdAt };
}
async function handleApi(req, res, url) {
  if (rateLimit(req, res)) return;
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { status: 'ok', service: 'cloud-bus-pass-system', timestamp: new Date().toISOString() });
  }
  if (req.method === 'GET' && url.pathname === '/api/routes') {
    return json(res, 200, { routes: ROUTES, passTypes: PASS_TYPES });
  }
  if (req.method === 'POST' && url.pathname === '/api/bookings') {
    const body = await readBody(req);
    const passengerName = safeString(body.passengerName, 80);
    const email = safeString(body.email, 120).toLowerCase();
    const routeId = safeString(body.routeId, 10);
    const passType = safeString(body.passType, 10);
    const travelDate = safeString(body.travelDate, 10);
    const quantity = Number(body.quantity);

    if (passengerName.length < 2) return json(res, 400, { error: 'Enter a passenger name with at least 2 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' });
    const route = ROUTES.find(item => item.id === routeId);
    if (!route) return json(res, 400, { error: 'Please select a valid route.' });
    const pass = PASS_TYPES[passType];
    if (!pass) return json(res, 400, { error: 'Please select a valid pass type.' });
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 5) return json(res, 400, { error: 'Quantity must be between 1 and 5.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) return json(res, 400, { error: 'Choose a valid travel date.' });
    const date = new Date(`${travelDate}T00:00:00Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== travelDate || date < today) {
      return json(res, 400, { error: 'Travel date must be today or a future date.' });
    }

    // Price is always calculated on the server; client-submitted prices are ignored.
    const unitPrice = route.baseFare * pass.multiplier;
    const totalPrice = unitPrice * quantity;
    const booking = {
      id: crypto.randomUUID(),
      ticketCode: makeTicketCode(),
      passengerName,
      email,
      routeId: route.id,
      routeName: `${route.from} → ${route.to}`,
      passType,
      passLabel: pass.label,
      validity: pass.validity,
      travelDate,
      quantity,
      unitPrice,
      totalPrice,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString()
    };
    const bookings = readBookings();
    bookings.unshift(booking);
    writeBookings(bookings);
    return json(res, 201, { booking: publicBooking(booking) });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/bookings/')) {
    const code = decodeURIComponent(url.pathname.slice('/api/bookings/'.length)).toUpperCase();
    if (!/^BP-[A-F0-9]{16}$/.test(code)) return json(res, 400, { error: 'Enter a valid ticket code.' });
    const booking = readBookings().find(item => item.ticketCode === code);
    if (!booking) return json(res, 404, { error: 'No booking found for that ticket code.' });
    return json(res, 200, { booking: publicBooking(booking) });
  }
  return json(res, 404, { error: 'API endpoint not found.' });
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8'
};
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const resolved = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!resolved.startsWith(`${PUBLIC_DIR}${path.sep}`) && resolved !== path.join(PUBLIC_DIR, 'index.html')) {
    return json(res, 403, { error: 'Forbidden.' });
  }
  fs.readFile(resolved, (err, content) => {
    if (err) return json(res, 404, { error: 'Page not found.' });
    securityHeaders(res);
    res.setHeader('Content-Type', MIME[path.extname(resolved)] || 'application/octet-stream');
    res.setHeader('Cache-Control', path.extname(resolved) === '.html' ? 'no-cache' : 'public, max-age=3600');
    res.end(content);
  });
}
const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
    return serveStatic(req, res, url);
  } catch (err) {
    if (!res.headersSent) json(res, err.statusCode || 500, { error: err.statusCode ? err.message : 'Unexpected server error.' });
    if (!err.statusCode) console.error('[server error]', err);
  }
});
if (require.main === module) {
  ensureStorage();
  server.listen(PORT, HOST, () => console.log(`Cloud Bus Pass System running at http://${HOST}:${PORT}`));
}
module.exports = { server, ROUTES, PASS_TYPES, makeTicketCode };
