import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../constants/Config';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  auth_provider: string;
  dietary_preferences: string[];
  flavor_preferences: string[];
  allergies: string[];
  liked_ingredients: string[];
  disliked_ingredients: string[];
  protein_preferences: { liked?: string[]; disliked?: string[] };
  cooking_time_budget: Record<string, number>;
  household_size: number;
  budget_level: string;
  xp_points: number;
  current_streak: number;
  longest_streak: number;
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setToken: (token: string) => void;
  setUser: (user: UserProfile) => void;
  addXp: (xp: number) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  loadAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setToken: (token) => {
    SecureStore.setItemAsync('auth_token', token).catch(console.error);
    set({ token, isAuthenticated: true });
  },
  setUser: (user) => {
    SecureStore.setItemAsync('auth_user', JSON.stringify(user)).catch(console.error);
    set({ user });
  },
  addXp: (xp) =>
    set((state) => {
      const updatedUser = state.user
        ? { ...state.user, xp_points: Math.max(0, (state.user.xp_points || 0) + xp) }
        : state.user;
      if (updatedUser) {
        SecureStore.setItemAsync('auth_user', JSON.stringify(updatedUser)).catch(console.error);
      }
      return { user: updatedUser };
    }),
  logout: () => {
    SecureStore.deleteItemAsync('auth_token').catch(console.error);
    SecureStore.deleteItemAsync('auth_user').catch(console.error);
    set({ token: null, user: null, isAuthenticated: false });
  },
  setLoading: (isLoading) => set({ isLoading }),
  loadAuth: async () => {
    try {
      const [token, userStr] = await Promise.all([
        SecureStore.getItemAsync('auth_token'),
        SecureStore.getItemAsync('auth_user'),
      ]);
      if (token && userStr) {
        const meResponse = await fetch(`${API_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!meResponse.ok) {
          await Promise.all([
            SecureStore.deleteItemAsync('auth_token'),
            SecureStore.deleteItemAsync('auth_user'),
          ]);
          set({ token: null, user: null, isAuthenticated: false, isLoading: false });
          return;
        }

        const profile = await meResponse.json();
        const normalizedUser = {
          ...profile,
          dietary_preferences: profile?.dietary_preferences || [],
          flavor_preferences: profile?.flavor_preferences || [],
          allergies: profile?.allergies || [],
          liked_ingredients: profile?.liked_ingredients || [],
          disliked_ingredients: profile?.disliked_ingredients || [],
          protein_preferences: profile?.protein_preferences || { liked: [], disliked: [] },
        };

        await SecureStore.setItemAsync('auth_user', JSON.stringify(normalizedUser));
        set({ token, user: normalizedUser, isAuthenticated: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Failed to load auth:', error);
      set({ isLoading: false });
    }
  },
}));
