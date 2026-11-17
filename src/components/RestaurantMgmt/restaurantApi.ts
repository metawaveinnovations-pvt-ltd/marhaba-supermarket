import { portalFetch } from '../../portal/portalApi';
import type {
  DiningFloorZone,
  DiningTable,
  FoodIngredient,
  KitchenStationId,
  KitchenTicket,
  KitchenTicketStatus,
  RestaurantAuditEntry,
  RestaurantCashierShift,
  RestaurantDeal,
  RestaurantGuestCase,
  RestaurantHygieneTask,
  RestaurantMenuItem,
  RestaurantModuleId,
  RestaurantOrder,
  RestaurantRecipe,
  RestaurantRoleDefinition,
  RestaurantStaffShift,
  RestaurantStaffUser,
  RestaurantSupplierOrder,
  TableReservation,
  TableStatus,
} from '../../restaurant/types';
import type { BranchInfo } from '../../types/marhaba';

export interface RestaurantMenuView extends RestaurantMenuItem {
  foodCostPkr: number | null;
  foodCostPercent: number | null;
}

export interface RestaurantRecipeView extends RestaurantRecipe {
  calculatedFoodCostPkr: number;
}

export interface RestaurantBootstrapPayload {
  user: RestaurantStaffUser;
  role: RestaurantRoleDefinition;
  permittedModules: {
    id: RestaurantModuleId;
    label: string;
    shortLabel: string;
    description: string;
  }[];
  stations: { id: KitchenStationId; label: string }[];
  branches: BranchInfo[];
  activeBranchScope: string;
  zones: DiningFloorZone[];
  tables: DiningTable[];
  reservations: TableReservation[];
  menu: RestaurantMenuView[];
  recipes: RestaurantRecipeView[];
  ingredients: FoodIngredient[];
  orders: RestaurantOrder[];
  kitchenTickets: KitchenTicket[];
  supplierOrders: RestaurantSupplierOrder[];
  deals: RestaurantDeal[];
  shifts: RestaurantCashierShift[];
  guestCases: RestaurantGuestCase[];
  staffShifts: RestaurantStaffShift[];
  hygieneTasks: RestaurantHygieneTask[];
  auditLogs: RestaurantAuditEntry[];
  config: {
    serviceChargeRatePercent: number;
    taxRatePercent: number;
    takeawayEnabled: boolean;
    deliveryEnabled: boolean;
  };
  kpis: {
    dailySalesPkr: number;
    ordersCount: number;
    coversServed: number;
    averageBillPkr: number;
    activeTablesCount: number;
    totalTablesCount: number;
    openKitchenTickets: number;
    readyTicketsCount: number;
    voidedOrdersCount: number;
    lowStockCount: number;
  };
  priorityAlerts: {
    id: string;
    priority: 'high' | 'medium';
    module: RestaurantModuleId;
    title: string;
    detail: string;
  }[];
}

