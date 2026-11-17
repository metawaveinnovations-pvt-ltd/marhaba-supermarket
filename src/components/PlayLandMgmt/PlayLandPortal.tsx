import React, { useCallback, useEffect, useState } from 'react';
import type { PlayLandModuleId } from '../../playland/types';
import { portalApi } from '../../portal/portalApi';
import { AdmissionsGateModule } from './AdmissionsGateModule';
import { AttractionsSafetyModule } from './AttractionsSafetyModule';
import { playLandApi, type PlayLandBootstrapPayload } from './playLandApi';
import { PlayLandEventsOpsModule } from './PlayLandEventsOpsModule';
import { PlayLandLogin } from './PlayLandLogin';
import { PlayLandOverview } from './PlayLandOverview';
import { PlayLandShell } from './PlayLandShell';
import { TicketCounterModule } from './TicketCounterModule';

const VALID_MODULES: PlayLandModuleId[] = [
  'overview',
  'tickets',
  'admissions',
  'attractions',
  'sessions',
  'packages',
  'safety',
  'maintenance',
  'events',
  'support',
  'staff',
  'accounts',
  'reports',
  'settings',
];

function extractPlayModule(path: string | null): PlayLandModuleId {
  if (!path) return 'overview';
  const cleaned = path.replace(/^\/management\/play-land\/?/, '').split('/')[0];
  if (cleaned === 'dashboard') return 'overview';
  return VALID_MODULES.includes(cleaned as PlayLandModuleId) ? (cleaned as PlayLandModuleId) : 'overview';
}

interface PlayLandPortalProps {
  currentPath: string;
  onNavigatePath: (path: string) => void;
  onExitToPublic: () => void;
}

export default function PlayLandPortal({
  currentPath,
  onNavigatePath,
  onExitToPublic,
}: PlayLandPortalProps) {
  const [data, setData] = useState<PlayLandBootstrapPayload | null>(null);
  const [checking, setChecking] = useState(true);
  const [activeModule, setActiveModule] = useState<PlayLandModuleId>(() => extractPlayModule(currentPath));
  const [deniedModule, setDeniedModule] = useState<PlayLandModuleId | null>(null);

  const loadBootstrap = useCallback(async () => {
    try {
      const payload = await playLandApi.bootstrap();
      setData(payload);
      const fromUrl = extractPlayModule(window.location.pathname);
      const permitted = payload.permittedModules.some((m) => m.id === fromUrl);
      if (
        window.location.pathname.startsWith('/management/play-land/') &&
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

  const refreshData = useCallback(async () => {
    await loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setChecking(true);
      try {
        const me = await portalApi.me();
        if (me.authenticated && me.systems.includes('playland')) {
          await loadBootstrap();
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
  }, [loadBootstrap]);

  useEffect(() => {
    if (!data) return;
    if (currentPath.startsWith('/management/play-land/') && !currentPath.endsWith('/login')) {
      const mod = extractPlayModule(currentPath);
      if (data.permittedModules.some((m) => m.id === mod)) {
        setDeniedModule(null);
        setActiveModule(mod);
      } else {
        setDeniedModule(mod);
      }
    }
  }, [currentPath, data]);

  const handleSelectModule = (moduleId: PlayLandModuleId) => {
    setDeniedModule(null);
    setActiveModule(moduleId);
    onNavigatePath(`/management/play-land/${moduleId === 'overview' ? 'dashboard' : moduleId}`);
  };

  const handleLogout = async () => {
    await portalApi.logout();
    setData(null);
    onNavigatePath('/management/play-land/login');
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-6">
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl px-6 py-5 text-sm font-medium text-[#1C1917]">
          Verifying Play Land staff session...
        </div>
      </div>
    );
  }

  if (!data || currentPath === '/management/play-land/login') {
    return (
      <PlayLandLogin
        onSuccess={() => {
          void loadBootstrap().then(() => {
            onNavigatePath('/management/play-land/dashboard');
          });
        }}
        onBackToPortal={() => onNavigatePath('/management')}
        onExitToPublic={onExitToPublic}
      />
    );
  }

  return (
    <PlayLandShell
      data={data}
      activeModule={activeModule}
      onSelectModule={handleSelectModule}
      onBackToPortal={() => onNavigatePath('/management')}
      onLogout={handleLogout}
      onExitToPublic={onExitToPublic}
    >
      {deniedModule ? (
        <div className="max-w-xl mx-auto my-8 bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-6 sm:p-8 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9B1C2E]">
            HTTP 403 · Play Land Role Access Restricted
          </p>
          <h2 className="font-serif text-2xl font-bold text-[#1C1917]">
            Access Denied to "{deniedModule}"
          </h2>
          <p className="text-sm text-[#57534E]">
            Your active role (<strong className="text-[#1C1917]">{data.role.label}</strong>) is not authorized for this Play Land module.
          </p>
          <button
            type="button"
            onClick={() => handleSelectModule('overview')}
            className="h-10 px-4 rounded-xl bg-[#9B1C2E] text-white text-xs font-semibold"
          >
            Return to Play Land Overview
          </button>
        </div>
      ) : (
        <>
          {activeModule === 'overview' && <PlayLandOverview data={data} onSelectModule={handleSelectModule} />}
          {activeModule === 'tickets' && <TicketCounterModule data={data} onRefresh={refreshData} />}
          {activeModule === 'admissions' && <AdmissionsGateModule data={data} onRefresh={refreshData} />}
          {['attractions', 'sessions', 'safety', 'maintenance'].includes(activeModule) && (
            <AttractionsSafetyModule
              mode={activeModule as 'attractions' | 'sessions' | 'safety' | 'maintenance'}
              data={data}
              onRefresh={refreshData}
            />
          )}
          {['packages', 'events', 'support', 'staff', 'accounts', 'reports', 'settings'].includes(
            activeModule
          ) && (
            <PlayLandEventsOpsModule
              mode={
                activeModule as
                  | 'packages'
                  | 'events'
                  | 'support'
                  | 'staff'
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
    </PlayLandShell>
  );
}
