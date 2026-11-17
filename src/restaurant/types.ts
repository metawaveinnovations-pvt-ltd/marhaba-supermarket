import type { PermissionAction } from '../erp/types';

export type RestaurantModuleId =
  | 'overview'
  | 'tables'
  | 'reservations'
  | 'pos'
  | 'kds'
  | 'menu'
  | 'inventory'
  | 'purchasing'
  | 'deals'
  | 'staff'
  | 'customers'
  | 'accounts'
  | 'reports'
  | 'settings';

export type RestaurantRoleId =
  | 'host'
  | 'waiter'
  | 'food_runner'
  | 'restaurant_cashier'
  | 'floor_supervisor'
  | 'head_chef'
  | 'sous_chef'
  | 'station_chef'
  | 'prep_cook'
  | 'kitchen_expeditor'
  | 'steward'
  | 'inventory_controller'
  | 'purchasing_officer'
  | 'accounts_officer'
  | 'guest_relations'
  | 'restaurant_manager'
  | 'general_manager'
  | 'mis_admin';

export type RestaurantRoleCategory = 'front_of_house' | 'kitchen' | 'management_support';

export type KitchenStationId =
  | 'bbq_grill'
  | 'pakistani_desi'
  | 'chinese'
  | 'italian'
  | 'turkish_me'
  | 'beverages'
  | 'desserts';

export interface RestaurantRoleDefinition {
  id: RestaurantRoleId;
  label: string;
  category: RestaurantRoleCategory;
  department: string;
  description: string;
  branchRestricted: boolean;
  assignedStation?: KitchenStationId;
  canViewFoodCost: boolean;
  maxDiscountPercent: number;
  canApproveVoidOrDiscount: boolean;
  canMarkOrderPaid: boolean;
  canCloseShift: boolean;
  canApproveMenuOrRecipe: boolean;
  modules: Partial<Record<RestaurantModuleId, PermissionAction[]>>;
}

export interface RestaurantStaffUser {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  roleId: RestaurantRoleId;
  department: string;
  branchId: string;
  assignedStation?: KitchenStationId;
  active: boolean;
  isDemoUser?: boolean;
}

export type TableStatus =
  | 'Available'
  | 'Reserved'
  | 'Occupied'
  | 'Awaiting Cleaning'
  | 'Temporarily Unavailable';

export interface DiningFloorZone {
  id: string;
  name: string;
  branchId: string;
  description: string;
  isDemoConfig: boolean;
}

export interface DiningTable {
  id: string;
  tableNumber: string;
  zoneId: string;
  zoneName: string;
  branchId: string;
  capacity: number;
  status: TableStatus;
  activeOrderId?: string;
  assignedWaiterId?: string;
  assignedWaiterName?: string;
  combinedWithTableIds?: string[];
  guestCount?: number;
  seatedAt?: string;
  notes?: string;
}

export type ReservationStatus =
  | 'Requested'
  | 'Confirmed'
  | 'Seated'
  | 'Completed'
  | 'Cancelled'
  | 'No-show'
  | 'Declined';

export interface TableReservation {
  id: string;
  reservationCode: string;
  branchId: string;
  guestName: string;
  phone: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. '19:30'
  partySize: number;
  specialRequests: string;
  source: 'Phone' | 'Walk-In Desk' | 'Website Inquiry';
  assignedTableId?: string;
  assignedTableNumber?: string;
  status: ReservationStatus;
  createdAt: string;
  updatedAt?: string;
  isDemoRecord: boolean;
}

export interface DishPortionOption {
  id: string;
  label: string;
  pricePkr: number;
}

export interface DishModifierOption {
  id: string;
  label: string;
  priceDeltaPkr: number;
}

export interface RecipeIngredientLine {
  ingredientId: string;
  ingredientName: string;
  quantityPerServing: number;
  unit: 'g' | 'ml' | 'pcs' | 'kg' | 'L';
  prepLossPercent: number;
}

export interface RestaurantMenuItem {
  id: string;
  dishCode: string;
  name: string;
  cuisine: 'Pakistani' | 'Chinese' | 'Italian' | 'Turkish' | 'BBQ' | 'Beverages' | 'Desserts';
  category: string;
  description: string;
  portions: DishPortionOption[];
  modifiers: DishModifierOption[];
  station: KitchenStationId;
  available: boolean;
  manualUnavailableReason?: string;
  recipeId: string;
  approvalStatus: 'Approved' | 'Pending Review';
  isDemoRecord: boolean;
}

export interface RestaurantRecipe {
  id: string;
  dishId: string;
  dishName: string;
  version: string;
  standardServing: string;
  yieldPortions: number;
  ingredients: RecipeIngredientLine[];
  calculatedFoodCostPkr: number;
  isDemoRecord: boolean;
}

export interface FoodIngredient {
  id: string;
  sku: string;
  name: string;
  category: 'Proteins' | 'Produce' | 'Dairy' | 'Dry Pantry' | 'Spices & Sauces' | 'Beverage Base';
  unit: 'g' | 'ml' | 'pcs' | 'kg' | 'L';
  branchId: string;
  onHand: number;
  reorderLevel: number;
  unitCostPkr: number;
  batchNumber: string;
  expiryDate: string;
  storageLocation: string;
  wasteQty: number;
  isDemoRecord: boolean;
}

