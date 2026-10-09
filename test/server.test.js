const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

let child;
let baseUrl;
let tempDir;
let output = '';
let port;

async function waitForServer(url, processRef) {
  for (let i = 0; i < 80; i++) {
    if (processRef.exitCode !== null) throw new Error(`Server exited early: ${output}`);
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server did not start: ${output}`);
}
async function postBooking(overrides = {}) {
  return fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      passengerName: 'Test Passenger',
      email: 'test@example.com',
      routeId: 'R101',
      passType: 'single',
      travelDate: new Date().toISOString().slice(0, 10),
      quantity: 1,
      ...overrides
    })
  });
}

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wayfare-test-'));
  port = 3100 + Math.floor(Math.random() * 2000);
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: tempDir },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  await waitForServer(baseUrl, child);
});
test.after(() => {
  if (child && child.exitCode === null) child.kill();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('health endpoint responds with ok', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'ok');
});
test('route list includes configured routes and pass types', async () => {
  const response = await fetch(`${baseUrl}/api/routes`);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.routes.length, 4);
  assert.equal(data.passTypes.weekly.multiplier, 14);
});
test('booking calculates fare on server and ignores client-supplied price', async () => {
  const response = await postBooking({ unitPrice: 0, totalPrice: 0 });
  const data = await response.json();
  assert.equal(response.status, 201);
  assert.equal(data.booking.unitPrice, 25);
  assert.equal(data.booking.totalPrice, 25);
  assert.match(data.booking.ticketCode, /^BP-[A-F0-9]{16}$/);
});
test('weekly pass fare and quantity are calculated correctly', async () => {
  const response = await postBooking({ routeId: 'R103', passType: 'weekly', quantity: 2 });
  const data = await response.json();
  assert.equal(response.status, 201);
  assert.equal(data.booking.unitPrice, 280);
  assert.equal(data.booking.totalPrice, 560);
});
test('rejects invalid email and quantity', async () => {
  const badEmail = await postBooking({ email: 'not-an-email' });
  assert.equal(badEmail.status, 400);
  const badQuantity = await postBooking({ quantity: 6 });
  assert.equal(badQuantity.status, 400);
});
test('ticket lookup retrieves a saved booking', async () => {
  const created = await postBooking({ passengerName: 'Lookup Person' });
  const { booking } = await created.json();
  const response = await fetch(`${baseUrl}/api/bookings/${booking.ticketCode}`);
  const found = await response.json();
  assert.equal(response.status, 200);
  assert.equal(found.booking.id, booking.id);
  assert.equal(found.booking.passengerName, 'Lookup Person');
});
test('unknown ticket code returns 404', async () => {
  const response = await fetch(`${baseUrl}/api/bookings/BP-DEADBEEFDEADBEEF`);
  assert.equal(response.status, 404);
});
test('serves the web application with security headers', async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
});
