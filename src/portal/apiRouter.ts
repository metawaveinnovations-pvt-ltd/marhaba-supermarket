import express, { type Request, type Response } from 'express';
import { ROLE_DEFINITIONS } from '../erp/permissions';
import type { ErpDatabaseState } from '../erp/seedData';
import type { StaffRoleId } from '../erp/types';
import { PLAYLAND_ROLES } from '../playland/permissions';
import type { PlayLandDatabaseState } from '../playland/seedData';
import type { PlayLandRoleId } from '../playland/types';
import { RESTAURANT_ROLES } from '../restaurant/permissions';
import type { RestaurantDatabaseState } from '../restaurant/seedData';
import type { RestaurantRoleId } from '../restaurant/types';
import {
  checkLoginRateLimit,
  extractBearerOrCookieToken,
  PORTAL_SESSION_COOKIE,
  resetLoginRateLimit,
  SESSION_TTL_MS,
  signPortalToken,
  verifyPasswordSecret,
  verifyPortalToken,
} from './auth';
import type {
  InterBusinessRequest,
  ManagementSystemId,
  PortalSessionPayload,
  UnifiedStaffAccount,
} from './types';

interface PortalRouterOptions {
  erpDb: ErpDatabaseState;
  restaurantDb: RestaurantDatabaseState;
  playLandDb: PlayLandDatabaseState;
  interBusinessRequests: InterBusinessRequest[];
}

const MULTI_SYSTEM_EXECUTIVE_MAP: Partial<
  Record<
    StaffRoleId,
    {
      systems: ManagementSystemId[];
      restaurantRoleId?: RestaurantRoleId;
      playLandRoleId?: PlayLandRoleId;
    }
  >
> = {
  ceo: {
    systems: ['supermarket', 'restaurant', 'playland'],
    restaurantRoleId: 'general_manager',
    playLandRoleId: 'general_manager',
  },
  owner_partner: {
    systems: ['supermarket', 'restaurant', 'playland'],
    restaurantRoleId: 'general_manager',
    playLandRoleId: 'general_manager',
  },
  director_admin: {
    systems: ['supermarket', 'restaurant', 'playland'],
    restaurantRoleId: 'general_manager',
    playLandRoleId: 'general_manager',
  },
  director_accounts: {
    systems: ['supermarket', 'restaurant', 'playland'],
    restaurantRoleId: 'accounts_officer',
    playLandRoleId: 'accounts_officer',
  },
  director_purchasing: {
    systems: ['supermarket', 'restaurant'],
    restaurantRoleId: 'purchasing_officer',
  },
  director_mis: {
    systems: ['supermarket', 'restaurant', 'playland'],
    restaurantRoleId: 'mis_admin',
    playLandRoleId: 'mis_admin',
  },
  internal_auditor: {
    systems: ['supermarket', 'restaurant', 'playland'],
    restaurantRoleId: 'accounts_officer',
    playLandRoleId: 'accounts_officer',
  },
};

export function createInitialInterBusinessRequests(): InterBusinessRequest[] {
  return [
    {
      id: 'ibr-1',
      requestNumber: 'IBR-2026-041',
      sourceSystem: 'restaurant',
      targetSystem: 'supermarket',
      branchId: 'hyderabad',
      category: 'Ingredient Transfer',
      title: 'Inter-Department Dairy & Cooking Oil Replenishment',
      itemsSummary: '12L Cooking Oil · 10kg Basmati Rice · 8kg Fresh Paneer (Demo)',
      estimatedAmountPkr: 14800,
      requestedByName: 'Zulfiqar Memon (Executive Chef)',
      requestedAt: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
      status: 'Requested',
      notes: 'Separate accounting ledger transfer voucher required on Supermarket fulfillment.',
    },
    {
      id: 'ibr-2',
      requestNumber: 'IBR-2026-042',
      sourceSystem: 'playland',
      targetSystem: 'restaurant',
      branchId: 'hyderabad',
      category: 'Event Catering',
      title: 'Birthday Party Catering — Ayan Raza (18 Kids · Party Room A)',
      itemsSummary: '18x Kids Crispy Meal + 4x Family Pizza Platter + Juices',
      estimatedAmountPkr: 24500,
      requestedByName: 'Hira Soomro (Party Coordinator)',
      requestedAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      status: 'Accepted by Target',
      referenceId: 'evt-1',
      notes: 'Deliver hot to Play Land Party Room A at 17:30.',
    },
  ];
}

