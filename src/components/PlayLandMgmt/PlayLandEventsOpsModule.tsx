import React, { useState } from 'react';
import { getEligibleAttractionsForChild } from '../../playland/calculations';
import type { EventLifecycleStage } from '../../playland/types';
import { playLandApi, type PlayLandBootstrapPayload } from './playLandApi';

interface PlayLandEventsOpsModuleProps {
  mode: 'packages' | 'events' | 'support' | 'staff' | 'accounts' | 'reports' | 'settings';
  data: PlayLandBootstrapPayload;
  onRefresh: () => Promise<void>;
}

const EVENT_STAGES: EventLifecycleStage[] = [
  'Inquiry',
  'Review',
  'Availability Check',
  'Quotation',
  'Customer Acceptance',
  'Authorized Confirmation',
  'Event Preparation',
  'Event Completion',
];

export function PlayLandEventsOpsModule({ mode, data, onRefresh }: PlayLandEventsOpsModuleProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Event creation
  const [evtParent, setEvtParent] = useState('');
  const [evtPhone, setEvtPhone] = useState('');
  const [evtDate, setEvtDate] = useState(data.config.operatingDate);
  const [evtSession, setEvtSession] = useState(data.sessions[1]?.id || data.sessions[0]?.id || '');
  const [evtChildren, setEvtChildren] = useState('15');
  const [evtCatering, setEvtCatering] = useState(true);

  // Age eligibility helper & support case
  const [checkAge, setCheckAge] = useState(5);
  const [supParent, setSupParent] = useState('');
  const [supSummary, setSupSummary] = useState('');

  // Shift closing
  const [declaredCash, setDeclaredCash] = useState('15000');

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

  if (mode === 'packages') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.packages.map((p) => (
          <div key={p.id} className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-2">
            <h3 className="text-sm font-bold text-[#1C1917]">{p.name}</h3>
            <p className="font-mono text-xl font-bold text-[#9B1C2E]">PKR {p.pricePkr.toLocaleString()}</p>
            <p className="text-xs text-[#57534E]">
              {p.durationLabel} · Includes {p.childCountIncluded} child, {p.adultCountIncluded} adult
            </p>
            <p className="text-[11px] text-[#57534E]">
              Type: {p.ticketType} · Status: <strong>{p.active ? 'Active' : 'Inactive'}</strong>
            </p>
          </div>
        ))}
      </div>
    );
  }

  if (mode === 'events') {
    return (
      <div className="space-y-5">
        {renderBanner()}
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#1C1917]">Book Birthday Party / Group Celebration</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <input
              type="text"
              value={evtParent}
              onChange={(e) => setEvtParent(e.target.value)}
              placeholder="Parent Name"
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
            <input
              type="text"
              value={evtPhone}
              onChange={(e) => setEvtPhone(e.target.value)}
              placeholder="Mobile Number"
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
            <input
              type="date"
              value={evtDate}
              onChange={(e) => setEvtDate(e.target.value)}
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
            <select
              value={evtSession}
              onChange={(e) => setEvtSession(e.target.value)}
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            >
              {data.sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.windowLabel}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={5}
              value={evtChildren}
              onChange={(e) => setEvtChildren(e.target.value)}
              placeholder="Children"
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-mono"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-[#57534E]">
            <input type="checkbox" checked={evtCatering} onChange={(e) => setEvtCatering(e.target.checked)} />
            <span>Request Kids Meal Catering from Marhaba Restaurant on Confirmation</span>
          </label>
          <button
            type="button"
            onClick={() =>
              void runAction(
                () =>
                  playLandApi.createEvent({
                    parentName: evtParent,
                    phone: evtPhone,
                    eventDate: evtDate,
                    sessionId: evtSession,
                    childCount: Number(evtChildren),
                    foodCateringRequested: evtCatering,
                  }),
                'Birthday booking inquiry saved.'
              )
            }
            className="h-9 px-4 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold"
          >
            Create Birthday Booking
          </button>
        </div>

        <div className="space-y-3">
          {data.events.map((ev) => {
            const idx = EVENT_STAGES.indexOf(ev.stage);
            const nextStage = idx >= 0 && idx < EVENT_STAGES.length - 1 ? EVENT_STAGES[idx + 1] : null;
            return (
              <div key={ev.id} className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-mono text-xs font-bold text-[#9B1C2E]">
                    {ev.eventCode} · Stage: {ev.stage}
                  </p>
                  <p className="text-sm font-bold text-[#1C1917]">
                    {ev.parentName} ({ev.childCount} kids) · {ev.eventDate} ({ev.sessionLabel})
                  </p>
                  <p className="text-xs text-[#57534E]">
                    Quoted: <strong className="font-mono">PKR {ev.quotedAmountPkr.toLocaleString()}</strong> · Payment:{' '}
                    <strong>{ev.paymentStatus}</strong>
                    {ev.restaurantServiceRequestId && (
                      <span className="text-[#166534] font-semibold">
                        {' '}
                        · Restaurant Catering Ref: {ev.restaurantServiceRequestId}
                      </span>
                    )}
                  </p>
                </div>
                {nextStage && (
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        () =>
                          playLandApi.updateEventStage(ev.id, {
                            stage: nextStage,
                            paymentStatus: nextStage === 'Authorized Confirmation' ? 'Deposit Paid' : undefined,
                          }),
                        `Advanced ${ev.eventCode} to "${nextStage}".`
                      )
                    }
                    className="h-9 px-4 rounded-lg bg-[#166534] text-white text-xs font-semibold shrink-0"
                  >
                    Advance to: {nextStage}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (mode === 'support') {
    const { eligible, unavailableOrRestricted } = getEligibleAttractionsForChild(data.attractions, checkAge);
    return (
      <div className="space-y-5">
        {renderBanner()}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#1C1917]">Parent Age-Eligibility Attraction Finder</h3>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold">Child Age (years):</label>
              <input
                type="number"
                min={1}
                max={15}
                value={checkAge}
                onChange={(e) => setCheckAge(Math.max(1, Number(e.target.value) || 4))}
                className="w-20 h-9 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] font-mono text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5 text-xs">
              {eligible.map((a) => (
                <div key={a.id} className="p-2.5 rounded-lg bg-[#FAF9F6] border border-[#E6E2DA] flex justify-between">
                  <span className="font-semibold text-[#1C1917]">{a.name}</span>
                  <span className="text-[#166534] font-semibold">{a.status}</span>
                </div>
              ))}
              {unavailableOrRestricted.map(({ attraction, reason }) => (
                <div key={attraction.id} className="p-2.5 rounded-lg bg-[#FAF9F6]/60 border border-[#E6E2DA] flex justify-between text-[#57534E]">
                  <span>{attraction.name}</span>
                  <span className="text-[#9B1C2E] font-medium">{reason}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#1C1917]">Log Parent Inquiry or Lost Property Case</h3>
            <input
              type="text"
              value={supParent}
              onChange={(e) => setSupParent(e.target.value)}
              placeholder="Parent Name"
              className="w-full h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
            <input
              type="text"
              value={supSummary}
              onChange={(e) => setSupSummary(e.target.value)}
              placeholder="Summary / Lost item description"
              className="w-full h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
            <button
              type="button"
              onClick={() =>
                void runAction(
                  () =>
                    playLandApi.createSupportCase({
                      parentName: supParent,
                      phone: '0300-***-000',
                      category: 'Parent Question',
                      summary: supSummary,
                    }),
                  'Logged parent support case.'
                )
              }
              className="h-9 px-4 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold"
            >
              Save Support Case
            </button>
          </div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl divide-y divide-[#E6E2DA]">
          {data.supportCases.map((sc) => (
            <div key={sc.id} className="p-4 text-xs">
              <p className="font-bold text-[#1C1917]">
                {sc.caseNumber} · {sc.parentName} ({sc.category}) — {sc.status}
              </p>
              <p className="text-[#57534E] mt-0.5">{sc.summary}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'staff') {
    return (
      <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl divide-y divide-[#E6E2DA]">
        <div className="px-5 py-4 font-bold text-sm text-[#1C1917]">
          Play Land Zone Supervision &amp; Staff Roster ({data.roster.length})
        </div>
        {data.roster.map((r) => (
          <div key={r.id} className="p-4 flex items-center justify-between text-xs">
            <div>
              <p className="font-bold text-[#1C1917]">{r.fullName}</p>
              <p className="text-[#57534E]">
                {r.roleLabel} · {r.assignmentZone} · {r.shiftWindow}
              </p>
            </div>
            <span className="font-semibold text-[#166534]">{r.status}</span>
          </div>
        ))}
      </div>
    );
  }

  if (mode === 'accounts') {
    return (
      <div className="space-y-5">
        {renderBanner()}
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-[#1C1917]">Play Land Ticket Counter Shifts &amp; Reconciliation</h3>
            <p className="text-xs text-[#57534E]">Separated Play Land cash drawer closing and verification.</p>
          </div>
          {data.role.canCloseShift && (
            <button
              type="button"
              onClick={() =>
                void runAction(() => playLandApi.openShift(10000), 'Opened Play Land ticket cashier shift (PKR 10,000 float).')
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
                  Float: PKR {sh.openingFloatPkr.toLocaleString()} · Cash Sales: PKR {sh.cashSalesPkr.toLocaleString()} · Card: PKR {sh.cardSalesPkr.toLocaleString()} · Expected Cash: PKR {sh.expectedCashPkr.toLocaleString()}
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
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(
                          () => playLandApi.closeShift(sh.id, Number(declaredCash)),
                          `Closed Play Land shift ${sh.shiftNumber}.`
                        )
                      }
                      className="h-9 px-3.5 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold"
                    >
                      Close Shift
                    </button>
                  </>
                )}
                {sh.status === 'Pending Accounts Verification' && (
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        () => playLandApi.reconcileShift(sh.id),
                        `Reconciled Play Land shift ${sh.shiftNumber}.`
                      )
                    }
                    className="h-9 px-3.5 rounded-lg bg-[#166534] text-white text-xs font-semibold"
                  >
                    Reconcile Shift
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'reports') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5">
          <p className="text-[11px] font-semibold uppercase text-[#57534E]">Ticket Revenue</p>
          <p className="mt-1 font-mono text-2xl font-bold">PKR {data.kpis.dailyTicketSalesPkr.toLocaleString()}</p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5">
          <p className="text-[11px] font-semibold uppercase text-[#57534E]">Gate Admissions</p>
          <p className="mt-1 font-mono text-2xl font-bold">{data.kpis.paidAdmissionsCount}</p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5">
          <p className="text-[11px] font-semibold uppercase text-[#57534E]">Open Work Orders</p>
          <p className="mt-1 font-mono text-2xl font-bold text-[#9B1C2E]">{data.kpis.openMaintenanceOrders}</p>
        </div>
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5">
          <p className="text-[11px] font-semibold uppercase text-[#57534E]">Confirmed Events</p>
          <p className="mt-1 font-mono text-2xl font-bold">{data.kpis.confirmedEventsCount}</p>
        </div>
      </div>
    );
  }

  // mode === 'settings'
  return (
    <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E6E2DA]">
        <h3 className="text-sm font-bold text-[#1C1917]">Play Land Audit Trail ({data.auditLogs.length})</h3>
      </div>
      <div className="divide-y divide-[#E6E2DA] max-h-96 overflow-y-auto">
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
  );
}
