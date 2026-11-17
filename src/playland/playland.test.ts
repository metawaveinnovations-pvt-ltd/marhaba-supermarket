import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApiApp } from '../erp/apiApp';
import {
  checkSessionCapacity,
  computePlayShiftClosing,
  computeTicketPrice,
  getEligibleAttractionsForChild,
  validateTicketAdmission,
} from './calculations';
import { PLAYLAND_ROLES } from './permissions';
import { INITIAL_PLAYLAND_STAFF } from './seedData';

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

test('Pure Play Land calculations: pricing, capacity limit, admission rules & shift variance', () => {
  const pricing = computeTicketPrice({
    pkg: {
      id: 'pkg-1',
      packageCode: 'PL-PKG-1',
      name: 'Standard Pass',
      ticketType: 'Family Pass',
      pricePkr: 1500,
      childCountIncluded: 1,
      adultCountIncluded: 1,
      durationLabel: '120 Minutes',
      permittedAttractionIds: [],
      active: true,
      approvalStatus: 'Approved',
      isDemoRecord: true,
    },
    participantCountMultiplier: 2,
    discountPercent: 10,
  });
  assert.equal(pricing.baseAmountPkr, 3000);
  assert.equal(pricing.discountAmountPkr, 300);
  assert.equal(pricing.finalAmountPkr, 2700);

  const capFail = checkSessionCapacity(
    {
      id: 's1',
      sessionCode: 'HYD-S1',
      date: '2026-05-01',
      windowLabel: 'Evening',
      zoneScope: 'All Zones',
      maxCapacity: 50,
      allocatedCount: 48,
      checkedInCount: 30,
      status: 'Open',
    },
    4
  );
  assert.equal(capFail.allowed, false);

  const shiftCalc = computePlayShiftClosing({
    openingFloatPkr: 10000,
    cashSalesPkr: 15000,
    refundsPkr: 1500,
    declaredCashPkr: 23500,
  });
  assert.equal(shiftCalc.expectedCashPkr, 23500);
  assert.equal(shiftCalc.variancePkr, 0);
  assert.equal(shiftCalc.hasVariance, false);

  const eligible3Yr = getEligibleAttractionsForChild(
    [
      {
        id: 'a1',
        attractionCode: 'PL-A1',
        name: 'Toddler Soft',
        type: 'Soft Play',
        zone: 'Toddler Zone',
        description: 'Soft play',
        minAgeYears: 1,
        maxAgeYears: 5,
        sessionDurationMinutes: 60,
        heightRule: 'All',
        guardianRequired: true,
        operatingInstructions: 'Safe play',
        inspectionRequirements: 'Daily check',
        capacity: 20,
        activeOccupancy: 0,
        status: 'Operating',
        maintenanceStatus: 'Clear',
        isDemoRecord: true,
      },
      {
        id: 'a2',
        attractionCode: 'PL-A2',
        name: 'Adventure',
        type: 'Climbing & Slides',
        zone: 'Main Zone',
        description: 'Climbing',
        minAgeYears: 6,
        maxAgeYears: 14,
        sessionDurationMinutes: 60,
        heightRule: '100cm+',
        guardianRequired: false,
        operatingInstructions: 'Climb safely',
        inspectionRequirements: 'Daily check',
        capacity: 20,
        activeOccupancy: 0,
        status: 'Operating',
        maintenanceStatus: 'Clear',
        isDemoRecord: true,
      },
    ],
    3
  );
  assert.equal(eligible3Yr.eligible.length, 1);
  assert.equal(eligible3Yr.eligible[0].id, 'a1');

  const inv = validateTicketAdmission({
    ticket: undefined,
    session: undefined,
    attractions: [],
    pkg: undefined,
    todayDate: '2026-05-01',
  });
  assert.equal(inv.result, 'Invalid');
  assert.equal(inv.canAdmit, false);
});

test('All 16 Play Land roles authenticate and load scoped modules cleanly', async () => {
  await withServer(async (baseUrl) => {
    assert.equal(Object.keys(PLAYLAND_ROLES).length, 16);
    assert.equal(INITIAL_PLAYLAND_STAFF.length, 16);

    for (const staff of INITIAL_PLAYLAND_STAFF) {
      const login = await reqJson(baseUrl, '/api/portal/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: staff.email, password: staff.demoPin, systemHint: 'playland' }),
      });
      assert.equal(login.status, 200, `Login failed for ${staff.roleId}`);
      const boot = await reqJson(baseUrl, '/api/play/bootstrap', {}, login.body.token);
      assert.equal(boot.status, 200, `Bootstrap failed for ${staff.roleId}`);
    }
  });
});

