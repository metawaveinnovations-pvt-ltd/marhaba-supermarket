import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Gamepad2,
  HelpCircle,
  KeyRound,
  LogOut,
  ShieldCheck,
  ShoppingBasket,
  UtensilsCrossed,
} from 'lucide-react';
import type { ManagementSystemId, UnifiedStaffAccount, InterBusinessRequest } from '../../portal/types';
import { portalApi, type ExecutiveSummaryPayload } from '../../portal/portalApi';
import { MarhabaLogo } from '../Header/SiteHeader';

interface UnifiedPortalPageProps {
  onNavigatePath: (path: string) => void;
  onExitToPublic: () => void;
}

const SYSTEM_CARDS: {
  id: ManagementSystemId;
  title: string;
  subtitle: string;
  description: string;
  loginPath: string;
  dashboardPath: string;
  icon: React.ComponentType<{ className?: string }>;
  metaLine: string;
}[] = [
  {
    id: 'supermarket',
    title: 'Supermarket Management',
    subtitle: 'Retail Operations & POS ERP',
    description:
      'Checkout POS, SKU catalogue, FEFO branch inventory, supplier purchasing, finance & 27 role controls.',
    loginPath: '/management/supermarket/login',
    dashboardPath: '/management/supermarket/dashboard',
    icon: ShoppingBasket,
    metaLine: '13 Modules · 27 Staff Roles',
  },
  {
    id: 'restaurant',
    title: 'Restaurant Management',
    subtitle: 'Dining, KDS & Recipe Inventory',
    description:
      'Floor zones & table layout, reservations, restaurant POS, station KDS, recipe costing & split billing.',
    loginPath: '/management/restaurant/login',
    dashboardPath: '/management/restaurant/dashboard',
    icon: UtensilsCrossed,
    metaLine: '14 Modules · 18 Staff Roles',
  },
  {
    id: 'playland',
    title: 'Play Land Management',
    subtitle: 'Ticketing, Safety & Events',
    description:
      'Timed session ticketing, QR gate admission, ride safety lockouts, maintenance & birthday events.',
    loginPath: '/management/play-land/login',
    dashboardPath: '/management/play-land/dashboard',
    icon: Gamepad2,
    metaLine: '14 Modules · 16 Staff Roles',
  },
];

