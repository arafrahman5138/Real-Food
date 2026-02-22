import { create } from 'zustand';
import { recipeApi } from '../services/api';

export interface SavedRecipe {
  id: string;
  title: string;
  description?: string;
  cuisine?: string;
  difficulty?: string;
  total_time_min?: number;
  health_benefits?: string[];
  nutrition_info?: Record<string, number>;
}

interface SavedRecipesState {
  recipes: SavedRecipe[];
  savedIds: Set<string>;
  loading: boolean;
  fetchSaved: () => Promise<void>;
  saveRecipe: (id: string) => Promise<any>;
  removeRecipe: (id: string) => Promise<void>;
  isSaved: (id: string) => boolean;
}

export const useSavedRecipesStore = create<SavedRecipesState>((set, get) => ({
  recipes: [],
  savedIds: new Set(),
  loading: false,

  fetchSaved: async () => {
    set({ loading: true });
    try {
      const data = await recipeApi.getSaved();
      set({
        recipes: data.items || [],
        savedIds: new Set(data.saved_ids || []),
      });
    } catch {
      // keep local state
    } finally {
      set({ loading: false });
    }
  },

  saveRecipe: async (id: string) => {
    set((s) => ({ savedIds: new Set([...s.savedIds, id]) }));
    try {
      const result = await recipeApi.save(id);
      get().fetchSaved();
      return result;
    } catch {
      set((s) => {
        const next = new Set(s.savedIds);
        next.delete(id);
        return { savedIds: next };
      });
    }
  },

  removeRecipe: async (id: string) => {
    set((s) => {
      const next = new Set(s.savedIds);
      next.delete(id);
      return { savedIds: next, recipes: s.recipes.filter((r) => r.id !== id) };
    });
    try {
      await recipeApi.unsave(id);
    } catch {
      // revert on error
      get().fetchSaved();
    }
  },

  isSaved: (id: string) => get().savedIds.has(id),
}));
