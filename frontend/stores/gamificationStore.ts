import { create } from 'zustand';
import { gameApi } from '../services/api';

// ─── Types ───

export interface DailyQuest {
  id: string;
  quest_type: string;
  title: string;
  description: string;
  target_value: number;
  current_value: number;
  xp_reward: number;
  completed: boolean;
}

export interface ScoreHistoryEntry {
  date: string;
  score: number;
  tier: 'none' | 'bronze' | 'silver' | 'gold';
}

export interface UserStats {
  xp_points: number;
  current_streak: number;
  longest_streak: number;
  level: number;
  level_title: string;
  xp_to_next_level: number;
  achievements_unlocked: number;
  total_achievements: number;
  nutrition_streak: number;
  nutrition_longest_streak: number;
}

interface GamificationState {
  // Quests
  quests: DailyQuest[];
  questsLoaded: boolean;
  fetchQuests: () => Promise<void>;
  updateQuestProgress: (questId: string, amount?: number) => Promise<{ xp_gained: number; completed: boolean }>;

  // Stats
  stats: UserStats | null;
  fetchStats: () => Promise<void>;

  // Score history
  scoreHistory: ScoreHistoryEntry[];
  fetchScoreHistory: (days?: number) => Promise<void>;

  // Nutrition streak
  nutritionStreak: number;
  nutritionLongestStreak: number;
  fetchNutritionStreak: () => Promise<void>;

  // XP
  awardXP: (amount: number, reason: string) => Promise<{ xp_gained: number; new_level?: number; level_title?: string }>;

  // Streak + achievements (existing)
  syncStreak: () => Promise<void>;
  syncAchievements: () => Promise<string[]>;
  lastStreakSync: string | null;

  // Convenience computed
  completionPct: number;
}

export const useGamificationStore = create<GamificationState>((set, get) => ({
  quests: [],
  questsLoaded: false,
  stats: null,
  scoreHistory: [],
  nutritionStreak: 0,
  nutritionLongestStreak: 0,
  completionPct: 0,
  lastStreakSync: null,

  // ─── Fetch daily quests from backend ───
  fetchQuests: async () => {
    try {
      const quests = await gameApi.getDailyQuests();
      const completedCount = (quests || []).filter((q: DailyQuest) => q.completed).length;
      const total = (quests || []).length || 1;
      set({
        quests: quests || [],
        questsLoaded: true,
        completionPct: Math.round((completedCount / total) * 100),
      });
    } catch {
      // Silent
    }
  },

  // ─── Update quest progress ───
  updateQuestProgress: async (questId, amount = 1) => {
    try {
      const result = await gameApi.updateQuestProgress(questId, amount);
      // Re-fetch quests to get updated state
      get().fetchQuests();
      return {
        xp_gained: result?.xp_gained || 0,
        completed: result?.completed || false,
      };
    } catch {
      return { xp_gained: 0, completed: false };
    }
  },

  // ─── Fetch stats ───
  fetchStats: async () => {
    try {
      const stats = await gameApi.getStats();
      set({
        stats,
        nutritionStreak: stats?.nutrition_streak || 0,
        nutritionLongestStreak: stats?.nutrition_longest_streak || 0,
      });
    } catch {
      // Silent
    }
  },

  // ─── Fetch score history ───
  fetchScoreHistory: async (days = 30) => {
    try {
      const history = await gameApi.getScoreHistory(days);
      set({ scoreHistory: history || [] });
    } catch {
      // Silent
    }
  },

  // ─── Fetch nutrition streak ───
  fetchNutritionStreak: async () => {
    try {
      const ns = await gameApi.getNutritionStreak();
      set({
        nutritionStreak: ns?.current_streak || 0,
        nutritionLongestStreak: ns?.longest_streak || 0,
      });
    } catch {
      // Silent
    }
  },

  // ─── Award XP ───
  awardXP: async (amount, reason) => {
    try {
      const result = await gameApi.awardXP(amount, reason);
      // Refresh stats after XP gain
      get().fetchStats();
      return {
        xp_gained: result?.xp_gained || 0,
        new_level: result?.new_level,
        level_title: result?.level_title,
      };
    } catch {
      return { xp_gained: 0 };
    }
  },

  // ─── Sync streak (existing) ───
  syncStreak: async () => {
    const today = new Date().toISOString().split('T')[0];
    if (get().lastStreakSync === today) return;
    try {
      await gameApi.updateStreak();
      set({ lastStreakSync: today });
      // Refresh stats to pick up streak XP + achievements
      get().fetchStats();
    } catch {
      // Silent — streak will be synced on next foreground
    }
  },

  // ─── Sync achievements (existing) ───
  syncAchievements: async () => {
    try {
      const result = await gameApi.checkAchievements();
      if (result?.newly_unlocked?.length) {
        get().fetchStats();
      }
      return result?.newly_unlocked || [];
    } catch {
      return [];
    }
  },
}));
