import express, { type NextFunction, type Request, type Response } from 'express';
import { VERIFIED_BRANCHES } from '../data/marhabaData';
import type { PermissionAction } from '../erp/types';
import { extractBearerOrCookieToken, verifyPortalToken } from '../portal/auth';
import type { InterBusinessRequest, PortalSessionPayload } from '../portal/types';
import {
  checkDishIngredientAvailability,
  computeOrderLineTotal,
  computeRecipeFoodCost,
  computeRestaurantOrderTotals,
  computeRestaurantShiftClosing,
  deductIngredientsForOrderLines,
  hasReservationConflict,
} from './calculations';
import {
  getPermittedRestaurantModules,
  hasRestaurantPermission,
  KITCHEN_STATIONS,
  RESTAURANT_ROLES,
} from './permissions';
import { createInitialRestaurantDatabase, type RestaurantDatabaseState } from './seedData';
import type {
  KitchenStationId,
  KitchenTicketStatus,
  OrderLineStatus,
  RestaurantModuleId,
  RestaurantOrderLine,
  RestaurantRoleId,
  RestaurantStaffUser,
  TableStatus,
} from './types';

interface RestaurantAuthedRequest extends Request {
  portalSession?: PortalSessionPayload;
  restUser?: RestaurantStaffUser;
}

