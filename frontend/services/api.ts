import { API_URL } from '../constants/Config';
import { useAuthStore } from '../stores/authStore';

class ApiClient {
  private baseUrl: string;
  private defaultTimeout = 15000; // 15 seconds
  private aiTimeout = 60000; // 60 seconds for AI calls
  private maxRetries = 1;

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

  private getTimeout(endpoint: string): number {
    // AI endpoints get longer timeout
    if (endpoint.includes('/chat/') || endpoint.includes('/meal-plans/generate') || endpoint.includes('/healthify')) {
      return this.aiTimeout;
    }
    return this.defaultTimeout;
  }

  private isRetryable(status: number): boolean {
    return status >= 500 || status === 408 || status === 429;
  }

  private async fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('Request timed out. Please check your connection and try again.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    endpoint: string,
  ): Promise<Response> {
    const timeout = this.getTimeout(endpoint);
    let lastError: any;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, options, timeout);

        // Don't retry client errors (4xx) except retryable ones
        if (!response.ok && this.isRetryable(response.status) && attempt < this.maxRetries) {
          // Exponential backoff: 1s on first retry
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }

        return response;
      } catch (err: any) {
        lastError = err;
        if (attempt < this.maxRetries && !err?.message?.includes('session has expired')) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed after retries.');
  }

  private async parseAndThrow(response: Response): Promise<never> {
    const error = await response.json().catch(() => ({}));

    if (response.status === 401) {
      useAuthStore.getState().logout();
      throw new Error('Your session has expired. Please sign in again.');
    }

    throw new Error(error.detail || `Request failed: ${response.status}`);
  }

  async get<T>(endpoint: string): Promise<T> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}${endpoint}`,
      { method: 'GET', headers: this.getHeaders() },
      endpoint,
    );
    if (!response.ok) await this.parseAndThrow(response);
    return response.json();
  }

  async post<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}${endpoint}`,
      { method: 'POST', headers: this.getHeaders(), body: body ? JSON.stringify(body) : undefined },
      endpoint,
    );
    if (!response.ok) await this.parseAndThrow(response);
    return response.json();
  }

  async put<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}${endpoint}`,
      { method: 'PUT', headers: this.getHeaders(), body: body ? JSON.stringify(body) : undefined },
      endpoint,
    );
    if (!response.ok) await this.parseAndThrow(response);
    return response.json();
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<T> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}${endpoint}`,
      { method: 'PATCH', headers: this.getHeaders(), body: body ? JSON.stringify(body) : undefined },
      endpoint,
    );
    if (!response.ok) await this.parseAndThrow(response);
    return response.json();
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await this.fetchWithRetry(
      `${this.baseUrl}${endpoint}`,
      { method: 'DELETE', headers: this.getHeaders() },
      endpoint,
    );
    if (!response.ok) await this.parseAndThrow(response);
    return response.json();
  }

  async stream(
    endpoint: string,
    body: unknown,
    onChunk: (text: string) => void,
    onDone?: (data: any) => void,
  ): Promise<void> {
    const timeout = this.aiTimeout;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
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
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('Streaming request timed out.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
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
  getSession: (id: string) => api.get<any>(`/chat/sessions/${id}`),
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
  substitute: (
    id: string,
    data?: { use_allergies?: boolean; use_dislikes?: boolean; custom_excludes?: string[] }
  ) => api.post<any>(`/recipes/${id}/substitute`, {
    use_allergies: data?.use_allergies ?? true,
    use_dislikes: data?.use_dislikes ?? true,
    custom_excludes: data?.custom_excludes ?? [],
  }),
  getSaved: () => api.get<any>('/recipes/saved/list'),
  saveGenerated: (recipe: {
    title: string;
    description?: string;
    ingredients?: Array<{ name: string; quantity?: string | number; unit?: string }>;
    steps?: string[];
    prep_time_min?: number;
    cook_time_min?: number;
    servings?: number;
    difficulty?: string;
    tags?: string[];
    flavor_profile?: string[];
    dietary_tags?: string[];
    cuisine?: string;
    health_benefits?: string[];
    nutrition_info?: Record<string, number>;
  }) =>
    api.post<any>('/recipes/saved', recipe),
  save: (id: string) => api.post<any>(`/recipes/saved/${id}`),
  unsave: (id: string) => api.delete<any>(`/recipes/saved/${id}`),
  getCookHelp: (recipeId: string, stepNumber: number, question?: string) =>
    api.post<{ answer: string }>(`/recipes/${recipeId}/cook-help`, {
      step_number: stepNumber,
      question: question || '',
    }),
};

export const nutritionApi = {
  getTargets: () => api.get<any>('/nutrition/targets'),
  updateTargets: (data: any) => api.put<any>('/nutrition/targets', data),
  getDaily: (date?: string) =>
    api.get<any>(`/nutrition/daily${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  getGaps: (date?: string) =>
    api.get<any>(`/nutrition/gaps${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  getLogs: (date?: string) =>
    api.get<any[]>(`/nutrition/logs${date ? `?date=${encodeURIComponent(date)}` : ''}`),
  createLog: (data: any) => api.post<any>('/nutrition/logs', data),
  updateLog: (id: string, data: any) => api.patch<any>(`/nutrition/logs/${id}`, data),
  deleteLog: (id: string) => api.delete<any>(`/nutrition/logs/${id}`),
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
