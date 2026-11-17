import { portalFetch } from '../../portal/portalApi';
import type {
  AdmissionScanLog,
  AttractionStatus,
  EquipmentFaultWorkOrder,
  EventLifecycleStage,
  ParentSupportCase,
  PlayAttractionRecord,
  PlayAuditEntry,
  PlayBirthdayEvent,
  PlayCashierShift,
  PlayIncidentRecord,
  PlayLandModuleId,
  PlayLandRoleDefinition,
  PlayLandStaffUser,
  PlayPackageRecord,
  PlaySessionRecord,
  PlayStaffRosterItem,
  PlayTicketRecord,
  PreOpeningInspection,
} from '../../playland/types';

export interface PlayLandBootstrapPayload {
  user: PlayLandStaffUser;
  role: PlayLandRoleDefinition;
  permittedModules: {
    id: PlayLandModuleId;
    label: string;
    shortLabel: string;
    description: string;
  }[];
  attractions: PlayAttractionRecord[];
  sessions: PlaySessionRecord[];
  packages: PlayPackageRecord[];
  tickets: PlayTicketRecord[];
  admissionLogs: AdmissionScanLog[];
  inspections: PreOpeningInspection[];
  workOrders: EquipmentFaultWorkOrder[];
  incidents: PlayIncidentRecord[];
  events: PlayBirthdayEvent[];
  supportCases: ParentSupportCase[];
  shifts: PlayCashierShift[];
  roster: PlayStaffRosterItem[];
  auditLogs: PlayAuditEntry[];
  config: {
    operatingDate: string;
    reentryAllowedByDefault: boolean;
    wristbandHardwareConnected: boolean;
  };
  kpis: {
    dailyTicketSalesPkr: number;
    ticketsIssuedCount: number;
    paidAdmissionsCount: number;
    activeOccupancy: number;
    totalAttractionCapacity: number;
    safetyLockedAttractions: number;
    openMaintenanceOrders: number;
    openIncidents: number;
    confirmedEventsCount: number;
  };
  priorityAlerts: {
    id: string;
    priority: 'high' | 'medium';
    module: PlayLandModuleId;
    title: string;
    detail: string;
  }[];
}

export const playLandApi = {
  bootstrap(): Promise<PlayLandBootstrapPayload> {
    return portalFetch('/api/play/bootstrap');
  },

  sellTicket(payload: {
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
  }): Promise<{ ticket: PlayTicketRecord; deduplicated?: boolean }> {
    return portalFetch('/api/play/tickets/sell', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  refundTicket(ticketId: string, reason: string) {
    return portalFetch(`/api/play/tickets/${encodeURIComponent(ticketId)}/refund`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  scanAdmission(codeOrQuery: string, idempotencyKey?: string): Promise<{
    result: string;
    canAdmit: boolean;
    reason: string;
    ticket?: PlayTicketRecord;
    eligibleAttractions?: {
      eligible: PlayAttractionRecord[];
      unavailableOrRestricted: { attraction: PlayAttractionRecord; reason: string }[];
    } | null;
  }> {
    return portalFetch('/api/play/admissions/scan', {
      method: 'POST',
      body: JSON.stringify({ codeOrQuery, idempotencyKey }),
    });
  },

  submitInspection(attractionId: string, checks: { item: string; passed: boolean; note?: string }[]) {
    return portalFetch('/api/play/safety/inspections', {
      method: 'POST',
      body: JSON.stringify({ attractionId, checks }),
    });
  },

  updateAttractionStatus(attractionId: string, status: AttractionStatus) {
    return portalFetch(`/api/play/attractions/${encodeURIComponent(attractionId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  reportFault(attractionId: string, severity: 'Non-Critical' | 'Safety-Critical', faultDescription: string) {
    return portalFetch('/api/play/maintenance/faults', {
      method: 'POST',
      body: JSON.stringify({ attractionId, severity, faultDescription }),
    });
  },

  updateWorkOrder(
    workOrderId: string,
    payload: {
      status: EquipmentFaultWorkOrder['status'];
      repairActionNotes?: string;
      downtimeMinutes?: number;
    }
  ) {
    return portalFetch(`/api/play/maintenance/work-orders/${encodeURIComponent(workOrderId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  logIncident(payload: {
    category: 'Guest Injury' | 'Equipment Fault' | 'Safety Concern' | 'Missing-Child Alert' | 'Unauthorized Access' | 'Other';
    severity: 'Low' | 'Medium' | 'High / Urgent';
    attractionId?: string;
    summary: string;
    immediateActionTaken: string;
    confidentialChildNote?: boolean;
  }) {
    return portalFetch('/api/play/safety/incidents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  createEvent(payload: {
    parentName: string;
    phone: string;
    eventDate: string;
    sessionId: string;
    childCount: number;
    packageId?: string;
    decorationNotes?: string;
    foodCateringRequested?: boolean;
  }) {
    return portalFetch('/api/play/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateEventStage(
    eventId: string,
    payload: {
      stage: EventLifecycleStage;
      paymentStatus?: PlayBirthdayEvent['paymentStatus'];
      checklistCompleted?: boolean;
    }
  ) {
    return portalFetch(`/api/play/events/${encodeURIComponent(eventId)}/stage`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  createSupportCase(payload: {
    parentName: string;
    phone: string;
    category: 'Ticket Issue' | 'Lost Property' | 'Parent Question' | 'Complaint' | 'Refund Request';
    summary: string;
  }) {
    return portalFetch('/api/play/support/cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  openShift(openingFloatPkr: number) {
    return portalFetch('/api/play/accounts/shifts/open', {
      method: 'POST',
      body: JSON.stringify({ openingFloatPkr }),
    });
  },

  closeShift(shiftId: string, declaredCashPkr: number) {
    return portalFetch(`/api/play/accounts/shifts/${encodeURIComponent(shiftId)}/close`, {
      method: 'POST',
      body: JSON.stringify({ declaredCashPkr }),
    });
  },

  reconcileShift(shiftId: string) {
    return portalFetch(`/api/play/accounts/shifts/${encodeURIComponent(shiftId)}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
};
