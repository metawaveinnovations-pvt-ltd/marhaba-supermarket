import React from 'react';
import { ArrowRight, ChefHat, ClipboardList, LayoutGrid, Receipt, Utensils, Warehouse } from 'lucide-react';
import type { RestaurantModuleId } from '../../restaurant/types';
import type { RestaurantBootstrapPayload } from './restaurantApi';

interface RestaurantOverviewProps {
  data: RestaurantBootstrapPayload;
  onSelectModule: (m: RestaurantModuleId) => void;
}

export function RestaurantOverview({ data, onSelectModule }: RestaurantOverviewProps) {
  const permitted = new Set(data.permittedModules.map((m) => m.id));

  const kpiCards = [
    {
      label: 'Daily Restaurant Sales',
      value: `PKR ${data.kpis.dailySalesPkr.toLocaleString()}`,
      sub: `${data.kpis.ordersCount} orders · Avg bill PKR ${data.kpis.averageBillPkr.toLocaleString()}`,
      show: true,
    },
    {
      label: 'Dining Tables Active',
      value: `${data.kpis.activeTablesCount} / ${data.kpis.totalTablesCount}`,
      sub: `${data.kpis.coversServed} covers served today`,
      show: permitted.has('tables') || permitted.has('pos') || permitted.has('reservations'),
    },
    {
      label: 'Open Kitchen Tickets',
      value: String(data.kpis.openKitchenTickets),
      sub: `${data.kpis.readyTicketsCount} ticket(s) ready at pass`,
      show: permitted.has('kds') || permitted.has('pos'),
    },
    {
      label: 'Low Ingredient Alerts',
      value: String(data.kpis.lowStockCount),
      sub: `${data.menu.filter((m) => !m.available).length} dish(es) currently unavailable`,
      show: permitted.has('inventory') || permitted.has('menu') || permitted.has('purchasing'),
    },
  ].filter((c) => c.show);

  const allQuickActions: {
    module: RestaurantModuleId;
    title: string;
    detail: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      module: 'tables',
      title: 'Floor Plan & Table Seating',
      detail: `${data.tables.filter((t) => t.status === 'Available').length} tables available · ${data.tables.filter((t) => t.status === 'Awaiting Cleaning').length} awaiting clean`,
      icon: LayoutGrid,
    },
    {
      module: 'pos',
      title: 'Restaurant POS & Settlement',
      detail: data.role.canMarkOrderPaid
        ? 'Take orders, send KDS additions, split bills & settle cash/card'
        : 'Create dine-in or takeaway orders & send tickets to kitchen',
      icon: Receipt,
    },
    {
      module: 'kds',
      title: 'Kitchen Display Queue',
      detail: `${data.kpis.openKitchenTickets} active ticket(s) across BBQ, Karahi, Tandoor, Cold & Beverage`,
      icon: ChefHat,
    },
    {
      module: 'reservations',
      title: 'Table Reservations',
      detail: `${data.reservations.filter((r) => r.status === 'Confirmed' || r.status === 'Requested').length} upcoming booking(s)`,
      icon: ClipboardList,
    },
    {
      module: 'menu',
      title: 'Menu Availability & Food Cost',
      detail: `${data.menu.filter((m) => m.available).length} of ${data.menu.length} dishes active`,
      icon: Utensils,
    },
    {
      module: 'inventory',
      title: 'Recipes & Ingredient Stock',
      detail: `${data.ingredients.length} tracked raw ingredients with automatic recipe deduction`,
      icon: Warehouse,
    },
  ];
  const quickActions = allQuickActions.filter((q) => permitted.has(q.module));

  return (
    <div className="space-y-6">
      <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9B1C2E]">
            {data.role.label} · Today Overview
          </p>
          <h2 className="mt-1 font-serif text-2xl font-bold text-[#1C1917]">
            Welcome, {data.user.fullName}
          </h2>
          <p className="text-xs text-[#57534E] mt-1">{data.role.description}</p>
        </div>
        <div className="text-xs text-[#57534E] shrink-0">
          <p>
            Service Charge: <strong className="font-mono text-[#1C1917]">{data.config.serviceChargeRatePercent}%</strong>
            {' · '}
            Tax: <strong className="font-mono text-[#1C1917]">{data.config.taxRatePercent}%</strong>
          </p>
          <p className="mt-1">
            Open Shift Cashiers:{' '}
            <strong className="text-[#1C1917]">{data.shifts.filter((s) => s.status === 'Open').length}</strong>
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
        <h3 className="text-sm font-bold text-[#1C1917]">Permitted Operational Workspaces</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <button
                key={qa.module}
                type="button"
                onClick={() => onSelectModule(qa.module)}
                className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 text-left hover:border-[#9B1C2E] transition-colors flex items-start justify-between gap-3 group"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#FAF9F6] border border-[#E6E2DA] text-[#9B1C2E] flex items-center justify-center group-hover:bg-[#9B1C2E] group-hover:text-white transition-colors">
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-bold text-[#1C1917] group-hover:text-[#9B1C2E]">{qa.title}</p>
                  <p className="text-xs text-[#57534E] leading-relaxed">{qa.detail}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#57534E] group-hover:text-[#9B1C2E] shrink-0 mt-1" />
              </button>
            );
          })}
        </div>
      </section>

      {data.priorityAlerts.length > 0 && (
        <section className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#1C1917]">Operational Exceptions Requiring Attention</h3>
          <div className="divide-y divide-[#E6E2DA]">
            {data.priorityAlerts.map((al) => (
              <div key={al.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-[#1C1917]">{al.title}</p>
                  <p className="text-[11px] text-[#57534E]">{al.detail}</p>
                </div>
                {permitted.has(al.module) && (
                  <button
                    type="button"
                    onClick={() => onSelectModule(al.module)}
                    className="h-8 px-3 rounded-lg border border-[#E6E2DA] text-xs font-semibold hover:border-[#9B1C2E] hover:text-[#9B1C2E] shrink-0"
                  >
                    Inspect
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
