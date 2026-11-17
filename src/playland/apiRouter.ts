import express, { type NextFunction, type Request, type Response } from 'express';
import type { PermissionAction } from '../erp/types';
import { extractBearerOrCookieToken, verifyPortalToken } from '../portal/auth';
import type { InterBusinessRequest, PortalSessionPayload } from '../portal/types';
import {
  checkSessionCapacity,
  computePlayShiftClosing,
  computeTicketPrice,
  getEligibleAttractionsForChild,
  isAttractionSafetyLocked,
  validateTicketAdmission,
} from './calculations';
import { getPermittedPlayLandModules, hasPlayLandPermission, PLAYLAND_ROLES } from './permissions';
import { createInitialPlayLandDatabase, type PlayLandDatabaseState } from './seedData';
import type {
  AttractionStatus,
  EventLifecycleStage,
  PlayLandModuleId,
  PlayLandRoleId,
  PlayLandStaffUser,
} from './types';

interface PlayLandAuthedRequest extends Request {
  portalSession?: PortalSessionPayload;
  playUser?: PlayLandStaffUser;
}

export function createPlayLandRouter(options: {
  initialDb?: PlayLandDatabaseState;
  onInterBusinessRequest?: (reqItem: Omit<InterBusinessRequest, 'id' | 'requestNumber' | 'requestedAt' | 'status'>) => InterBusinessRequest;
}) {
  const db: PlayLandDatabaseState = options.initialDb || createInitialPlayLandDatabase();
  const processedTicketKeys = new Set<string>();
  const processedScanKeys = new Set<string>();
  const router = express.Router();

  const addAudit = (
    user: { id: string; fullName: string; roleLabel: string },
    module: PlayLandModuleId | 'auth',
    action: string,
    target: string,
    outcome: 'Success' | 'Denied',
    detail: string
  ) => {
    db.auditLogs.unshift({
      id: `paud-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      timestamp: new Date().toISOString(),
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.roleLabel,
      module,
      action,
      target,
      outcome,
      detail,
    });
    if (db.auditLogs.length > 300) db.auditLogs = db.auditLogs.slice(0, 300);
  };

  const requirePlayLandAuth = (req: PlayLandAuthedRequest, res: Response, next: NextFunction) => {
    const token = extractBearerOrCookieToken(req);
    if (!token) {
      res.status(401).json({ error: 'Play Land management authentication required.' });
      return;
    }
    const payload = verifyPortalToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Management session expired or invalid.' });
      return;
    }
    if (!payload.systems.includes('playland') || !payload.playLandRoleId) {
      res.status(403).json({
        error: 'Cross-system access denied: your role is not authorized for Play Land Management.',
      });
      return;
    }
    const found = db.staffUsers.find((u) => u.id === payload.uid);
    const roleId: PlayLandRoleId = payload.playLandRoleId;
    if (found && !found.active) {
      res.status(401).json({ error: 'Play Land staff account is disabled.' });
      return;
    }
    const user: PlayLandStaffUser = found
      ? {
          id: found.id,
          employeeCode: found.employeeCode,
          fullName: found.fullName,
          email: found.email,
          roleId,
          department: found.department,
          branchId: found.branchId,
          assignedAttractionId: found.assignedAttractionId,
          active: found.active,
          isDemoUser: found.isDemoUser,
        }
      : {
          id: payload.uid,
          employeeCode: 'MRH-EXEC',
          fullName:
            payload.supermarketRoleId === 'ceo'
              ? 'Riaz Ahmed Memon'
              : payload.supermarketRoleId === 'director_mis'
              ? 'Shahzad Ahmed Memon'
              : 'Authorized Executive',
          email: 'executive@marhaba.demo',
          roleId,
          department: 'Executive Board',
          branchId: 'hyderabad',
          active: true,
          isDemoUser: payload.isDemoSession,
        };

    req.portalSession = payload;
    req.playUser = user;
    next();
  };

  const checkPerm = (
    req: PlayLandAuthedRequest,
    res: Response,
    moduleId: PlayLandModuleId,
    action: PermissionAction
  ): PlayLandStaffUser | null => {
    const user = req.playUser;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return null;
    }
    const role = PLAYLAND_ROLES[user.roleId];
    if (!role || !hasPlayLandPermission(user.roleId, moduleId, action)) {
      addAudit(
        { id: user.id, fullName: user.fullName, roleLabel: role?.label || user.roleId },
        moduleId,
        `${moduleId.toUpperCase()}_${action.toUpperCase()}`,
        req.originalUrl,
        'Denied',
        `Role "${role?.label || user.roleId}" lacks "${action}" permission in ${moduleId}.`
      );
      res.status(403).json({
        error: `Access denied: Role "${role?.label || user.roleId}" cannot perform "${action}" in ${moduleId}.`,
      });
      return null;
    }
    return user;
  };

  router.get('/bootstrap', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = req.playUser!;
    const role = PLAYLAND_ROLES[user.roleId];

    const canSeeConfidentialIncidents =
      ['safety_officer', 'playland_manager', 'general_manager', 'guest_relations'].includes(user.roleId);
    const incidentsView = db.incidents.map((inc) =>
      inc.confidentialChildNote && !canSeeConfidentialIncidents
        ? { ...inc, summary: '[Protected Child Incident — Restricted to Safety & Management]' }
        : inc
    );

    const confirmedTickets = db.tickets.filter((t) => t.paymentStatus === 'Confirmed' && t.status !== 'Refunded' && t.status !== 'Cancelled');
    const dailyTicketSalesPkr = confirmedTickets.reduce((s, t) => s + t.finalAmountPkr, 0);
    const paidAdmissionsCount = db.tickets.reduce((s, t) => s + t.entriesUsed, 0);
    const activeOccupancy = db.attractions.reduce((s, a) => s + a.activeOccupancy, 0);
    const totalAttractionCap = db.attractions.reduce((s, a) => s + a.capacity, 0);
    const safetyLockedCount = db.attractions.filter((a) => isAttractionSafetyLocked(a.status)).length;
    const openWorkOrders = db.workOrders.filter((w) => w.status !== 'Cleared for Service').length;
    const openIncidents = db.incidents.filter((i) => i.status !== 'Resolved').length;

    const priorityAlerts = [
      ...db.attractions
        .filter((a) => isAttractionSafetyLocked(a.status) || a.status === 'Pending Inspection')
        .map((a) => ({
          id: `pal-attr-${a.id}`,
          priority: isAttractionSafetyLocked(a.status) ? ('high' as const) : ('medium' as const),
          module: isAttractionSafetyLocked(a.status) ? ('maintenance' as PlayLandModuleId) : ('safety' as PlayLandModuleId),
          title: `${a.status}: ${a.name}`,
          detail: `Zone ${a.zone} · Maintenance: ${a.maintenanceStatus}`,
        })),
      ...db.shifts
        .filter((s) => s.status === 'Pending Accounts Verification')
        .map((s) => ({
          id: `pal-sh-${s.id}`,
          priority: 'high' as const,
          module: 'accounts' as PlayLandModuleId,
          title: `Shift Reconciliation Pending: ${s.shiftNumber}`,
          detail: `Variance PKR ${s.variancePkr?.toLocaleString() || 0}`,
        })),
    ];

    res.json({
      user,
      role,
      permittedModules: getPermittedPlayLandModules(user.roleId),
      attractions: db.attractions,
      sessions: db.sessions,
      packages: db.packages,
      tickets: db.tickets,
      admissionLogs: db.admissionLogs,
      inspections: db.inspections,
      workOrders: db.workOrders,
      incidents: incidentsView,
      events: db.events,
      supportCases: db.supportCases,
      shifts: hasPlayLandPermission(user.roleId, 'accounts', 'view') || role.canCloseShift ? db.shifts : [],
      roster: db.roster,
      auditLogs:
        hasPlayLandPermission(user.roleId, 'settings', 'view') ||
        user.roleId === 'playland_manager' ||
        user.roleId === 'general_manager'
          ? db.auditLogs.slice(0, 60)
          : [],
      config: db.config,
      kpis: {
        dailyTicketSalesPkr,
        ticketsIssuedCount: confirmedTickets.length,
        paidAdmissionsCount,
        activeOccupancy,
        totalAttractionCapacity: totalAttractionCap,
        safetyLockedAttractions: safetyLockedCount,
        openMaintenanceOrders: openWorkOrders,
        openIncidents,
        confirmedEventsCount: db.events.filter((e) => e.stage === 'Authorized Confirmation' || e.stage === 'Event Preparation').length,
      },
      priorityAlerts,
    });
  });

  // ==================== TICKETING COUNTER ====================
  router.post('/tickets/sell', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = checkPerm(req, res, 'tickets', 'create');
    if (!user) return;
    const role = PLAYLAND_ROLES[user.roleId];
    if (!role.canSellTickets) {
      res.status(403).json({ error: `Role "${role.label}" is not authorized to sell tickets.` });
      return;
    }

    const {
      idempotencyKey,
      packageId,
      sessionId,
      guestName,
      guestPhone,
      participantMultiplier,
      childAges,
      discountPercent,
      paymentMethod,
      simulatePaymentFailure,
    } = req.body as {
      idempotencyKey?: string;
      packageId: string;
      sessionId: string;
      guestName: string;
      guestPhone: string;
      participantMultiplier?: number;
      childAges?: number[];
      discountPercent?: number;
      paymentMethod: 'Cash' | 'Card';
      simulatePaymentFailure?: boolean;
    };

    if (idempotencyKey && processedTicketKeys.has(idempotencyKey)) {
      const existing = db.tickets.find((t) => t.idempotencyKey === idempotencyKey);
      if (existing) {
        res.json({ ticket: existing, deduplicated: true });
        return;
      }
    }

    if (!guestName?.trim() || !guestPhone?.trim()) {
      res.status(400).json({ error: 'Parent / guest name and phone number are required.' });
      return;
    }

    const pkg = db.packages.find((p) => p.id === packageId && p.active);
    if (!pkg) {
      res.status(404).json({ error: 'Selected package not found or inactive.' });
      return;
    }

    // Check if all included attractions are safety-locked / out of service
    const includedAttrs = db.attractions.filter((a) => pkg.permittedAttractionIds.includes(a.id));
    if (includedAttrs.length > 0 && includedAttrs.every((a) => isAttractionSafetyLocked(a.status) || a.status === 'Closed')) {
      res.status(409).json({
        error: `Package "${pkg.name}" cannot be sold right now because its included attraction(s) are Out of Service or on Safety Hold.`,
      });
      return;
    }

    const session = db.sessions.find((s) => s.id === sessionId);
    const mult = Math.max(1, Math.floor(Number(participantMultiplier) || 1));
    const totalGuests = (pkg.childCountIncluded + pkg.adultCountIncluded) * mult;
    const capCheck = checkSessionCapacity(session, totalGuests);
    if (!capCheck.allowed) {
      res.status(409).json({ error: capCheck.reason });
      return;
    }

    const discPct = Math.max(0, Number(discountPercent) || 0);
    if (discPct > role.maxDiscountPercent) {
      res.status(403).json({
        error: `Role "${role.label}" maximum discount is ${role.maxDiscountPercent}%.`,
      });
      return;
    }

    if (simulatePaymentFailure) {
      res.status(402).json({
        error: 'Card payment failed. Ticket was NOT issued and session capacity was NOT deducted.',
      });
      return;
    }

    const pricing = computeTicketPrice({
      pkg,
      participantCountMultiplier: mult,
      discountPercent: discPct,
    });

    const ticketCode = `PL-HYD-${1010 + db.tickets.length}`;
    const finalIdem = idempotencyKey || `idem-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    processedTicketKeys.add(finalIdem);

    const ticket = {
      id: `tkt-${Date.now()}`,
      ticketCode,
      qrPayload: `MRH-PL:${ticketCode}`,
      idempotencyKey: finalIdem,
      packageId: pkg.id,
      packageName: pkg.name,
      sessionId: session!.id,
      sessionLabel: session!.windowLabel,
      validDate: session!.date,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      childCount: pkg.childCountIncluded * mult,
      adultCount: pkg.adultCountIncluded * mult,
      childAges: Array.isArray(childAges) && childAges.length > 0 ? childAges : [6],
      ...pricing,
      discountPercent: discPct,
      paymentMethod: paymentMethod || 'Cash',
      paymentStatus: 'Confirmed' as const,
      status: 'Valid' as const,
      maxEntries: 1,
      entriesUsed: 0,
      reentryAllowed: db.config.reentryAllowedByDefault,
      issuedByName: user.fullName,
      issuedAt: new Date().toISOString(),
      isDemoRecord: true,
    };

    session!.allocatedCount += totalGuests;
    db.tickets.unshift(ticket);

    const activeShift = db.shifts.find((s) => s.status === 'Open');
    if (activeShift) {
      if (ticket.paymentMethod === 'Cash') {
        activeShift.cashSalesPkr += ticket.finalAmountPkr;
        activeShift.expectedCashPkr = activeShift.openingFloatPkr + activeShift.cashSalesPkr - activeShift.refundsPkr;
      } else {
        activeShift.cardSalesPkr += ticket.finalAmountPkr;
      }
    }

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: role.label },
      'tickets',
      'ISSUE_TICKET',
      ticket.ticketCode,
      'Success',
      `Issued ${ticket.ticketCode} (${pkg.name}) for PKR ${ticket.finalAmountPkr.toLocaleString()}.`
    );
    res.status(201).json({ ticket, session });
  });

  router.post('/tickets/:id/refund', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = req.playUser!;
    const role = PLAYLAND_ROLES[user.roleId];
    if (!role.canApproveRefunds) {
      res.status(403).json({
        error: `Authorization denied: "${role.label}" cannot approve ticket refunds.`,
      });
      return;
    }
    const ticket = db.tickets.find((t) => t.id === req.params.id);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket not found.' });
      return;
    }
    if (ticket.status === 'Refunded') {
      res.status(400).json({ error: 'Ticket already refunded.' });
      return;
    }
    const { reason } = req.body as { reason?: string };
    if (!reason?.trim()) {
      res.status(400).json({ error: 'Refund reason is required.' });
      return;
    }
    ticket.status = 'Refunded';
    ticket.paymentStatus = 'Refunded';
    ticket.refundReason = reason.trim();

    const sess = db.sessions.find((s) => s.id === ticket.sessionId);
    if (sess) {
      sess.allocatedCount = Math.max(0, sess.allocatedCount - (ticket.childCount + ticket.adultCount));
    }
    const activeShift = db.shifts.find((s) => s.status === 'Open');
    if (activeShift && ticket.paymentMethod === 'Cash') {
      activeShift.refundsPkr += ticket.finalAmountPkr;
      activeShift.expectedCashPkr = activeShift.openingFloatPkr + activeShift.cashSalesPkr - activeShift.refundsPkr;
    }

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: role.label },
      'tickets',
      'REFUND_TICKET',
      ticket.ticketCode,
      'Success',
      `Refunded ${ticket.ticketCode} (PKR ${ticket.finalAmountPkr.toLocaleString()}): ${reason.trim()}`
    );
    res.json({ ticket });
  });

  // ==================== ADMISSIONS GATE ====================
  router.post('/admissions/scan', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = checkPerm(req, res, 'admissions', 'verify');
    if (!user) return;
    const role = PLAYLAND_ROLES[user.roleId];
    if (!role.canScanAdmissions) {
      res.status(403).json({ error: `Role "${role.label}" cannot validate gate admissions.` });
      return;
    }

    const { codeOrQuery, idempotencyKey } = req.body as { codeOrQuery: string; idempotencyKey?: string };
    const cleanCode = (codeOrQuery || '').replace(/^MRH-PL:/i, '').trim().toUpperCase();
    if (!cleanCode) {
      res.status(400).json({ error: 'Enter or scan a ticket ID / QR code.' });
      return;
    }

    if (idempotencyKey && processedScanKeys.has(idempotencyKey)) {
      const existingTicket = db.tickets.find((t) => t.ticketCode.toUpperCase() === cleanCode);
      res.json({
        result: 'Valid',
        canAdmit: true,
        deduplicated: true,
        reason: 'Entry already recorded for this scan request.',
        ticket: existingTicket,
      });
      return;
    }

    const ticket = db.tickets.find(
      (t) => t.ticketCode.toUpperCase() === cleanCode || t.qrPayload.toUpperCase() === codeOrQuery.trim().toUpperCase()
    );
    const session = ticket ? db.sessions.find((s) => s.id === ticket.sessionId) : undefined;
    const pkg = ticket ? db.packages.find((p) => p.id === ticket.packageId) : undefined;

    const validation = validateTicketAdmission({
      ticket,
      session,
      attractions: db.attractions,
      pkg,
      todayDate: db.config.operatingDate,
    });

    if (validation.canAdmit && ticket) {
      if (idempotencyKey) processedScanKeys.add(idempotencyKey);
      ticket.entriesUsed += 1;
      ticket.lastScannedAt = new Date().toISOString();
      ticket.lastScannedByName = user.fullName;
      ticket.status = ticket.entriesUsed >= ticket.maxEntries && !ticket.reentryAllowed ? 'Already Used' : 'Partially Used';
      if (session) {
        session.checkedInCount += ticket.childCount + ticket.adultCount;
      }
    }

    const logEntry = {
      id: `adm-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ticketCode: ticket?.ticketCode || cleanCode,
      guestName: ticket?.guestName || 'Unknown Ticket',
      sessionLabel: ticket?.sessionLabel || '-',
      result: validation.result,
      detail: validation.reason,
      attendantName: user.fullName,
    };
    db.admissionLogs.unshift(logEntry);

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: role.label },
      'admissions',
      'GATE_SCAN',
      ticket?.ticketCode || cleanCode,
      validation.canAdmit ? 'Success' : 'Denied',
      `${validation.result}: ${validation.reason}`
    );

    const eligibleAttractions = ticket
      ? getEligibleAttractionsForChild(db.attractions, ticket.childAges[0] ?? 6)
      : null;

    res.json({
      ...validation,
      ticket,
      logEntry,
      eligibleAttractions,
    });
  });

  // ==================== ATTRACTIONS, SAFETY & MAINTENANCE ====================
  router.post('/safety/inspections', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = checkPerm(req, res, 'safety', 'create');
    if (!user) return;
    const { attractionId, checks } = req.body as {
      attractionId: string;
      checks: { item: string; passed: boolean; note?: string }[];
    };
    const attr = db.attractions.find((a) => a.id === attractionId);
    if (!attr) {
      res.status(404).json({ error: 'Attraction not found.' });
      return;
    }
    if (!Array.isArray(checks) || checks.length === 0) {
      res.status(400).json({ error: 'At least one inspection checklist item is required.' });
      return;
    }
    const allPassed = checks.every((c) => c.passed);
    const inspection = {
      id: `insp-${Date.now()}`,
      attractionId: attr.id,
      attractionName: attr.name,
      date: db.config.operatingDate,
      operatorName: user.fullName,
      checks,
      overallResult: allPassed ? ('Passed' as const) : ('Issue Found' as const),
      supervisorCleared: false,
      submittedAt: new Date().toISOString(),
    };
    db.inspections.unshift(inspection);

    if (!allPassed) {
      attr.status = 'Out of Service';
      attr.maintenanceStatus = 'Fault Reported';
      db.workOrders.unshift({
        id: `mwo-${Date.now()}`,
        workOrderNumber: `PL-MWO-${205 + db.workOrders.length}`,
        attractionId: attr.id,
        attractionName: attr.name,
        severity: 'Safety-Critical',
        faultDescription: `Pre-opening inspection failed: ${checks.filter((c) => !c.passed).map((c) => c.item).join('; ')}`,
        reportedByName: user.fullName,
        reportedAt: new Date().toISOString(),
        status: 'Reported',
        downtimeMinutes: 0,
      });
    } else if (attr.status === 'Closed') {
      attr.status = 'Pending Inspection';
      attr.maintenanceStatus = 'Clear';
    }

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: PLAYLAND_ROLES[user.roleId].label },
      'safety',
      'SUBMIT_PRE_OPENING_CHECK',
      attr.name,
      'Success',
      `Pre-opening check ${inspection.overallResult} by ${user.fullName}.`
    );
    res.status(201).json({ inspection, attraction: attr });
  });

  router.post('/attractions/:id/status', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = req.playUser!;
    const role = PLAYLAND_ROLES[user.roleId];
    const attr = db.attractions.find((a) => a.id === req.params.id);
    if (!attr) {
      res.status(404).json({ error: 'Attraction not found.' });
      return;
    }
    const { status } = req.body as { status: AttractionStatus };

    // Opening or returning to service from safety hold is strictly gated
    if (status === 'Ready / Authorized to Open' || status === 'Operating') {
      if (isAttractionSafetyLocked(attr.status)) {
        if (!role.canClearSafetyHold) {
          res.status(403).json({
            error: `Safety Hold Lock: "${attr.name}" is ${attr.status}. Only Safety Officer, Maintenance Supervisor, or Manager may clear it after technical verification.`,
          });
          return;
        }
        const openCritical = db.workOrders.find(
          (w) => w.attractionId === attr.id && w.severity === 'Safety-Critical' && w.status !== 'Cleared for Service'
        );
        if (openCritical) {
          res.status(409).json({
            error: `Cannot open "${attr.name}": Safety-critical work order ${openCritical.workOrderNumber} is still "${openCritical.status}".`,
          });
          return;
        }
      }
      if (!role.canAuthorizeAttractionOpen) {
        res.status(403).json({
          error: `Supervisor authorization required: "${role.label}" cannot authorize attraction opening.`,
        });
        return;
      }
      attr.lastClearedByName = user.fullName;
      attr.lastClearedAt = new Date().toISOString();
      attr.maintenanceStatus = 'Clear';
    }

    attr.status = status;
    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: role.label },
      'attractions',
      'ATTRACTION_STATUS_CHANGE',
      attr.name,
      'Success',
      `Changed attraction "${attr.name}" status to ${status}.`
    );
    res.json({ attraction: attr });
  });

  router.post('/maintenance/faults', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = checkPerm(req, res, 'maintenance', 'create');
    if (!user) return;
    const { attractionId, severity, faultDescription } = req.body as {
      attractionId: string;
      severity: 'Non-Critical' | 'Safety-Critical';
      faultDescription: string;
    };
    const attr = db.attractions.find((a) => a.id === attractionId);
    if (!attr) {
      res.status(404).json({ error: 'Attraction not found.' });
      return;
    }
    if (!faultDescription?.trim()) {
      res.status(400).json({ error: 'Fault description is required.' });
      return;
    }

    const wo = {
      id: `mwo-${Date.now()}`,
      workOrderNumber: `PL-MWO-${205 + db.workOrders.length}`,
      attractionId: attr.id,
      attractionName: attr.name,
      severity: severity || 'Safety-Critical',
      faultDescription: faultDescription.trim(),
      reportedByName: user.fullName,
      reportedAt: new Date().toISOString(),
      status: 'Reported' as const,
      downtimeMinutes: 0,
    };
    db.workOrders.unshift(wo);

    if (wo.severity === 'Safety-Critical') {
      attr.status = 'Out of Service';
      attr.maintenanceStatus = 'Fault Reported';
      attr.activeOccupancy = 0;
    }

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: PLAYLAND_ROLES[user.roleId].label },
      'maintenance',
      'REPORT_FAULT',
      wo.workOrderNumber,
      'Success',
      `Reported ${wo.severity} fault on ${attr.name}: ${wo.faultDescription}`
    );
    res.status(201).json({ workOrder: wo, attraction: attr });
  });

  router.patch('/maintenance/work-orders/:id', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = req.playUser!;
    const role = PLAYLAND_ROLES[user.roleId];
    if (!hasPlayLandPermission(user.roleId, 'maintenance', 'edit') && !hasPlayLandPermission(user.roleId, 'maintenance', 'verify')) {
      res.status(403).json({ error: `Role "${role.label}" cannot update maintenance work orders.` });
      return;
    }
    const wo = db.workOrders.find((w) => w.id === req.params.id);
    if (!wo) {
      res.status(404).json({ error: 'Work order not found.' });
      return;
    }
    const { status, repairActionNotes, downtimeMinutes } = req.body as {
      status: typeof wo.status;
      repairActionNotes?: string;
      downtimeMinutes?: number;
    };

    const attr = db.attractions.find((a) => a.id === wo.attractionId);

    if (status === 'Cleared for Service') {
      if (!role.canClearSafetyHold) {
        res.status(403).json({
          error: `Clearance restricted: "${role.label}" cannot issue safety clearance. Escalate to Safety Officer or Maintenance Supervisor.`,
        });
        return;
      }
      if (wo.status !== 'Repair Completed') {
        res.status(400).json({ error: 'Technician must mark "Repair Completed" before safety clearance.' });
        return;
      }
      wo.clearedByName = user.fullName;
      wo.clearedAt = new Date().toISOString();
      if (attr) {
        attr.status = 'Ready / Authorized to Open';
        attr.maintenanceStatus = 'Clear';
        attr.lastClearedByName = user.fullName;
        attr.lastClearedAt = wo.clearedAt;
      }
    } else if (status === 'Technician Inspecting' && attr && wo.severity === 'Safety-Critical') {
      attr.status = 'Under Maintenance';
      attr.maintenanceStatus = 'Repair In Progress';
      wo.assignedTechnicianName = user.fullName;
    } else if (status === 'Repair Completed') {
      wo.assignedTechnicianName = wo.assignedTechnicianName || user.fullName;
    }

    wo.status = status;
    if (repairActionNotes) wo.repairActionNotes = repairActionNotes;
    if (downtimeMinutes !== undefined) wo.downtimeMinutes = Math.max(0, Number(downtimeMinutes) || 0);

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: role.label },
      'maintenance',
      'UPDATE_WORK_ORDER',
      wo.workOrderNumber,
      'Success',
      `Updated ${wo.workOrderNumber} to ${status}.`
    );
    res.json({ workOrder: wo, attraction: attr });
  });

  router.post('/safety/incidents', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = checkPerm(req, res, 'safety', 'create');
    if (!user) return;
    const { category, severity, attractionId, summary, immediateActionTaken, confidentialChildNote } = req.body as {
      category: 'Guest Injury' | 'Equipment Fault' | 'Safety Concern' | 'Missing-Child Alert' | 'Unauthorized Access' | 'Other';
      severity: 'Low' | 'Medium' | 'High / Urgent';
      attractionId?: string;
      summary: string;
      immediateActionTaken: string;
      confidentialChildNote?: boolean;
    };
    if (!summary?.trim() || !immediateActionTaken?.trim()) {
      res.status(400).json({ error: 'Incident summary and immediate action taken are required.' });
      return;
    }
    const attr = attractionId ? db.attractions.find((a) => a.id === attractionId) : undefined;
    const inc = {
      id: `inc-${Date.now()}`,
      incidentNumber: `PL-INC-${45 + db.incidents.length}`,
      category: category || 'Safety Concern',
      severity: severity || 'Medium',
      attractionId: attr?.id,
      attractionName: attr?.name,
      summary: summary.trim(),
      immediateActionTaken: immediateActionTaken.trim(),
      confidentialChildNote: Boolean(confidentialChildNote) || category === 'Missing-Child Alert',
      reportedByName: user.fullName,
      reportedAt: new Date().toISOString(),
      status: severity === 'High / Urgent' ? ('Escalated to Supervisor' as const) : ('Open' as const),
    };
    db.incidents.unshift(inc);
    if (attr && severity === 'High / Urgent') {
      attr.status = 'Incident Hold';
    }
    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: PLAYLAND_ROLES[user.roleId].label },
      'safety',
      'LOG_INCIDENT',
      inc.incidentNumber,
      'Success',
      `Logged ${inc.severity} ${inc.category} (${inc.incidentNumber}).`
    );
    res.status(201).json({ incident: inc });
  });

  // ==================== BIRTHDAYS & EVENTS ====================
  router.post('/events', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = checkPerm(req, res, 'events', 'create');
    if (!user) return;
    const { parentName, phone, eventDate, sessionId, childCount, packageId, decorationNotes, foodCateringRequested } =
      req.body as {
        parentName: string;
        phone: string;
        eventDate: string;
        sessionId: string;
        childCount: number;
        packageId?: string;
        decorationNotes?: string;
        foodCateringRequested?: boolean;
      };
    if (!parentName?.trim() || !phone?.trim() || !eventDate) {
      res.status(400).json({ error: 'Parent name, phone, and event date are required.' });
      return;
    }
    const sess = db.sessions.find((s) => s.id === sessionId) || db.sessions[1];
    const pkg = db.packages.find((p) => p.id === packageId) || db.packages[1];
    const count = Math.max(5, Number(childCount) || 10);
    const created = {
      id: `evt-${Date.now()}`,
      eventCode: `PL-EVT-${310 + db.events.length}`,
      parentName: parentName.trim(),
      phone: phone.trim(),
      eventDate,
      sessionId: sess.id,
      sessionLabel: sess.windowLabel,
      childCount: count,
      packageId: pkg.id,
      packageName: 'Marhaba Birthday Celebration Package (DEMO)',
      quotedAmountPkr: count * pkg.pricePkr + 4500,
      decorationNotes: decorationNotes?.trim() || 'Standard family lounge seating',
      foodCateringRequested: Boolean(foodCateringRequested),
      paymentStatus: 'Unpaid' as const,
      stage: 'Inquiry' as const,
      assignedStaffName: user.fullName,
      checklistCompleted: false,
      createdAt: new Date().toISOString(),
      isDemoRecord: true,
    };
    db.events.unshift(created);
    res.status(201).json({ event: created });
  });

  router.patch('/events/:id/stage', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = checkPerm(req, res, 'events', 'edit');
    if (!user) return;
    const evt = db.events.find((e) => e.id === req.params.id);
    if (!evt) {
      res.status(404).json({ error: 'Birthday event not found.' });
      return;
    }
    const { stage, paymentStatus, checklistCompleted } = req.body as {
      stage: EventLifecycleStage;
      paymentStatus?: typeof evt.paymentStatus;
      checklistCompleted?: boolean;
    };

    if (stage === 'Authorized Confirmation') {
      const sess = db.sessions.find((s) => s.id === evt.sessionId);
      const capCheck = checkSessionCapacity(sess, evt.childCount + 4);
      if (!capCheck.allowed) {
        res.status(409).json({ error: `Cannot confirm event: ${capCheck.reason}` });
        return;
      }
      if (sess) sess.allocatedCount += evt.childCount + 4;

      if (evt.foodCateringRequested && !evt.restaurantServiceRequestId && options.onInterBusinessRequest) {
        const reqRes = options.onInterBusinessRequest({
          sourceSystem: 'playland',
          targetSystem: 'restaurant',
          branchId: 'hyderabad',
          category: 'Event Catering',
          title: `Birthday Catering Request: ${evt.eventCode}`,
          itemsSummary: `Kids celebration platters for ${evt.childCount} children on ${evt.eventDate} (${evt.sessionLabel})`,
          estimatedAmountPkr: evt.childCount * 650,
          requestedByName: user.fullName,
          referenceId: evt.eventCode,
        });
        evt.restaurantServiceRequestId = reqRes.requestNumber;
      }
    }

    evt.stage = stage;
    if (paymentStatus) evt.paymentStatus = paymentStatus;
    if (checklistCompleted !== undefined) evt.checklistCompleted = Boolean(checklistCompleted);

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: PLAYLAND_ROLES[user.roleId].label },
      'events',
      'EVENT_STAGE',
      evt.eventCode,
      'Success',
      `Moved event ${evt.eventCode} to stage "${stage}".`
    );
    res.json({ event: evt });
  });

  // ==================== PARENT SUPPORT, SHIFTS & SESSIONS ====================
  router.post('/support/cases', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = checkPerm(req, res, 'support', 'create');
    if (!user) return;
    const { parentName, phone, category, summary } = req.body as {
      parentName: string;
      phone: string;
      category: 'Ticket Issue' | 'Lost Property' | 'Parent Question' | 'Complaint' | 'Refund Request';
      summary: string;
    };
    if (!parentName?.trim() || !summary?.trim()) {
      res.status(400).json({ error: 'Parent name and summary are required.' });
      return;
    }
    const created = {
      id: `psc-${Date.now()}`,
      caseNumber: `PL-SUP-${20 + db.supportCases.length}`,
      parentName: parentName.trim(),
      phone: phone?.trim() || '0300-***-000',
      category: category || 'Parent Question',
      summary: summary.trim(),
      status: 'Open' as const,
      assignedTo: user.fullName,
      createdAt: new Date().toISOString(),
    };
    db.supportCases.unshift(created);
    res.status(201).json({ supportCase: created });
  });

  router.post('/accounts/shifts/open', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = req.playUser!;
    const role = PLAYLAND_ROLES[user.roleId];
    if (!role.canCloseShift) {
      res.status(403).json({ error: `Role "${role.label}" cannot open a Play Land cashier shift.` });
      return;
    }
    const { openingFloatPkr } = req.body as { openingFloatPkr?: number };
    const created = {
      id: `plsh-${Date.now()}`,
      shiftNumber: `PLSH-HYD-${Math.floor(100 + Math.random() * 900)}`,
      cashierUserId: user.id,
      cashierName: user.fullName,
      openedAt: new Date().toISOString(),
      openingFloatPkr: Math.max(0, Number(openingFloatPkr) || 10000),
      cashSalesPkr: 0,
      cardSalesPkr: 0,
      refundsPkr: 0,
      expectedCashPkr: Math.max(0, Number(openingFloatPkr) || 10000),
      status: 'Open' as const,
    };
    db.shifts.unshift(created);
    res.status(201).json({ shift: created });
  });

  router.post('/accounts/shifts/:id/close', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = req.playUser!;
    const role = PLAYLAND_ROLES[user.roleId];
    if (!role.canCloseShift) {
      res.status(403).json({ error: `Role "${role.label}" cannot close a ticket cashier shift.` });
      return;
    }
    const shift = db.shifts.find((s) => s.id === req.params.id);
    if (!shift) {
      res.status(404).json({ error: 'Shift not found.' });
      return;
    }
    const { declaredCashPkr } = req.body as { declaredCashPkr: number };
    const declared = Math.max(0, Number(declaredCashPkr));
    if (!Number.isFinite(declared)) {
      res.status(400).json({ error: 'Valid declared cash amount is required.' });
      return;
    }
    const calc = computePlayShiftClosing({
      openingFloatPkr: shift.openingFloatPkr,
      cashSalesPkr: shift.cashSalesPkr,
      refundsPkr: shift.refundsPkr,
      declaredCashPkr: declared,
    });
    shift.declaredCashPkr = declared;
    shift.expectedCashPkr = calc.expectedCashPkr;
    shift.variancePkr = calc.variancePkr;
    shift.closedAt = new Date().toISOString();
    shift.status = 'Pending Accounts Verification';

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: role.label },
      'accounts',
      'CLOSE_TICKET_SHIFT',
      shift.shiftNumber,
      'Success',
      `Closed Play Land shift ${shift.shiftNumber} (variance PKR ${calc.variancePkr}).`
    );
    res.json({ shift });
  });

  router.post('/accounts/shifts/:id/reconcile', requirePlayLandAuth, (req: PlayLandAuthedRequest, res) => {
    const user = checkPerm(req, res, 'accounts', 'verify');
    if (!user) return;
    const shift = db.shifts.find((s) => s.id === req.params.id);
    if (!shift) {
      res.status(404).json({ error: 'Shift not found.' });
      return;
    }
    shift.status = 'Reconciled';
    shift.reconciledByName = user.fullName;
    res.json({ shift });
  });

  return { router, db };
}
