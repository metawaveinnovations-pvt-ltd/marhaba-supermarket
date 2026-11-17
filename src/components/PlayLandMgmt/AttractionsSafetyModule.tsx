import React, { useState } from 'react';
import { ShieldAlert, Wrench } from 'lucide-react';
import type { AttractionStatus } from '../../playland/types';
import { playLandApi, type PlayLandBootstrapPayload } from './playLandApi';

interface AttractionsSafetyModuleProps {
  mode: 'attractions' | 'sessions' | 'safety' | 'maintenance';
  data: PlayLandBootstrapPayload;
  onRefresh: () => Promise<void>;
}

export function AttractionsSafetyModule({ mode, data, onRefresh }: AttractionsSafetyModuleProps) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Inspection form
  const [inspAttrId, setInspAttrId] = useState(data.attractions[0]?.id || '');
  const [inspPass, setInspPass] = useState(true);

  // Incident form
  const [incAttrId, setIncAttrId] = useState(data.attractions[0]?.id || '');
  const [incCategory, setIncCategory] = useState<'Safety Concern' | 'Guest Injury' | 'Missing-Child Alert'>(
    'Safety Concern'
  );
  const [incSeverity, setIncSeverity] = useState<'Low' | 'Medium' | 'High / Urgent'>('Medium');
  const [incSummary, setIncSummary] = useState('');
  const [incAction, setIncAction] = useState('');
  const [incConfidential, setIncConfidential] = useState(false);

  // Maintenance fault form
  const [faultAttrId, setFaultAttrId] = useState(data.attractions[0]?.id || '');
  const [faultSeverity, setFaultSeverity] = useState<'Non-Critical' | 'Safety-Critical'>('Safety-Critical');
  const [faultDesc, setFaultDesc] = useState('');

  const runAction = async (fn: () => Promise<unknown>, okMsg: string) => {
    setError(null);
    setNotice(null);
    try {
      await fn();
      await onRefresh();
      setNotice(okMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation denied or failed.');
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

  if (mode === 'attractions') {
    const statuses: AttractionStatus[] = [
      'Operating',
      'Paused',
      'Out of Service',
      'Under Maintenance',
      'Incident Hold',
      'Ready / Authorized to Open',
    ];
    return (
      <div className="space-y-4">
        {renderBanner()}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.attractions.map((a) => (
            <div key={a.id} className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#1C1917]">{a.name}</h3>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                      a.status === 'Operating' || a.status === 'Ready / Authorized to Open'
                        ? 'bg-[#166534]/10 text-[#166534] border-[#166534]/25'
                        : 'bg-[#9B1C2E]/10 text-[#9B1C2E] border-[#9B1C2E]/25'
                    }`}
                  >
                    {a.status}
                  </span>
                </div>
                <p className="text-xs text-[#57534E]">
                  {a.zone} · Ages {a.minAgeYears}-{a.maxAgeYears} yrs · Cap {a.activeOccupancy}/{a.capacity}
                </p>
                <p className="text-[11px] text-[#57534E]">
                  Maintenance: <strong className="text-[#1C1917]">{a.maintenanceStatus}</strong>
                  {a.lastClearedByName ? ` · Cleared by ${a.lastClearedByName}` : ''}
                </p>
              </div>

              <div className="pt-3 border-t border-[#E6E2DA] flex flex-wrap gap-1.5">
                {statuses.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() =>
                      void runAction(
                        () => playLandApi.updateAttractionStatus(a.id, st),
                        `Updated ${a.name} to "${st}".`
                      )
                    }
                    className="h-7 px-2 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-[11px] font-semibold hover:border-[#9B1C2E]"
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'sessions') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.sessions.map((s) => {
          const pct = Math.min(100, Math.round((s.allocatedCount / s.maxCapacity) * 100));
          return (
            <div key={s.id} className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
              <div>
                <p className="text-xs font-bold text-[#9B1C2E]">{s.date}</p>
                <h3 className="text-base font-bold text-[#1C1917] mt-0.5">{s.windowLabel}</h3>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono">
                  <span>Allocated: {s.allocatedCount} / {s.maxCapacity}</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-[#F3F1EC] overflow-hidden">
                  <div className="h-full bg-[#9B1C2E]" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[11px] text-[#57534E]">
                  Checked in at gate: <strong className="font-mono">{s.checkedInCount}</strong> · Remaining:{' '}
                  <strong className="font-mono">{Math.max(0, s.maxCapacity - s.allocatedCount)}</strong>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (mode === 'safety') {
    return (
      <div className="space-y-6">
        {renderBanner()}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#1C1917]">Submit Daily Pre-Opening Safety Checklist</h3>
            <select
              value={inspAttrId}
              onChange={(e) => setInspAttrId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            >
              {data.attractions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.status})
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={inspPass} onChange={(e) => setInspPass(e.target.checked)} />
              <span>All padding, nets, restraints &amp; emergency stop checks PASSED</span>
            </label>
            <button
              type="button"
              onClick={() =>
                void runAction(
                  () =>
                    playLandApi.submitInspection(inspAttrId, [
                      { item: 'Harness, padding & enclosure barrier check', passed: inspPass },
                      { item: 'Emergency stop & floor mat clearance', passed: inspPass },
                    ]),
                  inspPass
                    ? 'Submitted passed pre-opening inspection.'
                    : 'Inspection logged ISSUE FOUND — attraction placed Out of Service + Safety Work Order created.'
                )
              }
              className="h-9 px-4 rounded-lg bg-[#1C1917] text-white text-xs font-semibold"
            >
              Submit Inspection
            </button>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#1C1917] flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-[#9B1C2E]" />
              <span>Log Safety / Child Incident Report</span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={incCategory}
                onChange={(e) => setIncCategory(e.target.value as typeof incCategory)}
                className="h-9 px-2 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
              >
                <option value="Safety Concern">Safety Concern</option>
                <option value="Guest Injury">Guest Injury</option>
                <option value="Missing-Child Alert">Missing-Child Alert</option>
              </select>
              <select
                value={incSeverity}
                onChange={(e) => setIncSeverity(e.target.value as typeof incSeverity)}
                className="h-9 px-2 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High / Urgent">High / Urgent</option>
              </select>
              <select
                value={incAttrId}
                onChange={(e) => setIncAttrId(e.target.value)}
                className="h-9 px-2 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
              >
                {data.attractions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <input
              type="text"
              value={incSummary}
              onChange={(e) => setIncSummary(e.target.value)}
              placeholder="Incident Summary"
              className="w-full h-9 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
            <input
              type="text"
              value={incAction}
              onChange={(e) => setIncAction(e.target.value)}
              placeholder="Immediate Action Taken"
              className="w-full h-9 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
            <label className="flex items-center gap-2 text-xs text-[#57534E]">
              <input
                type="checkbox"
                checked={incConfidential}
                onChange={(e) => setIncConfidential(e.target.checked)}
              />
              <span>Confidential Child Protection Note (redacted for general floor staff)</span>
            </label>
            <button
              type="button"
              onClick={() =>
                void runAction(
                  () =>
                    playLandApi.logIncident({
                      category: incCategory,
                      severity: incSeverity,
                      attractionId: incAttrId,
                      summary: incSummary,
                      immediateActionTaken: incAction,
                      confidentialChildNote: incConfidential,
                    }),
                  'Safety incident logged.'
                )
              }
              className="h-9 px-4 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold"
            >
              Submit Incident Report
            </button>
          </div>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl divide-y divide-[#E6E2DA]">
          <div className="px-5 py-3.5 font-bold text-sm text-[#1C1917]">
            Recorded Safety Incidents ({data.incidents.length})
          </div>
          {data.incidents.map((inc) => (
            <div key={inc.id} className="p-4 text-xs space-y-1">
              <p className="font-bold text-[#1C1917]">
                {inc.incidentNumber} · {inc.category} ({inc.severity}) — {inc.status}
              </p>
              <p className="text-[#57534E]">{inc.summary}</p>
              <p className="text-[11px] text-[#57534E]">Action: {inc.immediateActionTaken}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // mode === 'maintenance'
  return (
    <div className="space-y-6">
      {renderBanner()}
      <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#1C1917] flex items-center gap-1.5">
          <Wrench className="w-4 h-4 text-[#9B1C2E]" />
          <span>Report Attraction Equipment Fault</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <select
            value={faultAttrId}
            onChange={(e) => setFaultAttrId(e.target.value)}
            className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
          >
            {data.attractions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={faultSeverity}
            onChange={(e) => setFaultSeverity(e.target.value as 'Non-Critical' | 'Safety-Critical')}
            className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
          >
            <option value="Safety-Critical">Safety-Critical (Locks Attraction Immediately)</option>
            <option value="Non-Critical">Non-Critical Cosmetic / Lighting</option>
          </select>
          <input
            type="text"
            value={faultDesc}
            onChange={(e) => setFaultDesc(e.target.value)}
            placeholder="Describe equipment fault..."
            className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
          />
        </div>
        <button
          type="button"
          onClick={() =>
            void runAction(
              () => playLandApi.reportFault(faultAttrId, faultSeverity, faultDesc),
              'Fault work order created.'
            )
          }
          className="h-9 px-4 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold"
        >
          Log Equipment Fault
        </button>
      </div>

      <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl divide-y divide-[#E6E2DA]">
        <div className="px-5 py-3.5 font-bold text-sm text-[#1C1917]">
          Maintenance Work Orders ({data.workOrders.length})
        </div>
        {data.workOrders.map((w) => (
          <div key={w.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <p className="font-bold text-[#1C1917]">
                {w.workOrderNumber} · {w.attractionName} ({w.severity}) — <span className="text-[#9B1C2E]">{w.status}</span>
              </p>
              <p className="text-[#57534E] mt-0.5">{w.faultDescription}</p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {w.status === 'Reported' && (
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      () => playLandApi.updateWorkOrder(w.id, { status: 'Technician Inspecting' }),
                      `Started inspection on ${w.workOrderNumber}.`
                    )
                  }
                  className="h-8 px-3 rounded-lg border border-[#E6E2DA] font-semibold"
                >
                  Start Inspection
                </button>
              )}
              {(w.status === 'Reported' || w.status === 'Technician Inspecting') && (
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      () =>
                        playLandApi.updateWorkOrder(w.id, {
                          status: 'Repair Completed',
                          repairActionNotes: 'Parts replaced & load test verified',
                          downtimeMinutes: 25,
                        }),
                      `Marked ${w.workOrderNumber} Repair Completed — awaiting Safety Officer clearance.`
                    )
                  }
                  className="h-8 px-3 rounded-lg bg-[#1C1917] text-white font-semibold"
                >
                  Complete Repair
                </button>
              )}
              {w.status === 'Repair Completed' && (
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      () => playLandApi.updateWorkOrder(w.id, { status: 'Cleared for Service' }),
                      `Cleared ${w.workOrderNumber} for guest operation.`
                    )
                  }
                  className="h-8 px-3 rounded-lg bg-[#166534] text-white font-semibold"
                >
                  Safety Clearance to Open
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
