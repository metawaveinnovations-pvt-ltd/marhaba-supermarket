import React, { Suspense, useCallback, useEffect, useState } from 'react';
import type { ManagementModuleId } from '../../erp/types';
import { useStore } from '../../context/StoreContext';
import { CatalogOffersModule } from './CatalogOffersModule';
import { FinanceModule } from './FinanceModule';
import { InventoryPurchasingModule } from './InventoryPurchasingModule';
import {
  managementApi,
  type ManagementBootstrapPayload,
} from './managementApi';
import { ManagementDashboard } from './ManagementDashboard';
import { ManagementLogin } from './ManagementLogin';
import { ManagementShell } from './ManagementShell';
import { OrdersModule } from './OrdersModule';
import { PosModule } from './PosModule';
import { ReportsSettingsModule } from './ReportsSettingsModule';
import { StaffBranchesCustomersModule } from './StaffBranchesCustomersModule';
import { UnifiedPortalPage } from './UnifiedPortalPage';

const RestaurantPortal = React.lazy(() => import('../RestaurantMgmt/RestaurantPortal'));
const PlayLandPortal = React.lazy(() => import('../PlayLandMgmt/PlayLandPortal'));

const VALID_MODULES: ManagementModuleId[] = [
  'dashboard',
  'pos',
  'products',
  'inventory',
  'purchasing',
  'orders',
  'offers',
  'finance',
  'staff',
  'branches',
  'customers',
  'reports',
  'settings',
];

function extractSupermarketModuleFromPath(path: string | null): ManagementModuleId {
  if (!path) return 'dashboard';
  const slug = path.replace(/^\/management(\/supermarket)?\/?/, '').split('/')[0] as ManagementModuleId;
  return VALID_MODULES.includes(slug) ? slug : 'dashboard';
}

