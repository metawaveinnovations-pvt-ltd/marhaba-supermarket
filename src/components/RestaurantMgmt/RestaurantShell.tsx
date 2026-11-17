import React, { useState } from 'react';
import {
  ArrowLeft,
  BadgePercent,
  BarChart3,
  Bell,
  CalendarClock,
  ChefHat,
  CreditCard,
  Headphones,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Settings,
  Truck,
  Users,
  Utensils,
  Warehouse,
  X,
} from 'lucide-react';
import type { RestaurantModuleId } from '../../restaurant/types';
import type { RestaurantBootstrapPayload } from './restaurantApi';

interface RestaurantShellProps {
  data: RestaurantBootstrapPayload;
  activeModule: RestaurantModuleId;
  selectedBranch: string;
  onSelectBranch: (branchId: string) => void;
  onSelectModule: (moduleId: RestaurantModuleId) => void;
  onBackToPortal: () => void;
  onLogout: () => void;
  onExitToPublic: () => void;
  children: React.ReactNode;
}

const MODULE_ICONS: Record<RestaurantModuleId, React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  tables: LayoutGrid,
  reservations: CalendarClock,
  pos: Receipt,
  kds: ChefHat,
  menu: Utensils,
  inventory: Warehouse,
  purchasing: Truck,
  deals: BadgePercent,
  staff: Users,
  customers: Headphones,
  accounts: CreditCard,
  reports: BarChart3,
  settings: Settings,
};

