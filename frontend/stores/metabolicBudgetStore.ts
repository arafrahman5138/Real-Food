import { create } from 'zustand';
import { metabolicApi } from '../services/api';

// ─── Types ───

export interface SubScores {
  gis: number;
  pas: number;
  fs: number;
  fas: number;
}

export interface WeightsUsed {
  gis: number;
  protein: number;
  fiber: number;
  fat: number;
}

export interface MESScore {
  protein_score: number;
  fiber_score: number;
  sugar_score: number;
  total_score: number;       // raw MES (backend logic)
  display_score: number;     // same as total_score (no inflation)
  tier: 'critical' | 'low' | 'moderate' | 'good' | 'optimal' | 'crash_risk' | 'shaky' | 'stable';
  display_tier: string;      // tier derived from display_score
  protein_g: number;
  fiber_g: number;
  sugar_g: number;
  carbs_g?: number;
  // New fields
  meal_mes?: number;
  sub_scores?: SubScores;
  weights_used?: WeightsUsed;
  net_carbs_g?: number;
  fat_g?: number;
}

export interface MetabolicBudget {
  protein_target_g: number;
  fiber_floor_g: number;
  sugar_ceiling_g: number;
  weight_protein: number;
  weight_fiber: number;
  weight_sugar: number;
  // New fields
  carb_ceiling_g?: number;
  fat_target_g?: number;
  weight_fat?: number;
  weight_gis?: number;
  tdee?: number;
  ism?: number;
  // Phase 6
  tier_thresholds?: TierThresholds;
  threshold_context?: { shift: string; reason: string; leniency: string } | null;
}

export interface RemainingBudget {
  protein_remaining_g: number;
  fiber_remaining_g: number;
  sugar_headroom_g: number;
  carb_headroom_g?: number;
  fat_remaining_g?: number;
}

export interface MEAScore {
  mea_score: number;
  caloric_adequacy: number;
  macro_balance: number;
  daily_mes: number;
  energy_prediction: 'sustained' | 'adequate' | 'may_dip' | 'likely_fatigued' | string;
  tier: string;
}

export interface TierThresholds {
  optimal: number;
  good: number;
  moderate: number;
  low: number;
}

export interface DailyMES {
  date: string;
  score: MESScore;
  remaining: RemainingBudget | null;
  mea?: MEAScore | null;
  treat_impact?: {
    has_treats: boolean;
    dessert_carbs_g: number;
    dessert_calories: number;
    protection_score: number;
    protection_buffer_g: number;
    treat_load_g: number;
    net_treat_load_g: number;
    mes_penalty_points: number;
    impact_level: 'none' | 'protected' | 'light' | 'impactful' | string;
  } | null;
}

export interface MealMES {
  food_log_id: string | null;
  title: string | null;
  score: MESScore | null;
  meal_context: string;
  meal_type: string | null;
  unscored_hint: string | null;
}

export interface CompositeMES {
  score: MESScore;
  component_count: number;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  total_fiber_g: number;
}

export interface MESHistoryEntry {
  date: string;
  total_score: number;
  display_score: number;
  tier: string;
  display_tier: string;
}

export interface MetabolicStreak {
  current_streak: number;
  longest_streak: number;
  threshold: number;
}

export interface MetabolicProfile {
  sex: string | null;
  age: number | null;
  height_cm: number | null;
  height_ft: number | null;
  height_in: number | null;
  weight_lb: number | null;
  body_fat_pct: number | null;
  body_fat_method: string | null;
  goal: string | null;
  activity_level: string | null;
  target_weight_lb: number | null;
  protein_target_g: number | null;
  insulin_resistant: boolean | null;
  prediabetes: boolean | null;
  type_2_diabetes: boolean | null;
  fasting_glucose_mgdl: number | null;
  hba1c_pct: number | null;
  triglycerides_mgdl: number | null;
  onboarding_step_completed: number | null;
}

// ─── Tier helpers ───

export const TIER_CONFIG = {
  // New tier names
  critical: { label: 'Energy Drain', color: '#DC2626', icon: 'battery-dead' as const },
  low: { label: 'Low Energy', color: '#FF4444', icon: 'battery-dead' as const },
  moderate: { label: 'Steady Burn', color: '#FF9500', icon: 'battery-half' as const },
  good: { label: 'Momentum', color: '#4A90D9', icon: 'battery-charging' as const },
  optimal: { label: 'Elite Fuel', color: '#34C759', icon: 'battery-full' as const },
  // Legacy aliases
  crash_risk: { label: 'Energy Drain', color: '#FF4444', icon: 'battery-dead' as const },
  shaky: { label: 'Steady Burn', color: '#FF9500', icon: 'battery-half' as const },
  stable: { label: 'Momentum', color: '#4A90D9', icon: 'battery-charging' as const },
} as const;

