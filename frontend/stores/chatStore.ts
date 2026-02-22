import { create } from 'zustand';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  recipe?: any;
  swaps?: any[];
  nutrition?: any;
}

interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  isLoading: boolean;
  streamingText: string;
  addMessage: (message: ChatMessage) => void;
  setSessionId: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setStreamingText: (text: string) => void;
  appendStreamingText: (chunk: string) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  sessionId: null,
  isLoading: false,
  streamingText: '',
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setSessionId: (sessionId) => set({ sessionId }),
  setLoading: (isLoading) => set({ isLoading }),
  setStreamingText: (streamingText) => set({ streamingText }),
  appendStreamingText: (chunk) =>
    set((state) => ({ streamingText: state.streamingText + chunk })),
  clearChat: () => set({ messages: [], sessionId: null, streamingText: '' }),
}));
