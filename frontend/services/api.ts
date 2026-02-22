import { API_URL } from '../constants/Config';
import { useAuthStore } from '../stores/authStore';

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  private getHeaders(): Record<string, string> {
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Request failed: ${response.status}`);
    }
    return response.json();
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Request failed: ${response.status}`);
    }
    return response.json();
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Request failed: ${response.status}`);
    }
    return response.json();
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || `Request failed: ${response.status}`);
    }
    return response.json();
  }

  async stream(
    endpoint: string,
    body: unknown,
    onChunk: (text: string) => void,
    onDone?: (data: any) => void,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Stream failed: ${response.status}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.done) {
              onDone?.(data);
            } else if (data.content) {
              onChunk(data.content);
            }
          } catch {}
        }
      }
    }
  }
}

export const api = new ApiClient();

export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    api.post<{ access_token: string }>('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post<{ access_token: string }>('/auth/login', data),
  socialAuth: (data: { provider: string; token: string; name?: string; email?: string }) =>
    api.post<{ access_token: string }>('/auth/social', data),
  getProfile: () => api.get<any>('/auth/me'),
  updatePreferences: (data: any) => api.put('/auth/preferences', data),
};

export const chatApi = {
  healthify: (message: string, sessionId?: string) =>
    api.post<any>('/chat/healthify', { message, session_id: sessionId }),
  streamHealthify: (message: string, sessionId: string | undefined, onChunk: (t: string) => void, onDone?: (d: any) => void) =>
    api.stream('/chat/healthify/stream', { message, session_id: sessionId }, onChunk, onDone),
  getSessions: () => api.get<any[]>('/chat/sessions'),
  deleteSession: (id: string) => api.delete(`/chat/sessions/${id}`),
};

export const mealPlanApi = {
  generate: (data?: any) => api.post<any>('/meal-plans/generate', data || {}),
  getCurrent: () => api.get<any>('/meal-plans/current'),
  getHistory: () => api.get<any[]>('/meal-plans/history'),
};

export const groceryApi = {
  generate: (mealPlanId: string) =>
    api.post<any>('/grocery/generate', { meal_plan_id: mealPlanId }),
  getCurrent: () => api.get<any>('/grocery/current'),
};

export const foodApi = {
  search: (q: string, page?: number) =>
    api.get<any>(`/foods/search?q=${encodeURIComponent(q)}&page=${page || 1}`),
  getDetail: (id: string) => api.get<any>(`/foods/${id}`),
};

export const recipeApi = {
  browse: (params: Record<string, string | number | undefined>) => {
    const qs = Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== '' && v !== null)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    return api.get<any>(`/recipes/browse?${qs}`);
  },
  getFilters: () => api.get<any>('/recipes/filters'),
  getDetail: (id: string) => api.get<any>(`/recipes/${id}`),
  getSaved: () => api.get<any>('/recipes/saved/list'),
  save: (id: string) => api.post<any>(`/recipes/saved/${id}`),
  unsave: (id: string) => api.delete<any>(`/recipes/saved/${id}`),
  getCookHelp: (recipeId: string, stepNumber: number, question?: string) =>
    api.post<{ answer: string }>(`/recipes/${recipeId}/cook-help`, {
      step_number: stepNumber,
      question: question || '',
    }),
};

export const gameApi = {
  getStats: () => api.get<any>('/game/stats'),
  getAchievements: () => api.get<any[]>('/game/achievements'),
  getLeaderboard: () => api.get<any[]>('/game/leaderboard'),
  getWeeklyStats: () => api.get<any>('/game/weekly-stats'),
  checkAchievements: () => api.post<any>('/game/check-achievements'),
  updateStreak: () => api.post<any>('/game/streak'),
  awardXP: (amount: number, reason: string) =>
    api.post<any>(`/game/xp?amount=${amount}&reason=${encodeURIComponent(reason)}`),
};