export function RestaurantShell({
  data,
  activeModule,
  selectedBranch,
  onSelectBranch,
  onSelectModule,
  onBackToPortal,
  onLogout,
  onExitToPublic,
  children,
}: RestaurantShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const currentModule =
    data.permittedModules.find((m) => m.id === activeModule) || data.permittedModules[0];
  const isBranchLocked = data.role.branchRestricted || data.user.branchId !== 'all';

  const renderNav = (compact: boolean, onAfter?: () => void) => (
    <nav aria-label="Restaurant Modules" className="flex-1 overflow-y-auto px-2.5 py-3 space-y-1">
      {data.permittedModules.map((mod) => {
        const Icon = MODULE_ICONS[mod.id] || LayoutDashboard;
        const active = activeModule === mod.id;
        return (
          <button
            key={mod.id}
            type="button"
            onClick={() => {
              onSelectModule(mod.id);
              onAfter?.();
            }}
            title={compact ? mod.label : undefined}
            aria-current={active ? 'page' : undefined}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-[13px] font-semibold transition-colors ${
              active
                ? 'bg-[#9B1C2E] text-white'
                : 'text-[#1C1917] hover:bg-[#F3F1EC] hover:text-[#9B1C2E]'
            } ${compact ? 'justify-center px-2' : ''}`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-[#57534E]'}`} />
            {!compact && <span className="truncate">{mod.label}</span>}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1C1917] flex">
      <aside
        className={`hidden lg:flex flex-col shrink-0 bg-[#FFFFFF] border-r border-[#E6E2DA] sticky top-0 h-screen transition-all duration-150 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[256px]'
        }`}
      >
        <div className="h-16 px-3.5 border-b border-[#E6E2DA] flex items-center justify-between gap-2 shrink-0">
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="font-serif text-base font-bold text-[#1C1917] truncate">Marhaba Dining</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9B1C2E] truncate">
                Restaurant Operations
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-2 rounded-lg text-[#57534E] hover:bg-[#F3F1EC] hover:text-[#1C1917] shrink-0 mx-auto"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {renderNav(sidebarCollapsed)}

        <div className="p-3 border-t border-[#E6E2DA] space-y-2 shrink-0">
          {!sidebarCollapsed && (
            <div className="px-2.5 py-2 rounded-lg bg-[#FAF9F6] border border-[#E6E2DA]">
              <p className="text-xs font-bold text-[#1C1917] truncate">{data.user.fullName}</p>
              <p className="text-[11px] text-[#57534E] truncate">{data.role.label}</p>
              <p className="text-[10px] font-mono text-[#57534E] mt-0.5">
                {data.user.employeeCode}
                {data.user.assignedStation ? ` · ${data.user.assignedStation}` : ''}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={onBackToPortal}
            title={sidebarCollapsed ? 'Management Portal' : undefined}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-semibold text-[#1C1917] hover:border-[#9B1C2E] hover:text-[#9B1C2E]"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            {!sidebarCollapsed && <span>Management Portal</span>}
          </button>
          <button
            type="button"
            onClick={onExitToPublic}
            title={sidebarCollapsed ? 'Public Website' : undefined}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#E6E2DA] text-xs font-semibold text-[#57534E] hover:bg-[#FAF9F6]"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            {!sidebarCollapsed && <span>Public Website</span>}
          </button>
        </div>
      </aside>

      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-[#1C1917]/50" onClick={() => setMobileDrawerOpen(false)} />
          <div className="relative w-72 bg-[#FFFFFF] h-full flex flex-col border-r border-[#E6E2DA]">
            <div className="h-16 px-4 border-b border-[#E6E2DA] flex items-center justify-between">
              <div>
                <p className="font-serif text-base font-bold text-[#1C1917]">Marhaba Dining</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9B1C2E]">
                  {data.role.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                aria-label="Close navigation"
                className="p-2 rounded-lg hover:bg-[#F3F1EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderNav(false, () => setMobileDrawerOpen(false))}
            <div className="p-3 border-t border-[#E6E2DA] space-y-2">
              <button
                type="button"
                onClick={onBackToPortal}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-[#E6E2DA] text-xs font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Management Portal</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-[#FFFFFF] border-b border-[#E6E2DA] px-4 lg:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open restaurant menu"
              className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-[#F3F1EC]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-[115px] flex-1">
              <div className="flex items-center gap-2 text-[11px] text-[#57534E]">
                <span className="hidden sm:inline">Marhaba Restaurant Management</span>
                <span className="hidden sm:inline">/</span>
                <span className="font-semibold text-[#9B1C2E] truncate">
                  {currentModule?.shortLabel || 'Today'}
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-bold text-[#1C1917] truncate">
                {currentModule?.label || 'Today'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Restaurant Branch Scope"
              disabled={isBranchLocked}
              value={isBranchLocked ? data.activeBranchScope : selectedBranch}
              onChange={(e) => onSelectBranch(e.target.value)}
              className="h-9 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-semibold text-[#1C1917] disabled:opacity-80 max-w-[105px] sm:max-w-[235px]"
            >
              {!isBranchLocked && <option value="all">All Restaurant Branches</option>}
              {data.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.shortName}
                </option>
              ))}
            </select>

            <div className="relative">
              <button
                type="button"
                onClick={() => setAlertsOpen((o) => !o)}
                aria-label={`Priority alerts (${data.priorityAlerts.length})`}
                className="h-9 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] hover:border-[#9B1C2E] inline-flex items-center gap-1.5 text-xs font-semibold"
              >
                <Bell className="w-4 h-4 text-[#57534E]" />
                {data.priorityAlerts.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-[#9B1C2E] text-white text-[11px] font-bold tabular-nums">
                    {data.priorityAlerts.length}
                  </span>
                )}
              </button>
              {alertsOpen && (
                <div className="absolute right-0 top-11 w-80 bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl shadow-xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#E6E2DA] flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1C1917]">Kitchen &amp; Floor Alerts</span>
                    <button type="button" onClick={() => setAlertsOpen(false)} className="text-xs text-[#57534E]">
                      Close
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-[#E6E2DA]">
                    {data.priorityAlerts.length === 0 ? (
                      <p className="p-4 text-xs text-[#57534E]">No active restaurant alerts.</p>
                    ) : (
                      data.priorityAlerts.map((al) => (
                        <button
                          key={al.id}
                          type="button"
                          onClick={() => {
                            setAlertsOpen(false);
                            onSelectModule(al.module);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-[#FAF9F6]"
                        >
                          <p className="text-xs font-bold text-[#1C1917]">{al.title}</p>
                          <p className="text-[11px] text-[#57534E] mt-0.5">{al.detail}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="h-9 px-3 rounded-lg border border-[#E6E2DA] text-xs font-semibold text-[#1C1917] hover:bg-[#F3F1EC] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5 text-[#57534E]" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>

        <div className="bg-[#F3F1EC]/70 border-b border-[#E6E2DA] px-4 lg:px-6 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#57534E]">
          <span>
            Signed in as <strong className="text-[#1C1917]">{data.user.fullName}</strong> ({data.role.label})
            {' · '}
            Food Costing:{' '}
            <strong className="text-[#1C1917]">
              {data.role.canViewFoodCost ? 'Authorized' : 'Redacted by RBAC'}
            </strong>
            {' · '}
            Billing Settlement:{' '}
            <strong className="text-[#1C1917]">
              {data.role.canMarkOrderPaid ? 'Cashier Authorized' : 'Read-Only / Floor Only'}
            </strong>
          </span>
          <span className="font-medium">Restaurant Demo Ledger · Separate from Supermarket &amp; Play Land</span>
        </div>

        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