export function UnifiedPortalPage({ onNavigatePath, onExitToPublic }: UnifiedPortalPageProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [authedUser, setAuthedUser] = useState<UnifiedStaffAccount | null>(null);
  const [execSummary, setExecSummary] = useState<ExecutiveSummaryPayload | null>(null);
  const [interBusiness, setInterBusiness] = useState<InterBusinessRequest[]>([]);
  const [ibrNotice, setIbrNotice] = useState<string | null>(null);

  const loadSessionContext = useCallback(async () => {
    try {
      const me = await portalApi.me();
      if (me.authenticated && me.user) {
        setAuthedUser(me.user);
        const [summaryRes, ibrRes] = await Promise.allSettled([
          me.user.systems.length > 1 ? portalApi.executiveSummary() : Promise.resolve(null),
          portalApi.interBusinessRequests(),
        ]);
        if (summaryRes.status === 'fulfilled' && summaryRes.value) {
          setExecSummary(summaryRes.value);
        } else {
          setExecSummary(null);
        }
        if (ibrRes.status === 'fulfilled') {
          setInterBusiness(ibrRes.value.requests);
        }
      } else {
        setAuthedUser(null);
        setExecSummary(null);
        setInterBusiness([]);
      }
    } catch {
      setAuthedUser(null);
    } finally {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    void loadSessionContext();
  }, [loadSessionContext]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await portalApi.login(identifier, password);
      if (res.systems.length === 1) {
        onNavigatePath(res.landingPath);
        return;
      }
      await loadSessionContext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await portalApi.logout();
    setAuthedUser(null);
    setExecSummary(null);
    setInterBusiness([]);
    setIdentifier('');
    setPassword('');
  };

  const handleSystemCardClick = (card: (typeof SYSTEM_CARDS)[number]) => {
    if (authedUser && authedUser.systems.includes(card.id)) {
      onNavigatePath(card.dashboardPath);
      return;
    }
    onNavigatePath(card.loginPath);
  };

  const handleIbrDecision = async (id: string, status: 'Accepted by Target' | 'Fulfilled' | 'Declined') => {
    setIbrNotice(null);
    try {
      await portalApi.updateInterBusinessStatus(id, status);
      await loadSessionContext();
      setIbrNotice(`Request updated to "${status}".`);
    } catch (err) {
      setIbrNotice(err instanceof Error ? err.message : 'Unable to update request.');
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1C1917] flex flex-col">
      {/* SECTION A — Brand Header */}
      <header className="bg-[#FFFFFF] border-b border-[#E6E2DA] px-4 lg:px-10 py-4">
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <MarhabaLogo />
            <span className="hidden sm:inline-block h-7 w-px bg-[#E6E2DA]" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-serif text-lg sm:text-xl font-bold text-[#1C1917] tracking-tight">
                  Marhaba Management Portal
                </h1>
                <span className="text-xs font-semibold text-[#9B1C2E]">· Hyderabad</span>
              </div>
              <p className="text-xs text-[#57534E]">Secure Access for Staff &amp; Management</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onExitToPublic}
            className="h-10 px-4 rounded-xl border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-semibold text-[#1C1917] hover:border-[#9B1C2E] hover:text-[#9B1C2E] transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Website</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 lg:px-10 py-8 lg:py-12 space-y-10">
        {/* SECTION B — Staff & Management Sign In (or Multi-System Workspace Selector) */}
        <section aria-labelledby="portal-signin-heading">
          {checkingSession ? (
            <div className="max-w-xl mx-auto bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-6 text-sm text-[#57534E] text-center">
              Checking active staff session...
            </div>
          ) : authedUser ? (
            <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#E6E2DA]">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#166534]">
                    Authenticated Staff Workspace
                  </p>
                  <h2 id="portal-signin-heading" className="mt-1 font-serif text-2xl font-bold text-[#1C1917]">
                    Welcome, {authedUser.fullName}
                  </h2>
                  <p className="text-xs text-[#57534E] mt-1">
                    {authedUser.employeeCode} · {authedUser.department} · Branch scope:{' '}
                    <span className="font-semibold text-[#1C1917]">{authedUser.branchId}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="h-10 px-4 rounded-xl border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-semibold text-[#1C1917] hover:border-[#9B1C2E] hover:text-[#9B1C2E] inline-flex items-center gap-2 self-start sm:self-auto whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-3">
                  Authorized Business Workspaces ({authedUser.systems.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {SYSTEM_CARDS.filter((c) => authedUser.systems.includes(c.id)).map((c) => {
                    const Icon = c.icon;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onNavigatePath(c.dashboardPath)}
                        className="p-4 rounded-xl border border-[#E6E2DA] bg-[#FAF9F6] hover:border-[#9B1C2E] hover:bg-[#FFFFFF] text-left transition-colors flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-[#9B1C2E]/10 text-[#9B1C2E] flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#1C1917] group-hover:text-[#9B1C2E] truncate">
                              {c.title}
                            </p>
                            <p className="text-[11px] text-[#57534E] truncate">Open Workspace</p>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[#57534E] group-hover:text-[#9B1C2E] shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Consolidated Read-Only Executive Summary (Separate Business Unit Ledgers) */}
              {execSummary && (
                <div className="pt-4 border-t border-[#E6E2DA] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                    <h3 className="text-sm font-bold text-[#1C1917]">
                      Consolidated Executive Snapshot (Separate Ledgers · Demo Data)
                    </h3>
                    <span className="text-[11px] text-[#57534E]">
                      Independent P&amp;L, Inventory &amp; Cash Tills per Business Unit
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E6E2DA]">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#57534E]">
                        Supermarket Ledger
                      </p>
                      <p className="mt-1 font-mono text-lg font-bold text-[#1C1917] tabular-nums">
                        PKR {execSummary.supermarket.posRevenuePkr.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-[#57534E] mt-0.5">
                        {execSummary.supermarket.posSalesCount} POS bills · {execSummary.supermarket.pendingApprovals} pending approvals
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E6E2DA]">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#57534E]">
                        Restaurant Ledger
                      </p>
                      <p className="mt-1 font-mono text-lg font-bold text-[#1C1917] tabular-nums">
                        PKR {execSummary.restaurant.paidRevenuePkr.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-[#57534E] mt-0.5">
                        {execSummary.restaurant.activeTables} occupied tables · {execSummary.restaurant.openKdsTickets} open KDS
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E6E2DA]">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#57534E]">
                        Play Land Ledger
                      </p>
                      <p className="mt-1 font-mono text-lg font-bold text-[#1C1917] tabular-nums">
                        PKR {execSummary.playland.ticketRevenuePkr.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-[#57534E] mt-0.5">
                        {execSummary.playland.currentlyInside} checked in · {execSummary.playland.safetyHolds} safety holds
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#1C1917] text-white">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#D6D3CD]">
                        Group Demo Gross
                      </p>
                      <p className="mt-1 font-mono text-lg font-bold tabular-nums">
                        PKR {execSummary.consolidatedDemoGrossPkr.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-[#D6D3CD] mt-0.5">
                        {execSummary.interBusinessRequestsCount} inter-business requests
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Inter-Business Service Contracts */}
              {interBusiness.length > 0 && (
                <div className="pt-4 border-t border-[#E6E2DA] space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#1C1917]">
                      Inter-Business Service Requests ({interBusiness.length})
                    </h3>
                    {ibrNotice && <span className="text-xs font-semibold text-[#166534]">{ibrNotice}</span>}
                  </div>
                  <div className="divide-y divide-[#E6E2DA] border border-[#E6E2DA] rounded-xl bg-[#FAF9F6]">
                    {interBusiness.slice(0, 5).map((ibr) => (
                      <div key={ibr.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#1C1917]">
                            {ibr.requestNumber} · {ibr.title}
                          </p>
                          <p className="text-[11px] text-[#57534E] mt-0.5">
                            {ibr.sourceSystem.toUpperCase()} -&gt; {ibr.targetSystem.toUpperCase()} · {ibr.itemsSummary} · Est. PKR{' '}
                            <span className="font-mono">{ibr.estimatedAmountPkr.toLocaleString()}</span> · Status:{' '}
                            <strong className="text-[#1C1917]">{ibr.status}</strong>
                          </p>
                        </div>
                        {(authedUser.systems.includes(ibr.targetSystem) || authedUser.systems.length > 1) &&
                          ibr.status !== 'Fulfilled' &&
                          ibr.status !== 'Declined' && (
                            <div className="flex items-center gap-2 shrink-0">
                              {ibr.status === 'Requested' && (
                                <button
                                  type="button"
                                  onClick={() => handleIbrDecision(ibr.id, 'Accepted by Target')}
                                  className="h-8 px-3 rounded-lg bg-[#FFFFFF] border border-[#E6E2DA] text-xs font-semibold hover:border-[#166534] hover:text-[#166534]"
                                >
                                  Accept
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleIbrDecision(ibr.id, 'Fulfilled')}
                                className="h-8 px-3 rounded-lg bg-[#166534] text-white text-xs font-semibold hover:bg-[#14532D]"
                              >
                                Mark Fulfilled
                              </button>
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-xl mx-auto bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-6 sm:p-8">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#9B1C2E]">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Staff &amp; Management Sign In</span>
              </div>
              <h2 id="portal-signin-heading" className="mt-2 font-serif text-2xl font-bold text-[#1C1917]">
                Sign In With Your Staff Account
              </h2>
              <p className="mt-1 text-xs text-[#57534E]">
                Use your assigned Marhaba staff email or employee code. Single-system staff go straight to their workspace; executive leadership sees all authorized systems.
              </p>

              <form onSubmit={handleSignIn} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="portal-email" className="block text-xs font-semibold text-[#1C1917] mb-1.5">
                    Email Address or Staff ID
                  </label>
                  <input
                    id="portal-email"
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. riaz.ceo@marhaba.demo or rest.manager@marhaba.demo"
                    className="w-full h-11 px-3.5 rounded-xl border border-[#E6E2DA] bg-[#FAF9F6] text-sm text-[#1C1917] focus:bg-[#FFFFFF] focus:border-[#9B1C2E] focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="portal-password" className="block text-xs font-semibold text-[#1C1917]">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setForgotOpen((v) => !v)}
                      className="text-xs font-semibold text-[#9B1C2E] hover:underline inline-flex items-center gap-1"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Forgot Password</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="portal-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter staff password (demo accounts: demo1234)"
                      className="w-full h-11 pl-3.5 pr-11 rounded-xl border border-[#E6E2DA] bg-[#FAF9F6] text-sm text-[#1C1917] focus:bg-[#FFFFFF] focus:border-[#9B1C2E] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#57534E] hover:text-[#1C1917]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {forgotOpen && (
                  <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E6E2DA] text-xs text-[#57534E] space-y-1">
                    <p className="font-semibold text-[#1C1917]">Password &amp; Access Recovery</p>
                    <p>
                      For security compliance, staff credential resets are issued by the Branch Manager or M.I.S. Administrator Desk (Hyderabad HQ). Demo accounts across all three systems use demo credential{' '}
                      <code className="font-mono font-semibold text-[#1C1917]">demo1234</code>, or select a specific system below for Quick Demo Role Inspection.
                    </p>
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-[#9B1C2E]/8 border border-[#9B1C2E]/25 text-xs font-medium text-[#9B1C2E]"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl bg-[#9B1C2E] text-white text-sm font-semibold hover:bg-[#7F1524] disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{loading ? 'Signing In...' : 'Sign In'}</span>
                </button>
              </form>
            </div>
          )}
        </section>

        {/* SECTION C — Management Systems */}
        <section aria-labelledby="management-systems-heading" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#9B1C2E] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                <span>Management Systems</span>
              </p>
              <h2 id="management-systems-heading" className="mt-1 font-serif text-2xl font-bold text-[#1C1917]">
                Marhaba Hyderabad — Business Operations
              </h2>
            </div>
            <p className="text-xs text-[#57534E]">
              Select a business system for direct staff sign-in or isolated demo role inspection.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {SYSTEM_CARDS.map((card) => {
              const Icon = card.icon;
              const hasActiveAccess = Boolean(authedUser && authedUser.systems.includes(card.id));
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => handleSystemCardClick(card)}
                  className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-6 text-left hover:border-[#9B1C2E] transition-colors flex flex-col justify-between gap-5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9B1C2E]"
                >
                  <div className="space-y-3">
                    <div className="w-11 h-11 rounded-xl bg-[#FAF9F6] border border-[#E6E2DA] text-[#9B1C2E] flex items-center justify-center group-hover:bg-[#9B1C2E] group-hover:text-white group-hover:border-[#9B1C2E] transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-serif text-xl font-bold text-[#1C1917] group-hover:text-[#9B1C2E] transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-xs font-semibold text-[#57534E] mt-0.5">{card.subtitle}</p>
                    </div>
                    <p className="text-xs leading-relaxed text-[#57534E]">{card.description}</p>
                  </div>

                  <div className="pt-4 border-t border-[#E6E2DA] flex items-center justify-between gap-2 w-full">
                    <span className="text-[11px] font-medium text-[#57534E]">{card.metaLine}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[#9B1C2E] whitespace-nowrap">
                      <span>{hasActiveAccess ? 'Enter System' : 'Open Login'}</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
