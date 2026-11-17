import type {
  DiningTable,
  FoodIngredient,
  RestaurantOrderLine,
  RestaurantRecipe,
  TableReservation,
} from './types';

export function computeOrderLineTotal(
  unitPricePkr: number,
  quantity: number,
  modifiers: { priceDeltaPkr: number }[]
): number {
  const modsSum = modifiers.reduce((s, m) => s + m.priceDeltaPkr, 0);
  return Math.max(0, Math.round((unitPricePkr + modsSum) * quantity));
}

export function computeRestaurantOrderTotals(params: {
  items: RestaurantOrderLine[];
  discountPercent: number;
  serviceChargeRatePercent?: number; // e.g., 5% if configured
  taxRatePercent?: number; // e.g., 13% Sindh Sales Tax (Demo Configurable)
}) {
  const activeLines = params.items.filter((i) => i.kitchenStatus !== 'Cancelled');
  const subtotalPkr = activeLines.reduce((sum, l) => sum + l.lineTotalPkr, 0);
  const clampedDisc = Math.max(0, Math.min(100, params.discountPercent || 0));
  const discountAmountPkr = Math.round((subtotalPkr * clampedDisc) / 100);
  const netAfterDisc = Math.max(0, subtotalPkr - discountAmountPkr);
  const svcRate = params.serviceChargeRatePercent ?? 5;
  const taxRate = params.taxRatePercent ?? 13;
  const serviceChargePkr = Math.round((netAfterDisc * svcRate) / 100);
  const taxAmountPkr = Math.round((netAfterDisc * taxRate) / 100);
  const grandTotalPkr = netAfterDisc + serviceChargePkr + taxAmountPkr;
  return {
    subtotalPkr,
    discountAmountPkr,
    serviceChargePkr,
    taxAmountPkr,
    grandTotalPkr,
  };
}

export function computeSplitCheckByGuests(grandTotalPkr: number, guestSplitCount: number): number[] {
  const count = Math.max(1, Math.floor(guestSplitCount));
  const base = Math.floor(grandTotalPkr / count);
  const remainder = grandTotalPkr - base * count;
  return Array.from({ length: count }, (_, idx) => (idx === 0 ? base + remainder : base));
}

export function computeRecipeFoodCost(
  recipe: Pick<RestaurantRecipe, 'ingredients' | 'yieldPortions'>,
  ingredientsCatalog: FoodIngredient[]
): number {
  let totalBatchCost = 0;
  for (const line of recipe.ingredients) {
    const ing = ingredientsCatalog.find((i) => i.id === line.ingredientId);
    if (!ing) continue;
    const lossFactor = 1 + Math.max(0, line.prepLossPercent || 0) / 100;
    // Normalize g->kg or ml->L if catalog unit differs
    let qtyInIngUnit = line.quantityPerServing * lossFactor;
    if (line.unit === 'g' && ing.unit === 'kg') qtyInIngUnit /= 1000;
    else if (line.unit === 'ml' && ing.unit === 'L') qtyInIngUnit /= 1000;
    else if (line.unit === 'kg' && ing.unit === 'g') qtyInIngUnit *= 1000;
    else if (line.unit === 'L' && ing.unit === 'ml') qtyInIngUnit *= 1000;
    totalBatchCost += qtyInIngUnit * ing.unitCostPkr;
  }
  const yieldCount = Math.max(1, recipe.yieldPortions || 1);
  return Math.round(totalBatchCost / yieldCount);
}

/**
 * Checks whether sufficient ingredient stock exists for a recipe & quantity.
 */
export function checkDishIngredientAvailability(
  recipe: RestaurantRecipe | undefined,
  ingredientsInBranch: FoodIngredient[],
  requestedQty = 1
): { available: boolean; missingIngredients: string[] } {
  if (!recipe) return { available: true, missingIngredients: [] };
  const missing: string[] = [];
  for (const line of recipe.ingredients) {
    const ing = ingredientsInBranch.find((i) => i.id === line.ingredientId);
    if (!ing) {
      missing.push(line.ingredientName);
      continue;
    }
    let needed = line.quantityPerServing * requestedQty;
    if (line.unit === 'g' && ing.unit === 'kg') needed /= 1000;
    else if (line.unit === 'ml' && ing.unit === 'L') needed /= 1000;
    if (ing.onHand < needed) {
      missing.push(ing.name);
    }
  }
  return { available: missing.length === 0, missingIngredients: missing };
}