export type TierKey = keyof typeof TIER_CONFIG;

export function getTierConfig(tier: string) {
  return TIER_CONFIG[tier as TierKey] ?? TIER_CONFIG.crash_risk;
}

// ─── Store ───

interface MetabolicBudgetState {
  // Budget
  budget: MetabolicBudget | null;
  budgetLoaded: boolean;

  // Daily score
  dailyScore: DailyMES | null;

  // Meal scores
  mealScores: MealMES[];

  // Remaining budget
  remainingBudget: RemainingBudget | null;

  // History
  scoreHistory: MESHistoryEntry[];

  // Streak
  streak: MetabolicStreak | null;

  // Profile
  profile: MetabolicProfile | null;

  // Loading
  loading: boolean;

  // Actions
  fetchBudget: () => Promise<void>;
  updateBudget: (updates: Partial<MetabolicBudget>) => Promise<void>;
  fetchDailyScore: (date?: string) => Promise<void>;
  fetchMealScores: (date?: string) => Promise<void>;
  fetchRemainingBudget: (date?: string) => Promise<void>;
  fetchScoreHistory: (days?: number) => Promise<void>;
  fetchStreak: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  saveProfile: (data: Partial<MetabolicProfile>) => Promise<void>;
  patchProfile: (data: Partial<MetabolicProfile>) => Promise<void>;
  fetchAll: (date?: string) => Promise<void>;
  fetchCompositeMES: (foodLogIds: string[]) => Promise<CompositeMES | null>;
}

export const useMetabolicBudgetStore = create<MetabolicBudgetState>((set, get) => ({
  budget: null,
  budgetLoaded: false,
  dailyScore: null,
  mealScores: [],
  remainingBudget: null,
  scoreHistory: [],
  streak: null,
  profile: null,
  loading: false,

  fetchBudget: async () => {
    try {
      const data = await metabolicApi.getBudget();
      set({ budget: data, budgetLoaded: true });
    } catch (e) {
      console.warn('[MES] fetchBudget failed:', e);
    }
  },

  updateBudget: async (updates) => {
    try {
      const data = await metabolicApi.updateBudget(updates);
      set({ budget: data });
    } catch {
      // silent
    }
  },

  fetchDailyScore: async (date) => {
    try {
      const data = await metabolicApi.getDailyScore(date);
      set({ dailyScore: data, remainingBudget: data.remaining });
    } catch (e) {
      console.warn('[MES] fetchDailyScore failed:', e);
    }
  },

  fetchMealScores: async (date) => {
    try {
      const data = await metabolicApi.getMealScores(date);
      set({ mealScores: data ?? [] });
    } catch (e) {
      console.warn('[MES] fetchMealScores failed:', e);
    }
  },

  fetchRemainingBudget: async (date) => {
    try {
      const data = await metabolicApi.getRemainingBudget(date);
      set({ remainingBudget: data });
    } catch {
      // silent
    }
  },

  fetchScoreHistory: async (days = 14) => {
    try {
      const data = await metabolicApi.getScoreHistory(days);
      set({ scoreHistory: data ?? [] });
    } catch {
      // silent
    }
  },

  fetchStreak: async () => {
    try {
      const data = await metabolicApi.getStreak();
      set({ streak: data });
    } catch {
      // silent
    }
  },

  fetchProfile: async () => {
    try {
      const data = await metabolicApi.getProfile();
      set({ profile: data });
    } catch {
      // silent
    }
  },

  saveProfile: async (data) => {
    try {
      const result = await metabolicApi.saveProfile(data);
      set({ profile: result });
      // Refresh budget since profile sync updates it
      get().fetchBudget();
    } catch {
      // silent
    }
  },

  patchProfile: async (data) => {
    try {
      const result = await metabolicApi.patchProfile(data);
      set({ profile: result });
      get().fetchBudget();
    } catch {
      // silent
    }
  },

  fetchAll: async (date) => {
    set({ loading: true });
    try {
      await Promise.all([
        get().fetchBudget(),
        get().fetchDailyScore(date),
        get().fetchMealScores(date),
        get().fetchStreak(),
        get().fetchScoreHistory(),
      ]);
    } finally {
      set({ loading: false });
    }
  },

  fetchCompositeMES: async (foodLogIds) => {
    try {
      const data = await metabolicApi.getCompositeMES(foodLogIds);
      return data as CompositeMES;
    } catch (e) {
      console.warn('[MES] fetchCompositeMES failed:', e);
      return null;
    }
  },
}));