export function createRestaurantRouter(options: {
  initialDb?: RestaurantDatabaseState;
  onInterBusinessRequest?: (reqItem: Omit<InterBusinessRequest, 'id' | 'requestNumber' | 'requestedAt' | 'status'>) => InterBusinessRequest;
}) {
  const db: RestaurantDatabaseState = options.initialDb || createInitialRestaurantDatabase();
  const processedKdsKeys = new Set<string>();
  const router = express.Router();

  const addAudit = (
    user: { id: string; fullName: string; roleLabel: string; branchId: string },
    module: RestaurantModuleId | 'auth',
    action: string,
    target: string,
    outcome: 'Success' | 'Denied',
    detail: string
  ) => {
    db.auditLogs.unshift({
      id: `raud-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      timestamp: new Date().toISOString(),
      actorUserId: user.id,
      actorName: user.fullName,
      actorRole: user.roleLabel,
      branchId: user.branchId,
      module,
      action,
      target,
      outcome,
      detail,
    });
    if (db.auditLogs.length > 300) db.auditLogs = db.auditLogs.slice(0, 300);
  };

  const requireRestaurantAuth = (req: RestaurantAuthedRequest, res: Response, next: NextFunction) => {
    const token = extractBearerOrCookieToken(req);
    if (!token) {
      res.status(401).json({ error: 'Restaurant management authentication required.' });
      return;
    }
    const payload = verifyPortalToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Management session expired or invalid.' });
      return;
    }
    if (!payload.systems.includes('restaurant') || !payload.restaurantRoleId) {
      res.status(403).json({
        error: 'Cross-system access denied: your role is not authorized for Restaurant Management.',
      });
      return;
    }
    const found = db.staffUsers.find((u) => u.id === payload.uid);
    const roleId: RestaurantRoleId = payload.restaurantRoleId;
    if (found && !found.active) {
      res.status(401).json({ error: 'Restaurant staff account is disabled.' });
      return;
    }
    const user: RestaurantStaffUser = found
      ? {
          id: found.id,
          employeeCode: found.employeeCode,
          fullName: found.fullName,
          email: found.email,
          roleId,
          department: found.department,
          branchId: found.branchId,
          assignedStation: found.assignedStation,
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
          branchId: payload.branchId || 'all',
          active: true,
          isDemoUser: payload.isDemoSession,
        };

    req.portalSession = payload;
    req.restUser = user;
    next();
  };

  const checkPerm = (
    req: RestaurantAuthedRequest,
    res: Response,
    moduleId: RestaurantModuleId,
    action: PermissionAction
  ): RestaurantStaffUser | null => {
    const user = req.restUser;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return null;
    }
    const role = RESTAURANT_ROLES[user.roleId];
    if (!role || !hasRestaurantPermission(user.roleId, moduleId, action)) {
      addAudit(
        { id: user.id, fullName: user.fullName, roleLabel: role?.label || user.roleId, branchId: user.branchId },
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

  // Sync menu availability whenever ingredients change
  const syncMenuAvailabilityFromStock = (branchId: string) => {
    const branchIngs = db.ingredients.filter((i) => i.branchId === branchId);
    for (const dish of db.menu) {
      const recipe = db.recipes.find((r) => r.id === dish.recipeId);
      const check = checkDishIngredientAvailability(recipe, branchIngs, 1);
      if (!check.available) {
        dish.available = false;
        dish.manualUnavailableReason = `Auto-unavailable: missing ${check.missingIngredients.join(', ')}`;
      }
    }
  };

  router.get('/bootstrap', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = req.restUser!;
    const role = RESTAURANT_ROLES[user.roleId];
    const requestedBranch = typeof req.query.branchId === 'string' ? req.query.branchId : 'hyderabad';
    const activeBranchScope =
      role.branchRestricted || user.branchId !== 'all'
        ? user.branchId === 'all'
          ? 'hyderabad'
          : user.branchId
        : requestedBranch === 'all' || VERIFIED_BRANCHES.some((b) => b.id === requestedBranch)
        ? requestedBranch
        : 'hyderabad';

    const inScope = (bId: string) => activeBranchScope === 'all' || bId === activeBranchScope;

    const menuView = db.menu.map((m) => {
      const rec = db.recipes.find((r) => r.id === m.recipeId);
      const foodCost = rec ? computeRecipeFoodCost(rec, db.ingredients) : 0;
      const basePrice = m.portions[0]?.pricePkr || 0;
      const foodCostPct = basePrice > 0 ? Number(((foodCost / basePrice) * 100).toFixed(1)) : 0;
      return {
        ...m,
        foodCostPkr: role.canViewFoodCost ? foodCost : null,
        foodCostPercent: role.canViewFoodCost ? foodCostPct : null,
      };
    });

    const recipesView = role.canViewFoodCost
      ? db.recipes.map((r) => ({
          ...r,
          calculatedFoodCostPkr: computeRecipeFoodCost(r, db.ingredients),
        }))
      : db.recipes.map((r) => ({
          ...r,
          calculatedFoodCostPkr: 0,
        }));

    const ingredientsView = db.ingredients
      .filter((i) => inScope(i.branchId))
      .map((i) => ({
        ...i,
        unitCostPkr: role.canViewFoodCost ? i.unitCostPkr : 0,
      }));

    // Station chef only sees tickets for their assigned station unless Head/Sous/Expeditor/Manager
    const assignedStation = user.assignedStation || role.assignedStation;
    const ticketsInScope = db.kitchenTickets
      .filter((t) => inScope(t.branchId))
      .filter((t) => (user.roleId === 'station_chef' && assignedStation ? t.station === assignedStation : true));

    const ordersInScope = db.orders.filter((o) => inScope(o.branchId));
    const paidOrders = ordersInScope.filter((o) => o.status !== 'Cancelled' && o.paidTotalPkr > 0);
    const totalSalesPkr = paidOrders.reduce((s, o) => s + o.paidTotalPkr, 0);
    const totalGuests = ordersInScope.filter((o) => o.status !== 'Cancelled').reduce((s, o) => s + o.guestCount, 0);
    const avgBillPkr = paidOrders.length > 0 ? Math.round(totalSalesPkr / paidOrders.length) : 0;
    const voidedCount = ordersInScope.filter((o) => o.status === 'Cancelled').length;
    const lowStockIngredients = ingredientsView.filter((i) => i.onHand <= i.reorderLevel);

    const priorityAlerts = [
      ...lowStockIngredients.map((i) => ({
        id: `ral-ing-${i.id}`,
        priority: 'high' as const,
        module: 'inventory' as RestaurantModuleId,
        title: `Low Ingredient: ${i.name}`,
        detail: `${i.onHand} ${i.unit} remaining (reorder at ${i.reorderLevel} ${i.unit})`,
      })),
      ...ticketsInScope
        .filter((t) => t.status === 'Ready')
        .map((t) => ({
          id: `ral-kds-${t.id}`,
          priority: 'medium' as const,
          module: 'kds' as RestaurantModuleId,
          title: `Ready for Service: ${t.tableLabel}`,
          detail: `${t.ticketNumber} (${t.station}) waiting at pass`,
        })),
      ...db.shifts
        .filter((s) => inScope(s.branchId) && s.status === 'Pending Verification')
        .map((s) => ({
          id: `ral-sh-${s.id}`,
          priority: 'high' as const,
          module: 'accounts' as RestaurantModuleId,
          title: `Shift Variance Pending: ${s.shiftNumber}`,
          detail: `Variance PKR ${s.variancePkr?.toLocaleString() || 0}`,
        })),
    ];

    res.json({
      user,
      role,
      permittedModules: getPermittedRestaurantModules(user.roleId),
      stations: KITCHEN_STATIONS,
      branches: VERIFIED_BRANCHES.filter((b) => b.facilities.includes('Restaurant')),
      activeBranchScope,
      zones: db.zones.filter((z) => inScope(z.branchId)),
      tables: db.tables.filter((t) => inScope(t.branchId)),
      reservations: db.reservations.filter((r) => inScope(r.branchId)),
      menu: menuView,
      recipes: recipesView,
      ingredients: ingredientsView,
      orders: ordersInScope,
      kitchenTickets: ticketsInScope,
      supplierOrders: hasRestaurantPermission(user.roleId, 'purchasing', 'view')
        ? db.supplierOrders.filter((p) => inScope(p.branchId))
        : [],
      deals: db.deals,
      shifts: hasRestaurantPermission(user.roleId, 'accounts', 'view') || role.canCloseShift
        ? db.shifts.filter((s) => inScope(s.branchId))
        : [],
      guestCases: db.guestCases.filter((c) => inScope(c.branchId)),
      staffShifts: db.staffShifts.filter((s) => inScope(s.branchId)),
      hygieneTasks: db.hygieneTasks.filter((h) => inScope(h.branchId)),
      auditLogs: hasRestaurantPermission(user.roleId, 'settings', 'view') || user.roleId === 'restaurant_manager' || user.roleId === 'general_manager'
        ? db.auditLogs.slice(0, 60)
        : [],
      config: db.config,
      kpis: {
        dailySalesPkr: totalSalesPkr,
        ordersCount: ordersInScope.length,
        coversServed: totalGuests,
        averageBillPkr: avgBillPkr,
        activeTablesCount: db.tables.filter((t) => inScope(t.branchId) && t.status === 'Occupied').length,
        totalTablesCount: db.tables.filter((t) => inScope(t.branchId)).length,
        openKitchenTickets: ticketsInScope.filter((t) => !['Served', 'Cancelled'].includes(t.status)).length,
        readyTicketsCount: ticketsInScope.filter((t) => t.status === 'Ready').length,
        voidedOrdersCount: voidedCount,
        lowStockCount: lowStockIngredients.length,
      },
      priorityAlerts,
    });
  });

  // ==================== TABLES & FLOOR ====================
  router.post('/tables/:id/seat', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'tables', 'edit');
    if (!user) return;
    const table = db.tables.find((t) => t.id === req.params.id);
    if (!table) {
      res.status(404).json({ error: 'Table not found.' });
      return;
    }
    if (table.status !== 'Available' && table.status !== 'Reserved') {
      res.status(400).json({ error: `Table ${table.tableNumber} is currently ${table.status}.` });
      return;
    }
    const { guestCount, reservationId, waiterId } = req.body as {
      guestCount?: number;
      reservationId?: string;
      waiterId?: string;
    };
    const count = Math.max(1, Number(guestCount) || 2);
    if (count > table.capacity) {
      res.status(400).json({ error: `Party size (${count}) exceeds table capacity (${table.capacity}).` });
      return;
    }

    const waiter = db.staffUsers.find((u) => u.id === (waiterId || user.id)) || user;
    table.status = 'Occupied';
    table.guestCount = count;
    table.seatedAt = new Date().toISOString();
    table.assignedWaiterId = waiter.id;
    table.assignedWaiterName = waiter.fullName;

    if (reservationId) {
      const resv = db.reservations.find((r) => r.id === reservationId);
      if (resv) {
        resv.status = 'Seated';
        resv.assignedTableId = table.id;
        resv.assignedTableNumber = table.tableNumber;
        resv.updatedAt = new Date().toISOString();
      }
    }

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: table.branchId },
      'tables',
      'SEAT_TABLE',
      table.tableNumber,
      'Success',
      `Seated ${count} guest(s) at ${table.tableNumber}.`
    );
    res.json({ table });
  });

  router.patch('/tables/:id/status', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'tables', 'edit');
    if (!user) return;
    const table = db.tables.find((t) => t.id === req.params.id);
    if (!table) {
      res.status(404).json({ error: 'Table not found.' });
      return;
    }
    const { status, notes } = req.body as { status: TableStatus; notes?: string };
    const valid: TableStatus[] = ['Available', 'Reserved', 'Occupied', 'Awaiting Cleaning', 'Temporarily Unavailable'];
    if (!valid.includes(status)) {
      res.status(400).json({ error: 'Invalid table status.' });
      return;
    }
    if (status === 'Available' && table.activeOrderId) {
      const ord = db.orders.find((o) => o.id === table.activeOrderId);
      if (ord && !['Paid', 'Closed', 'Cancelled'].includes(ord.status)) {
        res.status(400).json({ error: `Cannot release ${table.tableNumber} while order ${ord.orderNumber} is unpaid.` });
        return;
      }
      table.activeOrderId = undefined;
      table.guestCount = undefined;
      table.seatedAt = undefined;
      table.assignedWaiterId = undefined;
      table.assignedWaiterName = undefined;
    }
    table.status = status;
    if (notes !== undefined) table.notes = notes;

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: table.branchId },
      'tables',
      'UPDATE_TABLE_STATUS',
      table.tableNumber,
      'Success',
      `Set ${table.tableNumber} status to ${status}.`
    );
    res.json({ table });
  });

  router.post('/tables/move', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'tables', 'edit');
    if (!user) return;
    const { fromTableId, toTableId } = req.body as { fromTableId: string; toTableId: string };
    const fromT = db.tables.find((t) => t.id === fromTableId);
    const toT = db.tables.find((t) => t.id === toTableId);
    if (!fromT || !toT) {
      res.status(404).json({ error: 'Source or target table not found.' });
      return;
    }
    if (toT.status !== 'Available') {
      res.status(400).json({ error: `Target table ${toT.tableNumber} is not available.` });
      return;
    }

    toT.status = 'Occupied';
    toT.guestCount = fromT.guestCount || 2;
    toT.seatedAt = fromT.seatedAt || new Date().toISOString();
    toT.assignedWaiterId = fromT.assignedWaiterId;
    toT.assignedWaiterName = fromT.assignedWaiterName;
    toT.activeOrderId = fromT.activeOrderId;

    if (fromT.activeOrderId) {
      const ord = db.orders.find((o) => o.id === fromT.activeOrderId);
      if (ord) {
        ord.tableId = toT.id;
        ord.tableNumber = toT.tableNumber;
        for (const tkt of db.kitchenTickets.filter((k) => k.orderId === ord.id)) {
          tkt.tableLabel = `Table ${toT.tableNumber}`;
        }
      }
    }

    fromT.status = 'Awaiting Cleaning';
    fromT.activeOrderId = undefined;
    fromT.guestCount = undefined;
    fromT.seatedAt = undefined;

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: toT.branchId },
      'tables',
      'MOVE_TABLE',
      `${fromT.tableNumber} -> ${toT.tableNumber}`,
      'Success',
      `Transferred guests and active order from ${fromT.tableNumber} to ${toT.tableNumber}.`
    );
    res.json({ fromTable: fromT, toTable: toT });
  });

  // ==================== RESERVATIONS ====================
  router.post('/reservations', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'reservations', 'create');
    if (!user) return;
    const { branchId, guestName, phone, date, timeSlot, partySize, specialRequests, source, assignedTableId, confirmImmediately } =
      req.body as {
        branchId?: string;
        guestName?: string;
        phone?: string;
        date?: string;
        timeSlot?: string;
        partySize?: number;
        specialRequests?: string;
        source?: 'Phone' | 'Walk-In Desk' | 'Website Inquiry';
        assignedTableId?: string;
        confirmImmediately?: boolean;
      };

    if (!guestName?.trim() || !phone?.trim() || !date || !timeSlot) {
      res.status(400).json({ error: 'Guest name, phone, date, and time slot are required.' });
      return;
    }

    const bId = branchId || 'hyderabad';
    const size = Math.max(1, Number(partySize) || 2);
    const wantsConfirm = Boolean(confirmImmediately) && hasRestaurantPermission(user.roleId, 'reservations', 'approve');

    if (assignedTableId) {
      const check = hasReservationConflict({
        existingReservations: db.reservations,
        tables: db.tables,
        branchId: bId,
        date,
        timeSlot,
        partySize: size,
        assignedTableId,
      });
      if (check.conflict) {
        res.status(409).json({ error: check.reason });
        return;
      }
    }

    const tableObj = assignedTableId ? db.tables.find((t) => t.id === assignedTableId) : undefined;
    const created = {
      id: `res-${Date.now()}`,
      reservationCode: `RES-HYD-${Math.floor(810 + Math.random() * 190)}`,
      branchId: bId,
      guestName: guestName.trim(),
      phone: phone.trim(),
      date,
      timeSlot,
      partySize: size,
      specialRequests: specialRequests?.trim() || '',
      source: source || 'Phone',
      assignedTableId: tableObj?.id,
      assignedTableNumber: tableObj?.tableNumber,
      status: wantsConfirm ? ('Confirmed' as const) : ('Requested' as const),
      createdAt: new Date().toISOString(),
      isDemoRecord: true,
    };

    if (wantsConfirm && tableObj && tableObj.status === 'Available') {
      tableObj.status = 'Reserved';
      tableObj.notes = `Reserved ${timeSlot} for ${created.guestName}`;
    }

    db.reservations.unshift(created);
    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: bId },
      'reservations',
      'CREATE_RESERVATION',
      created.reservationCode,
      'Success',
      `Created reservation (${created.status}) for ${created.guestName} (${size} guests).`
    );
    res.status(201).json({ reservation: created });
  });

  router.patch('/reservations/:id', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'reservations', 'edit');
    if (!user) return;
    const resv = db.reservations.find((r) => r.id === req.params.id);
    if (!resv) {
      res.status(404).json({ error: 'Reservation not found.' });
      return;
    }
    const { status, assignedTableId } = req.body as {
      status?: typeof resv.status;
      assignedTableId?: string;
    };

    const nextTableId = assignedTableId ?? resv.assignedTableId;
    if (status === 'Confirmed' || status === 'Seated') {
      if (!nextTableId) {
        res.status(400).json({ error: 'Assign an available table before confirming or seating a reservation.' });
        return;
      }
      const check = hasReservationConflict({
        existingReservations: db.reservations,
        tables: db.tables,
        branchId: resv.branchId,
        date: resv.date,
        timeSlot: resv.timeSlot,
        partySize: resv.partySize,
        assignedTableId: nextTableId,
        excludeReservationId: resv.id,
      });
      if (check.conflict) {
        res.status(409).json({ error: check.reason });
        return;
      }
    }

    if (nextTableId) {
      const tbl = db.tables.find((t) => t.id === nextTableId);
      if (tbl) {
        resv.assignedTableId = tbl.id;
        resv.assignedTableNumber = tbl.tableNumber;
        if (status === 'Confirmed' && tbl.status === 'Available') {
          tbl.status = 'Reserved';
          tbl.notes = `Reserved ${resv.timeSlot} for ${resv.guestName}`;
        } else if (status === 'Seated') {
          tbl.status = 'Occupied';
          tbl.guestCount = resv.partySize;
          tbl.seatedAt = new Date().toISOString();
        } else if ((status === 'Cancelled' || status === 'No-show') && tbl.status === 'Reserved') {
          tbl.status = 'Available';
          tbl.notes = undefined;
        }
      }
    }
    if (status) resv.status = status;
    resv.updatedAt = new Date().toISOString();

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: resv.branchId },
      'reservations',
      'UPDATE_RESERVATION',
      resv.reservationCode,
      'Success',
      `Updated reservation ${resv.reservationCode} to ${resv.status}.`
    );
    res.json({ reservation: resv });
  });

  // ==================== POS ORDERS & KITCHEN ROUTING ====================
  const dispatchKitchenTickets = (order: typeof db.orders[number], newLines: RestaurantOrderLine[], version: number) => {
    const byStation = new Map<KitchenStationId, RestaurantOrderLine[]>();
    for (const line of newLines) {
      const list = byStation.get(line.station) || [];
      list.push(line);
      byStation.set(line.station, list);
    }

    const createdTickets = [];
    for (const [station, lines] of byStation.entries()) {
      const idempotencyKey = `kds-${order.id}-v${version}-${station}`;
      if (processedKdsKeys.has(idempotencyKey)) {
        continue;
      }
      processedKdsKeys.add(idempotencyKey);
      const tkt = {
        id: `kds-${Date.now()}-${station}-${Math.floor(Math.random() * 1000)}`,
        ticketNumber: `KDS-${order.orderNumber.split('-').pop()}-V${version}-${station.slice(0, 3).toUpperCase()}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        version,
        branchId: order.branchId,
        tableLabel: order.tableNumber ? `Table ${order.tableNumber}` : order.serviceType,
        serviceType: order.serviceType,
        station,
        priority: 'Normal' as const,
        status: 'New Order' as const,
        items: lines.map((l) => ({
          lineId: l.lineId,
          dishId: l.dishId,
          dishName: l.dishName,
          portionLabel: l.portionLabel,
          quantity: l.quantity,
          modifiers: l.modifiers.map((m) => m.label),
          prepNotes: l.prepNotes,
          status: 'Queued' as OrderLineStatus,
        })),
        createdAt: new Date().toISOString(),
        idempotencyKey,
      };
      db.kitchenTickets.unshift(tkt);
      createdTickets.push(tkt);
    }
    return createdTickets;
  };

  router.post('/orders', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'pos', 'create');
    if (!user) return;
    const { branchId, serviceType, tableId, guestCount, items, idempotencyKey } = req.body as {
      branchId?: string;
      serviceType?: 'Dine-In' | 'Takeaway' | 'Delivery';
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
    };

    const sType = serviceType || 'Dine-In';
    if (sType === 'Delivery' && !db.config.deliveryEnabled) {
      res.status(400).json({ error: 'Delivery channel is not enabled in Restaurant MIS Settings.' });
      return;
    }
    if (sType === 'Takeaway' && !db.config.takeawayEnabled) {
      res.status(400).json({ error: 'Takeaway channel is not enabled in Restaurant MIS Settings.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'At least one dish is required to open an order.' });
      return;
    }

    const bId = branchId || 'hyderabad';
    const orderId = `rord-${Date.now()}`;
    const orderNumber = `RST-2026-${410 + db.orders.length}`;

    let tableObj = tableId ? db.tables.find((t) => t.id === tableId && t.branchId === bId) : undefined;
    if (sType === 'Dine-In' && !tableObj) {
      res.status(400).json({ error: 'Please select a dining table for Dine-In orders.' });
      return;
    }
    if (tableObj && tableObj.status === 'Temporarily Unavailable') {
      res.status(400).json({ error: `Table ${tableObj.tableNumber} is temporarily unavailable.` });
      return;
    }

    const builtLines: RestaurantOrderLine[] = [];
    for (let idx = 0; idx < items.length; idx++) {
      const reqLine = items[idx];
      const dish = db.menu.find((m) => m.id === reqLine.dishId);
      if (!dish) {
        res.status(404).json({ error: `Dish ${reqLine.dishId} not found.` });
        return;
      }
      if (!dish.available) {
        res.status(400).json({ error: `"${dish.name}" is currently unavailable (${dish.manualUnavailableReason || '86d'}).` });
        return;
      }
      const portion = dish.portions.find((p) => p.id === reqLine.portionId) || dish.portions[0];
      const mods = (reqLine.modifierIds || [])
        .map((mid) => dish.modifiers.find((m) => m.id === mid))
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .map((m) => ({ label: m.label, priceDeltaPkr: m.priceDeltaPkr }));
      const qty = Math.max(1, Math.floor(Number(reqLine.quantity) || 1));
      const lineTotalPkr = computeOrderLineTotal(portion.pricePkr, qty, mods);

      builtLines.push({
        lineId: `rl-${Date.now()}-${idx}`,
        dishId: dish.id,
        dishName: dish.name,
        portionLabel: portion.label,
        quantity: qty,
        unitPricePkr: portion.pricePkr,
        modifiers: mods,
        prepNotes: reqLine.prepNotes?.trim() || undefined,
        station: dish.station,
        ticketVersion: 1,
        kitchenStatus: 'Queued',
        lineTotalPkr,
        ingredientsDeducted: false,
      });
    }

    const totals = computeRestaurantOrderTotals({
      items: builtLines,
      discountPercent: 0,
      serviceChargeRatePercent: sType === 'Dine-In' ? db.config.serviceChargeRatePercent : 0,
      taxRatePercent: db.config.taxRatePercent,
    });

    const newOrder = {
      id: orderId,
      orderNumber,
      branchId: bId,
      serviceType: sType,
      tableId: tableObj?.id,
      tableNumber: tableObj?.tableNumber,
      waiterId: user.id,
      waiterName: user.fullName,
      guestCount: Math.max(1, Number(guestCount) || tableObj?.guestCount || 2),
      items: builtLines,
      ...totals,
      discountPercent: 0,
      paidTotalPkr: 0,
      status: 'In Kitchen' as const,
      payments: [],
      ticketVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDemoRecord: true,
    };

    // Deduct ingredients atomically once for new lines & sync dish availability
    deductIngredientsForOrderLines(
      newOrder.items,
      db.recipes,
      db.ingredients.filter((i) => i.branchId === bId)
    );
    syncMenuAvailabilityFromStock(bId);

    if (tableObj) {
      tableObj.status = 'Occupied';
      tableObj.activeOrderId = newOrder.id;
      tableObj.assignedWaiterId = user.id;
      tableObj.assignedWaiterName = user.fullName;
      tableObj.guestCount = newOrder.guestCount;
      if (!tableObj.seatedAt) tableObj.seatedAt = new Date().toISOString();
    }

    db.orders.unshift(newOrder);
    const createdTickets = dispatchKitchenTickets(newOrder, builtLines, 1);

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: bId },
      'pos',
      'OPEN_ORDER',
      newOrder.orderNumber,
      'Success',
      `Opened ${sType} order ${newOrder.orderNumber} (${builtLines.length} lines, ${createdTickets.length} KDS tickets).${idempotencyKey ? ` [${idempotencyKey}]` : ''}`
    );

    res.status(201).json({ order: newOrder, kitchenTickets: createdTickets });
  });

  router.post('/orders/:id/items', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'pos', 'edit');
    if (!user) return;
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    if (['Closed', 'Cancelled', 'Paid'].includes(order.status)) {
      res.status(400).json({ error: `Cannot add items to order in "${order.status}" state.` });
      return;
    }

    const { items, additionKey } = req.body as {
      items: { dishId: string; portionId?: string; quantity: number; modifierIds?: string[]; prepNotes?: string }[];
      additionKey?: string;
    };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Provide at least one dish to add.' });
      return;
    }

    const nextVersion = order.ticketVersion + 1;
    const addedLines: RestaurantOrderLine[] = [];
    for (let idx = 0; idx < items.length; idx++) {
      const reqLine = items[idx];
      const dish = db.menu.find((m) => m.id === reqLine.dishId);
      if (!dish) {
        res.status(404).json({ error: `Dish ${reqLine.dishId} not found.` });
        return;
      }
      if (!dish.available) {
        res.status(400).json({ error: `"${dish.name}" is currently unavailable.` });
        return;
      }
      const portion = dish.portions.find((p) => p.id === reqLine.portionId) || dish.portions[0];
      const mods = (reqLine.modifierIds || [])
        .map((mid) => dish.modifiers.find((m) => m.id === mid))
        .filter((m): m is NonNullable<typeof m> => Boolean(m))
        .map((m) => ({ label: m.label, priceDeltaPkr: m.priceDeltaPkr }));
      const qty = Math.max(1, Math.floor(Number(reqLine.quantity) || 1));

      addedLines.push({
        lineId: `rl-${Date.now()}-${idx}`,
        dishId: dish.id,
        dishName: dish.name,
        portionLabel: portion.label,
        quantity: qty,
        unitPricePkr: portion.pricePkr,
        modifiers: mods,
        prepNotes: reqLine.prepNotes?.trim() || undefined,
        station: dish.station,
        ticketVersion: nextVersion,
        kitchenStatus: 'Queued',
        lineTotalPkr: computeOrderLineTotal(portion.pricePkr, qty, mods),
        ingredientsDeducted: false,
      });
    }

    order.items.push(...addedLines);
    order.ticketVersion = nextVersion;
    order.status = 'In Kitchen';
    order.updatedAt = new Date().toISOString();

    const totals = computeRestaurantOrderTotals({
      items: order.items,
      discountPercent: order.discountPercent,
      serviceChargeRatePercent: order.serviceType === 'Dine-In' ? db.config.serviceChargeRatePercent : 0,
      taxRatePercent: db.config.taxRatePercent,
    });
    Object.assign(order, totals);

    // Deducts ONLY newly added lines (ingredientsDeducted === false)
    deductIngredientsForOrderLines(
      order.items,
      db.recipes,
      db.ingredients.filter((i) => i.branchId === order.branchId)
    );
    syncMenuAvailabilityFromStock(order.branchId);

    const createdTickets = dispatchKitchenTickets(order, addedLines, nextVersion);
    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: order.branchId },
      'pos',
      'ADD_ORDER_ITEMS',
      order.orderNumber,
      'Success',
      `Added ${addedLines.length} item(s) on Ticket v${nextVersion}${additionKey ? ` [${additionKey}]` : ''}.`
    );

    res.json({ order, kitchenTickets: createdTickets });
  });

  router.patch('/orders/:id/discount', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'pos', 'edit');
    if (!user) return;
    const role = RESTAURANT_ROLES[user.roleId];
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const { discountPercent, reason } = req.body as { discountPercent: number; reason: string };
    const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0));
    if (pct > role.maxDiscountPercent) {
      res.status(403).json({
        error: `Role "${role.label}" discount cap is ${role.maxDiscountPercent}%. Supervisor or Manager approval required for ${pct}%.`,
      });
      return;
    }
    if (pct > 0 && !reason?.trim()) {
      res.status(400).json({ error: 'Discount reason is required for audit compliance.' });
      return;
    }
    order.discountPercent = pct;
    order.discountReason = reason?.trim() || undefined;
    order.authorizedByName = user.fullName;
    const totals = computeRestaurantOrderTotals({
      items: order.items,
      discountPercent: pct,
      serviceChargeRatePercent: order.serviceType === 'Dine-In' ? db.config.serviceChargeRatePercent : 0,
      taxRatePercent: db.config.taxRatePercent,
    });
    Object.assign(order, totals);
    order.updatedAt = new Date().toISOString();

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: role.label, branchId: order.branchId },
      'pos',
      'APPLY_DISCOUNT',
      order.orderNumber,
      'Success',
      `Applied ${pct}% discount (${reason?.trim() || 'cleared'}).`
    );
    res.json({ order });
  });

  router.post('/orders/:id/pay', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'pos', 'submit');
    if (!user) return;
    const role = RESTAURANT_ROLES[user.roleId];
    if (!role.canMarkOrderPaid) {
      addAudit(
        { id: user.id, fullName: user.fullName, roleLabel: role.label, branchId: user.branchId },
        'pos',
        'PAYMENT_ATTEMPT',
        req.params.id,
        'Denied',
        `Role "${role.label}" is blocked from marking financial payments.`
      );
      res.status(403).json({
        error: `Forbidden: "${role.label}" cannot accept payments or mark orders as paid.`,
      });
      return;
    }

    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    if (order.status === 'Cancelled') {
      res.status(400).json({ error: 'Cancelled orders cannot be paid.' });
      return;
    }

    const { method, amountPkr, splitLabel, simulateFailure, closeTable } = req.body as {
      method: 'Cash' | 'Card' | 'Wallet';
      amountPkr: number;
      splitLabel?: string;
      simulateFailure?: boolean;
      closeTable?: boolean;
    };

    const payAmount = Math.round(Number(amountPkr) || 0);
    if (payAmount <= 0) {
      res.status(400).json({ error: 'Payment amount must be greater than PKR 0.' });
      return;
    }

    if (simulateFailure) {
      order.payments.push({
        id: `rpay-${Date.now()}`,
        splitLabel: splitLabel?.trim() || 'Terminal Attempt',
        method,
        amountPkr: payAmount,
        status: 'Failed',
        paidAt: new Date().toISOString(),
        processedByName: user.fullName,
      });
      res.status(402).json({
        error: 'Card terminal declined / timed out. Order remains open for retry or alternate tender.',
        order,
      });
      return;
    }

    const remaining = Math.max(0, order.grandTotalPkr - order.paidTotalPkr);
    const appliedAmount = Math.min(payAmount, remaining || payAmount);

    order.payments.push({
      id: `rpay-${Date.now()}`,
      splitLabel: splitLabel?.trim() || (appliedAmount < order.grandTotalPkr ? 'Split Payment' : 'Full Settlement'),
      method,
      amountPkr: appliedAmount,
      status: 'Paid',
      reference: `RCP-${order.orderNumber}-${order.payments.length + 1}`,
      paidAt: new Date().toISOString(),
      processedByName: user.fullName,
    });
    order.paidTotalPkr += appliedAmount;
    order.updatedAt = new Date().toISOString();

    if (order.paidTotalPkr >= order.grandTotalPkr) {
      order.status = closeTable ? 'Closed' : 'Paid';
      if (closeTable) order.closedAt = new Date().toISOString();
      if (order.tableId) {
        const tbl = db.tables.find((t) => t.id === order.tableId);
        if (tbl && closeTable) {
          tbl.status = 'Awaiting Cleaning';
          tbl.activeOrderId = undefined;
          tbl.guestCount = undefined;
          tbl.seatedAt = undefined;
        }
      }
    } else {
      order.status = 'Billed';
    }

    // Post to active open cashier shift
    const activeShift = db.shifts.find((s) => s.branchId === order.branchId && s.status === 'Open');
    if (activeShift) {
      if (method === 'Cash') {
        activeShift.cashSalesPkr += appliedAmount;
        activeShift.expectedCashPkr = activeShift.openingFloatPkr + activeShift.cashSalesPkr - activeShift.refundsPkr;
      } else {
        activeShift.cardSalesPkr += appliedAmount;
      }
    }

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: role.label, branchId: order.branchId },
      'pos',
      'RECORD_PAYMENT',
      order.orderNumber,
      'Success',
      `Accepted ${method} PKR ${appliedAmount.toLocaleString()} (${splitLabel || 'Full'}).`
    );

    res.json({ order, shift: activeShift });
  });

  router.post('/orders/:id/void', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'pos', 'cancel');
    if (!user) return;
    const role = RESTAURANT_ROLES[user.roleId];
    if (!role.canApproveVoidOrDiscount) {
      res.status(403).json({
        error: `Forbidden: "${role.label}" does not hold authorization to void orders.`,
      });
      return;
    }
    const order = db.orders.find((o) => o.id === req.params.id);
    if (!order) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    const { reason } = req.body as { reason?: string };
    if (!reason?.trim()) {
      res.status(400).json({ error: 'Void reason is mandatory for audit compliance.' });
      return;
    }
    order.status = 'Cancelled';
    order.voidReason = reason.trim();
    order.authorizedByName = user.fullName;
    order.closedAt = new Date().toISOString();
    for (const l of order.items) l.kitchenStatus = 'Cancelled';
    for (const t of db.kitchenTickets.filter((k) => k.orderId === order.id)) {
      t.status = 'Cancelled';
    }
    if (order.tableId) {
      const tbl = db.tables.find((t) => t.id === order.tableId);
      if (tbl) {
        tbl.status = 'Available';
        tbl.activeOrderId = undefined;
        tbl.guestCount = undefined;
      }
    }
    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: role.label, branchId: order.branchId },
      'pos',
      'VOID_ORDER',
      order.orderNumber,
      'Success',
      `Voided order ${order.orderNumber}: ${reason.trim()}`
    );
    res.json({ order });
  });

  // ==================== KITCHEN DISPLAY SYSTEM ====================
  router.patch('/kds/:ticketId/status', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = req.restUser!;
    const role = RESTAURANT_ROLES[user.roleId];
    // Allow KDS edit OR Food Runner verify
    if (!hasRestaurantPermission(user.roleId, 'kds', 'edit') && !hasRestaurantPermission(user.roleId, 'kds', 'verify')) {
      res.status(403).json({ error: `Role "${role.label}" is not permitted to update kitchen tickets.` });
      return;
    }
    const ticket = db.kitchenTickets.find((t) => t.id === req.params.ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Kitchen ticket not found.' });
      return;
    }
    const assignedStation = user.assignedStation || role.assignedStation;
    if (user.roleId === 'station_chef' && assignedStation && ticket.station !== assignedStation) {
      res.status(403).json({
        error: `Station scope: you are assigned to ${assignedStation}, not ${ticket.station}.`,
      });
      return;
    }

    const { status, delayReason } = req.body as { status: KitchenTicketStatus; delayReason?: string };
    const now = new Date().toISOString();
    ticket.status = status;
    if (status === 'Accepted' && !ticket.acceptedAt) ticket.acceptedAt = now;
    if (status === 'Ready') ticket.readyAt = now;
    if (status === 'Served') ticket.servedAt = now;
    if (status === 'Delayed' && delayReason) ticket.delayReason = delayReason;

    const lineMap: Record<KitchenTicketStatus, OrderLineStatus> = {
      'New Order': 'Queued',
      Accepted: 'Accepted',
      Preparing: 'Preparing',
      Ready: 'Ready',
      Served: 'Served',
      Delayed: 'Preparing',
      Cancelled: 'Cancelled',
    };
    const mappedLineStatus = lineMap[status];
    for (const ti of ticket.items) ti.status = mappedLineStatus;

    const parentOrder = db.orders.find((o) => o.id === ticket.orderId);
    if (parentOrder) {
      const lineIds = new Set(ticket.items.map((i) => i.lineId));
      for (const ol of parentOrder.items) {
        if (lineIds.has(ol.lineId)) {
          ol.kitchenStatus = mappedLineStatus;
        }
      }
      const activeLines = parentOrder.items.filter((i) => i.kitchenStatus !== 'Cancelled');
      if (activeLines.length > 0 && activeLines.every((i) => i.kitchenStatus === 'Served')) {
        if (!['Paid', 'Closed', 'Cancelled'].includes(parentOrder.status)) {
          parentOrder.status = 'Served';
        }
      } else if (activeLines.some((i) => i.kitchenStatus === 'Ready')) {
        if (!['Paid', 'Closed', 'Cancelled'].includes(parentOrder.status)) {
          parentOrder.status = 'Ready for Service';
        }
      }
      parentOrder.updatedAt = now;
    }

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: role.label, branchId: ticket.branchId },
      'kds',
      'KDS_STATUS',
      ticket.ticketNumber,
      'Success',
      `Updated ${ticket.ticketNumber} (${ticket.station}) to ${status}.`
    );

    res.json({ ticket, order: parentOrder });
  });

  // ==================== MENU & FOOD INVENTORY ====================
  router.patch('/menu/:id/availability', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'menu', 'edit');
    if (!user) return;
    const dish = db.menu.find((m) => m.id === req.params.id);
    if (!dish) {
      res.status(404).json({ error: 'Dish not found.' });
      return;
    }
    const { available, reason } = req.body as { available: boolean; reason?: string };
    dish.available = Boolean(available);
    dish.manualUnavailableReason = dish.available ? undefined : reason?.trim() || 'Marked temporarily unavailable by kitchen';
    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: user.branchId },
      'menu',
      'DISH_AVAILABILITY',
      dish.name,
      'Success',
      `Set ${dish.name} available=${dish.available}.`
    );
    res.json({ dish });
  });

  router.post('/inventory/waste', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'inventory', 'edit');
    if (!user) return;
    const { ingredientId, wasteQty, reason } = req.body as {
      ingredientId: string;
      wasteQty: number;
      reason?: string;
    };
    const ing = db.ingredients.find((i) => i.id === ingredientId);
    if (!ing) {
      res.status(404).json({ error: 'Ingredient not found.' });
      return;
    }
    const qty = Math.max(0, Number(wasteQty) || 0);
    if (qty <= 0) {
      res.status(400).json({ error: 'Waste quantity must be positive.' });
      return;
    }
    ing.onHand = Math.max(0, Number((ing.onHand - qty).toFixed(3)));
    ing.wasteQty = Number((ing.wasteQty + qty).toFixed(3));
    syncMenuAvailabilityFromStock(ing.branchId);

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: ing.branchId },
      'inventory',
      'LOG_WASTE',
      ing.name,
      'Success',
      `Logged ${qty} ${ing.unit} waste (${reason || 'Prep/Spoilage'}).`
    );
    res.json({ ingredient: ing });
  });

  router.post('/inventory/count', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'inventory', 'edit');
    if (!user) return;
    const { ingredientId, physicalQty } = req.body as { ingredientId: string; physicalQty: number };
    const ing = db.ingredients.find((i) => i.id === ingredientId);
    if (!ing) {
      res.status(404).json({ error: 'Ingredient not found.' });
      return;
    }
    const nextQty = Math.max(0, Number(physicalQty));
    if (!Number.isFinite(nextQty)) {
      res.status(400).json({ error: 'Invalid physical quantity.' });
      return;
    }
    ing.onHand = nextQty;
    syncMenuAvailabilityFromStock(ing.branchId);
    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: ing.branchId },
      'inventory',
      'STOCK_COUNT',
      ing.name,
      'Success',
      `Updated physical stock count to ${nextQty} ${ing.unit}.`
    );
    res.json({ ingredient: ing });
  });

  // ==================== PURCHASING & INTER-BUSINESS SUPERMARKET REQUEST ====================
  router.post('/purchasing/orders', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'purchasing', 'create');
    if (!user) return;
    const { branchId, supplierName, type, ingredientId, orderedQty } = req.body as {
      branchId?: string;
      supplierName?: string;
      type: 'External Supplier' | 'Supermarket Inter-Business Transfer';
      ingredientId: string;
      orderedQty: number;
    };
    const ing = db.ingredients.find((i) => i.id === ingredientId);
    if (!ing) {
      res.status(404).json({ error: 'Ingredient not found.' });
      return;
    }
    const qty = Math.max(1, Number(orderedQty) || 1);
    const totalCostPkr = Math.round(qty * ing.unitCostPkr);
    const created = {
      id: `rpo-${Date.now()}`,
      poNumber: `RPO-2026-${100 + db.supplierOrders.length}`,
      branchId: branchId || ing.branchId,
      supplierName:
        type === 'Supermarket Inter-Business Transfer'
          ? 'Marhaba Supermarket Warehouse (Inter-Business Request)'
          : supplierName?.trim() || 'Authorized Culinary Supplier',
      type,
      items: [
        {
          ingredientId: ing.id,
          ingredientName: ing.name,
          orderedQty: qty,
          receivedQty: 0,
          unit: ing.unit,
          unitCostPkr: ing.unitCostPkr,
        },
      ],
      totalCostPkr,
      status: 'Ordered' as const,
      createdByName: user.fullName,
      createdAt: new Date().toISOString(),
    };
    db.supplierOrders.unshift(created);

    // Emit controlled inter-business contract instead of mutating Supermarket stock
    let interBizReq: InterBusinessRequest | undefined;
    if (type === 'Supermarket Inter-Business Transfer' && options.onInterBusinessRequest) {
      interBizReq = options.onInterBusinessRequest({
        sourceSystem: 'restaurant',
        targetSystem: 'supermarket',
        branchId: created.branchId,
        category: 'Ingredient Transfer',
        title: `Restaurant Ingredient Request: ${ing.name}`,
        itemsSummary: `${qty} ${ing.unit} × ${ing.name}`,
        estimatedAmountPkr: totalCostPkr,
        requestedByName: user.fullName,
        referenceId: created.poNumber,
      });
    }

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: created.branchId },
      'purchasing',
      'CREATE_PURCHASE_ORDER',
      created.poNumber,
      'Success',
      `Created ${type} ${created.poNumber} for ${qty} ${ing.unit} ${ing.name}.`
    );

    res.status(201).json({ supplierOrder: created, interBusinessRequest: interBizReq });
  });

  router.post('/purchasing/orders/:id/receive', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'purchasing', 'verify');
    if (!user) return;
    const po = db.supplierOrders.find((p) => p.id === req.params.id);
    if (!po) {
      res.status(404).json({ error: 'Purchase order not found.' });
      return;
    }
    const { receivedQty, discrepancyNote } = req.body as { receivedQty?: number; discrepancyNote?: string };
    const line = po.items[0];
    const rQty = Math.max(0, receivedQty !== undefined ? Number(receivedQty) : line.orderedQty);
    line.receivedQty = rQty;
    po.status = rQty < line.orderedQty ? 'Discrepancy Flagged' : 'Received';
    po.receivedByName = user.fullName;
    if (discrepancyNote) po.discrepancyNote = discrepancyNote;

    const ing = db.ingredients.find((i) => i.id === line.ingredientId);
    if (ing) {
      ing.onHand = Number((ing.onHand + rQty).toFixed(3));
      // Re-enable dishes if ingredients are now sufficient
      for (const dish of db.menu) {
        const rec = db.recipes.find((r) => r.id === dish.recipeId);
        const check = checkDishIngredientAvailability(rec, db.ingredients.filter((i) => i.branchId === ing.branchId), 1);
        if (check.available && dish.manualUnavailableReason?.startsWith('Auto-unavailable')) {
          dish.available = true;
          dish.manualUnavailableReason = undefined;
        }
      }
    }

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: po.branchId },
      'purchasing',
      'RECEIVE_PO',
      po.poNumber,
      'Success',
      `Received ${rQty} / ${line.orderedQty} ${line.unit} for ${po.poNumber}.`
    );
    res.json({ supplierOrder: po });
  });

  // ==================== CASHIER SHIFTS & ACCOUNTS CLOSING ====================
  router.post('/accounts/shifts/open', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = req.restUser!;
    const role = RESTAURANT_ROLES[user.roleId];
    if (!role.canCloseShift) {
      res.status(403).json({ error: `Role "${role.label}" cannot open a cashier shift.` });
      return;
    }
    const { branchId, openingFloatPkr } = req.body as { branchId?: string; openingFloatPkr?: number };
    const bId = branchId || 'hyderabad';
    const created = {
      id: `rsh-${Date.now()}`,
      shiftNumber: `RSH-${bId.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
      branchId: bId,
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

  router.post('/accounts/shifts/:id/close', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = req.restUser!;
    const role = RESTAURANT_ROLES[user.roleId];
    if (!role.canCloseShift) {
      res.status(403).json({ error: `Role "${role.label}" cannot close a cashier shift.` });
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
    const calc = computeRestaurantShiftClosing({
      openingFloatPkr: shift.openingFloatPkr,
      cashSalesPkr: shift.cashSalesPkr,
      refundsPkr: shift.refundsPkr,
      declaredCashPkr: declared,
    });
    shift.declaredCashPkr = declared;
    shift.expectedCashPkr = calc.expectedCashPkr;
    shift.variancePkr = calc.variancePkr;
    shift.closedAt = new Date().toISOString();
    shift.status = 'Pending Verification';

    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: role.label, branchId: shift.branchId },
      'accounts',
      'CLOSE_SHIFT',
      shift.shiftNumber,
      'Success',
      `Closed shift ${shift.shiftNumber} with declared PKR ${declared.toLocaleString()} (variance PKR ${calc.variancePkr}).`
    );
    res.json({ shift });
  });

  router.post('/accounts/shifts/:id/verify', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'accounts', 'verify');
    if (!user) return;
    const shift = db.shifts.find((s) => s.id === req.params.id);
    if (!shift) {
      res.status(404).json({ error: 'Shift not found.' });
      return;
    }
    if (shift.cashierUserId === user.id && user.roleId === 'restaurant_cashier') {
      res.status(403).json({ error: 'Segregation of duties: cashier cannot verify their own shift closing.' });
      return;
    }
    shift.status = 'Posted to Accounts';
    shift.verifiedByName = user.fullName;
    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: shift.branchId },
      'accounts',
      'VERIFY_SHIFT',
      shift.shiftNumber,
      'Success',
      `Verified & posted shift ${shift.shiftNumber} to Restaurant Accounts.`
    );
    res.json({ shift });
  });

  // ==================== DEALS, GUEST CARE, HYGIENE & SETTINGS ====================
  router.post('/deals', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'deals', 'create');
    if (!user) return;
    const { title, description, discountPercent, applicableWindow } = req.body as {
      title: string;
      description: string;
      discountPercent: number;
      applicableWindow: string;
    };
    if (!title?.trim()) {
      res.status(400).json({ error: 'Deal title is required.' });
      return;
    }
    const deal = {
      id: `rdeal-${Date.now()}`,
      title: title.trim(),
      description: description?.trim() || '',
      discountPercent: Math.max(0, Math.min(50, Number(discountPercent) || 0)),
      applicableWindow: applicableWindow?.trim() || 'Daily · Dinner Hours',
      active: true,
      approvalStatus: hasRestaurantPermission(user.roleId, 'deals', 'approve')
        ? ('Approved' as const)
        : ('Pending Approval' as const),
      isDemoRecord: true,
    };
    db.deals.unshift(deal);
    res.status(201).json({ deal });
  });

  router.post('/customers/cases', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'customers', 'create');
    if (!user) return;
    const { guestName, phone, orderNumber, category, priority, notes } = req.body as {
      guestName: string;
      phone: string;
      orderNumber?: string;
      category: 'Service Inquiry' | 'Food Quality' | 'Billing Issue' | 'Special Event Request';
      priority: 'Normal' | 'High';
      notes: string;
    };
    if (!guestName?.trim() || !notes?.trim()) {
      res.status(400).json({ error: 'Guest name and notes are required.' });
      return;
    }
    const created = {
      id: `rgc-${Date.now()}`,
      caseNumber: `RGC-2026-${20 + db.guestCases.length}`,
      branchId: 'hyderabad',
      guestName: guestName.trim(),
      phone: phone?.trim() || '0300-***-000',
      orderNumber: orderNumber?.trim() || undefined,
      category: category || 'Service Inquiry',
      priority: priority || 'Normal',
      status: 'Open' as const,
      notes: notes.trim(),
      assignedTo: user.fullName,
      createdAt: new Date().toISOString(),
    };
    db.guestCases.unshift(created);
    res.status(201).json({ guestCase: created });
  });

  router.patch('/staff/hygiene/:id', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'staff', 'edit');
    if (!user) return;
    const item = db.hygieneTasks.find((h) => h.id === req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Hygiene task not found.' });
      return;
    }
    item.completed = !item.completed;
    item.completedBy = item.completed ? user.fullName : undefined;
    item.completedAt = item.completed ? new Date().toISOString() : undefined;
    res.json({ hygieneTask: item });
  });

  router.patch('/settings/config', requireRestaurantAuth, (req: RestaurantAuthedRequest, res) => {
    const user = checkPerm(req, res, 'settings', 'administer');
    if (!user) return;
    const { serviceChargeRatePercent, taxRatePercent, takeawayEnabled, deliveryEnabled } = req.body as Partial<
      typeof db.config
    >;
    if (serviceChargeRatePercent !== undefined) db.config.serviceChargeRatePercent = Math.max(0, Math.min(20, Number(serviceChargeRatePercent)));
    if (taxRatePercent !== undefined) db.config.taxRatePercent = Math.max(0, Math.min(25, Number(taxRatePercent)));
    if (takeawayEnabled !== undefined) db.config.takeawayEnabled = Boolean(takeawayEnabled);
    if (deliveryEnabled !== undefined) db.config.deliveryEnabled = Boolean(deliveryEnabled);
    addAudit(
      { id: user.id, fullName: user.fullName, roleLabel: RESTAURANT_ROLES[user.roleId].label, branchId: 'all' },
      'settings',
      'UPDATE_CONFIG',
      'Restaurant Config',
      'Success',
      `Updated service charge (${db.config.serviceChargeRatePercent}%), tax (${db.config.taxRatePercent}%), takeaway=${db.config.takeawayEnabled}, delivery=${db.config.deliveryEnabled}.`
    );
    res.json({ config: db.config });
  });

  return { router, db };
}