export const restaurantApi = {
  bootstrap(branchId = 'hyderabad'): Promise<RestaurantBootstrapPayload> {
    return portalFetch(`/api/rest/bootstrap?branchId=${encodeURIComponent(branchId)}`);
  },

  seatTable(tableId: string, payload: { guestCount: number; reservationId?: string }) {
    return portalFetch(`/api/rest/tables/${encodeURIComponent(tableId)}/seat`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateTableStatus(tableId: string, status: TableStatus, notes?: string) {
    return portalFetch(`/api/rest/tables/${encodeURIComponent(tableId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes }),
    });
  },

  moveTable(fromTableId: string, toTableId: string) {
    return portalFetch('/api/rest/tables/move', {
      method: 'POST',
      body: JSON.stringify({ fromTableId, toTableId }),
    });
  },

  createReservation(payload: {
    branchId: string;
    guestName: string;
    phone: string;
    date: string;
    timeSlot: string;
    partySize: number;
    specialRequests?: string;
    source?: 'Phone' | 'Walk-In Desk' | 'Website Inquiry';
    assignedTableId?: string;
    confirmImmediately?: boolean;
  }) {
    return portalFetch('/api/rest/reservations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateReservation(id: string, payload: { status?: TableReservation['status']; assignedTableId?: string }) {
    return portalFetch(`/api/rest/reservations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  openOrder(payload: {
    branchId: string;
    serviceType: 'Dine-In' | 'Takeaway' | 'Delivery';
    tableId?: string;
    guestCount?: number;
    items: {
      dishId: string;
      portionId?: string;
      quantity: number;
      modifierIds?: string[];
      prepNotes?: string;
    }[];
    idempotencyKey?: string;
  }) {
    return portalFetch('/api/rest/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  addOrderItems(
    orderId: string,
    items: {
      dishId: string;
      portionId?: string;
      quantity: number;
      modifierIds?: string[];
      prepNotes?: string;
    }[]
  ) {
    return portalFetch(`/api/rest/orders/${encodeURIComponent(orderId)}/items`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  applyDiscount(orderId: string, discountPercent: number, reason: string) {
    return portalFetch(`/api/rest/orders/${encodeURIComponent(orderId)}/discount`, {
      method: 'PATCH',
      body: JSON.stringify({ discountPercent, reason }),
    });
  },

  recordPayment(
    orderId: string,
    payload: {
      method: 'Cash' | 'Card' | 'Wallet';
      amountPkr: number;
      splitLabel?: string;
      simulateFailure?: boolean;
      closeTable?: boolean;
    }
  ) {
    return portalFetch(`/api/rest/orders/${encodeURIComponent(orderId)}/pay`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  voidOrder(orderId: string, reason: string) {
    return portalFetch(`/api/rest/orders/${encodeURIComponent(orderId)}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  updateKdsStatus(ticketId: string, status: KitchenTicketStatus, delayReason?: string) {
    return portalFetch(`/api/rest/kds/${encodeURIComponent(ticketId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, delayReason }),
    });
  },

  toggleDishAvailability(dishId: string, available: boolean, reason?: string) {
    return portalFetch(`/api/rest/menu/${encodeURIComponent(dishId)}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ available, reason }),
    });
  },

  logWaste(ingredientId: string, wasteQty: number, reason?: string) {
    return portalFetch('/api/rest/inventory/waste', {
      method: 'POST',
      body: JSON.stringify({ ingredientId, wasteQty, reason }),
    });
  },

  updateIngredientCount(ingredientId: string, physicalQty: number) {
    return portalFetch('/api/rest/inventory/count', {
      method: 'POST',
      body: JSON.stringify({ ingredientId, physicalQty }),
    });
  },

  createPurchaseOrder(payload: {
    branchId: string;
    supplierName?: string;
    type: 'External Supplier' | 'Supermarket Inter-Business Transfer';
    ingredientId: string;
    orderedQty: number;
  }) {
    return portalFetch('/api/rest/purchasing/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  receivePurchaseOrder(id: string, receivedQty: number, discrepancyNote?: string) {
    return portalFetch(`/api/rest/purchasing/orders/${encodeURIComponent(id)}/receive`, {
      method: 'POST',
      body: JSON.stringify({ receivedQty, discrepancyNote }),
    });
  },

  openShift(branchId: string, openingFloatPkr: number) {
    return portalFetch('/api/rest/accounts/shifts/open', {
      method: 'POST',
      body: JSON.stringify({ branchId, openingFloatPkr }),
    });
  },

  closeShift(id: string, declaredCashPkr: number) {
    return portalFetch(`/api/rest/accounts/shifts/${encodeURIComponent(id)}/close`, {
      method: 'POST',
      body: JSON.stringify({ declaredCashPkr }),
    });
  },

  verifyShift(id: string) {
    return portalFetch(`/api/rest/accounts/shifts/${encodeURIComponent(id)}/verify`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  createDeal(payload: {
    title: string;
    description: string;
    discountPercent: number;
    applicableWindow: string;
  }) {
    return portalFetch('/api/rest/deals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  createGuestCase(payload: {
    guestName: string;
    phone: string;
    orderNumber?: string;
    category: 'Service Inquiry' | 'Food Quality' | 'Billing Issue' | 'Special Event Request';
    priority: 'Normal' | 'High';
    notes: string;
  }) {
    return portalFetch('/api/rest/customers/cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  toggleHygieneTask(id: string) {
    return portalFetch(`/api/rest/staff/hygiene/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
  },

  updateSettings(payload: {
    serviceChargeRatePercent?: number;
    taxRatePercent?: number;
    takeawayEnabled?: boolean;
    deliveryEnabled?: boolean;
  }) {
    return portalFetch('/api/rest/settings/config', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};
