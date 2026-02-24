import { create } from 'zustand';
import { chatApi } from '../services/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  recipe?: any;
  swaps?: any[];
  nutrition?: any;
}

interface ChatSession {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
}

interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  isLoading: boolean;
  streamingText: string;
  sessions: ChatSession[];
  hasLoadedHistory: boolean;
  addMessage: (message: ChatMessage) => void;
  setSessionId: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setStreamingText: (text: string) => void;
  appendStreamingText: (chunk: string) => void;
  clearChat: () => void;
  loadLastSession: () => Promise<void>;
  loadSessions: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  sessionId: null,
  isLoading: false,
  streamingText: '',
  sessions: [],
  hasLoadedHistory: false,
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setSessionId: (sessionId) => set({ sessionId }),
  setLoading: (isLoading) => set({ isLoading }),
  setStreamingText: (streamingText) => set({ streamingText }),
  appendStreamingText: (chunk) =>
    set((state) => ({ streamingText: state.streamingText + chunk })),
  clearChat: () => set({ messages: [], sessionId: null, streamingText: '' }),
  loadSessions: async () => {
    try {
      const sessions = await chatApi.getSessions();
      set({ sessions: sessions || [] });
    } catch {
      // Silent — sessions list is optional
    }
  },
  loadLastSession: async () => {
    if (get().hasLoadedHistory || get().messages.length > 0) return;
    try {
      const sessions = await chatApi.getSessions();
      set({ sessions: sessions || [], hasLoadedHistory: true });
      if (sessions?.length > 0) {
        const latest = sessions[0]; // already sorted by updated_at desc
        const detail = await chatApi.getSession(latest.id);
        if (detail?.messages?.length > 0) {
          set({
            messages: detail.messages,
            sessionId: latest.id,
          });
        }
      }
    } catch {
      set({ hasLoadedHistory: true });
    }
  },
}));
