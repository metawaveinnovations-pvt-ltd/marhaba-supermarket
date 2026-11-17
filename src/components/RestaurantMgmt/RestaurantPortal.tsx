import React, { useCallback, useEffect, useState } from 'react';
import { portalApi } from '../../portal/portalApi';
import type { RestaurantModuleId } from '../../restaurant/types';
import { KitchenDisplayModule } from './KitchenDisplayModule';
import { MenuRecipesInventoryModule } from './MenuRecipesInventoryModule';
import { restaurantApi, type RestaurantBootstrapPayload } from './restaurantApi';
import { RestaurantLogin } from './RestaurantLogin';
import { RestaurantOpsFinanceModule } from './RestaurantOpsFinanceModule';
import { RestaurantOverview } from './RestaurantOverview';
import { RestaurantPosModule } from './RestaurantPosModule';
import { RestaurantShell } from './RestaurantShell';
import { TablesReservationsModule } from './TablesReservationsModule';

const VALID_MODULES: RestaurantModuleId[] = [
  'overview',
  'tables',
  'reservations',
  'pos',
  'kds',
  'menu',
  'inventory',
  'purchasing',
  'deals',
  'staff',
  'customers',
  'accounts',
  'reports',
  'settings',
];

function extractRestaurantModule(path: string | null): RestaurantModuleId {
  if (!path) return 'overview';
  const cleaned = path.replace(/^\/management\/restaurant\/?/, '').split('/')[0];
  if (cleaned === 'dashboard') return 'overview';
  return VALID_MODULES.includes(cleaned as RestaurantModuleId) ? (cleaned as RestaurantModuleId) : 'overview';
}

interface RestaurantPortalProps {
  currentPath: string;
  onNavigatePath: (path: string) => void;
  onExitToPublic: () => void;
}

export default function RestaurantPortal({
  currentPath,
  onNavigatePath,
  onExitToPublic,
}: RestaurantPortalProps) {
  const [data, setData] = useState<RestaurantBootstrapPayload | null>(null);
  const [selectedBranch, setSelectedBranch] = useState('hyderabad');
  const [checking, setChecking] = useState(true);
  const [activeModule, setActiveModule] = useState<RestaurantModuleId>(() =>
    extractRestaurantModule(currentPath)
  );
  const [posTableId, setPosTableId] = useState<string | undefined>(undefined);
  const [deniedModule, setDeniedModule] = useState<RestaurantModuleId | null>(null);

  const loadBootstrap = useCallback(async (branch = 'hyderabad') => {
    try {
      const payload = await restaurantApi.bootstrap(branch);
      setData(payload);
      const fromUrl = extractRestaurantModule(window.location.pathname);
      const permitted = payload.permittedModules.some((m) => m.id === fromUrl);
      if (
        window.location.pathname.startsWith('/management/restaurant/') &&
        !window.location.pathname.endsWith('/login') &&
        !permitted
      ) {
        setDeniedModule(fromUrl);
      } else {
        setDeniedModule(null);
        setActiveModule(permitted ? fromUrl : 'overview');
      }
      return true;
    } catch {
      setData(null);
      return false;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setChecking(true);
      try {
        const me = await portalApi.me();
        if (me.authenticated && me.systems.includes('restaurant')) {
          await loadBootstrap(selectedBranch);
        } else if (mounted) {
          setData(null);
        }
      } catch {
        if (mounted) setData(null);
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadBootstrap, selectedBranch]);

  useEffect(() => {
    if (!data) return;
    if (currentPath.startsWith('/management/restaurant/') && !currentPath.endsWith('/login')) {
      const mod = extractRestaurantModule(currentPath);
      if (data.permittedModules.some((m) => m.id === mod)) {
        setDeniedModule(null);
        setActiveModule(mod);
      } else {
        setDeniedModule(mod);
      }
    }
  }, [currentPath, data]);

  const handleSelectModule = (moduleId: RestaurantModuleId) => {
    setDeniedModule(null);
    setActiveModule(moduleId);
    onNavigatePath(`/management/restaurant/${moduleId === 'overview' ? 'dashboard' : moduleId}`);
  };

  const handleLogout = async () => {
    await portalApi.logout();
    setData(null);
    onNavigatePath('/management/restaurant/login');
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl px-6 py-5 text-sm font-medium text-[#1C1917]">
          Verifying Restaurant staff session...
        </div>
      </div>
    );
  }

  if (!data || currentPath === '/management/restaurant/login') {
    return (
      <RestaurantLogin
        onSuccess={() => {
          void loadBootstrap('hyderabad').then(() => {
            onNavigatePath('/management/restaurant/dashboard');
          });
        }}
        onBackToPortal={() => onNavigatePath('/management')}
        onExitToPublic={onExitToPublic}
      />
    );
  }

  const refreshData = async () => {
    await loadBootstrap(selectedBranch);
  };

  return (
    <RestaurantShell
      data={data}
      activeModule={activeModule}
      selectedBranch={selectedBranch}
      onSelectBranch={(b) => setSelectedBranch(b)}
      onSelectModule={handleSelectModule}
      onBackToPortal={() => onNavigatePath('/management')}
      onLogout={handleLogout}
      onExitToPublic={onExitToPublic}
    >
      {deniedModule ? (
        <div className="max-w-xl mx-auto my-8 bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-6 sm:p-8 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9B1C2E]">
            HTTP 403 · Restaurant Role Access Restricted
          </p>
          <h2 className="font-serif text-2xl font-bold text-[#1C1917]">
            Access Denied to "{deniedModule}"
          </h2>
          <p className="text-sm text-[#57534E]">
            Your active role (<strong className="text-[#1C1917]">{data.role.label}</strong>) does not include access to this Restaurant module.
          </p>
          <button
            type="button"
            onClick={() => handleSelectModule('overview')}
            className="h-10 px-4 rounded-xl bg-[#9B1C2E] text-white text-xs font-semibold"
          >
            Return to Restaurant Overview
          </button>
        </div>
      ) : (
        <>
          {activeModule === 'overview' && (
            <RestaurantOverview data={data} onSelectModule={handleSelectModule} />
          )}
          {(activeModule === 'tables' || activeModule === 'reservations') && (
            <TablesReservationsModule
              mode={activeModule}
              data={data}
              onRefresh={refreshData}
              onOpenPosForTable={(tblId) => {
                setPosTableId(tblId);
                handleSelectModule('pos');
              }}
            />
          )}
          {activeModule === 'pos' && (
            <RestaurantPosModule data={data} initialTableId={posTableId} onRefresh={refreshData} />
          )}
          {activeModule === 'kds' && <KitchenDisplayModule data={data} onRefresh={refreshData} />}
          {(activeModule === 'menu' || activeModule === 'inventory') && (
            <MenuRecipesInventoryModule mode={activeModule} data={data} onRefresh={refreshData} />
          )}
          {['purchasing', 'deals', 'staff', 'customers', 'accounts', 'reports', 'settings'].includes(
            activeModule
          ) && (
            <RestaurantOpsFinanceModule
              mode={
                activeModule as
                  | 'purchasing'
                  | 'deals'
                  | 'staff'
                  | 'customers'
                  | 'accounts'
                  | 'reports'
                  | 'settings'
              }
              data={data}
              onRefresh={refreshData}
            />
          )}
        </>
      )}
    </RestaurantShell>
  );
}
