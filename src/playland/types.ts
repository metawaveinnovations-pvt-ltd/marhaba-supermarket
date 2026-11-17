import type { PermissionAction } from '../erp/types';

export type PlayLandModuleId =
  | 'overview'
  | 'tickets'
  | 'admissions'
  | 'attractions'
  | 'sessions'
  | 'packages'
  | 'safety'
  | 'maintenance'
  | 'events'
  | 'support'
  | 'staff'
  | 'accounts'
  | 'reports'
  | 'settings';

export type PlayLandRoleId =
  | 'ticket_cashier'
  | 'admissions_attendant'
  | 'ride_operator'
  | 'play_area_attendant'
  | 'guest_relations'
  | 'attractions_supervisor'
  | 'admissions_supervisor'
  | 'safety_officer'
  | 'maintenance_technician'
  | 'maintenance_supervisor'
  | 'events_coordinator'
  | 'staff_coordinator'
  | 'accounts_officer'
  | 'playland_manager'
  | 'general_manager'
  | 'mis_admin';

export type PlayLandRoleCategory = 'frontline' | 'supervision' | 'events_admin' | 'management';

export interface PlayLandRoleDefinition {
  id: PlayLandRoleId;
  label: string;
  category: PlayLandRoleCategory;
  department: string;
  description: string;
  assignedAttractionId?: string;
  canSellTickets: boolean;
  canScanAdmissions: boolean;
  canAuthorizeAttractionOpen: boolean;
  canClearSafetyHold: boolean;
  canApproveRefunds: boolean;
  canCloseShift: boolean;
  maxDiscountPercent: number;
  modules: Partial<Record<PlayLandModuleId, PermissionAction[]>>;
}

export interface PlayLandStaffUser {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  roleId: PlayLandRoleId;
  department: string;
  branchId: string;
  assignedAttractionId?: string;
  active: boolean;
  isDemoUser?: boolean;
}

export type AttractionStatus =
  | 'Closed'
  | 'Pending Inspection'
  | 'Ready / Authorized to Open'
  | 'Operating'
  | 'Paused'
  | 'Out of Service'
  | 'Under Maintenance'
  | 'Incident Hold';

export interface PlayAttractionRecord {
  id: string;
  attractionCode: string;
  name: string;
  type: 'Soft Play' | 'Climbing & Slides' | 'Mechanical Ride' | 'Arcade & Interactive' | 'Family Lounge';
  zone: string;
  description: string;
  capacity: number;
  activeOccupancy: number;
  sessionDurationMinutes: number;
  minAgeYears: number;
  maxAgeYears: number;
  heightRule: string;
  guardianRequired: boolean;
  operatingInstructions: string;
  inspectionRequirements: string;
  maintenanceStatus: 'Clear' | 'Inspection Due' | 'Fault Reported' | 'Repair In Progress';
  status: AttractionStatus;
  assignedOperatorId?: string;
  assignedOperatorName?: string;
  lastClearedByName?: string;
  lastClearedAt?: string;
  isDemoRecord: boolean;
}

export interface PlaySessionRecord {
  id: string;
  sessionCode: string;
  date: string; // YYYY-MM-DD
  windowLabel: string; // e.g. '04:00 PM – 06:00 PM'
  zoneScope: string;
  maxCapacity: number;
  allocatedCount: number;
  checkedInCount: number;
  status: 'Open' | 'Restricted' | 'Completed' | 'Cancelled';
}

export interface PlayPackageRecord {
  id: string;
  packageCode: string;
  name: string;
  ticketType: 'Child Session' | 'Family Pass' | 'Single Ride Token' | 'Group / School' | 'Birthday Base';
  pricePkr: number;
  childCountIncluded: number;
  adultCountIncluded: number;
  durationLabel: string;
  permittedAttractionIds: string[];
  active: boolean;
  approvalStatus: 'Approved' | 'Pending Approval';
  isDemoRecord: boolean;
}

export type TicketStatus =
  | 'Valid'
  | 'Already Used'
  | 'Not Yet Valid'
  | 'Expired'
  | 'Cancelled'
  | 'Refunded'
  | 'Partially Used';

