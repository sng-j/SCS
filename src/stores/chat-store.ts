import { create } from "zustand";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatAction {
  tool: string;
  result: unknown;
  label?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[];
  conversationId?: string | null;
  feedback?: 1 | -1 | null;
  timestamp: number;
}

interface ChatContext {
  path: string;
  projectId?: string;
  equipmentId?: string;
  banner: string;
  pageType: string;
}

interface ChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  isTyping: boolean;
  context: ChatContext;
  pageFormData: Record<string, unknown>;

  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  setTyping: (v: boolean) => void;
  updateContext: (ctx: Partial<ChatContext>) => void;
  setPageFormData: (data: Record<string, unknown>) => void;
  setFeedback: (msgId: string, rating: 1 | -1) => void;
  clearMessages: () => void;
}

let msgCounter = 0;

export const useChatStore = create<ChatState>((set) => ({
  isOpen: false,
  messages: [],
  isTyping: false,
  context: { path: "/", banner: "📍 SCS", pageType: "default" },
  pageFormData: {},

  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),

  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { ...msg, id: `msg_${++msgCounter}_${Date.now()}`, timestamp: Date.now() },
      ],
    })),

  setTyping: (isTyping) => set({ isTyping }),

  updateContext: (ctx) =>
    set((s) => ({ context: { ...s.context, ...ctx } })),

  setPageFormData: (pageFormData) => set({ pageFormData }),

  setFeedback: (msgId, rating) =>
    set((s) => ({
      messages: s.messages.map((m) => m.id === msgId ? { ...m, feedback: rating } : m),
    })),

  clearMessages: () => set({ messages: [] }),
}));
