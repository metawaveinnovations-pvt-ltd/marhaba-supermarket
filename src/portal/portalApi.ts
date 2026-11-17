import type { InterBusinessRequest, ManagementSystemId, UnifiedStaffAccount } from './types';

export const MGMT_TOKEN_STORAGE_KEY = 'marhaba_mgmt_bearer_token_v1';

export function getStoredMgmtToken(): string | null {
  try {
    return sessionStorage.getItem(MGMT_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredMgmtToken(token: string | null) {
  try {
    if (token) {
      sessionStorage.setItem(MGMT_TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(MGMT_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export async function portalFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredMgmtToken();
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Request failed (${res.status})`);
  }
  return payload as T;
}

export interface PortalAuthResponse {
  token: string;
  user: UnifiedStaffAccount;
  systems: ManagementSystemId[];
  landingPath: string;
  isDemoSession: boolean;
}

export interface ExecutiveSummaryPayload {
  generatedAt: string;
  ledgerSeparationNote: string;
  supermarket: {
    posSalesCount: number;
    posRevenuePkr: number;
    onlineOrdersCount: number;
    pendingApprovals: number;
  };
  restaurant: {
    ordersCount: number;
    paidRevenuePkr: number;
    activeTables: number;
    openKdsTickets: number;
    lowStockIngredients: number;
  };
  playland: {
    ticketsIssued: number;
    ticketRevenuePkr: number;
    currentlyInside: number;
    safetyHolds: number;
    activeEvents: number;
  };
  consolidatedDemoGrossPkr: number;
  interBusinessRequestsCount: number;
}

export const portalApi = {
  async login(identifier: string, password: string, systemHint?: ManagementSystemId): Promise<PortalAuthResponse> {
    const res = await portalFetch<PortalAuthResponse>('/api/portal/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, systemHint }),
    });
    setStoredMgmtToken(res.token);
    return res;
  },

  async demoRoleLogin(system: ManagementSystemId, roleId: string): Promise<{
    token: string;
    system: ManagementSystemId;
    roleId: string;
    roleLabel: string;
    isDemoSession: boolean;
    landingPath: string;
  }> {
    const res = await portalFetch<{
      token: string;
      system: ManagementSystemId;
      roleId: string;
      roleLabel: string;
      isDemoSession: boolean;
      landingPath: string;
    }>('/api/portal/auth/demo-role', {
      method: 'POST',
      body: JSON.stringify({ system, roleId }),
    });
    setStoredMgmtToken(res.token);
    return res;
  },

  async me(): Promise<{
    authenticated: boolean;
    user: UnifiedStaffAccount | null;
    systems: ManagementSystemId[];
    isDemoSession?: boolean;
  }> {
    return portalFetch('/api/portal/auth/me');
  },

  async logout(): Promise<void> {
    try {
      await portalFetch('/api/portal/auth/logout', { method: 'POST' });
    } finally {
      setStoredMgmtToken(null);
    }
  },

  async executiveSummary(): Promise<ExecutiveSummaryPayload> {
    return portalFetch('/api/portal/executive-summary');
  },

  async interBusinessRequests(): Promise<{ requests: InterBusinessRequest[] }> {
    return portalFetch('/api/portal/inter-business');
  },

  async updateInterBusinessStatus(
    id: string,
    status: 'Accepted by Target' | 'Fulfilled' | 'Declined',
    notes?: string
  ): Promise<{ request: InterBusinessRequest }> {
    return portalFetch(`/api/portal/inter-business/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, notes }),
    });
  },
};
