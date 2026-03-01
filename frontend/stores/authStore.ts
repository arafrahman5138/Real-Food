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
  refreshToken: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setToken: (token: string) => void;
  setRefreshToken: (refreshToken: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: UserProfile) => void;
  addXp: (xp: number) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  loadAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setToken: (token) => {
    SecureStore.setItemAsync('auth_token', token).catch(console.error);
    set({ token, isAuthenticated: true });
  },
  setRefreshToken: (refreshToken) => {
    SecureStore.setItemAsync('refresh_token', refreshToken).catch(console.error);
    set({ refreshToken });
  },
  setTokens: (accessToken, refreshToken) => {
    SecureStore.setItemAsync('auth_token', accessToken).catch(console.error);
    SecureStore.setItemAsync('refresh_token', refreshToken).catch(console.error);
    set({ token: accessToken, refreshToken, isAuthenticated: true });
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
    SecureStore.deleteItemAsync('refresh_token').catch(console.error);
    SecureStore.deleteItemAsync('auth_user').catch(console.error);
    set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
  },
  setLoading: (isLoading) => set({ isLoading }),
  loadAuth: async () => {
    try {
      const [token, refreshToken, userStr] = await Promise.all([
        SecureStore.getItemAsync('auth_token'),
        SecureStore.getItemAsync('refresh_token'),
        SecureStore.getItemAsync('auth_user'),
      ]);

      if (!token && !refreshToken) {
        set({ isLoading: false });
        return;
      }

      // Try the access token first
      let accessToken = token;
      let currentRefreshToken = refreshToken;

      if (accessToken) {
        const meResponse = await fetch(`${API_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (meResponse.ok) {
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
          set({ token: accessToken, refreshToken: currentRefreshToken, user: normalizedUser, isAuthenticated: true, isLoading: false });
          return;
        }
      }

      // Access token expired or missing — try refresh
      if (currentRefreshToken) {
        try {
          const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: currentRefreshToken }),
          });

          if (refreshResponse.ok) {
            const tokens = await refreshResponse.json();
            accessToken = tokens.access_token;
            currentRefreshToken = tokens.refresh_token;

            await Promise.all([
              SecureStore.setItemAsync('auth_token', accessToken!),
              SecureStore.setItemAsync('refresh_token', currentRefreshToken!),
            ]);

            // Fetch profile with new token
            const meResponse = await fetch(`${API_URL}/auth/me`, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            });

            if (meResponse.ok) {
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
              set({ token: accessToken, refreshToken: currentRefreshToken, user: normalizedUser, isAuthenticated: true, isLoading: false });
              return;
            }
          }
        } catch (e) {
          console.error('Refresh token failed:', e);
        }
      }

      // Both tokens invalid — clean up
      await Promise.all([
        SecureStore.deleteItemAsync('auth_token'),
        SecureStore.deleteItemAsync('refresh_token'),
        SecureStore.deleteItemAsync('auth_user'),
      ]);
      set({ token: null, refreshToken: null, user: null, isAuthenticated: false, isLoading: false });
    } catch (error) {
      console.error('Failed to load auth:', error);
      set({ isLoading: false });
    }
  },
}));