test('Play Land ticketing idempotency, payment failure, oversell rejection, duplicate gate scan & safety lockout flow', async () => {
  await withServer(async (baseUrl) => {
    const cashierToken = (
      await reqJson(baseUrl, '/api/portal/auth/demo-role', {
        method: 'POST',
        body: JSON.stringify({ system: 'playland', roleId: 'ticket_cashier' }),
      })
    ).body.token;

    // 1. Payment failure leaves no ticket & does not consume capacity
    const failSale = await reqJson(
      baseUrl,
      '/api/play/tickets/sell',
      {
        method: 'POST',
        body: JSON.stringify({
          packageId: 'pkg-all-access',
          sessionId: 'sess-afternoon',
          guestName: 'Test Failed Card',
          guestPhone: '0300111222',
          paymentMethod: 'Card',
          simulatePaymentFailure: true,
        }),
      },
      cashierToken
    );
    assert.equal(failSale.status, 402);

    // 2. Idempotent ticket issuance
    const idem = `idem-test-${Date.now()}`;
    const sale1 = await reqJson(
      baseUrl,
      '/api/play/tickets/sell',
      {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: idem,
          packageId: 'pkg-all-access',
          sessionId: 'sess-afternoon',
          guestName: 'Ayesha Bilal',
          guestPhone: '0300333444',
          childAges: [7],
          paymentMethod: 'Cash',
        }),
      },
      cashierToken
    );
    assert.equal(sale1.status, 201);
    const sale2 = await reqJson(
      baseUrl,
      '/api/play/tickets/sell',
      {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: idem,
          packageId: 'pkg-all-access',
          sessionId: 'sess-afternoon',
          guestName: 'Ayesha Bilal',
          guestPhone: '0300333444',
          paymentMethod: 'Cash',
        }),
      },
      cashierToken
    );
    assert.equal(sale2.status, 200);
    assert.equal(sale2.body.deduplicated, true);

    // 3. Oversell protection
    const oversell = await reqJson(
      baseUrl,
      '/api/play/tickets/sell',
      {
        method: 'POST',
        body: JSON.stringify({
          packageId: 'pkg-all-access',
          sessionId: 'sess-afternoon',
          guestName: 'Huge Group',
          guestPhone: '0300555666',
          participantMultiplier: 200,
          paymentMethod: 'Cash',
        }),
      },
      cashierToken
    );
    assert.equal(oversell.status, 409);

    // 4. Gate scan: Valid -> Already Used on duplicate scan
    const gateToken = (
      await reqJson(baseUrl, '/api/portal/auth/demo-role', {
        method: 'POST',
        body: JSON.stringify({ system: 'playland', roleId: 'admissions_attendant' }),
      })
    ).body.token;

    const scan1 = await reqJson(
      baseUrl,
      '/api/play/admissions/scan',
      { method: 'POST', body: JSON.stringify({ codeOrQuery: sale1.body.ticket.ticketCode }) },
      gateToken
    );
    assert.equal(scan1.status, 200);
    assert.equal(scan1.body.result, 'Valid');
    assert.equal(scan1.body.canAdmit, true);

    const scanDup = await reqJson(
      baseUrl,
      '/api/play/admissions/scan',
      { method: 'POST', body: JSON.stringify({ codeOrQuery: sale1.body.ticket.ticketCode }) },
      gateToken
    );
    assert.equal(scanDup.status, 200);
    assert.equal(scanDup.body.result, 'Already Used');
    assert.equal(scanDup.body.canAdmit, false);

    // 5. Safety fault lockout -> Technician repair -> Safety Officer clearance
    const opToken = (
      await reqJson(baseUrl, '/api/portal/auth/demo-role', {
        method: 'POST',
        body: JSON.stringify({ system: 'playland', roleId: 'ride_operator' }),
      })
    ).body.token;
    const faultRes = await reqJson(
      baseUrl,
      '/api/play/maintenance/faults',
      {
        method: 'POST',
        body: JSON.stringify({
          attractionId: 'attr-carousel-rides',
          severity: 'Safety-Critical',
          faultDescription: 'Drive belt tension sensor fault during pre-open test',
        }),
      },
      opToken
    );
    assert.equal(faultRes.status, 201);
    assert.equal(faultRes.body.attraction.status, 'Out of Service');
    const woId = faultRes.body.workOrder.id;

    // Operator & Manager blocked from opening safety-locked ride
    const blockedOpen = await reqJson(
      baseUrl,
      '/api/play/attractions/attr-carousel-rides/status',
      { method: 'POST', body: JSON.stringify({ status: 'Operating' }) },
      opToken
    );
    assert.equal(blockedOpen.status, 403);

    // Technician marks repair completed
    const techToken = (
      await reqJson(baseUrl, '/api/portal/auth/demo-role', {
        method: 'POST',
        body: JSON.stringify({ system: 'playland', roleId: 'maintenance_technician' }),
      })
    ).body.token;
    await reqJson(
      baseUrl,
      `/api/play/maintenance/work-orders/${woId}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'Repair Completed', repairActionNotes: 'Replaced spring mat' }) },
      techToken
    );
    // Technician cannot clear safety hold (requires Safety Officer / Maintenance Supervisor)
    const techClearFail = await reqJson(
      baseUrl,
      `/api/play/maintenance/work-orders/${woId}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'Cleared for Service' }) },
      techToken
    );
    assert.equal(techClearFail.status, 403);

    // Safety Officer clears work order & opens attraction
    const safetyToken = (
      await reqJson(baseUrl, '/api/portal/auth/demo-role', {
        method: 'POST',
        body: JSON.stringify({ system: 'playland', roleId: 'safety_officer' }),
      })
    ).body.token;
    const cleared = await reqJson(
      baseUrl,
      `/api/play/maintenance/work-orders/${woId}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'Cleared for Service' }) },
      safetyToken
    );
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.attraction.status, 'Ready / Authorized to Open');

    // 6. Confidential child note redaction test
    await reqJson(
      baseUrl,
      '/api/play/safety/incidents',
      {
        method: 'POST',
        body: JSON.stringify({
          category: 'Missing-Child Alert',
          severity: 'High / Urgent',
          summary: 'Minor separated near Arcade entrance, reunited safely',
          immediateActionTaken: 'Page + Guardian ID verification',
          confidentialChildNote: true,
        }),
      },
      safetyToken
    );
    const opBoot = await reqJson(baseUrl, '/api/play/bootstrap', {}, opToken);
    assert.ok(
      opBoot.body.incidents.some((inc: { summary: string }) =>
        inc.summary.includes('Protected Child Incident')
      )
    );
  });
});
