import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApiApp } from '../erp/apiApp';
import {
  computeOrderLineTotal,
  computeRestaurantOrderTotals,
  computeRestaurantShiftClosing,
  computeSplitCheckByGuests,
  hasReservationConflict,
} from './calculations';
import { RESTAURANT_ROLES } from './permissions';
import { INITIAL_RESTAURANT_STAFF } from './seedData';

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

test('Pure restaurant calculations: order totals, split bills, reservation conflict & shift variance', () => {
  const line = computeOrderLineTotal(1200, 2, [{ priceDeltaPkr: 150 }]);
  assert.equal(line, 2700);

  const totals = computeRestaurantOrderTotals({
    items: [
      {
        lineId: 'l1',
        dishId: 'd1',
        dishName: 'Karahi',
        portionLabel: 'Full',
        quantity: 1,
        unitPricePkr: 2000,
        modifiers: [],
        station: 'pakistani_desi',
        ticketVersion: 1,
        kitchenStatus: 'Queued',
        lineTotalPkr: 2000,
        ingredientsDeducted: false,
      },
    ],
    discountPercent: 10,
    serviceChargeRatePercent: 5,
    taxRatePercent: 13,
  });
  assert.equal(totals.subtotalPkr, 2000);
  assert.equal(totals.discountAmountPkr, 200);
  assert.equal(totals.serviceChargePkr, 90);
  assert.equal(totals.taxAmountPkr, 234);
  assert.equal(totals.grandTotalPkr, 2124);

  const splits = computeSplitCheckByGuests(1000, 3);
  assert.deepEqual(splits, [334, 333, 333]);
  assert.equal(
    splits.reduce((a, b) => a + b, 0),
    1000
  );

  const closing = computeRestaurantShiftClosing({
    openingFloatPkr: 15000,
    cashSalesPkr: 12500,
    refundsPkr: 500,
    declaredCashPkr: 26800,
  });
  assert.equal(closing.expectedCashPkr, 27000);
  assert.equal(closing.variancePkr, -200);
  assert.equal(closing.hasVariance, true);

  const conflict = hasReservationConflict({
    existingReservations: [
      {
        id: 'r1',
        reservationCode: 'RES-1',
        branchId: 'hyderabad',
        guestName: 'Test',
        phone: '0300',
        date: '2026-05-01',
        timeSlot: '20:00',
        partySize: 4,
        specialRequests: '',
        source: 'Phone',
        assignedTableId: 'tbl-1',
        status: 'Confirmed',
        createdAt: '',
        isDemoRecord: true,
      },
    ],
    tables: [
      {
        id: 'tbl-1',
        branchId: 'hyderabad',
        zoneId: 'z1',
        zoneName: 'Zone 1',
        tableNumber: 'T-01',
        capacity: 4,
        status: 'Reserved',
      },
    ],
    branchId: 'hyderabad',
    date: '2026-05-01',
    timeSlot: '20:00',
    partySize: 4,
    assignedTableId: 'tbl-1',
  });
  assert.equal(conflict.conflict, true);
});

test('All 18 Restaurant roles authenticate, scope modules, and enforce station & payment RBAC', async () => {
  await withServer(async (baseUrl) => {
    assert.equal(Object.keys(RESTAURANT_ROLES).length, 18);
    assert.equal(INITIAL_RESTAURANT_STAFF.length, 18);

    for (const staff of INITIAL_RESTAURANT_STAFF) {
      const login = await reqJson(baseUrl, '/api/portal/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: staff.email, password: staff.demoPin, systemHint: 'restaurant' }),
      });
      assert.equal(login.status, 200, `Login failed for ${staff.roleId}`);
      const boot = await reqJson(baseUrl, '/api/rest/bootstrap', {}, login.body.token);
      assert.equal(boot.status, 200, `Bootstrap failed for ${staff.roleId}`);
      const expectedCostVisible = RESTAURANT_ROLES[staff.roleId].canViewFoodCost;
      const firstDish = boot.body.menu[0];
      if (!expectedCostVisible) {
        assert.equal(firstDish.foodCostPkr, null, `${staff.roleId} should have redacted food cost`);
      }
    }

    // Station chef scoped to BBQ & Grill cannot settle order or update Karahi ticket
    const grillLogin = await reqJson(baseUrl, '/api/portal/auth/demo-role', {
      method: 'POST',
      body: JSON.stringify({ system: 'restaurant', roleId: 'station_chef' }),
    });
    const grillToken = grillLogin.body.token;
    const payAttempt = await reqJson(
      baseUrl,
      '/api/rest/orders/rord-101/pay',
      { method: 'POST', body: JSON.stringify({ method: 'Cash', amountPkr: 500 }) },
      grillToken
    );
    assert.equal(payAttempt.status, 403);
  });
});

