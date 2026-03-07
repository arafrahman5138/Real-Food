/**
 * plateStore.ts — Zustand store for the "Build Plate" feature.
 *
 * Lets users combine prep-component recipes into an assembled plate,
 * then preview the combined MES score.
 */
import { create } from 'zustand';
import { metabolicApi } from '../services/api';

export interface PlateItem {
  id: string;
  title: string;
  nutrition: Record<string, number>;
  context: string; // meal context label
}

interface PlateState {
  items: PlateItem[];
  /** Combined nutrition (summed across items). */
  combinedNutrition: Record<string, number>;
  /** Preview MES result from backend (null until fetched). */
  previewMES: { displayScore: number; displayTier: string; totalScore: number; tier: string } | null;
  previewLoading: boolean;

  addItem: (item: PlateItem) => void;
  removeItem: (id: string) => void;
  clearPlate: () => void;
  fetchPreview: () => Promise<void>;
}

function sumNutrition(items: PlateItem[]): Record<string, number> {
  const combined: Record<string, number> = {};
  for (const item of items) {
    for (const [k, v] of Object.entries(item.nutrition)) {
      combined[k] = (combined[k] ?? 0) + (Number(v) || 0);
    }
  }
  return combined;
}

export const usePlateStore = create<PlateState>((set, get) => ({
  items: [],
  combinedNutrition: {},
  previewMES: null,
  previewLoading: false,

  addItem: (item) => {
    const existing = get().items;
    if (existing.find((i) => i.id === item.id)) return; // no dupes
    const next = [...existing, item];
    set({ items: next, combinedNutrition: sumNutrition(next), previewMES: null });
  },

  removeItem: (id) => {
    const next = get().items.filter((i) => i.id !== id);
    set({ items: next, combinedNutrition: sumNutrition(next), previewMES: null });
  },

  clearPlate: () => set({ items: [], combinedNutrition: {}, previewMES: null }),

  fetchPreview: async () => {
    const { combinedNutrition, items } = get();
    if (items.length === 0) return;
    set({ previewLoading: true });
    try {
      // Normalise keys to what the preview endpoint expects
      const payload = {
        protein_g: Number(combinedNutrition.protein ?? combinedNutrition.protein_g ?? 0),
        fiber_g: Number(combinedNutrition.fiber ?? combinedNutrition.fiber_g ?? 0),
        carbs_g: Number(combinedNutrition.carbs ?? combinedNutrition.carbs_g ?? combinedNutrition.sugar ?? combinedNutrition.sugar_g ?? 0),
        sugar_g: Number(combinedNutrition.sugar ?? combinedNutrition.sugar_g ?? 0),
        calories: Number(combinedNutrition.calories ?? 0),
      };
      const data = await metabolicApi.previewMeal(payload);
      const score = data?.meal_score ?? data?.score ?? data;
      set({
        previewMES: {
          displayScore: score.display_score ?? score.total_score,
          displayTier: score.display_tier ?? score.tier,
          totalScore: score.total_score,
          tier: score.tier,
        },
      });
    } catch (e) {
      console.warn('[Plate] preview failed:', e);
    } finally {
      set({ previewLoading: false });
    }
  },
}));
