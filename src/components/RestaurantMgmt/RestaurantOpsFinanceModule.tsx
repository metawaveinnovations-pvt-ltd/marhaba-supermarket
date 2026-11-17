import React, { useState } from 'react';
import { restaurantApi, type RestaurantBootstrapPayload } from './restaurantApi';

interface RestaurantOpsFinanceModuleProps {
  mode: 'purchasing' | 'deals' | 'staff' | 'customers' | 'accounts' | 'reports' | 'settings';
  data: RestaurantBootstrapPayload;
  onRefresh: () => Promise<void>;
}

export function RestaurantOpsFinanceModule({ mode, data, onRefresh }: RestaurantOpsFinanceModuleProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Purchasing state
  const [poType, setPoType] = useState<'External Supplier' | 'Supermarket Inter-Business Transfer'>(
    'Supermarket Inter-Business Transfer'
  );
  const [poIngId, setPoIngId] = useState(data.ingredients[0]?.id || '');
  const [poQty, setPoQty] = useState('10');
  const [poSupplier, setPoSupplier] = useState('Mehran Fresh Produce Co.');

  // Deals state
  const [dealTitle, setDealTitle] = useState('');
  const [dealWindow, setDealWindow] = useState('Fri-Sun · Dinner 19:00-23:00');
  const [dealPct, setDealPct] = useState('15');

  // Guest care state
  const [caseGuest, setCaseGuest] = useState('');
  const [caseNotes, setCaseNotes] = useState('');

  // Shift closing state
  const [declaredCash, setDeclaredCash] = useState('25000');

  // MIS Settings state
  const [svcRate, setSvcRate] = useState(String(data.config.serviceChargeRatePercent));
  const [taxRate, setTaxRate] = useState(String(data.config.taxRatePercent));
  const [takeawayOn, setTakeawayOn] = useState(data.config.takeawayEnabled);
  const [deliveryOn, setDeliveryOn] = useState(data.config.deliveryEnabled);

  const runAction = async (fn: () => Promise<unknown>, okMsg: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      await onRefresh();
      setNotice(okMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const renderBanner = () =>
    (notice || error) && (
      <div
        className={`p-3 rounded-xl border text-xs font-semibold ${
          error
            ? 'bg-[#9B1C2E]/8 border-[#9B1C2E]/25 text-[#9B1C2E]'
            : 'bg-[#166534]/8 border-[#166534]/25 text-[#166534]'
        }`}
      >
        {error || notice}
      </div>
    );

  if (mode === 'purchasing') {
    return (
      <div className="space-y-5">
        {renderBanner()}
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#1C1917]">
            Create Supplier PO or Supermarket Inter-Business Transfer Request
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <select
              value={poType}
              onChange={(e) =>
                setPoType(e.target.value as 'External Supplier' | 'Supermarket Inter-Business Transfer')
              }
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            >
              <option value="Supermarket Inter-Business Transfer">Supermarket Inter-Business Request</option>
              <option value="External Supplier">External Culinary Supplier</option>
            </select>
            <select
              value={poIngId}
              onChange={(e) => setPoIngId(e.target.value)}
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            >
              {data.ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={poQty}
              onChange={(e) => setPoQty(e.target.value)}
              placeholder="Quantity"
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-mono"
            />
            {poType === 'External Supplier' ? (
              <input
                type="text"
                value={poSupplier}
                onChange={(e) => setPoSupplier(e.target.value)}
                placeholder="Supplier Name"
                className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
              />
            ) : (
              <div className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-[11px] flex items-center text-[#57534E]">
                Emits contract to Supermarket Portal
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() =>
              void runAction(
                () =>
                  restaurantApi.createPurchaseOrder({
                    branchId: data.activeBranchScope === 'all' ? 'hyderabad' : data.activeBranchScope,
                    type: poType,
                    supplierName: poSupplier,
                    ingredientId: poIngId,
                    orderedQty: Number(poQty),
                  }),
                'Created purchase / inter-business transfer order.'
              )
            }
            className="h-9 px-4 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold"
          >
            Submit Purchase Order
          </button>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E6E2DA]">
            <h3 className="text-sm font-bold text-[#1C1917]">Restaurant Purchase Orders ({data.supplierOrders.length})</h3>
          </div>
          <div className="divide-y divide-[#E6E2DA]">
            {data.supplierOrders.map((po) => {
              const line = po.items[0];
              return (
                <div key={po.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-[#1C1917]">
                      {po.poNumber} · {po.supplierName} ({po.type})
                    </p>
                    <p className="text-[11px] text-[#57534E]">
                      {line.orderedQty} {line.unit} {line.ingredientName} · Cost PKR{' '}
                      <span className="font-mono">{po.totalCostPkr.toLocaleString()}</span> · Status:{' '}
                      <strong>{po.status}</strong>
                    </p>
                  </div>
                  {po.status === 'Ordered' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(
                            () => restaurantApi.receivePurchaseOrder(po.id, line.orderedQty),
                            `Received full delivery for ${po.poNumber}.`
                          )
                        }
                        className="h-8 px-3 rounded-lg bg-[#166534] text-white text-xs font-semibold"
                      >
                        Receive Full Qty
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'accounts') {
    return (
      <div className="space-y-5">
        {renderBanner()}
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-[#1C1917]">Restaurant Cashier Shifts &amp; Till Closing</h3>
            <p className="text-xs text-[#57534E]">
              Strictly separated Restaurant cash drawer and POS settlement reconciliation.
            </p>
          </div>
          {data.role.canCloseShift && (
            <button
              type="button"
              onClick={() =>
                void runAction(
                  () =>
                    restaurantApi.openShift(
                      data.activeBranchScope === 'all' ? 'hyderabad' : data.activeBranchScope,
                      15000
                    ),
                  'Opened new Restaurant cashier shift with PKR 15,000 float.'
                )
              }
              className="h-9 px-4 rounded-lg bg-[#1C1917] text-white text-xs font-semibold"
            >
              Open Cashier Shift
            </button>
          )}
        </div>

        <div className="space-y-3">
          {data.shifts.map((sh) => (
            <div key={sh.id} className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-mono text-xs font-bold text-[#9B1C2E]">
                  {sh.shiftNumber} · {sh.status}
                </p>
                <p className="text-sm font-bold text-[#1C1917]">{sh.cashierName}</p>
                <p className="text-xs text-[#57534E] font-mono">
                  Float: PKR {sh.openingFloatPkr.toLocaleString()} · Cash Sales: PKR {sh.cashSalesPkr.toLocaleString()} · Card/Wallet: PKR {sh.cardSalesPkr.toLocaleString()} · Expected Cash: PKR {sh.expectedCashPkr.toLocaleString()}
                </p>
                {sh.variancePkr !== undefined && (
                  <p className="text-xs font-mono font-bold text-[#1C1917]">
                    Declared: PKR {sh.declaredCashPkr?.toLocaleString()} · Variance: PKR {sh.variancePkr.toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {sh.status === 'Open' && data.role.canCloseShift && (
                  <>
                    <input
                      type="number"
                      value={declaredCash}
                      onChange={(e) => setDeclaredCash(e.target.value)}
                      className="w-32 h-9 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-mono"
                      aria-label="Declared cash PKR"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(
                          () => restaurantApi.closeShift(sh.id, Number(declaredCash)),
                          `Closed shift ${sh.shiftNumber} pending Accounts verification.`
                        )
                      }
                      className="h-9 px-3.5 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold"
                    >
                      Close Shift
                    </button>
                  </>
                )}
                {sh.status === 'Pending Verification' && (
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        () => restaurantApi.verifyShift(sh.id),
                        `Verified and posted ${sh.shiftNumber} to Restaurant Accounts.`
                      )
                    }
                    className="h-9 px-3.5 rounded-lg bg-[#166534] text-white text-xs font-semibold"
                  >
                    Accounts Verify &amp; Post
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'deals') {
    return (
      <div className="space-y-5">
        {renderBanner()}
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#1C1917]">Create Dining Promotion or Buffet Event</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              value={dealTitle}
              onChange={(e) => setDealTitle(e.target.value)}
              placeholder="Deal / Buffet Title"
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
            <input
              type="text"
              value={dealWindow}
              onChange={(e) => setDealWindow(e.target.value)}
              placeholder="Valid Window"
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
            <input
              type="number"
              min="0"
              max="50"
              value={dealPct}
              onChange={(e) => setDealPct(e.target.value)}
              placeholder="Discount %"
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-mono"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              void runAction(
                () =>
                  restaurantApi.createDeal({
                    title: dealTitle,
                    description: 'Dining room promotional offer (Demo)',
                    discountPercent: Number(dealPct),
                    applicableWindow: dealWindow,
                  }),
                'Created dining promotion.'
              )
            }
            className="h-9 px-4 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold"
          >
            Publish Deal
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.deals.map((d) => (
            <div key={d.id} className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-[#1C1917]">{d.title}</h4>
                <span className="font-mono text-xs font-bold text-[#9B1C2E]">{d.discountPercent}% OFF</span>
              </div>
              <p className="text-xs text-[#57534E]">{d.description}</p>
              <p className="text-[11px] text-[#57534E]">
                {d.applicableWindow} · Status: <strong>{d.approvalStatus}</strong>
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'staff') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#1C1917]">Active Kitchen &amp; Dining Roster</h3>
          <div className="divide-y divide-[#E6E2DA]">
            {data.staffShifts.map((s) => (
              <div key={s.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-[#1C1917]">{s.fullName}</p>
                  <p className="text-[11px] text-[#57534E]">
                    {s.roleLabel} {s.stationLabel ? `(${s.stationLabel})` : ''} · {s.shiftWindow}
                  </p>
                </div>
                <span className="font-semibold text-[#166534]">{s.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#1C1917]">Daily Kitchen Hygiene &amp; Food Safety</h3>
          {renderBanner()}
          <div className="divide-y divide-[#E6E2DA]">
            {data.hygieneTasks.map((h) => (
              <div key={h.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-bold text-[#1C1917]">{h.task}</p>
                  <p className="text-[11px] text-[#57534E]">
                    Zone: {h.area} {h.completedBy ? `· Checked by ${h.completedBy}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void runAction(() => restaurantApi.toggleHygieneTask(h.id), 'Updated hygiene checklist.')
                  }
                  className={`h-8 px-3 rounded-lg text-xs font-semibold ${
                    h.completed
                      ? 'bg-[#166534] text-white'
                      : 'border border-[#E6E2DA] bg-[#FAF9F6] text-[#1C1917]'
                  }`}
                >
                  {h.completed ? 'Completed' : 'Sign Off'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'customers') {
    return (
      <div className="space-y-5">
        {renderBanner()}
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#1C1917]">Log Dining Guest Feedback or Billing Case</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={caseGuest}
              onChange={(e) => setCaseGuest(e.target.value)}
              placeholder="Guest Name"
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
            <input
              type="text"
              value={caseNotes}
              onChange={(e) => setCaseNotes(e.target.value)}
              placeholder="Feedback / Action Taken"
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              void runAction(
                () =>
                  restaurantApi.createGuestCase({
                    guestName: caseGuest,
                    phone: '0300-***-000',
                    category: 'Service Inquiry',
                    priority: 'Normal',
                    notes: caseNotes,
                  }),
                'Logged dining guest case.'
              )
            }
            className="h-9 px-4 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold"
          >
            Save Guest Case
          </button>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl divide-y divide-[#E6E2DA]">
          {data.guestCases.map((gc) => (
            <div key={gc.id} className="p-4 text-xs">
              <p className="font-bold text-[#1C1917]">
                {gc.caseNumber} · {gc.guestName} ({gc.category}) — {gc.status}
              </p>
              <p className="text-[#57534E] mt-0.5">{gc.notes}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'reports') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase text-[#57534E]">Total Paid Sales</p>
            <p className="mt-1 font-mono text-2xl font-bold">PKR {data.kpis.dailySalesPkr.toLocaleString()}</p>
          </div>
          <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase text-[#57534E]">Covers Served</p>
            <p className="mt-1 font-mono text-2xl font-bold">{data.kpis.coversServed}</p>
          </div>
          <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase text-[#57534E]">Average Check</p>
            <p className="mt-1 font-mono text-2xl font-bold">PKR {data.kpis.averageBillPkr.toLocaleString()}</p>
          </div>
          <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase text-[#57534E]">Voided Checks</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#9B1C2E]">{data.kpis.voidedOrdersCount}</p>
          </div>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5">
          <h3 className="text-sm font-bold text-[#1C1917] mb-3">Menu Engineering &amp; Cost Snapshot</h3>
          <div className="divide-y divide-[#E6E2DA] text-xs">
            {data.menu.map((m) => (
              <div key={m.id} className="py-2 flex items-center justify-between">
                <span>{m.name} ({m.cuisine})</span>
                <span className="font-mono">
                  {m.foodCostPercent !== null ? `Food Cost ${m.foodCostPercent}%` : 'Cost Protected'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // mode === 'settings'
  return (
    <div className="space-y-5">
      {renderBanner()}
      <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#1C1917]">Restaurant MIS Configuration (Demo Controls)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-semibold mb-1">Dine-In Service Charge (%)</label>
            <input
              type="number"
              value={svcRate}
              onChange={(e) => setSvcRate(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">Sales Tax (%)</label>
            <input
              type="number"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] font-mono"
            />
          </div>
          <label className="flex items-center gap-2 pt-5 font-semibold">
            <input type="checkbox" checked={takeawayOn} onChange={(e) => setTakeawayOn(e.target.checked)} />
            <span>Takeaway Channel Active</span>
          </label>
          <label className="flex items-center gap-2 pt-5 font-semibold">
            <input type="checkbox" checked={deliveryOn} onChange={(e) => setDeliveryOn(e.target.checked)} />
            <span>Delivery Channel Active</span>
          </label>
        </div>
        <button
          type="button"
          onClick={() =>
            void runAction(
              () =>
                restaurantApi.updateSettings({
                  serviceChargeRatePercent: Number(svcRate),
                  taxRatePercent: Number(taxRate),
                  takeawayEnabled: takeawayOn,
                  deliveryEnabled: deliveryOn,
                }),
              'Updated Restaurant MIS settings.'
            )
          }
          className="h-9 px-4 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold"
        >
          Save Configuration
        </button>
      </div>

      <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E6E2DA]">
          <h3 className="text-sm font-bold text-[#1C1917]">Restaurant Audit Log ({data.auditLogs.length})</h3>
        </div>
        <div className="divide-y divide-[#E6E2DA] max-h-80 overflow-y-auto">
          {data.auditLogs.map((a) => (
            <div key={a.id} className="px-5 py-2.5 text-xs flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-[#1C1917]">
                  {a.action} · {a.target} ({a.outcome})
                </p>
                <p className="text-[11px] text-[#57534E]">
                  {a.actorName} ({a.actorRole}) — {a.detail}
                </p>
              </div>
              <span className="font-mono text-[11px] text-[#57534E] shrink-0">
                {new Date(a.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
