import React, { useState } from 'react';
import { CalendarPlus, Check, MoveRight, Users } from 'lucide-react';
import type { TableStatus } from '../../restaurant/types';
import { restaurantApi, type RestaurantBootstrapPayload } from './restaurantApi';

interface TablesReservationsModuleProps {
  mode: 'tables' | 'reservations';
  data: RestaurantBootstrapPayload;
  onRefresh: () => Promise<void>;
  onOpenPosForTable?: (tableId: string) => void;
}

const TABLE_STATUS_COLORS: Record<TableStatus, string> = {
  Available: 'bg-[#166534]/10 text-[#166534] border-[#166534]/25',
  Reserved: 'bg-[#B45309]/10 text-[#B45309] border-[#B45309]/25',
  Occupied: 'bg-[#9B1C2E]/10 text-[#9B1C2E] border-[#9B1C2E]/25',
  'Awaiting Cleaning': 'bg-[#F3F1EC] text-[#57534E] border-[#E6E2DA]',
  'Temporarily Unavailable': 'bg-[#1C1917]/10 text-[#1C1917] border-[#1C1917]/20',
};

export function TablesReservationsModule({
  mode,
  data,
  onRefresh,
  onOpenPosForTable,
}: TablesReservationsModuleProps) {
  const [selectedZone, setSelectedZone] = useState<string>('all');
  const [guestCountInput, setGuestCountInput] = useState<number>(4);
  const [moveFromId, setMoveFromId] = useState<string>('');
  const [moveToId, setMoveToId] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reservation creation state
  const [resGuest, setResGuest] = useState('');
  const [resPhone, setResPhone] = useState('');
  const [resDate, setResDate] = useState(new Date().toISOString().slice(0, 10));
  const [resSlot, setResSlot] = useState('20:00');
  const [resParty, setResParty] = useState(4);
  const [resTableId, setResTableId] = useState('');
  const [resNotes, setResNotes] = useState('');

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

  if (mode === 'tables') {
    const filteredTables = data.tables.filter((t) => selectedZone === 'all' || t.zoneId === selectedZone);
    const occupiedTables = data.tables.filter((t) => t.status === 'Occupied');
    const availableTables = data.tables.filter((t) => t.status === 'Available');

    return (
      <div className="space-y-5">
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedZone('all')}
              className={`h-9 px-3.5 rounded-lg text-xs font-semibold border transition-colors ${
                selectedZone === 'all'
                  ? 'bg-[#9B1C2E] text-white border-[#9B1C2E]'
                  : 'bg-[#FAF9F6] text-[#1C1917] border-[#E6E2DA]'
              }`}
            >
              All Zones ({data.tables.length})
            </button>
            {data.zones.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => setSelectedZone(z.id)}
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold border transition-colors ${
                  selectedZone === z.id
                    ? 'bg-[#9B1C2E] text-white border-[#9B1C2E]'
                    : 'bg-[#FAF9F6] text-[#1C1917] border-[#E6E2DA]'
                }`}
              >
                {z.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="seat-party-size" className="text-xs font-semibold text-[#57534E]">
              Walk-In Party Size:
            </label>
            <input
              id="seat-party-size"
              type="number"
              min={1}
              max={16}
              value={guestCountInput}
              onChange={(e) => setGuestCountInput(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 h-9 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-mono font-bold text-[#1C1917]"
            />
          </div>
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

        {/* Table Move Bar */}
        {occupiedTables.length > 0 && availableTables.length > 0 && (
          <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-[#1C1917]">Transfer Table / Order:</span>
            <select
              value={moveFromId}
              onChange={(e) => setMoveFromId(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            >
              <option value="">From occupied table...</option>
              {occupiedTables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tableNumber} ({t.guestCount || '?'} guests)
                </option>
              ))}
            </select>
            <MoveRight className="w-4 h-4 text-[#57534E]" />
            <select
              value={moveToId}
              onChange={(e) => setMoveToId(e.target.value)}
              className="h-9 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            >
              <option value="">To available table...</option>
              {availableTables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tableNumber} (Seats {t.capacity})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!moveFromId || !moveToId}
              onClick={() =>
                void runAction(
                  () => restaurantApi.moveTable(moveFromId, moveToId),
                  'Guests and active order transferred cleanly.'
                )
              }
              className="h-9 px-3.5 rounded-lg bg-[#1C1917] text-white text-xs font-semibold disabled:opacity-40"
            >
              Move Table
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTables.map((tbl) => {
            const zone = data.zones.find((z) => z.id === tbl.zoneId);
            const activeOrd = tbl.activeOrderId
              ? data.orders.find((o) => o.id === tbl.activeOrderId)
              : undefined;
            return (
              <div key={tbl.id} className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-4 flex flex-col justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-base font-bold text-[#1C1917]">{tbl.tableNumber}</span>
                    <span className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${TABLE_STATUS_COLORS[tbl.status]}`}>
                      {tbl.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#57534E]">
                    {zone?.name} · <Users className="inline w-3.5 h-3.5 mr-0.5" /> Capacity {tbl.capacity}
                  </p>
                  {tbl.assignedWaiterName && (
                    <p className="text-xs text-[#1C1917]">
                      Server: <strong>{tbl.assignedWaiterName}</strong>
                    </p>
                  )}
                  {activeOrd && (
                    <p className="text-xs font-mono text-[#9B1C2E]">
                      {activeOrd.orderNumber} · PKR {activeOrd.grandTotalPkr.toLocaleString()}
                    </p>
                  )}
                  {tbl.notes && <p className="text-[11px] text-[#57534E]">{tbl.notes}</p>}
                </div>

                <div className="pt-3 border-t border-[#E6E2DA] flex flex-wrap gap-2">
                  {(tbl.status === 'Available' || tbl.status === 'Reserved') && (
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(
                          () => restaurantApi.seatTable(tbl.id, { guestCount: guestCountInput }),
                          `Seated ${guestCountInput} guest(s) at ${tbl.tableNumber}.`
                        )
                      }
                      className="h-8 px-3 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold hover:bg-[#7F1524]"
                    >
                      Seat Guests
                    </button>
                  )}
                  {tbl.status === 'Occupied' && onOpenPosForTable && (
                    <button
                      type="button"
                      onClick={() => onOpenPosForTable(tbl.id)}
                      className="h-8 px-3 rounded-lg bg-[#1C1917] text-white text-xs font-semibold"
                    >
                      Open POS Order
                    </button>
                  )}
                  {tbl.status === 'Awaiting Cleaning' && (
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(
                          () => restaurantApi.updateTableStatus(tbl.id, 'Available'),
                          `${tbl.tableNumber} sanitized and marked Available.`
                        )
                      }
                      className="h-8 px-3 rounded-lg bg-[#166534] text-white text-xs font-semibold inline-flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark Clean</span>
                    </button>
                  )}
                  {tbl.status === 'Available' && (
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(
                          () => restaurantApi.updateTableStatus(tbl.id, 'Temporarily Unavailable', 'Floor hold'),
                          `${tbl.tableNumber} marked Temporarily Unavailable.`
                        )
                      }
                      className="h-8 px-2.5 rounded-lg border border-[#E6E2DA] text-xs font-semibold text-[#57534E] hover:text-[#1C1917]"
                    >
                      Hold
                    </button>
                  )}
                  {tbl.status === 'Temporarily Unavailable' && (
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(
                          () => restaurantApi.updateTableStatus(tbl.id, 'Available', ''),
                          `${tbl.tableNumber} reopened.`
                        )
                      }
                      className="h-8 px-2.5 rounded-lg border border-[#E6E2DA] text-xs font-semibold text-[#166534]"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // mode === 'reservations'
  const handleCreateRes = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAction(
      () =>
        restaurantApi.createReservation({
          branchId: data.activeBranchScope === 'all' ? 'hyderabad' : data.activeBranchScope,
          guestName: resGuest,
          phone: resPhone,
          date: resDate,
          timeSlot: resSlot,
          partySize: resParty,
          assignedTableId: resTableId || undefined,
          specialRequests: resNotes,
          confirmImmediately: Boolean(resTableId),
        }),
      'Reservation saved cleanly.'
    );
    setResGuest('');
    setResPhone('');
    setResNotes('');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <form
        onSubmit={handleCreateRes}
        className="xl:col-span-4 bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3.5"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-[#1C1917]">
          <CalendarPlus className="w-4 h-4 text-[#9B1C2E]" />
          <span>New Table Reservation</span>
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
        <input
          type="text"
          required
          value={resGuest}
          onChange={(e) => setResGuest(e.target.value)}
          placeholder="Guest Full Name"
          className="w-full h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
        />
        <input
          type="text"
          required
          value={resPhone}
          onChange={(e) => setResPhone(e.target.value)}
          placeholder="Contact Number (e.g. 0300-2211990)"
          className="w-full h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
        />
        <div className="grid grid-cols-2 gap-2.5">
          <input
            type="date"
            required
            value={resDate}
            onChange={(e) => setResDate(e.target.value)}
            className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
          />
          <input
            type="time"
            required
            value={resSlot}
            onChange={(e) => setResSlot(e.target.value)}
            className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <input
            type="number"
            min={1}
            max={20}
            value={resParty}
            onChange={(e) => setResParty(Math.max(1, Number(e.target.value) || 1))}
            placeholder="Guests"
            className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
          />
          <select
            value={resTableId}
            onChange={(e) => setResTableId(e.target.value)}
            className="h-10 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
          >
            <option value="">Assign table later...</option>
            {data.tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.tableNumber} ({t.capacity} seats · {t.status})
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={resNotes}
          onChange={(e) => setResNotes(e.target.value)}
          placeholder="Dietary / high-chair / birthday note"
          className="w-full h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
        />
        <button
          type="submit"
          className="w-full h-10 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold hover:bg-[#7F1524]"
        >
          Save Reservation
        </button>
      </form>

      <div className="xl:col-span-8 bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E6E2DA] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#1C1917]">Reservations Schedule ({data.reservations.length})</h3>
          <span className="text-[11px] text-[#57534E]">Double-booking &amp; capacity conflict checks enforced</span>
        </div>
        <div className="divide-y divide-[#E6E2DA]">
          {data.reservations.map((r) => (
            <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-bold text-[#1C1917]">
                  {r.reservationCode} · {r.guestName} ({r.partySize} guests)
                </p>
                <p className="text-[11px] text-[#57534E]">
                  {r.date} at {r.timeSlot} · {r.phone} · Source: {r.source}
                  {r.assignedTableNumber ? ` · Table ${r.assignedTableNumber}` : ' · Table Unassigned'}
                </p>
                {r.specialRequests && <p className="text-[11px] text-[#9B1C2E]">Note: {r.specialRequests}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-[#1C1917] mr-1">{r.status}</span>
                {r.status === 'Requested' && (
                  <button
                    type="button"
                    onClick={() => {
                      const avail = data.tables.find((t) => t.status === 'Available' && t.capacity >= r.partySize);
                      void runAction(
                        () =>
                          restaurantApi.updateReservation(r.id, {
                            status: 'Confirmed',
                            assignedTableId: r.assignedTableId || avail?.id,
                          }),
                        `Confirmed reservation ${r.reservationCode}.`
                      );
                    }}
                    className="h-8 px-2.5 rounded-lg bg-[#166534] text-white text-xs font-semibold"
                  >
                    Confirm &amp; Assign
                  </button>
                )}
                {r.status === 'Confirmed' && (
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        () => restaurantApi.updateReservation(r.id, { status: 'Seated' }),
                        `Seated reservation ${r.reservationCode}.`
                      )
                    }
                    className="h-8 px-2.5 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold"
                  >
                    Seat Now
                  </button>
                )}
                {(r.status === 'Requested' || r.status === 'Confirmed') && (
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        () => restaurantApi.updateReservation(r.id, { status: 'No-show' }),
                        `Marked ${r.reservationCode} as No-show.`
                      )
                    }
                    className="h-8 px-2.5 rounded-lg border border-[#E6E2DA] text-xs font-semibold text-[#57534E]"
                  >
                    No-Show
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