function SupermarketManagementWorkspace({
  currentPath,
  navigateToManagement,
  exitManagement,
}: {
  currentPath: string;
  navigateToManagement: (subPath?: string) => void;
  exitManagement: () => void;
}) {
  const [data, setData] = useState<ManagementBootstrapPayload | null>(null);
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeModule, setActiveModule] = useState<ManagementModuleId>(() =>
    extractSupermarketModuleFromPath(currentPath)
  );
  const [deniedModule, setDeniedModule] = useState<ManagementModuleId | null>(null);

  const loadBootstrap = useCallback(async (branchScope = 'all') => {
    try {
      const payload = await managementApi.bootstrap(branchScope);
      setData(payload);
      const fromUrl = extractSupermarketModuleFromPath(window.location.pathname);
      const permitted = payload.permittedModules.some((m) => m.id === fromUrl);
      const isLoginUrl =
        window.location.pathname === '/management/login' ||
        window.location.pathname === '/management/supermarket/login';
      if (!isLoginUrl && fromUrl && !permitted) {
        setDeniedModule(fromUrl);
      } else {
        setDeniedModule(null);
        setActiveModule(permitted ? fromUrl : 'dashboard');
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
      setCheckingAuth(true);
      try {
        const st = await managementApi.status();
        if (st.authenticated) {
          await loadBootstrap(selectedBranch);
        } else if (mounted) {
          setData(null);
        }
      } catch {
        if (mounted) setData(null);
      } finally {
        if (mounted) setCheckingAuth(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadBootstrap, selectedBranch]);

  useEffect(() => {
    if (!data) return;
    const isLoginUrl =
      currentPath === '/management/login' || currentPath === '/management/supermarket/login';
    if (!isLoginUrl) {
      const slug = extractSupermarketModuleFromPath(currentPath);
      if (data.permittedModules.some((m) => m.id === slug)) {
        setDeniedModule(null);
        setActiveModule(slug);
      } else {
        setDeniedModule(slug);
      }
    }
  }, [currentPath, data]);

  const handleSelectModule = (moduleId: ManagementModuleId) => {
    setDeniedModule(null);
    setActiveModule(moduleId);
    navigateToManagement(`/management/supermarket/${moduleId}`);
  };

  const handleLogout = async () => {
    await managementApi.logout();
    setData(null);
    setDeniedModule(null);
    navigateToManagement('/management/supermarket/login');
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl px-6 py-5 text-sm font-medium text-[#1C1917]">
          Verifying Supermarket staff session...
        </div>
      </div>
    );
  }

  if (
    !data ||
    currentPath === '/management/login' ||
    currentPath === '/management/supermarket/login'
  ) {
    return (
      <ManagementLogin
        onSuccess={() => {
          void loadBootstrap('all').then(() => {
            navigateToManagement('/management/supermarket/dashboard');
          });
        }}
        onBackToPortal={() => navigateToManagement('/management')}
        onExitToPublic={exitManagement}
      />
    );
  }

  const refreshData = async () => {
    await loadBootstrap(selectedBranch);
  };

  return (
    <ManagementShell
      data={data}
      activeModule={activeModule}
      selectedBranch={selectedBranch}
      onSelectBranch={(b) => setSelectedBranch(b)}
      onSelectModule={handleSelectModule}
      onLogout={handleLogout}
      onBackToPortal={() => navigateToManagement('/management')}
      onExitToPublic={exitManagement}
    >
      {deniedModule ? (
        <div className="max-w-xl mx-auto my-8 bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-6 sm:p-8 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9B1C2E]">
            HTTP 403 · Role Access Restricted
          </p>
          <h2 className="font-serif text-2xl font-bold text-[#1C1917]">
            Access Denied to "{deniedModule}"
          </h2>
          <p className="text-sm text-[#57534E]">
            Your active role (<strong className="text-[#1C1917]">{data.role.label}</strong>) is not authorized to open this module under Marhaba Supermarket RBAC controls.
          </p>
          <button
            type="button"
            onClick={() => handleSelectModule('dashboard')}
            className="h-10 px-4 rounded-xl bg-[#9B1C2E] text-white text-xs font-semibold hover:bg-[#7F1524]"
          >
            Return to Today Overview
          </button>
        </div>
      ) : (
        <>
          {activeModule === 'dashboard' && (
            <ManagementDashboard data={data} onSelectModule={handleSelectModule} />
          )}
          {activeModule === 'pos' && <PosModule data={data} onRefresh={refreshData} />}
          {(activeModule === 'products' || activeModule === 'offers') && (
            <CatalogOffersModule mode={activeModule} data={data} onRefresh={refreshData} />
          )}
          {(activeModule === 'inventory' || activeModule === 'purchasing') && (
            <InventoryPurchasingModule mode={activeModule} data={data} onRefresh={refreshData} />
          )}
          {activeModule === 'orders' && <OrdersModule data={data} onRefresh={refreshData} />}
          {activeModule === 'finance' && <FinanceModule data={data} onRefresh={refreshData} />}
          {(activeModule === 'staff' || activeModule === 'branches' || activeModule === 'customers') && (
            <StaffBranchesCustomersModule mode={activeModule} data={data} onRefresh={refreshData} />
          )}
          {(activeModule === 'reports' || activeModule === 'settings') && (
            <ReportsSettingsModule mode={activeModule} data={data} onRefresh={refreshData} />
          )}
        </>
      )}
    </ManagementShell>
  );
}

export default function ManagementPortal() {
  const { managementPath, navigateToManagement, exitManagement } = useStore();
  const cleanPath = (managementPath || '/management').replace(/\/+$/, '') || '/management';

  if (cleanPath === '/management') {
    return (
      <UnifiedPortalPage
        onNavigatePath={(p) => navigateToManagement(p)}
        onExitToPublic={exitManagement}
      />
    );
  }

  if (cleanPath === '/management/restaurant' || cleanPath.startsWith('/management/restaurant/')) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
            <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl px-6 py-5 text-sm font-medium text-[#1C1917]">
              Loading Marhaba Restaurant Management System...
            </div>
          </div>
        }
      >
        <RestaurantPortal
          currentPath={cleanPath}
          onNavigatePath={(p) => navigateToManagement(p)}
          onExitToPublic={exitManagement}
        />
      </Suspense>
    );
  }

  if (cleanPath === '/management/play-land' || cleanPath.startsWith('/management/play-land/')) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
            <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl px-6 py-5 text-sm font-medium text-[#1C1917]">
              Loading Marhaba Play Land Management System...
            </div>
          </div>
        }
      >
        <PlayLandPortal
          currentPath={cleanPath}
          onNavigatePath={(p) => navigateToManagement(p)}
          onExitToPublic={exitManagement}
        />
      </Suspense>
    );
  }

  return (
    <SupermarketManagementWorkspace
      currentPath={cleanPath}
      navigateToManagement={navigateToManagement}
      exitManagement={exitManagement}
    />
  );
}
