import React, { useState } from 'react';
import { Printer, Ticket, X } from 'lucide-react';
import type { PlayTicketRecord } from '../../playland/types';
import { playLandApi, type PlayLandBootstrapPayload } from './playLandApi';

interface TicketCounterModuleProps {
  data: PlayLandBootstrapPayload;
  onRefresh: () => Promise<void>;
}

export function TicketCounterModule({ data, onRefresh }: TicketCounterModuleProps) {
  const [selectedPkgId, setSelectedPkgId] = useState(data.packages[0]?.id || '');
  const [selectedSessionId, setSelectedSessionId] = useState(data.sessions[0]?.id || '');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [multiplier, setMultiplier] = useState(1);
  const [childAge, setChildAge] = useState(6);
  const [discountPct, setDiscountPct] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Card'>('Cash');
  const [simulateFailure, setSimulateFailure] = useState(false);

  const [issuedReceipt, setIssuedReceipt] = useState<PlayTicketRecord | null>(null);
  const [refundReason, setRefundReason] = useState('Schedule changed by parent');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pkg = data.packages.find((p) => p.id === selectedPkgId) || data.packages[0];
  const gross = pkg ? pkg.pricePkr * multiplier : 0;
  const net = Math.max(0, Math.round(gross - (gross * discountPct) / 100));

  const handleSellTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    setError(null);
    try {
      const res = await playLandApi.sellTicket({
        idempotencyKey: `plt-${Date.now()}`,
        packageId: selectedPkgId,
        sessionId: selectedSessionId,
        guestName,
        guestPhone,
        participantMultiplier: multiplier,
        childAges: [childAge],
        discountPercent: discountPct,
        paymentMethod,
        simulatePaymentFailure: simulateFailure,
      });
      await onRefresh();
      setIssuedReceipt(res.ticket);
      setNotice(`Ticket ${res.ticket.ticketCode} issued for PKR ${res.ticket.finalAmountPkr.toLocaleString()}.`);
      setGuestName('');
      setGuestPhone('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ticket sale failed.');
    }
  };

  const handleRefund = async (ticketId: string, ticketCode: string) => {
    setNotice(null);
    setError(null);
    try {
      await playLandApi.refundTicket(ticketId, refundReason);
      await onRefresh();
      setNotice(`Refunded ticket ${ticketCode} and restored session capacity.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund failed.');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <form
        onSubmit={handleSellTicket}
        className="xl:col-span-5 bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-[#E6E2DA] pb-3">
          <h2 className="text-sm font-bold text-[#1C1917] flex items-center gap-2">
            <Ticket className="w-4 h-4 text-[#9B1C2E]" />
            <span>Issue Timed Play Land Ticket (POS)</span>
          </h2>
          <span className="text-[11px] text-[#57534E] whitespace-nowrap shrink-0">Demo Tariff</span>
        </div>

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

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[#1C1917]">Pass Package</label>
          <select
            value={selectedPkgId}
            onChange={(e) => setSelectedPkgId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-semibold"
          >
            {data.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — PKR {p.pricePkr.toLocaleString()} ({p.durationLabel})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[#1C1917]">Timed Session Slot</label>
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-semibold"
          >
            {data.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.windowLabel} · {Math.max(0, s.maxCapacity - s.allocatedCount)} / {s.maxCapacity} spots left
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input
            type="text"
            required
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Parent / Guardian Name"
            className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
          />
          <input
            type="text"
            required
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            placeholder="Mobile Number"
            className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
          />
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <label className="block text-[11px] font-semibold text-[#57534E] mb-1">Pass Qty</label>
            <input
              type="number"
              min={1}
              max={15}
              value={multiplier}
              onChange={(e) => setMultiplier(Math.max(1, Number(e.target.value) || 1))}
              className="w-full h-9 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#57534E] mb-1">Child Age</label>
            <input
              type="number"
              min={1}
              max={15}
              value={childAge}
              onChange={(e) => setChildAge(Math.max(1, Number(e.target.value) || 4))}
              className="w-full h-9 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#57534E] mb-1">Discount %</label>
            <input
              type="number"
              min={0}
              max={50}
              value={discountPct}
              onChange={(e) => setDiscountPct(Math.max(0, Number(e.target.value) || 0))}
              className="w-full h-9 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[#E6E2DA]">
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as 'Cash' | 'Card')}
            className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-semibold"
          >
            <option value="Cash">Cash Payment</option>
            <option value="Card">Card Terminal</option>
          </select>
          <div className="h-10 px-3 rounded-lg bg-[#FAF9F6] border border-[#E6E2DA] flex items-center justify-between text-xs font-mono font-bold">
            <span>Total</span>
            <span>PKR {net.toLocaleString()}</span>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-[#57534E]">
          <input
            type="checkbox"
            checked={simulateFailure}
            onChange={(e) => setSimulateFailure(e.target.checked)}
          />
          <span>Simulate card terminal failure (verifies no ticket/capacity deduction)</span>
        </label>

        <button
          type="submit"
          disabled={!data.role.canSellTickets}
          className={`w-full min-h-10 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
            data.role.canSellTickets
              ? 'bg-[#9B1C2E] text-white hover:bg-[#7F1524]'
              : 'bg-[#F3F1EC] text-[#57534E] border border-[#E6E2DA] cursor-not-allowed'
          }`}
        >
          {data.role.canSellTickets
            ? `Issue Ticket & Collect PKR ${net.toLocaleString()}`
            : 'Read-Only Mode — Ticket Cashier Role Required'}
        </button>
      </form>

      {/* Issued Tickets Table */}
      <div className="xl:col-span-7 bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E6E2DA] flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#1C1917]">Issued Tickets &amp; QR Passes ({data.tickets.length})</h3>
          {data.role.canApproveRefunds && (
            <input
              type="text"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Refund reason..."
              className="h-8 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs w-52"
            />
          )}
        </div>
        <div className="divide-y divide-[#E6E2DA]">
          {data.tickets.map((t) => (
            <div key={t.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="font-mono text-xs font-bold text-[#9B1C2E]">
                  {t.ticketCode} · {t.status}
                </p>
                <p className="text-xs font-bold text-[#1C1917]">
                  {t.guestName} ({t.childCount} child, {t.adultCount} adult)
                </p>
                <p className="text-[11px] text-[#57534E]">
                  {t.packageName} · {t.sessionLabel} · PKR <span className="font-mono">{t.finalAmountPkr.toLocaleString()}</span> ({t.paymentMethod})
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIssuedReceipt(t)}
                  className="h-8 px-2.5 rounded-lg border border-[#E6E2DA] text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>QR Pass</span>
                </button>
                {data.role.canApproveRefunds && t.status !== 'Refunded' && (
                  <button
                    type="button"
                    onClick={() => void handleRefund(t.id, t.ticketCode)}
                    className="h-8 px-2.5 rounded-lg bg-[#9B1C2E]/10 text-[#9B1C2E] text-xs font-semibold hover:bg-[#9B1C2E] hover:text-white"
                  >
                    Refund
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {issuedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1917]/50 p-4" role="dialog" aria-modal="true">
          <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E6E2DA] pb-3">
              <div>
                <h3 className="font-serif text-lg font-bold text-[#1C1917]">Marhaba Play Land Pass</h3>
                <p className="text-[11px] text-[#57534E]">Hyderabad Family Zone · Gate Admission QR</p>
              </div>
              <button type="button" onClick={() => setIssuedReceipt(null)} aria-label="Close pass">
                <X className="w-5 h-5 text-[#57534E]" />
              </button>
            </div>
            <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#E6E2DA] text-center space-y-1">
              <p className="font-mono text-lg font-bold text-[#9B1C2E]">{issuedReceipt.ticketCode}</p>
              <p className="font-mono text-xs text-[#57534E]">{issuedReceipt.qrPayload}</p>
              <p className="text-xs font-semibold text-[#1C1917] pt-1">{issuedReceipt.sessionLabel}</p>
            </div>
            <div className="text-xs space-y-1 font-mono">
              <p>Guest: {issuedReceipt.guestName}</p>
              <p>Package: {issuedReceipt.packageName}</p>
              <p>Paid: PKR {issuedReceipt.finalAmountPkr.toLocaleString()} ({issuedReceipt.paymentMethod})</p>
              <p>Issued By: {issuedReceipt.issuedByName}</p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="w-full h-10 rounded-xl bg-[#1C1917] text-white text-xs font-semibold"
            >
              Print Wristband &amp; Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