/**
 * Deducts recipe ingredients for order lines that have NOT yet been deducted.
 * Prevents duplicate deductions when adding dishes to an existing order.
 */
export function deductIngredientsForOrderLines(
  lines: RestaurantOrderLine[],
  recipes: RestaurantRecipe[],
  ingredientsInBranch: FoodIngredient[]
): { deductedLinesCount: number; shortages: string[] } {
  let deductedLinesCount = 0;
  const shortages: string[] = [];

  for (const line of lines) {
    if (line.ingredientsDeducted || line.kitchenStatus === 'Cancelled') continue;
    const recipe = recipes.find((r) => r.dishId === line.dishId);
    if (recipe) {
      for (const req of recipe.ingredients) {
        const ing = ingredientsInBranch.find((i) => i.id === req.ingredientId);
        if (!ing) continue;
        const lossMultiplier = 1 + Math.max(0, req.prepLossPercent || 0) / 100;
        let qty = req.quantityPerServing * line.quantity * lossMultiplier;
        if (req.unit === 'g' && ing.unit === 'kg') qty /= 1000;
        else if (req.unit === 'ml' && ing.unit === 'L') qty /= 1000;
        const nextQty = Number((ing.onHand - qty).toFixed(3));
        if (nextQty <= 0) {
          ing.onHand = 0;
          shortages.push(ing.name);
        } else {
          ing.onHand = nextQty;
        }
      }
    }
    line.ingredientsDeducted = true;
    deductedLinesCount += 1;
  }

  return { deductedLinesCount, shortages };
}

export function hasReservationConflict(params: {
  existingReservations: TableReservation[];
  tables: DiningTable[];
  branchId: string;
  date: string;
  timeSlot: string;
  partySize: number;
  assignedTableId?: string;
  excludeReservationId?: string;
}): { conflict: boolean; reason?: string } {
  const activeStatuses = new Set(['Confirmed', 'Seated']);
  if (params.assignedTableId) {
    const table = params.tables.find((t) => t.id === params.assignedTableId && t.branchId === params.branchId);
    if (!table) return { conflict: true, reason: 'Assigned table does not belong to this branch.' };
    if (table.status === 'Temporarily Unavailable') {
      return { conflict: true, reason: `Table ${table.tableNumber} is temporarily unavailable.` };
    }
    if (params.partySize > table.capacity) {
      return {
        conflict: true,
        reason: `Party size (${params.partySize}) exceeds Table ${table.tableNumber} capacity (${table.capacity}).`,
      };
    }
    const overlap = params.existingReservations.find(
      (r) =>
        r.id !== params.excludeReservationId &&
        r.branchId === params.branchId &&
        r.date === params.date &&
        r.timeSlot === params.timeSlot &&
        r.assignedTableId === params.assignedTableId &&
        activeStatuses.has(r.status)
    );
    if (overlap) {
      return {
        conflict: true,
        reason: `Table ${table.tableNumber} is already ${overlap.status.toLowerCase()} for ${overlap.guestName} at ${params.timeSlot}.`,
      };
    }
  }
  return { conflict: false };
}

export function computeRestaurantShiftClosing(params: {
  openingFloatPkr: number;
  cashSalesPkr: number;
  refundsPkr: number;
  declaredCashPkr: number;
}) {
  const expectedCashPkr = Math.max(0, params.openingFloatPkr + params.cashSalesPkr - params.refundsPkr);
  const variancePkr = params.declaredCashPkr - expectedCashPkr;
  return {
    expectedCashPkr,
    variancePkr,
    hasVariance: variancePkr !== 0,
  };
}