function resolveLandingPath(systems: ManagementSystemId[]): string {
  if (systems.length === 1) {
    if (systems[0] === 'supermarket') return '/management/supermarket/dashboard';
    if (systems[0] === 'restaurant') return '/management/restaurant/dashboard';
    return '/management/play-land/dashboard';
  }
  return '/management';
}

export function createPortalRouter(options: PortalRouterOptions) {
  const { erpDb, restaurantDb, playLandDb, interBusinessRequests } = options;
  const router = express.Router();

  const resolveUnifiedUserFromPayload = (rawPayload: unknown): UnifiedStaffAccount | null => {
    if (!rawPayload || typeof rawPayload !== 'object') return null;
    const payload = rawPayload as PortalSessionPayload & { roleId?: StaffRoleId };
    if (!payload.uid) return null;

    // 1. Check Supermarket directory
    const sm = erpDb.staffUsers.find((u) => u.id === payload.uid);
    if (sm && sm.active) {
      const execMapping = MULTI_SYSTEM_EXECUTIVE_MAP[sm.roleId];
      const systems: ManagementSystemId[] =
        payload.systems && payload.systems.length > 0
          ? payload.systems
          : execMapping?.systems || ['supermarket'];
      return {
        id: sm.id,
        employeeCode: sm.employeeCode,
        fullName: sm.fullName,
        email: sm.email,
        department: sm.department,
        branchId: sm.branchId,
        active: sm.active,
        isPublishedLeadership: sm.isPublishedLeadership,
        systems,
        supermarketRoleId: systems.includes('supermarket')
          ? payload.supermarketRoleId || payload.roleId || sm.roleId
          : undefined,
        restaurantRoleId: systems.includes('restaurant')
          ? payload.restaurantRoleId || execMapping?.restaurantRoleId
          : undefined,
        playLandRoleId: systems.includes('playland')
          ? payload.playLandRoleId || execMapping?.playLandRoleId
          : undefined,
        isDemoAccount: Boolean(payload.isDemoSession),
      };
    }

    // 2. Check Restaurant directory
    const rest = restaurantDb.staffUsers.find((u) => u.id === payload.uid);
    if (rest && rest.active) {
      return {
        id: rest.id,
        employeeCode: rest.employeeCode,
        fullName: rest.fullName,
        email: rest.email,
        department: rest.department,
        branchId: rest.branchId,
        active: rest.active,
        systems: ['restaurant'],
        restaurantRoleId: payload.restaurantRoleId || rest.roleId,
        isDemoAccount: Boolean(rest.isDemoUser || payload.isDemoSession),
      };
    }

    // 3. Check Play Land directory
    const play = playLandDb.staffUsers.find((u) => u.id === payload.uid);
    if (play && play.active) {
      return {
        id: play.id,
        employeeCode: play.employeeCode,
        fullName: play.fullName,
        email: play.email,
        department: play.department,
        branchId: play.branchId,
        active: play.active,
        systems: ['playland'],
        playLandRoleId: payload.playLandRoleId || play.roleId,
        isDemoAccount: Boolean(play.isDemoUser || payload.isDemoSession),
      };
    }

    return null;
  };

  // ==================== UNIFIED STAFF LOGIN (PATH A) ====================
  router.post('/auth/login', (req: Request, res: Response) => {
    const { identifier, email, password, pin, systemHint } = req.body as {
      identifier?: string;
      email?: string;
      password?: string;
      pin?: string;
      systemHint?: ManagementSystemId;
    };

    const cleanId = (identifier || email || '').trim().toLowerCase();
    const secret = (password ?? pin ?? '').trim();

    if (!cleanId || !secret) {
      res.status(400).json({ error: 'Staff email/employee code and password are required.' });
      return;
    }

    const rateKey = `${req.ip || 'local'}:${cleanId}`;
    if (!checkLoginRateLimit(rateKey)) {
      res.status(429).json({
        error: 'Too many sign-in attempts. Please wait a minute before trying again.',
      });
      return;
    }

    // Match user across directories (respect systemHint if provided to disambiguate)
    const matchSm = () =>
      erpDb.staffUsers.find(
        (u) =>
          u.email.toLowerCase() === cleanId ||
          u.employeeCode.toLowerCase() === cleanId ||
          u.id.toLowerCase() === cleanId
      );
    const matchRest = () =>
      restaurantDb.staffUsers.find(
        (u) =>
          u.email.toLowerCase() === cleanId ||
          u.employeeCode.toLowerCase() === cleanId ||
          u.id.toLowerCase() === cleanId
      );
    const matchPlay = () =>
      playLandDb.staffUsers.find(
        (u) =>
          u.email.toLowerCase() === cleanId ||
          u.employeeCode.toLowerCase() === cleanId ||
          u.id.toLowerCase() === cleanId
      );

    let smUser = systemHint === 'restaurant' || systemHint === 'playland' ? undefined : matchSm();
    let restUser = systemHint === 'restaurant' ? matchRest() : undefined;
    let playUser = systemHint === 'playland' ? matchPlay() : undefined;

    if (!smUser && !restUser && !playUser) {
      smUser = matchSm();
      if (!smUser) restUser = matchRest();
      if (!smUser && !restUser) playUser = matchPlay();
    }

    if (smUser) {
      if (!verifyPasswordSecret(secret, smUser.demoPin)) {
        res.status(401).json({ error: 'Invalid staff email/ID or password.' });
        return;
      }
      if (!smUser.active) {
        res.status(403).json({ error: 'This staff account is currently disabled by MIS Admin.' });
        return;
      }
      if (systemHint && systemHint !== 'supermarket') {
        const execMapping = MULTI_SYSTEM_EXECUTIVE_MAP[smUser.roleId];
        if (!execMapping?.systems.includes(systemHint)) {
          res.status(403).json({
            error: `Access denied: ${smUser.fullName} (${ROLE_DEFINITIONS[smUser.roleId]?.label}) is only authorized for Supermarket Management.`,
          });
          return;
        }
      }

      resetLoginRateLimit(rateKey);
      const execMapping = MULTI_SYSTEM_EXECUTIVE_MAP[smUser.roleId];
      const systems: ManagementSystemId[] = execMapping?.systems || ['supermarket'];
      const payload: PortalSessionPayload = {
        uid: smUser.id,
        systems,
        supermarketRoleId: smUser.roleId,
        restaurantRoleId: execMapping?.restaurantRoleId,
        playLandRoleId: execMapping?.playLandRoleId,
        branchId: smUser.branchId,
        isDemoSession: false,
        iat: Date.now(),
        exp: Date.now() + SESSION_TTL_MS,
      };
      const token = signPortalToken(payload);
      res.cookie(PORTAL_SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS,
      });

      const user: UnifiedStaffAccount = {
        id: smUser.id,
        employeeCode: smUser.employeeCode,
        fullName: smUser.fullName,
        email: smUser.email,
        department: smUser.department,
        branchId: smUser.branchId,
        active: smUser.active,
        isPublishedLeadership: smUser.isPublishedLeadership,
        systems,
        supermarketRoleId: smUser.roleId,
        restaurantRoleId: execMapping?.restaurantRoleId,
        playLandRoleId: execMapping?.playLandRoleId,
        isDemoAccount: false,
      };
      res.json({
        token,
        user,
        systems,
        landingPath: systemHint ? resolveLandingPath([systemHint]) : resolveLandingPath(systems),
        isDemoSession: false,
      });
      return;
    }

    if (restUser) {
      if (!verifyPasswordSecret(secret, restUser.demoPin)) {
        res.status(401).json({ error: 'Invalid staff email/ID or password.' });
        return;
      }
      if (!restUser.active) {
        res.status(403).json({ error: 'This Restaurant staff account is currently disabled.' });
        return;
      }
      if (systemHint && systemHint !== 'restaurant') {
        res.status(403).json({
          error: `Cross-system access denied: ${restUser.fullName} is authorized only for Restaurant Management.`,
        });
        return;
      }
      resetLoginRateLimit(rateKey);
      const payload: PortalSessionPayload = {
        uid: restUser.id,
        systems: ['restaurant'],
        restaurantRoleId: restUser.roleId,
        branchId: restUser.branchId,
        isDemoSession: Boolean(restUser.isDemoUser),
        iat: Date.now(),
        exp: Date.now() + SESSION_TTL_MS,
      };
      const token = signPortalToken(payload);
      res.cookie(PORTAL_SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS,
      });
      const user: UnifiedStaffAccount = {
        id: restUser.id,
        employeeCode: restUser.employeeCode,
        fullName: restUser.fullName,
        email: restUser.email,
        department: restUser.department,
        branchId: restUser.branchId,
        active: restUser.active,
        systems: ['restaurant'],
        restaurantRoleId: restUser.roleId,
        isDemoAccount: Boolean(restUser.isDemoUser),
      };
      res.json({
        token,
        user,
        systems: ['restaurant'],
        landingPath: '/management/restaurant/dashboard',
        isDemoSession: Boolean(restUser.isDemoUser),
      });
      return;
    }

    if (playUser) {
      if (!verifyPasswordSecret(secret, playUser.demoPin)) {
        res.status(401).json({ error: 'Invalid staff email/ID or password.' });
        return;
      }
      if (!playUser.active) {
        res.status(403).json({ error: 'This Play Land staff account is currently disabled.' });
        return;
      }
      if (systemHint && systemHint !== 'playland') {
        res.status(403).json({
          error: `Cross-system access denied: ${playUser.fullName} is authorized only for Play Land Management.`,
        });
        return;
      }
      resetLoginRateLimit(rateKey);
      const payload: PortalSessionPayload = {
        uid: playUser.id,
        systems: ['playland'],
        playLandRoleId: playUser.roleId,
        branchId: playUser.branchId,
        isDemoSession: Boolean(playUser.isDemoUser),
        iat: Date.now(),
        exp: Date.now() + SESSION_TTL_MS,
      };
      const token = signPortalToken(payload);
      res.cookie(PORTAL_SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS,
      });
      const user: UnifiedStaffAccount = {
        id: playUser.id,
        employeeCode: playUser.employeeCode,
        fullName: playUser.fullName,
        email: playUser.email,
        department: playUser.department,
        branchId: playUser.branchId,
        active: playUser.active,
        systems: ['playland'],
        playLandRoleId: playUser.roleId,
        isDemoAccount: Boolean(playUser.isDemoUser),
      };
      res.json({
        token,
        user,
        systems: ['playland'],
        landingPath: '/management/play-land/dashboard',
        isDemoSession: Boolean(playUser.isDemoUser),
      });
      return;
    }

    res.status(401).json({ error: 'No matching active Marhaba staff account found.' });
  });

  // ==================== SYSTEM-ISOLATED DEMO ROLE LOGIN (PATH B) ====================
  router.post('/auth/demo-role', (req: Request, res: Response) => {
    if (process.env.ALLOW_DEMO_ROLE_SWITCH === 'false') {
      res.status(403).json({ error: 'Demo role selector is disabled in production mode.' });
      return;
    }

    const { system, roleId } = req.body as {
      system?: ManagementSystemId;
      roleId?: string;
    };

    if (!system || !roleId) {
      res.status(400).json({ error: 'Target system and roleId are required for demo sign-in.' });
      return;
    }

    if (system === 'supermarket') {
      const target = erpDb.staffUsers.find((u) => u.roleId === roleId && u.active);
      if (!target) {
        res.status(404).json({ error: `No demo staff account found for Supermarket role "${roleId}".` });
        return;
      }
      const payload: PortalSessionPayload = {
        uid: target.id,
        systems: ['supermarket'],
        supermarketRoleId: target.roleId,
        branchId: target.branchId,
        isDemoSession: true,
        iat: Date.now(),
        exp: Date.now() + SESSION_TTL_MS,
      };
      const token = signPortalToken(payload);
      res.cookie(PORTAL_SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS,
      });
      res.json({
        token,
        system: 'supermarket',
        roleId: target.roleId,
        roleLabel: ROLE_DEFINITIONS[target.roleId]?.label || target.roleId,
        isDemoSession: true,
        landingPath: '/management/supermarket/dashboard',
      });
      return;
    }

    if (system === 'restaurant') {
      const target = restaurantDb.staffUsers.find((u) => u.roleId === roleId && u.active);
      if (!target) {
        res.status(404).json({ error: `No demo staff account found for Restaurant role "${roleId}".` });
        return;
      }
      const payload: PortalSessionPayload = {
        uid: target.id,
        systems: ['restaurant'],
        restaurantRoleId: target.roleId,
        branchId: target.branchId,
        isDemoSession: true,
        iat: Date.now(),
        exp: Date.now() + SESSION_TTL_MS,
      };
      const token = signPortalToken(payload);
      res.cookie(PORTAL_SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS,
      });
      res.json({
        token,
        system: 'restaurant',
        roleId: target.roleId,
        roleLabel: RESTAURANT_ROLES[target.roleId]?.label || target.roleId,
        isDemoSession: true,
        landingPath: '/management/restaurant/dashboard',
      });
      return;
    }

    if (system === 'playland') {
      const target = playLandDb.staffUsers.find((u) => u.roleId === roleId && u.active);
      if (!target) {
        res.status(404).json({ error: `No demo staff account found for Play Land role "${roleId}".` });
        return;
      }
      const payload: PortalSessionPayload = {
        uid: target.id,
        systems: ['playland'],
        playLandRoleId: target.roleId,
        branchId: target.branchId,
        isDemoSession: true,
        iat: Date.now(),
        exp: Date.now() + SESSION_TTL_MS,
      };
      const token = signPortalToken(payload);
      res.cookie(PORTAL_SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_TTL_MS,
      });
      res.json({
        token,
        system: 'playland',
        roleId: target.roleId,
        roleLabel: PLAYLAND_ROLES[target.roleId]?.label || target.roleId,
        isDemoSession: true,
        landingPath: '/management/play-land/dashboard',
      });
      return;
    }

    res.status(400).json({ error: 'Unknown management system.' });
  });

  router.get('/auth/me', (req: Request, res: Response) => {
    const token = extractBearerOrCookieToken(req);
    const payload = token ? verifyPortalToken(token) : null;
    if (!payload) {
      res.json({ authenticated: false, user: null, systems: [] });
      return;
    }
    const user = resolveUnifiedUserFromPayload(payload);
    if (!user) {
      res.json({ authenticated: false, user: null, systems: [] });
      return;
    }
    res.json({
      authenticated: true,
      user,
      systems: user.systems,
      isDemoSession: Boolean(payload.isDemoSession),
    });
  });

  router.post('/auth/logout', (_req: Request, res: Response) => {
    res.clearCookie(PORTAL_SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // ==================== CONSOLIDATED EXECUTIVE REPORT (SEPARATE LEDGERS) ====================
  router.get('/executive-summary', (req: Request, res: Response) => {
    const token = extractBearerOrCookieToken(req);
    const payload = token ? verifyPortalToken(token) : null;
    const user = payload ? resolveUnifiedUserFromPayload(payload) : null;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (user.systems.length < 2) {
      res.status(403).json({
        error: 'Consolidated executive reporting is restricted to multi-system Executive Directors and CEO.',
      });
      return;
    }

    const smSales = erpDb.posSales.reduce((acc, s) => acc + s.grandTotal, 0);
    const restPaidSales = restaurantDb.orders
      .filter((o) => o.status !== 'Cancelled' && o.paidTotalPkr > 0)
      .reduce((acc, o) => acc + o.paidTotalPkr, 0);
    const playPaidSales = playLandDb.tickets
      .filter((t) => t.paymentStatus === 'Confirmed' && t.status !== 'Cancelled' && t.status !== 'Refunded')
      .reduce((acc, t) => acc + t.finalAmountPkr, 0);

    res.json({
      generatedAt: new Date().toISOString(),
      ledgerSeparationNote:
        'Each business unit maintains an independent financial ledger, inventory/recipe store, and cashier shift reconciliation.',
      supermarket: {
        posSalesCount: erpDb.posSales.length,
        posRevenuePkr: smSales,
        onlineOrdersCount: erpDb.onlineOrders.length,
        pendingApprovals: erpDb.approvals.filter((a) => a.status === 'Pending').length,
      },
      restaurant: {
        ordersCount: restaurantDb.orders.length,
        paidRevenuePkr: restPaidSales,
        activeTables: restaurantDb.tables.filter((t) => t.status !== 'Available').length,
        openKdsTickets: restaurantDb.kitchenTickets.filter((k) => k.status !== 'Served' && k.status !== 'Cancelled').length,
        lowStockIngredients: restaurantDb.ingredients.filter((i) => i.onHand <= i.reorderLevel).length,
      },
      playland: {
        ticketsIssued: playLandDb.tickets.length,
        ticketRevenuePkr: playPaidSales,
        currentlyInside: playLandDb.tickets.filter(
          (t) => t.entriesUsed > 0 && t.status !== 'Refunded' && t.status !== 'Cancelled'
        ).length,
        safetyHolds: playLandDb.attractions.filter((a) =>
          ['Out of Service', 'Under Maintenance', 'Incident Hold'].includes(a.status)
        ).length,
        activeEvents: playLandDb.events.filter(
          (e) => e.stage !== 'Event Completion' && e.stage !== 'Declined'
        ).length,
      },
      consolidatedDemoGrossPkr: smSales + restPaidSales + playPaidSales,
      interBusinessRequestsCount: interBusinessRequests.length,
    });
  });

  // ==================== INTER-BUSINESS CONTRACTS ====================
  router.get('/inter-business', (req: Request, res: Response) => {
    const token = extractBearerOrCookieToken(req);
    const payload = token ? verifyPortalToken(token) : null;
    const user = payload ? resolveUnifiedUserFromPayload(payload) : null;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const visible = interBusinessRequests.filter(
      (r) => user.systems.includes(r.sourceSystem) || user.systems.includes(r.targetSystem)
    );
    res.json({ requests: visible });
  });

  router.post('/inter-business/:id/status', (req: Request, res: Response) => {
    const token = extractBearerOrCookieToken(req);
    const payload = token ? verifyPortalToken(token) : null;
    const user = payload ? resolveUnifiedUserFromPayload(payload) : null;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const item = interBusinessRequests.find((r) => r.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Inter-business request not found.' });
      return;
    }

    if (!user.systems.includes(item.targetSystem) && user.systems.length < 2) {
      res.status(403).json({
        error: `Only authorized ${item.targetSystem} or multi-system leadership can update this request.`,
      });
      return;
    }

    const { status, notes } = req.body as {
      status?: InterBusinessRequest['status'];
      notes?: string;
    };
    if (!status || !['Accepted by Target', 'Fulfilled', 'Declined'].includes(status)) {
      res.status(400).json({ error: 'Valid target status is required.' });
      return;
    }

    item.status = status;
    if (notes?.trim()) item.notes = notes.trim();
    res.json({ request: item });
  });

  return router;
}
