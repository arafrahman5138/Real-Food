import { create } from 'zustand';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  auth_provider: string;
  dietary_preferences: string[];
  flavor_preferences: string[];
  allergies: string[];
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
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setToken: (token) => set({ token, isAuthenticated: true }),
  setUser: (user) => set({ user }),
  addXp: (xp) =>
    set((state) => ({
      user: state.user
        ? { ...state.user, xp_points: Math.max(0, (state.user.xp_points || 0) + xp) }
        : state.user,
    })),
  logout: () => set({ token: null, user: null, isAuthenticated: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));
