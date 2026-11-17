import React, { useState } from 'react';
import { restaurantApi, type RestaurantBootstrapPayload } from './restaurantApi';

interface MenuRecipesInventoryModuleProps {
  mode: 'menu' | 'inventory';
  data: RestaurantBootstrapPayload;
  onRefresh: () => Promise<void>;
}

export function MenuRecipesInventoryModule({ mode, data, onRefresh }: MenuRecipesInventoryModuleProps) {
  const [wasteIngId, setWasteIngId] = useState(data.ingredients[0]?.id || '');
  const [wasteQty, setWasteQty] = useState('1');
  const [wasteReason, setWasteReason] = useState('Prep trim / spoilage');
  const [countIngId, setCountIngId] = useState(data.ingredients[0]?.id || '');
  const [countQty, setCountQty] = useState('25');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAction = async (fn: () => Promise<unknown>, okMsg: string) => {
    setNotice(null);
    setError(null);
    try {
      await fn();
      await onRefresh();
      setNotice(okMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save update.');
    }
  };

  if (mode === 'menu') {
    return (
      <div className="space-y-4">
        {(notice || error) && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold ${
              error
                ? 'bg-[#9B1C2E]/8 border-[#9B1C2E]/25 text-[#9B1C2E]'
                : 'bg-[#166534]/8 border-[#166534]/25 text-[#166534]'
            }`}
          >
            {error || notice}
          </div>
        )}
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E6E2DA] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#1C1917]">Menu Catalogue, Station Routing &amp; Food Cost</h2>
              <p className="text-xs text-[#57534E]">
                {data.role.canViewFoodCost
                  ? 'Live recipe food cost % visible for authorized culinary & finance roles.'
                  : 'Recipe food costs redacted by RBAC for frontline floor roles.'}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E6E2DA] bg-[#FAF9F6] text-[11px] uppercase tracking-wider text-[#57534E]">
                  <th className="py-3 px-4">Dish</th>
                  <th className="py-3 px-4">Cuisine / Station</th>
                  <th className="py-3 px-4">Portions &amp; Prices</th>
                  <th className="py-3 px-4">Food Cost</th>
                  <th className="py-3 px-4">Availability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E2DA]">
                {data.menu.map((dish) => (
                  <tr key={dish.id} className="hover:bg-[#FAF9F6]/70">
                    <td className="py-3 px-4">
                      <p className="font-bold text-[#1C1917]">{dish.name}</p>
                      <p className="text-[11px] text-[#57534E]">{dish.category}</p>
                    </td>
                    <td className="py-3 px-4 text-[#57534E]">
                      {dish.cuisine} · {dish.station}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {dish.portions.map((p) => `${p.label}: PKR ${p.pricePkr}`).join(' | ')}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {dish.foodCostPkr !== null ? (
                        <span>
                          PKR {dish.foodCostPkr.toLocaleString()} ({dish.foodCostPercent}%)
                        </span>
                      ) : (
                        <span className="text-[#57534E]">Redacted</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${dish.available ? 'text-[#166534]' : 'text-[#9B1C2E]'}`}>
                          {dish.available ? 'Available' : '86d / Unavailable'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(
                              () => restaurantApi.toggleDishAvailability(dish.id, !dish.available),
                              `Updated ${dish.name} availability.`
                            )
                          }
                          className="h-7 px-2.5 rounded-lg border border-[#E6E2DA] bg-[#FFFFFF] text-[11px] font-semibold hover:border-[#9B1C2E]"
                        >
                          {dish.available ? 'Mark 86' : 'Re-enable'}
                        </button>
                      </div>
                      {dish.manualUnavailableReason && (
                        <p className="text-[11px] text-[#9B1C2E] mt-0.5">{dish.manualUnavailableReason}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // mode === 'inventory'
  return (
    <div className="space-y-6">
      {(notice || error) && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold ${
            error
              ? 'bg-[#9B1C2E]/8 border-[#9B1C2E]/25 text-[#9B1C2E]'
              : 'bg-[#166534]/8 border-[#166534]/25 text-[#166534]'
          }`}
        >
          {error || notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#1C1917]">Log Kitchen Waste / Spoilage</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <select
              value={wasteIngId}
              onChange={(e) => setWasteIngId(e.target.value)}
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            >
              {data.ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.onHand} {i.unit})
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={wasteQty}
              onChange={(e) => setWasteQty(e.target.value)}
              placeholder="Waste qty"
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-mono"
            />
            <input
              type="text"
              value={wasteReason}
              onChange={(e) => setWasteReason(e.target.value)}
              placeholder="Reason"
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              void runAction(
                () => restaurantApi.logWaste(wasteIngId, Number(wasteQty), wasteReason),
                'Logged ingredient waste & re-evaluated dish availability.'
              )
            }
            className="h-9 px-4 rounded-lg bg-[#9B1C2E] text-white text-xs font-semibold hover:bg-[#7F1524]"
          >
            Record Waste
          </button>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[#1C1917]">Physical Ingredient Stock Count</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <select
              value={countIngId}
              onChange={(e) => setCountIngId(e.target.value)}
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs"
            >
              {data.ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} (System: {i.onHand} {i.unit})
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.1"
              min="0"
              value={countQty}
              onChange={(e) => setCountQty(e.target.value)}
              placeholder="Counted physical qty"
              className="h-10 px-3 rounded-lg border border-[#E6E2DA] bg-[#FAF9F6] text-xs font-mono"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              void runAction(
                () => restaurantApi.updateIngredientCount(countIngId, Number(countQty)),
                'Updated ingredient stock count.'
              )
            }
            className="h-9 px-4 rounded-lg bg-[#1C1917] text-white text-xs font-semibold"
          >
            Save Physical Count
          </button>
        </div>
      </div>

      <div className="bg-[#FFFFFF] border border-[#E6E2DA] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E6E2DA]">
          <h3 className="text-sm font-bold text-[#1C1917]">Raw Food Ingredients Ledger ({data.ingredients.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E6E2DA] bg-[#FAF9F6] text-[11px] uppercase tracking-wider text-[#57534E]">
                <th className="py-3 px-4">Ingredient</th>
                <th className="py-3 px-4">Storage</th>
                <th className="py-3 px-4">On Hand</th>
                <th className="py-3 px-4">Reorder At</th>
                <th className="py-3 px-4">Waste Logged</th>
                <th className="py-3 px-4">Unit Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6E2DA]">
              {data.ingredients.map((ing) => (
                <tr key={ing.id} className="hover:bg-[#FAF9F6]/70">
                  <td className="py-3 px-4 font-bold text-[#1C1917]">{ing.name}</td>
                  <td className="py-3 px-4 text-[#57534E]">{ing.storageLocation}</td>
                  <td className={`py-3 px-4 font-mono font-bold ${ing.onHand <= ing.reorderLevel ? 'text-[#9B1C2E]' : 'text-[#166534]'}`}>
                    {ing.onHand} {ing.unit}
                  </td>
                  <td className="py-3 px-4 font-mono text-[#57534E]">
                    {ing.reorderLevel} {ing.unit}
                  </td>
                  <td className="py-3 px-4 font-mono text-[#57534E]">
                    {ing.wasteQty} {ing.unit}
                  </td>
                  <td className="py-3 px-4 font-mono">
                    {data.role.canViewFoodCost ? `PKR ${ing.unitCostPkr}` : 'Redacted'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