export type OrderServiceType = 'Dine-In' | 'Takeaway' | 'Delivery';

export type OrderLineStatus = 'Queued' | 'Accepted' | 'Preparing' | 'Ready' | 'Served' | 'Cancelled';

export interface RestaurantOrderLine {
  lineId: string;
  dishId: string;
  dishName: string;
  portionLabel: string;
  quantity: number;
  unitPricePkr: number;
  modifiers: { label: string; priceDeltaPkr: number }[];
  prepNotes?: string;
  station: KitchenStationId;
  ticketVersion: number;
  kitchenStatus: OrderLineStatus;
  lineTotalPkr: number;
  ingredientsDeducted: boolean;
}

export type RestaurantOrderStatus =
  | 'Open'
  | 'In Kitchen'
  | 'Ready for Service'
  | 'Served'
  | 'Billed'
  | 'Paid'
  | 'Closed'
  | 'Cancelled';

export interface RestaurantOrderPayment {
  id: string;
  splitLabel: string; // e.g. 'Full Bill' or 'Guest 1 / Item Split'
  method: 'Cash' | 'Card' | 'Wallet';
  amountPkr: number;
  status: 'Paid' | 'Failed' | 'Refunded';
  reference?: string;
  paidAt: string;
  processedByName: string;
}

export interface RestaurantOrder {
  id: string;
  orderNumber: string;
  branchId: string;
  serviceType: OrderServiceType;
  tableId?: string;
  tableNumber?: string;
  waiterId?: string;
  waiterName?: string;
  guestCount: number;
  items: RestaurantOrderLine[];
  subtotalPkr: number;
  discountPercent: number;
  discountAmountPkr: number;
  discountReason?: string;
  serviceChargePkr: number;
  taxAmountPkr: number;
  grandTotalPkr: number;
  paidTotalPkr: number;
  status: RestaurantOrderStatus;
  payments: RestaurantOrderPayment[];
  ticketVersion: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  voidReason?: string;
  authorizedByName?: string;
  isDemoRecord: boolean;
}

export type KitchenTicketStatus =
  | 'New Order'
  | 'Accepted'
  | 'Preparing'
  | 'Ready'
  | 'Served'
  | 'Delayed'
  | 'Cancelled';

export interface KitchenTicket {
  id: string;
  ticketNumber: string;
  orderId: string;
  orderNumber: string;
  version: number;
  branchId: string;
  tableLabel: string;
  serviceType: OrderServiceType;
  station: KitchenStationId;
  priority: 'Normal' | 'Rush';
  status: KitchenTicketStatus;
  items: {
    lineId: string;
    dishId: string;
    dishName: string;
    portionLabel: string;
    quantity: number;
    modifiers: string[];
    prepNotes?: string;
    status: OrderLineStatus;
  }[];
  createdAt: string;
  acceptedAt?: string;
  readyAt?: string;
  servedAt?: string;
  delayReason?: string;
  idempotencyKey: string;
}

export interface RestaurantSupplierOrder {
  id: string;
  poNumber: string;
  branchId: string;
  supplierName: string;
  type: 'External Supplier' | 'Supermarket Inter-Business Transfer';
  items: {
    ingredientId: string;
    ingredientName: string;
    orderedQty: number;
    receivedQty: number;
    unit: string;
    unitCostPkr: number;
  }[];
  totalCostPkr: number;
  status: 'Requisition' | 'Ordered' | 'Received' | 'Discrepancy Flagged';
  createdByName: string;
  createdAt: string;
  receivedByName?: string;
  discrepancyNote?: string;
}

export interface RestaurantDeal {
  id: string;
  title: string;
  description: string;
  discountPercent: number;
  applicableWindow: string;
  active: boolean;
  approvalStatus: 'Approved' | 'Pending Approval';
  isDemoRecord: boolean;
}

export interface RestaurantCashierShift {
  id: string;
  shiftNumber: string;
  branchId: string;
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
  status: 'Open' | 'Pending Verification' | 'Posted to Accounts';
  verifiedByName?: string;
}

export interface RestaurantGuestCase {
  id: string;
  caseNumber: string;
  branchId: string;
  guestName: string;
  phone: string;
  orderNumber?: string;
  category: 'Service Inquiry' | 'Food Quality' | 'Billing Issue' | 'Special Event Request';
  priority: 'Normal' | 'High';
  status: 'Open' | 'In Review' | 'Resolved';
  notes: string;
  assignedTo: string;
  createdAt: string;
}

export interface RestaurantStaffShift {
  id: string;
  userId: string;
  fullName: string;
  roleLabel: string;
  branchId: string;
  stationLabel: string;
  shiftWindow: string;
  status: 'On Duty' | 'Scheduled' | 'Break' | 'Completed';
}

export interface RestaurantHygieneTask {
  id: string;
  branchId: string;
  area: string;
  task: string;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
}

export interface RestaurantAuditEntry {
  id: string;
  timestamp: string;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  branchId: string;
  module: RestaurantModuleId | 'auth';
  action: string;
  target: string;
  outcome: 'Success' | 'Denied';
  detail: string;
}
