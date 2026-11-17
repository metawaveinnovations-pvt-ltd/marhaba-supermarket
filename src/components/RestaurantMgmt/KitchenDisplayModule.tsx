import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Flame } from 'lucide-react';
import type { KitchenStationId, KitchenTicketStatus } from '../../restaurant/types';
import { restaurantApi, type RestaurantBootstrapPayload } from './restaurantApi';

interface KitchenDisplayModuleProps {
  data: RestaurantBootstrapPayload;
  onRefresh: () => Promise<void>;
}

export function KitchenDisplayModule({ data, onRefresh }: KitchenDisplayModuleProps) {
  const lockedStation =
    data.user.roleId === 'station_chef' ? data.user.assignedStation || data.role.assignedStation : undefined;
  const [stationFilter, setStationFilter] = useState<KitchenStationId | 'all'>(lockedStation || 'all');
  const [showServed, setShowServed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStatusUpdate = async (ticketId: string, status: KitchenTicketStatus, delayReason?: string) => {
    setError(null);
    try {
      await restaurantApi.updateKdsStatus(ticketId, status, delayReason);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update kitchen ticket.');
    }
  };

  const visibleTickets = data.kitchenTickets.filter((t) => {
    if (stationFilter !== 'all' && t.station !== stationFilter) return false;
    if (!showServed && (t.status === 'Served' || t.status === 'Cancelled')) return false;
    return true;
  });

  const getElapsedMinutes = (iso: string) =>
    Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

  return (
    <div className="space-y-5">
      <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {!lockedStation && (
            <button
              type="button"
              onClick={() => setStationFilter('all')}
              className={`h-9 px-3.5 rounded-lg text-xs font-semibold border ${
                stationFilter === 'all'
                  ? 'bg-[#9B1C2E] text-white border-[#9B1C2E]'
                  : 'bg-[#FAF9F6] text-[#1C1917] border-[#E6E2DA]'
              }`}
            >
              All Stations ({data.kitchenTickets.filter((t) => t.status !== 'Served').length})
            </button>
          )}
          {data.stations
            .filter((s) => !lockedStation || s.id === lockedStation)
            .map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStationFilter(s.id)}
                className={`h-9 px-3.5 rounded-lg text-xs font-semibold border ${
                  stationFilter === s.id
                    ? 'bg-[#9B1C2E] text-white border-[#9B1C2E]'
                    : 'bg-[#FAF9F6] text-[#1C1917] border-[#E6E2DA]'
                }`}
              >
                {s.label}
              </button>
            ))}
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#57534E] cursor-pointer">
          <input
            type="checkbox"
            checked={showServed}
            onChange={(e) => setShowServed(e.target.checked)}
            className="rounded border-[#E6E2DA]"
          />
          <span>Show Served / Cancelled</span>
        </label>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-[#9B1C2E]/8 border border-[#9B1C2E]/25 text-xs font-semibold text-[#9B1C2E]">
          {error}
        </div>
      )}

      {visibleTickets.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-8 text-center text-sm text-[#57534E]">
          No active kitchen tickets in this station view.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleTickets.map((tkt) => {
            const mins = getElapsedMinutes(tkt.createdAt);
            const stationMeta = data.stations.find((s) => s.id === tkt.station);
            return (
              <div
                key={tkt.id}
                className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-4 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[#E6E2DA]">
                    <div>
                      <p className="font-mono text-xs font-bold text-[#9B1C2E]">
                        {tkt.ticketNumber} · v{tkt.version}
                      </p>
                      <h3 className="text-base font-bold text-[#1C1917] mt-0.5">
                        {tkt.tableLabel} ({tkt.orderNumber})
                      </h3>
                      <p className="text-[11px] text-[#57534E]">
                        {stationMeta?.label || tkt.station} · {tkt.serviceType}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#1C1917] tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-[#57534E]" />
                        {mins}m
                      </span>
                      <p className="text-[11px] font-semibold text-[#B45309] mt-0.5">{tkt.status}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {tkt.items.map((item) => (
                      <div key={item.lineId} className="p-2.5 rounded-xl bg-[#FAF9F6] border border-[#E6E2DA]">
                        <p className="text-xs font-bold text-[#1C1917]">
                          <span className="font-mono text-[#9B1C2E] mr-1.5">{item.quantity}x</span>
                          {item.dishName} ({item.portionLabel})
                        </p>
                        {item.modifiers.length > 0 && (
                          <p className="text-[11px] text-[#57534E] mt-0.5">+ {item.modifiers.join(', ')}</p>
                        )}
                        {item.prepNotes && (
                          <p className="text-[11px] font-semibold text-[#9B1C2E] mt-0.5">
                            Prep Note: {item.prepNotes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  {tkt.delayReason && (
                    <p className="text-xs font-semibold text-[#B45309]">Delay: {tkt.delayReason}</p>
                  )}
                </div>

                <div className="pt-3 border-t border-[#E6E2DA] flex flex-wrap gap-2">
                  {tkt.status === 'New Order' && (
                    <button
                      type="button"
                      onClick={() => void handleStatusUpdate(tkt.id, 'Accepted')}
                      className="flex-1 h-9 px-3 rounded-lg bg-[#1C1917] text-white text-xs font-semibold"
                    >
                      Accept Ticket
                    </button>
                  )}
                  {(tkt.status === 'Accepted' || tkt.status === 'Delayed') && (
                    <button
                      type="button"
                      onClick={() => void handleStatusUpdate(tkt.id, 'Preparing')}
                      className="flex-1 h-9 px-3 rounded-lg bg-[#B45309] text-white text-xs font-semibold inline-flex items-center justify-center gap-1"
                    >
                      <Flame className="w-3.5 h-3.5" />
                      <span>Start Preparing</span>
                    </button>
                  )}
                  {tkt.status === 'Preparing' && (
                    <button
                      type="button"
                      onClick={() => void handleStatusUpdate(tkt.id, 'Ready')}
                      className="flex-1 h-9 px-3 rounded-lg bg-[#166534] text-white text-xs font-semibold inline-flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Mark Ready</span>
                    </button>
                  )}
                  {tkt.status === 'Ready' && (
                    <button
                      type="button"
                      onClick={() => void handleStatusUpdate(tkt.id, 'Served')}
                      className="flex-1 h-9 px-3 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold"
                    >
                      Picked Up / Served
                    </button>
                  )}
                  {['Accepted', 'Preparing'].includes(tkt.status) && (
                    <button
                      type="button"
                      onClick={() => void handleStatusUpdate(tkt.id, 'Delayed', 'High kitchen queue volume')}
                      className="h-9 px-2.5 rounded-lg border border-[#E6E2DA] text-xs font-semibold text-[#B45309] inline-flex items-center gap-1"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Delay</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
