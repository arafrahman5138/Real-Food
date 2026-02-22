import { create } from 'zustand';

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
  selectedDay: string;
  setCurrentPlan: (plan: MealPlan) => void;
  setGenerating: (generating: boolean) => void;
  setSelectedDay: (day: string) => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const today = new Date().getDay();
const dayIndex = today === 0 ? 6 : today - 1;

export const useMealPlanStore = create<MealPlanState>((set) => ({
  currentPlan: null,
  isGenerating: false,
  selectedDay: DAYS[dayIndex],
  setCurrentPlan: (currentPlan) => set({ currentPlan }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setSelectedDay: (selectedDay) => set({ selectedDay }),
}));