export interface PlayTicketRecord {
  id: string;
  ticketCode: string;
  qrPayload: string;
  idempotencyKey: string;
  packageId: string;
  packageName: string;
  sessionId: string;
  sessionLabel: string;
  validDate: string;
  guestName: string;
  guestPhone: string;
  childCount: number;
  adultCount: number;
  childAges: number[];
  baseAmountPkr: number;
  discountPercent: number;
  discountAmountPkr: number;
  finalAmountPkr: number;
  paymentMethod: 'Cash' | 'Card';
  paymentStatus: 'Confirmed' | 'Failed' | 'Refunded';
  status: TicketStatus;
  maxEntries: number;
  entriesUsed: number;
  reentryAllowed: boolean;
  issuedByName: string;
  issuedAt: string;
  lastScannedAt?: string;
  lastScannedByName?: string;
  refundReason?: string;
  isDemoRecord: boolean;
}

export interface AdmissionScanLog {
  id: string;
  timestamp: string;
  ticketCode: string;
  guestName: string;
  sessionLabel: string;
  result:
    | 'Valid'
    | 'Already Used'
    | 'Not Yet Valid'
    | 'Expired'
    | 'Cancelled'
    | 'Invalid'
    | 'Requires Supervisor';
  detail: string;
  attendantName: string;
}

export interface PreOpeningInspection {
  id: string;
  attractionId: string;
  attractionName: string;
  date: string;
  operatorName: string;
  checks: { item: string; passed: boolean; note?: string }[];
  overallResult: 'Passed' | 'Issue Found';
  supervisorCleared: boolean;
  supervisorName?: string;
  submittedAt: string;
}

export interface EquipmentFaultWorkOrder {
  id: string;
  workOrderNumber: string;
  attractionId: string;
  attractionName: string;
  severity: 'Non-Critical' | 'Safety-Critical';
  faultDescription: string;
  reportedByName: string;
  reportedAt: string;
  assignedTechnicianName?: string;
  repairActionNotes?: string;
  status: 'Reported' | 'Technician Inspecting' | 'Repair Completed' | 'Cleared for Service';
  clearedByName?: string;
  clearedAt?: string;
  downtimeMinutes: number;
}

export interface PlayIncidentRecord {
  id: string;
  incidentNumber: string;
  category:
    | 'Guest Injury'
    | 'Equipment Fault'
    | 'Safety Concern'
    | 'Missing-Child Alert'
    | 'Unauthorized Access'
    | 'Other';
  severity: 'Low' | 'Medium' | 'High / Urgent';
  attractionId?: string;
  attractionName?: string;
  summary: string;
  immediateActionTaken: string;
  confidentialChildNote: boolean;
  reportedByName: string;
  reportedAt: string;
  status: 'Open' | 'Escalated to Supervisor' | 'Resolved';
  resolvedByName?: string;
}

export type EventLifecycleStage =
  | 'Inquiry'
  | 'Review'
  | 'Availability Check'
  | 'Quotation'
  | 'Customer Acceptance'
  | 'Authorized Confirmation'
  | 'Event Preparation'
  | 'Event Completion'
  | 'Declined';

export interface PlayBirthdayEvent {
  id: string;
  eventCode: string;
  parentName: string;
  phone: string;
  eventDate: string;
  sessionId: string;
  sessionLabel: string;
  childCount: number;
  packageId: string;
  packageName: string;
  quotedAmountPkr: number;
  decorationNotes: string;
  foodCateringRequested: boolean;
  restaurantServiceRequestId?: string;
  paymentStatus: 'Unpaid' | 'Deposit Paid' | 'Paid';
  stage: EventLifecycleStage;
  assignedStaffName?: string;
  checklistCompleted: boolean;
  createdAt: string;
  isDemoRecord: boolean;
}

export interface ParentSupportCase {
  id: string;
  caseNumber: string;
  parentName: string;
  phone: string;
  category: 'Ticket Issue' | 'Lost Property' | 'Parent Question' | 'Complaint' | 'Refund Request';
  summary: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  assignedTo: string;
  createdAt: string;
}

export interface PlayCashierShift {
  id: string;
  shiftNumber: string;
  cashierUserId: string;
  cashierName: string;
  openedAt: string;
  closedAt?: string;
  openingFloatPkr: number;
  cashSalesPkr: number;
  cardSalesPkr: number;
  refundsPkr: number;
  expectedCashPkr: number;
  declaredCashPkr?: number;
  variancePkr?: number;
  status: 'Open' | 'Pending Accounts Verification' | 'Reconciled';
  reconciledByName?: string;
}

export interface PlayStaffRosterItem {
  id: string;
  userId: string;
  fullName: string;
  roleLabel: string;
  assignmentZone: string;
  shiftWindow: string;
  status: 'On Duty' | 'Scheduled' | 'Break' | 'Completed';
}

export interface PlayAuditEntry {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  module: PlayLandModuleId | 'auth';
  action: string;
  target: string;
  outcome: 'Success' | 'Denied';
  detail: string;
}
