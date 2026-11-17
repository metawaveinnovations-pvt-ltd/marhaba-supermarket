import React, { useState } from 'react';
import { CheckCircle2, QrCode, ShieldAlert } from 'lucide-react';
import { playLandApi, type PlayLandBootstrapPayload } from './playLandApi';

interface AdmissionsGateModuleProps {
  data: PlayLandBootstrapPayload;
  onRefresh: () => Promise<void>;
}

export function AdmissionsGateModule({ data, onRefresh }: AdmissionsGateModuleProps) {
  const [scanInput, setScanInput] = useState(data.tickets.find((t) => t.status === 'Valid')?.ticketCode || '');
  const [scanResult, setScanResult] = useState<{
    result: string;
    canAdmit: boolean;
    reason: string;
    eligibleCount?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const performScan = async (code: string) => {
    setError(null);
    setScanResult(null);
    try {
      const res = await playLandApi.scanAdmission(code);
      setScanResult({
        result: res.result,
        canAdmit: res.canAdmit,
        reason: res.reason,
        eligibleCount: res.eligibleAttractions?.eligible.length,
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gate scan failed.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-[#1C1917]">
          <QrCode className="w-4 h-4 text-[#9B1C2E]" />
          <span>Gate Scanner &amp; Admission Validation</span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void performScan(scanInput);
          }}
          className="space-y-3"
        >
          <input
            type="text"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            placeholder="Scan QR or enter Ticket Code (e.g. PL-HYD-1002)"
            className="w-full h-11 px-3.5 rounded-xl border border-[#E6E2DA] bg-[#FAF9F6] font-mono text-sm font-bold"
          />
          <button
            type="submit"
            disabled={!data.role.canScanAdmissions}
            className="w-full h-11 rounded-xl bg-[#9B1C2E] text-white text-xs font-semibold hover:bg-[#7F1524] disabled:opacity-40"
          >
            {data.role.canScanAdmissions ? 'Validate & Admit Guest' : 'Gate Scan Restricted for Role'}
          </button>
        </form>

        {error && (
          <div className="p-3 rounded-xl bg-[#9B1C2E]/8 border border-[#9B1C2E]/25 text-xs font-semibold text-[#9B1C2E]">
            {error}
          </div>
        )}

        {scanResult && (
          <div
            className={`p-4 rounded-xl border space-y-1.5 ${
              scanResult.canAdmit
                ? 'bg-[#166534]/10 border-[#166534]/30 text-[#166534]'
                : 'bg-[#9B1C2E]/10 border-[#9B1C2E]/30 text-[#9B1C2E]'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-bold">
              {scanResult.canAdmit ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
              <span>{scanResult.result}</span>
            </div>
            <p className="text-xs font-medium text-[#1C1917]">{scanResult.reason}</p>
            {typeof scanResult.eligibleCount === 'number' && (
              <p className="text-[11px] text-[#57534E]">
                Eligible attractions for child age: <strong>{scanResult.eligibleCount}</strong> zone(s)
              </p>
            )}
          </div>
        )}

        <div className="pt-3 border-t border-[#E6E2DA] space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#57534E]">
            Quick Test Tickets
          </p>
          <div className="flex flex-wrap gap-2">
            {data.tickets.slice(0, 6).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setScanInput(t.ticketCode);
                  void performScan(t.ticketCode);
                }}
                className="h-8 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-[11px] font-mono font-semibold hover:border-[#9B1C2E]"
              >
                {t.ticketCode} ({t.status})
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E6E2DA]">
          <h3 className="text-sm font-bold text-[#1C1917]">Gate Check-In Audit Log ({data.admissionLogs.length})</h3>
        </div>
        <div className="divide-y divide-[#E6E2DA]">
          {data.admissionLogs.map((log) => (
            <div key={log.id} className="p-4 flex items-center justify-between gap-3 text-xs">
              <div>
                <p className="font-bold text-[#1C1917]">
                  <span className="font-mono text-[#9B1C2E] mr-1.5">{log.ticketCode}</span>
                  {log.guestName} · <strong className={log.result === 'Valid' ? 'text-[#166534]' : 'text-[#9B1C2E]'}>{log.result}</strong>
                </p>
                <p className="text-[11px] text-[#57534E] mt-0.5">
                  {log.detail} · Scanned by {log.attendantName}
                </p>
              </div>
              <span className="font-mono text-[11px] text-[#57534E] shrink-0">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
