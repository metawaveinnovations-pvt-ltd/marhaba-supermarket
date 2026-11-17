import React from 'react';
import { ArrowRight, Cake, Gamepad2, QrCode, ShieldAlert, Ticket, Wrench } from 'lucide-react';
import type { PlayLandModuleId } from '../../playland/types';
import type { PlayLandBootstrapPayload } from './playLandApi';

interface PlayLandOverviewProps {
  data: PlayLandBootstrapPayload;
  onSelectModule: (m: PlayLandModuleId) => void;
}

export function PlayLandOverview({ data, onSelectModule }: PlayLandOverviewProps) {
  const permitted = new Set(data.permittedModules.map((m) => m.id));

  const kpiCards = [
    {
      label: 'Ticket Counter Sales',
      value: `PKR ${data.kpis.dailyTicketSalesPkr.toLocaleString()}`,
      sub: `${data.kpis.ticketsIssuedCount} valid passes issued today`,
    },
    {
      label: 'Gate Admissions Checked In',
      value: String(data.kpis.paidAdmissionsCount),
      sub: `Live zone occupancy ${data.kpis.activeOccupancy} / ${data.kpis.totalAttractionCapacity}`,
    },
    {
      label: 'Safety Lockouts & Faults',
      value: String(data.kpis.safetyLockedAttractions),
      sub: `${data.kpis.openMaintenanceOrders} open work order(s) · ${data.kpis.openIncidents} incident(s)`,
    },
    {
      label: 'Birthday & Group Events',
      value: String(data.kpis.confirmedEventsCount),
      sub: `${data.events.length} total bookings in pipeline`,
    },
  ];

  const allActions: {
    module: PlayLandModuleId;
    title: string;
    detail: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      module: 'tickets',
      title: 'Ticket Counter & POS',
      detail: 'Issue timed passes, apply child-age pricing, print QR passes & handle refunds',
      icon: Ticket,
    },
    {
      module: 'admissions',
      title: 'Admissions Gate & QR Check-In',
      detail: 'Scan guest QR codes, prevent duplicate entry & view age-eligible attractions',
      icon: QrCode,
    },
    {
      module: 'attractions',
      title: 'Attractions & Rides Board',
      detail: `${data.attractions.filter((a) => a.status === 'Operating').length} operating · supervisor clearance enforcement`,
      icon: Gamepad2,
    },
    {
      module: 'safety',
      title: 'Safety Checklists & Incidents',
      detail: 'Daily pre-opening safety sign-offs & protected incident log',
      icon: ShieldAlert,
    },
    {
      module: 'maintenance',
      title: 'Equipment Faults & Maintenance',
      detail: 'Report critical ride faults, log repairs & issue safety clearance',
      icon: Wrench,
    },
    {
      module: 'events',
      title: 'Birthdays & Group Bookings',
      detail: '8-stage birthday workflow with Restaurant catering request trigger',
      icon: Cake,
    },
  ];
  const actions = allActions.filter((a) => permitted.has(a.module));

  return (
    <div className="space-y-6">
      <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9B1C2E]">
            {data.role.label} · Operations Overview
          </p>
          <h2 className="mt-1 font-serif text-2xl font-bold text-[#1C1917]">
            Welcome, {data.user.fullName}
          </h2>
          <p className="text-xs text-[#57534E] mt-1">{data.role.description}</p>
        </div>
        <div className="text-xs text-[#57534E] shrink-0">
          <p>
            Re-entry Policy:{' '}
            <strong className="text-[#1C1917]">
              {data.config.reentryAllowedByDefault ? 'Multi-Entry' : 'Single Entry'}
            </strong>
          </p>
          <p className="mt-1">
            Open Shifts: <strong className="text-[#1C1917]">{data.shifts.filter((s) => s.status === 'Open').length}</strong>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((c) => (
          <div key={c.label} className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#57534E]">{c.label}</p>
            <p className="mt-2 font-mono text-2xl font-bold text-[#1C1917] tabular-nums">{c.value}</p>
            <p className="mt-1 text-xs text-[#57534E]">{c.sub}</p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-[#1C1917]">Permitted Play Land Workspaces</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.module}
                type="button"
                onClick={() => onSelectModule(a.module)}
                className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 text-left hover:border-[#9B1C2E] transition-colors flex items-start justify-between gap-3 group"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#FAF9F6] border border-[#E6E2DA] text-[#9B1C2E] flex items-center justify-center group-hover:bg-[#9B1C2E] group-hover:text-white transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-bold text-[#1C1917] group-hover:text-[#9B1C2E]">{a.title}</p>
                  <p className="text-xs text-[#57534E] leading-relaxed">{a.detail}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#57534E] group-hover:text-[#9B1C2E] shrink-0 mt-1" />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
