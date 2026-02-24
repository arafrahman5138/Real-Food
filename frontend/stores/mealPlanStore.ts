import { create } from 'zustand';
import { mealPlanApi } from '../services/api';

interface MealPlanItem {
  id: string;
  day_of_week: string;
  meal_type: string;
  meal_category: string;
  is_bulk_cook: boolean;
  servings: number;
  recipe_data: any;
}

interface MealPlan {
  id: string;
  week_start: string;
  items: MealPlanItem[];
  created_at: string;
}

interface MealPlanState {
  currentPlan: MealPlan | null;
  isGenerating: boolean;
  isLoading: boolean;
  hasLoaded: boolean;
  selectedDay: string;
  setCurrentPlan: (plan: MealPlan) => void;
  setGenerating: (generating: boolean) => void;
  setSelectedDay: (day: string) => void;
  loadCurrentPlan: () => Promise<void>;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const today = new Date().getDay();
const dayIndex = today === 0 ? 6 : today - 1;

export const useMealPlanStore = create<MealPlanState>((set, get) => ({
  currentPlan: null,
  isGenerating: false,
  isLoading: false,
  hasLoaded: false,
  selectedDay: DAYS[dayIndex],
  setCurrentPlan: (currentPlan) => set({ currentPlan }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setSelectedDay: (selectedDay) => set({ selectedDay }),
  loadCurrentPlan: async () => {
    if (get().hasLoaded || get().isLoading) return;
    set({ isLoading: true });
    try {
      const plan = await mealPlanApi.getCurrent();
      if (plan?.items?.length) {
        set({ currentPlan: plan, hasLoaded: true });
      } else {
        set({ hasLoaded: true });
      }
    } catch {
      // No saved plan — that's fine, user will generate one
      set({ hasLoaded: true });
    } finally {
      set({ isLoading: false });
    }
  },
}));
