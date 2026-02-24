import { create } from 'zustand';
import { gameApi } from '../services/api';

export type DailyQuestId = 'healthify' | 'meal_plan' | 'grocery';

export interface DailyQuest {
  id: DailyQuestId;
  title: string;
  description: string;
  target: number;
  progress: number;
  xpReward: number;
  completed: boolean;
}

interface GamificationState {
  quests: DailyQuest[];
  completeAction: (id: DailyQuestId, amount?: number) => { gainedXp: number; justCompleted: boolean };
  resetDailyQuests: () => void;
  completionPct: number;
  syncStreak: () => Promise<void>;
  syncAchievements: () => Promise<string[]>;
  lastStreakSync: string | null;
}

const INITIAL_QUESTS: DailyQuest[] = [
  {
    id: 'healthify',
    title: 'Healthify 1 craving',
    description: 'Transform one comfort food into a whole-food version.',
    target: 1,
    progress: 0,
    xpReward: 40,
    completed: false,
  },
  {
    id: 'meal_plan',
    title: 'Generate weekly plan',
    description: 'Create or refresh your weekly meal plan.',
    target: 1,
    progress: 0,
    xpReward: 80,
    completed: false,
  },
  {
    id: 'grocery',
    title: 'Check off 5 groceries',
    description: 'Complete at least 5 grocery items today.',
    target: 5,
    progress: 0,
    xpReward: 60,
    completed: false,
  },
];

export const useGamificationStore = create<GamificationState>((set, get) => ({
  quests: INITIAL_QUESTS,
  completionPct: 0,
  lastStreakSync: null,

  completeAction: (id, amount = 1) => {
    let gainedXp = 0;
    let justCompleted = false;

    set((state) => {
      const quests = state.quests.map((q) => {
        if (q.id !== id || q.completed) return q;
        const progress = Math.min(q.target, q.progress + Math.max(1, amount));
        const completed = progress >= q.target;
        if (completed) {
          gainedXp = q.xpReward;
          justCompleted = true;
        }
        return { ...q, progress, completed };
      });

      const completedCount = quests.filter((q) => q.completed).length;
      return { quests, completionPct: Math.round((completedCount / quests.length) * 100) };
    });

    // Fire-and-forget: check achievements after meaningful actions
    get().syncAchievements().catch(() => {});

    return { gainedXp, justCompleted };
  },

  resetDailyQuests: () =>
    set({
      quests: INITIAL_QUESTS,
      completionPct: 0,
    }),

  syncStreak: async () => {
    const today = new Date().toISOString().split('T')[0];
    if (get().lastStreakSync === today) return;
    try {
      await gameApi.updateStreak();
      set({ lastStreakSync: today });
    } catch {
      // Silent — streak will be synced on next foreground
    }
  },

  syncAchievements: async () => {
    try {
      const result = await gameApi.checkAchievements();
      return result?.newly_unlocked || [];
    } catch {
      return [];
    }
  },
}));
