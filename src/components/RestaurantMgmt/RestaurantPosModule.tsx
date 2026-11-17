import React, { useMemo, useState } from 'react';
import { Plus, Printer, Receipt, Split, Trash2, X } from 'lucide-react';
import { computeSplitCheckByGuests } from '../../restaurant/calculations';
import { restaurantApi, type RestaurantBootstrapPayload } from './restaurantApi';

interface RestaurantPosModuleProps {
  data: RestaurantBootstrapPayload;
  initialTableId?: string;
  onRefresh: () => Promise<void>;
}

interface DraftLine {
  key: string;
  dishId: string;
  dishName: string;
  portionId: string;
  portionLabel: string;
  unitPricePkr: number;
  quantity: number;
  modifierIds: string[];
  modifiersLabel: string;
  prepNotes: string;
}

export function RestaurantPosModule({ data, initialTableId, onRefresh }: RestaurantPosModuleProps) {
  const [cuisineFilter, setCuisineFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceType, setServiceType] = useState<'Dine-In' | 'Takeaway' | 'Delivery'>('Dine-In');
  const [selectedTableId, setSelectedTableId] = useState<string>(
    initialTableId || data.tables.find((t) => t.status === 'Occupied')?.id || data.tables[0]?.id || ''
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    data.orders.find((o) => !['Closed', 'Cancelled'].includes(o.status))?.id || ''
  );
  const [draftCart, setDraftCart] = useState<DraftLine[]>([]);
  const [prepNoteInput, setPrepNoteInput] = useState('');

  // Billing & Split Check state
  const [splitWays, setSplitWays] = useState<number>(2);
  const [payMethod, setPayMethod] = useState<'Cash' | 'Card' | 'Wallet'>('Card');
  const [payAmount, setPayAmount] = useState<string>('');
  const [simulateCardFailure, setSimulateCardFailure] = useState(false);
  const [closeTableOnPaid, setCloseTableOnPaid] = useState(true);
  const [discountInput, setDiscountInput] = useState<string>('5');
  const [discountReason, setDiscountReason] = useState('Loyalty dining privilege');
  const [voidReason, setVoidReason] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cuisines = useMemo(() => ['All', ...Array.from(new Set(data.menu.map((m) => m.cuisine)))], [data.menu]);
  const filteredMenu = data.menu.filter((m) => {
    if (cuisineFilter !== 'All' && m.cuisine !== cuisineFilter) return false;
    if (searchQuery.trim() && !m.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const activeOrder = data.orders.find((o) => o.id === selectedOrderId);
  const remainingDue = activeOrder ? Math.max(0, activeOrder.grandTotalPkr - activeOrder.paidTotalPkr) : 0;
  const splitParts = activeOrder ? computeSplitCheckByGuests(remainingDue || activeOrder.grandTotalPkr, splitWays) : [];

  const runAction = async (fn: () => Promise<unknown>, okMsg: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      await onRefresh();
      setNotice(okMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'POS operation failed.');
    }
  };

  const addDishToDraft = (dish: RestaurantBootstrapPayload['menu'][number], portionIdx = 0) => {
    if (!dish.available) return;
    const portion = dish.portions[portionIdx] || dish.portions[0];
    const key = `${dish.id}:${portion.id}:${prepNoteInput.trim()}`;
    setDraftCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          key,
          dishId: dish.id,
          dishName: dish.name,
          portionId: portion.id,
          portionLabel: portion.label,
          unitPricePkr: portion.pricePkr,
          quantity: 1,
          modifierIds: [],
          modifiersLabel: '',
          prepNotes: prepNoteInput.trim(),
        },
      ];
    });
  };

  const handleOpenOrAddItems = async () => {
    if (draftCart.length === 0) return;
    const linePayload = draftCart.map((l) => ({
      dishId: l.dishId,
      portionId: l.portionId,
      quantity: l.quantity,
      modifierIds: l.modifierIds,
      prepNotes: l.prepNotes || undefined,
    }));

    if (activeOrder && !['Paid', 'Closed', 'Cancelled'].includes(activeOrder.status)) {
      await runAction(async () => {
        await restaurantApi.addOrderItems(activeOrder.id, linePayload);
        setDraftCart([]);
      }, `Sent addition (v${activeOrder.ticketVersion + 1}) to kitchen for ${activeOrder.orderNumber}.`);
    } else {
      await runAction(async () => {
        const res = (await restaurantApi.openOrder({
          branchId: data.activeBranchScope === 'all' ? 'hyderabad' : data.activeBranchScope,
          serviceType,
          tableId: serviceType === 'Dine-In' ? selectedTableId : undefined,
          items: linePayload,
          idempotencyKey: `pos-${Date.now()}`,
        })) as { order: { id: string } };
        setDraftCart([]);
        setSelectedOrderId(res.order.id);
      }, 'Opened new order and dispatched station KDS tickets.');
    }
  };

  const draftTotal = draftCart.reduce((s, l) => s + l.unitPricePkr * l.quantity, 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
      {/* Left/Center: Menu & Item Entry */}
      <div className="xl:col-span-7 space-y-4">
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {cuisines.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCuisineFilter(c)}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold border ${
                    cuisineFilter === c
                      ? 'bg-[#9B1C2E] text-white border-[#9B1C2E]'
                      : 'bg-[#FAF9F6] text-[#1C1917] border-[#E6E2DA]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes..."
              className="h-9 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs w-48"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E6E2DA]">
            <label htmlFor="pos-prep-note" className="text-[11px] font-semibold text-[#57534E]">
              Prep Note for Next Dish:
            </label>
            <input
              id="pos-prep-note"
              type="text"
              value={prepNoteInput}
              onChange={(e) => setPrepNoteInput(e.target.value)}
              placeholder="e.g. Less spicy / No garlic / Well done"
              className="flex-1 min-w-[200px] h-8 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredMenu.map((dish) => (
            <div
              key={dish.id}
              className={`bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-4 flex flex-col justify-between gap-3 ${
                !dish.available ? 'opacity-65' : ''
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#1C1917]">{dish.name}</h3>
                  <span className="text-[11px] font-semibold text-[#57534E] shrink-0">
                    {data.stations.find((s) => s.id === dish.station)?.label || dish.station}
                  </span>
                </div>
                <p className="text-[11px] text-[#57534E] mt-0.5">
                  {dish.cuisine} · {dish.category}
                </p>
                {!dish.available && (
                  <p className="text-[11px] font-bold text-[#9B1C2E] mt-1">
                    Unavailable: {dish.manualUnavailableReason || '86d'}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {dish.portions.map((por, idx) => (
                  <button
                    key={por.id}
                    type="button"
                    disabled={!dish.available}
                    onClick={() => addDishToDraft(dish, idx)}
                    className="h-8 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] hover:border-[#9B1C2E] hover:bg-[#9B1C2E] hover:text-white disabled:opacity-40 text-xs font-semibold transition-colors inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{por.label}</span>
                    <span className="font-mono">PKR {por.pricePkr}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Ticket Builder, Active Order & Settlement */}
      <div className="xl:col-span-5 space-y-4">
        {(notice || error) && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold ${
              error
                ? 'bg-[#9B1C2E]/8 border-[#9B1C2E]/25 text-[#9B1C2E]'
                : 'bg-[#166534]/8 border-[#166534]/25 text-[#166534]'
            }`}
          >
            {error || notice}
          </div>
        )}

        {/* Active Order Selector / Channel Picker */}
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[#1C1917] flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-[#9B1C2E]" />
              <span>Order &amp; Table Ticket</span>
            </h3>
            <select
              value={selectedOrderId}
              onChange={(e) => setSelectedOrderId(e.target.value)}
              aria-label="Select existing restaurant order"
              className="h-8 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-semibold max-w-[210px]"
            >
              <option value="">+ New Order Ticket</option>
              {data.orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber} · {o.tableNumber || o.serviceType} ({o.status})
                </option>
              ))}
            </select>
          </div>

          {!selectedOrderId && (
            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[#E6E2DA]">
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as 'Dine-In' | 'Takeaway' | 'Delivery')}
                className="h-9 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-semibold"
              >
                <option value="Dine-In">Dine-In Table</option>
                <option value="Takeaway">Takeaway Counter</option>
                <option value="Delivery">Home Delivery</option>
              </select>
              {serviceType === 'Dine-In' && (
                <select
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  className="h-9 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-semibold"
                >
                  {data.tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.tableNumber} ({t.status})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Draft Queue */}
          {draftCart.length > 0 && (
            <div className="pt-3 border-t border-[#E6E2DA] space-y-2">
              <p className="text-xs font-bold text-[#9B1C2E]">
                Pending Kitchen Dispatch ({draftCart.length} line{draftCart.length > 1 ? 's' : ''})
              </p>
              {draftCart.map((line) => (
                <div key={line.key} className="flex items-center justify-between gap-2 text-xs bg-[#FAF9F6] p-2 rounded-lg">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#1C1917] truncate">
                      {line.quantity}x {line.dishName} ({line.portionLabel})
                    </p>
                    {line.prepNotes && <p className="text-[11px] text-[#9B1C2E]">Note: {line.prepNotes}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold">PKR {(line.unitPricePkr * line.quantity).toLocaleString()}</span>
                    <button
                      type="button"
                      onClick={() => setDraftCart((prev) => prev.filter((p) => p.key !== line.key))}
                      aria-label="Remove item"
                      className="p-1 text-[#57534E] hover:text-[#9B1C2E]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => void handleOpenOrAddItems()}
                className="w-full h-10 rounded-xl bg-[#9B1C2E] text-white text-xs font-semibold hover:bg-[#7F1524]"
              >
                {activeOrder
                  ? `Send Addition v${activeOrder.ticketVersion + 1} (PKR ${draftTotal.toLocaleString()})`
                  : `Send to Kitchen & Open Order (PKR ${draftTotal.toLocaleString()})`}
              </button>
            </div>
          )}
        </div>

        {/* Active Order Summary & Payment */}
        {activeOrder && (
          <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E6E2DA] pb-3">
              <div>
                <p className="font-mono text-xs font-bold text-[#9B1C2E]">
                  {activeOrder.orderNumber} · Ticket v{activeOrder.ticketVersion}
                </p>
                <p className="text-xs text-[#57534E]">
                  {activeOrder.serviceType}
                  {activeOrder.tableNumber ? ` · Table ${activeOrder.tableNumber}` : ''} · {activeOrder.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptOpen(true)}
                className="h-8 px-2.5 rounded-lg border border-[#E6E2DA] text-xs font-semibold inline-flex items-center gap-1 hover:border-[#9B1C2E]"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Receipt</span>
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {activeOrder.items.map((it) => (
                <div key={it.lineId} className="flex items-center justify-between text-xs py-1 border-b border-[#F3F1EC]">
                  <span>
                    <strong className="font-mono">{it.quantity}x</strong> {it.dishName} ({it.portionLabel}){' '}
                    <span className="text-[11px] text-[#57534E]">[{it.kitchenStatus}]</span>
                  </span>
                  <span className="font-mono font-semibold">PKR {it.lineTotalPkr.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="text-xs space-y-1 pt-2 border-t border-[#E6E2DA]">
              <div className="flex justify-between text-[#57534E]">
                <span>Subtotal</span>
                <span className="font-mono">PKR {activeOrder.subtotalPkr.toLocaleString()}</span>
              </div>
              {activeOrder.discountAmountPkr > 0 && (
                <div className="flex justify-between text-[#166534]">
                  <span>Discount ({activeOrder.discountPercent}%)</span>
                  <span className="font-mono">- PKR {activeOrder.discountAmountPkr.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-[#57534E]">
                <span>Service Charge + Tax</span>
                <span className="font-mono">
                  PKR {(activeOrder.serviceChargePkr + activeOrder.taxAmountPkr).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-[#1C1917] pt-1">
                <span>Grand Total</span>
                <span className="font-mono">PKR {activeOrder.grandTotalPkr.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-[#9B1C2E]">
                <span>Balance Due</span>
                <span className="font-mono">PKR {remainingDue.toLocaleString()}</span>
              </div>
            </div>

            {/* Discount Control */}
            <div className="pt-3 border-t border-[#E6E2DA] flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                className="w-16 h-8 px-2 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-mono"
                aria-label="Discount percent"
              />
              <input
                type="text"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="Discount reason"
                className="flex-1 h-8 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
              />
              <button
                type="button"
                onClick={() =>
                  void runAction(
                    () => restaurantApi.applyDiscount(activeOrder.id, Number(discountInput), discountReason),
                    `Applied ${discountInput}% discount.`
                  )
                }
                className="h-8 px-3 rounded-lg border border-[#E6E2DA] text-xs font-semibold hover:border-[#9B1C2E]"
              >
                Apply %
              </button>
            </div>

            {/* Split Check Estimator */}
            <div className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E6E2DA] space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-[#1C1917]">
                <span className="inline-flex items-center gap-1">
                  <Split className="w-3.5 h-3.5 text-[#9B1C2E]" />
                  <span>Split Check Calculator</span>
                </span>
                <select
                  value={splitWays}
                  onChange={(e) => setSplitWays(Number(e.target.value))}
                  className="h-7 px-2 rounded border border-[#E6E2DA] bg-[#FFFFFF] text-xs"
                >
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} Guests
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] font-mono text-[#57534E]">
                Per Guest: {splitParts.map((amt, i) => `G${i + 1}: PKR ${amt.toLocaleString()}`).join(' · ')}
              </p>
            </div>

            {/* Settlement Controls */}
            {data.role.canMarkOrderPaid ? (
              <div className="pt-3 border-t border-[#E6E2DA] space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as 'Cash' | 'Card' | 'Wallet')}
                    className="h-9 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-semibold"
                  >
                    <option value="Card">Card Terminal</option>
                    <option value="Cash">Cash Tender</option>
                    <option value="Wallet">Digital Wallet</option>
                  </select>
                  <input
                    type="number"
                    value={payAmount || String(remainingDue)}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="Amount PKR"
                    className="h-9 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-mono"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#57534E]">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={closeTableOnPaid}
                      onChange={(e) => setCloseTableOnPaid(e.target.checked)}
                    />
                    <span>Release table to Awaiting Cleaning when paid</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={simulateCardFailure}
                      onChange={(e) => setSimulateCardFailure(e.target.checked)}
                    />
                    <span>Test terminal decline</span>
                  </label>
                </div>
                <button
                  type="button"
                  disabled={remainingDue <= 0}
                  onClick={() =>
                    void runAction(
                      () =>
                        restaurantApi.recordPayment(activeOrder.id, {
                          method: payMethod,
                          amountPkr: Number(payAmount) || remainingDue,
                          simulateFailure: simulateCardFailure,
                          closeTable: closeTableOnPaid,
                        }),
                      `Payment recorded for ${activeOrder.orderNumber}.`
                    )
                  }
                  className="w-full h-10 rounded-xl bg-[#166534] text-white text-xs font-semibold hover:bg-[#14532D] disabled:opacity-40"
                >
                  Settle Payment (PKR {(Number(payAmount) || remainingDue).toLocaleString()})
                </button>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E6E2DA] text-xs text-[#57534E]">
                Cashier Role Required for Settlement: Floor servers and chefs can send kitchen orders but cannot mark checks as paid.
              </div>
            )}

            {data.role.canApproveVoidOrDiscount && activeOrder.status !== 'Cancelled' && (
              <div className="pt-3 border-t border-[#E6E2DA] flex items-center gap-2">
                <input
                  type="text"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Mandatory void reason..."
                  className="flex-1 h-8 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      () => restaurantApi.voidOrder(activeOrder.id, voidReason),
                      `Voided order ${activeOrder.orderNumber}.`
                    )
                  }
                  className="h-8 px-3 rounded-lg bg-[#9B1C2E]/10 text-[#9B1C2E] text-xs font-semibold hover:bg-[#9B1C2E] hover:text-white"
                >
                  Void Order
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Printable Guest Receipt Modal */}
      {receiptOpen && activeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1917]/50 p-4" role="dialog" aria-modal="true">
          <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E6E2DA] pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1C1917]">Marhaba Family Restaurant</h3>
                <p className="text-[11px] text-[#57534E]">Autobhan Road, Hyderabad · Guest Bill Preview</p>
              </div>
              <button type="button" onClick={() => setReceiptOpen(false)} aria-label="Close receipt">
                <X className="w-5 h-5 text-[#57534E]" />
              </button>
            </div>
            <div className="text-xs font-mono space-y-1">
              <p>Bill: {activeOrder.orderNumber}</p>
              <p>Service: {activeOrder.serviceType} {activeOrder.tableNumber ? `(${activeOrder.tableNumber})` : ''}</p>
              <p>Server: {activeOrder.waiterName}</p>
            </div>
            <div className="border-y border-dashed border-[#E6E2DA] py-3 space-y-1.5 text-xs">
              {activeOrder.items.map((i) => (
                <div key={i.lineId} className="flex justify-between">
                  <span>
                    {i.quantity}x {i.dishName} ({i.portionLabel})
                  </span>
                  <span className="font-mono">PKR {i.lineTotalPkr.toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-xs font-mono">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>PKR {activeOrder.subtotalPkr.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Service + Tax</span>
                <span>PKR {(activeOrder.serviceChargePkr + activeOrder.taxAmountPkr).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-sm pt-1">
                <span>TOTAL</span>
                <span>PKR {activeOrder.grandTotalPkr.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[#166534]">
                <span>PAID</span>
                <span>PKR {activeOrder.paidTotalPkr.toLocaleString()}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full h-10 rounded-xl bg-[#1C1917] text-white text-xs font-semibold"
            >
              Print Bill Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