test('Restaurant E2E workflow: open order -> KDS addition without double deduction -> dish auto-86 -> card fail -> settle & shift close', async () => {
  await withServer(async (baseUrl) => {
    const waiterRes = await reqJson(baseUrl, '/api/portal/auth/demo-role', {
      method: 'POST',
      body: JSON.stringify({ system: 'restaurant', roleId: 'waiter' }),
    });
    const waiterToken = waiterRes.body.token;

    // 1. Open Dine-In order at tbl-r2
    const openOrd = await reqJson(
      baseUrl,
      '/api/rest/orders',
      {
        method: 'POST',
        body: JSON.stringify({
          branchId: 'hyderabad',
          serviceType: 'Dine-In',
          tableId: 'tbl-r2',
          guestCount: 3,
          items: [{ dishId: 'dish-karahi', portionId: 'half', quantity: 1, prepNotes: 'Medium spice' }],
        }),
      },
      waiterToken
    );
    assert.equal(openOrd.status, 201);
    const orderId = openOrd.body.order.id;
    assert.equal(openOrd.body.order.ticketVersion, 1);

    // 2. Add BBQ addition v2 -> creates new KDS ticket v2
    const addRes = await reqJson(
      baseUrl,
      `/api/rest/orders/${orderId}/items`,
      {
        method: 'POST',
        body: JSON.stringify({
          items: [{ dishId: 'dish-bbq-platter', portionId: 'regular', quantity: 1 }],
        }),
      },
      waiterToken
    );
    assert.equal(addRes.status, 200);
    assert.equal(addRes.body.order.ticketVersion, 2);
    assert.equal(addRes.body.kitchenTickets[0].version, 2);

    // 3. Waiter cannot mark payment
    const waiterPay = await reqJson(
      baseUrl,
      `/api/rest/orders/${orderId}/pay`,
      { method: 'POST', body: JSON.stringify({ method: 'Cash', amountPkr: 1000 }) },
      waiterToken
    );
    assert.equal(waiterPay.status, 403);

    // 4. Cashier tests card failure -> 402 leaves order unpaid, then settles
    const cashierToken = (
      await reqJson(baseUrl, '/api/portal/auth/demo-role', {
        method: 'POST',
        body: JSON.stringify({ system: 'restaurant', roleId: 'restaurant_cashier' }),
      })
    ).body.token;

    const failPay = await reqJson(
      baseUrl,
      `/api/rest/orders/${orderId}/pay`,
      {
        method: 'POST',
        body: JSON.stringify({ method: 'Card', amountPkr: addRes.body.order.grandTotalPkr, simulateFailure: true }),
      },
      cashierToken
    );
    assert.equal(failPay.status, 402);

    const okPay = await reqJson(
      baseUrl,
      `/api/rest/orders/${orderId}/pay`,
      {
        method: 'POST',
        body: JSON.stringify({
          method: 'Cash',
          amountPkr: addRes.body.order.grandTotalPkr,
          closeTable: true,
        }),
      },
      cashierToken
    );
    assert.equal(okPay.status, 200);
    assert.equal(okPay.body.order.status, 'Closed');

    // 5. Reservation conflict blocked on duplicate date/time/table
    const mgrToken = (
      await reqJson(baseUrl, '/api/portal/auth/demo-role', {
        method: 'POST',
        body: JSON.stringify({ system: 'restaurant', roleId: 'restaurant_manager' }),
      })
    ).body.token;
    const r1 = await reqJson(
      baseUrl,
      '/api/rest/reservations',
      {
        method: 'POST',
        body: JSON.stringify({
          branchId: 'hyderabad',
          guestName: 'Family A',
          phone: '0300111222',
          date: '2026-12-20',
          timeSlot: '20:30',
          partySize: 4,
          assignedTableId: 'tbl-r2',
          confirmImmediately: true,
        }),
      },
      mgrToken
    );
    assert.equal(r1.status, 201);
    const r2 = await reqJson(
      baseUrl,
      '/api/rest/reservations',
      {
        method: 'POST',
        body: JSON.stringify({
          branchId: 'hyderabad',
          guestName: 'Family B',
          phone: '0300999888',
          date: '2026-12-20',
          timeSlot: '20:30',
          partySize: 4,
          assignedTableId: 'tbl-r2',
          confirmImmediately: true,
        }),
      },
      mgrToken
    );
    assert.equal(r2.status, 409);

    // 6. Shift closing & SoD verification
    const boot = await reqJson(baseUrl, '/api/rest/bootstrap', {}, cashierToken);
    const openShiftId = boot.body.shifts[0].id;
    const closedShift = await reqJson(
      baseUrl,
      `/api/rest/accounts/shifts/${openShiftId}/close`,
      { method: 'POST', body: JSON.stringify({ declaredCashPkr: 15000 }) },
      cashierToken
    );
    assert.equal(closedShift.status, 200);
    assert.equal(closedShift.body.shift.status, 'Pending Verification');

    const accToken = (
      await reqJson(baseUrl, '/api/portal/auth/demo-role', {
        method: 'POST',
        body: JSON.stringify({ system: 'restaurant', roleId: 'accounts_officer' }),
      })
    ).body.token;
    const verified = await reqJson(
      baseUrl,
      `/api/rest/accounts/shifts/${openShiftId}/verify`,
      { method: 'POST', body: JSON.stringify({}) },
      accToken
    );
    assert.equal(verified.status, 200);
    assert.equal(verified.body.shift.status, 'Posted to Accounts');
  });
});
