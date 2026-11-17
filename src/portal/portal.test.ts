import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApiApp } from '../erp/apiApp';

async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

async function reqJson(baseUrl: string, path: string, options: RequestInit = {}, token?: string) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

test('Unified Portal routes single-system staff directly and multi-system executives to workspace selector', async () => {
  await withServer(async (baseUrl) => {
    // 1. Restaurant single-system login
    const restLogin = await reqJson(baseUrl, '/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'rest.manager@marhaba.demo', password: 'demo1234' }),
    });
    assert.equal(restLogin.status, 200);
    assert.deepEqual(restLogin.body.systems, ['restaurant']);
    assert.equal(restLogin.body.landingPath, '/management/restaurant/dashboard');

    // 2. Play Land single-system login
    const playLogin = await reqJson(baseUrl, '/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'pl.manager@marhaba.demo', password: 'demo1234' }),
    });
    assert.equal(playLogin.status, 200);
    assert.deepEqual(playLogin.body.systems, ['playland']);
    assert.equal(playLogin.body.landingPath, '/management/play-land/dashboard');

    // 3. CEO multi-system login
    const ceoLogin = await reqJson(baseUrl, '/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'riaz.ceo@marhaba.demo', password: 'demo1234' }),
    });
    assert.equal(ceoLogin.status, 200);
    assert.deepEqual(ceoLogin.body.systems, ['supermarket', 'restaurant', 'playland']);
    assert.equal(ceoLogin.body.landingPath, '/management');

    // 4. CEO can read consolidated executive summary with separate ledgers
    const execSum = await reqJson(baseUrl, '/api/portal/executive-summary', {}, ceoLogin.body.token);
    assert.equal(execSum.status, 200);
    assert.ok(execSum.body.supermarket.posRevenuePkr >= 0);
    assert.ok(execSum.body.restaurant.paidRevenuePkr >= 0);
    assert.ok(execSum.body.playland.ticketRevenuePkr >= 0);
  });
});

test('Strict cross-system RBAC isolation blocks Supermarket, Restaurant, and Play Land cross-access', async () => {
  await withServer(async (baseUrl) => {
    const restDemo = await reqJson(baseUrl, '/api/portal/auth/demo-role', {
      method: 'POST',
      body: JSON.stringify({ system: 'restaurant', roleId: 'restaurant_manager' }),
    });
    assert.equal(restDemo.status, 200);
    const restToken = restDemo.body.token;

    // Restaurant manager blocked from Supermarket & Play Land
    const smRes = await reqJson(baseUrl, '/api/mgmt/bootstrap', {}, restToken);
    assert.equal(smRes.status, 403);
    const plRes = await reqJson(baseUrl, '/api/play/bootstrap', {}, restToken);
    assert.equal(plRes.status, 403);
    const execRes = await reqJson(baseUrl, '/api/portal/executive-summary', {}, restToken);
    assert.equal(execRes.status, 403);

    // Play Land manager blocked from Supermarket & Restaurant
    const plDemo = await reqJson(baseUrl, '/api/portal/auth/demo-role', {
      method: 'POST',
      body: JSON.stringify({ system: 'playland', roleId: 'playland_manager' }),
    });
    assert.equal(plDemo.status, 200);
    assert.equal((await reqJson(baseUrl, '/api/mgmt/bootstrap', {}, plDemo.body.token)).status, 403);
    assert.equal((await reqJson(baseUrl, '/api/rest/bootstrap', {}, plDemo.body.token)).status, 403);

    // Supermarket cashier blocked from Restaurant & Play Land
    const smDemo = await reqJson(baseUrl, '/api/portal/auth/demo-role', {
      method: 'POST',
      body: JSON.stringify({ system: 'supermarket', roleId: 'cashier' }),
    });
    assert.equal(smDemo.status, 200);
    assert.equal((await reqJson(baseUrl, '/api/rest/bootstrap', {}, smDemo.body.token)).status, 403);
    assert.equal((await reqJson(baseUrl, '/api/play/bootstrap', {}, smDemo.body.token)).status, 403);
  });
});

test('Inter-business contracts connect Restaurant, Play Land & Supermarket without mixing ledgers', async () => {
  await withServer(async (baseUrl) => {
    const restLogin = await reqJson(baseUrl, '/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'rest.manager@marhaba.demo', password: 'demo1234' }),
    });
    const restToken = restLogin.body.token;

    // Restaurant sees IBR-2026-042 (Play Land catering request) and fulfills it
    const listRes = await reqJson(baseUrl, '/api/portal/inter-business', {}, restToken);
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.requests.some((r: { id: string }) => r.id === 'ibr-2'));

    const upd = await reqJson(
      baseUrl,
      '/api/portal/inter-business/ibr-2/status',
      { method: 'POST', body: JSON.stringify({ status: 'Fulfilled' }) },
      restToken
    );
    assert.equal(upd.status, 200);
    assert.equal(upd.body.request.status, 'Fulfilled');

    // Restaurant cannot mark Supermarket target request ibr-1 Fulfilled
    const blockedUpd = await reqJson(
      baseUrl,
      '/api/portal/inter-business/ibr-1/status',
      { method: 'POST', body: JSON.stringify({ status: 'Fulfilled' }) },
      restToken
    );
    assert.equal(blockedUpd.status, 403);
  });
});
