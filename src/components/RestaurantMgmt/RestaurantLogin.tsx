import React, { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, KeyRound, ShieldCheck, UserCheck, UtensilsCrossed } from 'lucide-react';
import { portalApi } from '../../portal/portalApi';
import { RESTAURANT_ROLES } from '../../restaurant/permissions';
import { INITIAL_RESTAURANT_STAFF } from '../../restaurant/seedData';
import type { RestaurantRoleCategory } from '../../restaurant/types';
import { MarhabaLogo } from '../Header/SiteHeader';

interface RestaurantLoginProps {
  onSuccess: () => void;
  onBackToPortal: () => void;
  onExitToPublic: () => void;
}

const ROLE_GROUPS: { id: RestaurantRoleCategory; title: string; subtitle: string }[] = [
  {
    id: 'front_of_house',
    title: 'Front of House Roles (Demo)',
    subtitle: 'Floor hosting, table orders, delivery dispatch, cash & billing',
  },
  {
    id: 'kitchen',
    title: 'Kitchen & Culinary Roles (Demo)',
    subtitle: 'Station KDS queues, prep costing, menu availability & stock',
  },
  {
    id: 'management_support',
    title: 'Management & Support Roles (Demo)',
    subtitle: 'Procurement, finance reconciliation, events, audits & MIS',
  },
];

export function RestaurantLogin({ onSuccess, onBackToPortal, onExitToPublic }: RestaurantLoginProps) {
  const [identifier, setIdentifier] = useState('rest.manager@marhaba.demo');
  const [password, setPassword] = useState('demo1234');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await portalApi.login(identifier, password, 'restaurant');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoRole = async (roleId: string, email: string) => {
    setError(null);
    setLoading(true);
    setIdentifier(email);
    setPassword('demo1234');
    try {
      await portalApi.demoRoleLogin('restaurant', roleId);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to switch demo role.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1C1917] flex flex-col">
      <header className="bg-[#FFFFFF] border-b border-[#E6E2DA] px-4 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <MarhabaLogo />
          <span className="hidden sm:inline-block h-5 w-px bg-[#E6E2DA]" aria-hidden="true" />
          <span className="hidden sm:inline text-xs font-semibold uppercase tracking-wider text-[#9B1C2E] truncate">
            Restaurant Management System
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onBackToPortal}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E6E2DA] bg-[#FFFFFF] text-xs font-semibold text-[#1C1917] hover:border-[#9B1C2E] hover:text-[#9B1C2E] transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Management Portal</span>
          </button>
          <button
            type="button"
            onClick={onExitToPublic}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-semibold text-[#1C1917] hover:border-[#9B1C2E] hover:text-[#9B1C2E] transition-colors whitespace-nowrap"
          >
            <span>Public Website</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 lg:px-8 py-8 lg:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <section className="lg:col-span-5 lg:sticky lg:top-6 bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-6 sm:p-8">
          <div className="inline-flex items-center gap-2 text-[#9B1C2E] text-xs font-semibold uppercase tracking-wider">
            <UtensilsCrossed className="w-4 h-4" />
            <span>Restaurant Sign In</span>
          </div>
          <h1 className="mt-2 font-serif text-2xl sm:text-3xl font-bold text-[#1C1917]">
            Marhaba Restaurant Operations
          </h1>
          <p className="mt-1.5 text-sm text-[#57534E]">
            Hyderabad Dining Room, Kitchen Display, Recipe Costing &amp; Cashier Settlement.
          </p>

          <div className="mt-5 p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E6E2DA] text-xs text-[#57534E] space-y-1">
            <p className="font-semibold text-[#1C1917] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#166534] shrink-0" />
              <span>Isolated Restaurant Ledger &amp; Demo Controls</span>
            </p>
            <p>
              Restaurant billing, tables, recipes, and cashier shifts operate separately from Supermarket and Play Land. Demo accounts use credential{' '}
              <code className="font-mono font-semibold text-[#1C1917]">demo1234</code>.
            </p>
          </div>

          <form onSubmit={handleCredentialLogin} className="mt-6 space-y-4">
            <div>
              <label htmlFor="rest-login-id" className="block text-xs font-semibold text-[#1C1917] mb-1.5">
                Email Address or Staff Code
              </label>
              <input
                id="rest-login-id"
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. rest.manager@marhaba.demo"
                className="w-full h-11 px-3.5 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-sm text-[#1C1917] focus:bg-[#FFFFFF] focus:border-[#9B1C2E] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="rest-login-pw" className="block text-xs font-semibold text-[#1C1917] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="rest-login-pw"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 pl-3.5 pr-11 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-sm text-[#1C1917] focus:bg-[#FFFFFF] focus:border-[#9B1C2E] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#57534E] hover:text-[#1C1917]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="p-3 rounded-lg bg-[#9B1C2E]/8 border border-[#9B1C2E]/25 text-xs font-medium text-[#9B1C2E]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-[#9B1C2E] text-white text-sm font-semibold hover:bg-[#7F1524] disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? 'Signing In...' : 'Sign In to Restaurant System'}</span>
            </button>
          </form>
        </section>

        <section className="lg:col-span-7 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-[#1C1917]">Demo Role Selection (18 Restaurant Roles)</h2>
            <p className="text-xs text-[#57534E] mt-0.5">
              Select a role below to launch a Restaurant-isolated demo session and inspect role-scoped modules, station KDS queues, and billing controls.
            </p>
          </div>

          <div className="space-y-4">
            {ROLE_GROUPS.map((grp) => {
              const staffList = INITIAL_RESTAURANT_STAFF.filter(
                (u) => RESTAURANT_ROLES[u.roleId]?.category === grp.id
              );
              return (
                <div key={grp.id} className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 pb-3 border-b border-[#E6E2DA]">
                    <h3 className="text-sm font-bold text-[#1C1917]">{grp.title}</h3>
                    <span className="text-[11px] text-[#57534E]">{grp.subtitle}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {staffList.map((u) => {
                      const roleDef = RESTAURANT_ROLES[u.roleId];
                      return (
                        <button
                          key={u.id}
                          type="button"
                          disabled={loading}
                          onClick={() => void handleDemoRole(u.roleId, u.email)}
                          className="text-left p-3 rounded-xl border border-[#E6E2DA] bg-[#FAF9F6] hover:border-[#9B1C2E] hover:bg-[#FFFFFF] transition-colors flex items-start justify-between gap-2 group"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#1C1917] group-hover:text-[#9B1C2E] truncate">
                              {roleDef.label}
                            </p>
                            <p className="text-xs text-[#57534E] truncate mt-0.5">{u.fullName}</p>
                            <p className="text-[11px] font-mono text-[#57534E] mt-1">
                              {u.employeeCode}
                              {u.assignedStation ? ` · ${u.assignedStation}` : ''}
                            </p>
                          </div>
                          <UserCheck className="w-4 h-4 text-[#57534E] group-hover:text-[#9B1C2E] shrink-0 mt-0.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
