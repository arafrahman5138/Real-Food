import { create } from 'zustand';
import { recipeApi, gameApi } from '../services/api';

export interface SavedRecipe {
  id: string;
  title: string;
  description?: string;
  cuisine?: string;
  difficulty?: string;
  total_time_min?: number;
  health_benefits?: string[];
  nutrition_info?: Record<string, number>;
  ingredients?: Array<{ name: string; quantity?: string | number; unit?: string }>;
  steps?: string[];
  servings?: number;
  prep_time_min?: number;
  cook_time_min?: number;
}

interface SavedRecipesState {
  recipes: SavedRecipe[];
  savedIds: Set<string>;
  loading: boolean;
  fetchSaved: () => Promise<void>;
  saveRecipe: (id: string) => Promise<any>;
  saveGeneratedRecipe: (recipe: Omit<SavedRecipe, 'id'> & { id?: string }) => Promise<string | null>;
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
      // Award XP for saving a recipe
      gameApi.awardXP(10, 'save_recipe').catch(() => {});
      return result;
    } catch {
      set((s) => {
        const next = new Set(s.savedIds);
        next.delete(id);
        return { savedIds: next };
      });
    }
  },

  saveGeneratedRecipe: async (recipe) => {
    try {
      const result = await recipeApi.saveGenerated({
        title: recipe.title,
        description: recipe.description,
        ingredients: recipe.ingredients || [],
        steps: recipe.steps || [],
        servings: recipe.servings,
        prep_time_min: recipe.prep_time_min,
        cook_time_min: recipe.cook_time_min,
        difficulty: recipe.difficulty,
        cuisine: recipe.cuisine,
        health_benefits: recipe.health_benefits,
        nutrition_info: recipe.nutrition_info,
      });
      await get().fetchSaved();
      // Award XP for saving a generated recipe
      gameApi.awardXP(10, 'save_recipe').catch(() => {});
      return result?.recipe_id || null;
    } catch {
      return null;
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
