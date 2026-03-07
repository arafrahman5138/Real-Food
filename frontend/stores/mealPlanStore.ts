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
  prep_timeline?: Array<{
    prep_group_id: string;
    recipe_id: string;
    recipe_title: string;
    meal_type: string;
    prep_day: string;
    covers_days: string[];
    servings_to_make: number;
    summary_text: string;
  }>;
  quality_summary?: {
    target_meal_display_mes: number;
    target_daily_average_display_mes: number;
    actual_weekly_average_daily_display_mes: number;
    qualifying_meal_count: number;
    total_meal_count: number;
    days_meeting_target: number;
    total_days: number;
  };
  warnings?: string[];
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
  loadCurrentPlan: (forceReload?: boolean) => Promise<void>;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getTodayName() {
  const today = new Date().getDay();
  const dayIndex = today === 0 ? 6 : today - 1;
  return DAYS[dayIndex];
}

export const useMealPlanStore = create<MealPlanState>((set, get) => ({
  currentPlan: null,
  isGenerating: false,
  isLoading: false,
  hasLoaded: false,
  selectedDay: getTodayName(),
  setCurrentPlan: (currentPlan) => set({ currentPlan, hasLoaded: true }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setSelectedDay: (selectedDay) => set({ selectedDay }),
  loadCurrentPlan: async (forceReload = false) => {
    if (get().isLoading) return;
    if (get().hasLoaded && !forceReload) return;
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
      // Don't set hasLoaded so user can retry
    } finally {
      set({ isLoading: false });
    }
  },
}));
