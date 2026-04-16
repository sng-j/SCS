import { create } from "zustand";
import type { Node, Edge } from "@xyflow/react";

interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

interface DfdState {
  history: HistoryEntry[];
  historyIndex: number;
  isDirty: boolean;
  lastSavedAt: number | null;
  canUndo: boolean;
  canRedo: boolean;

  pushHistory: (nodes: Node[], edges: Edge[]) => void;
  undo: () => HistoryEntry | null;
  redo: () => HistoryEntry | null;
  markSaved: () => void;
  reset: () => void;
}

const MAX_HISTORY = 50;

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export const useDfdStore = create<DfdState>((set, get) => ({
  history: [],
  historyIndex: -1,
  isDirty: false,
  lastSavedAt: null,
  canUndo: false,
  canRedo: false,

  pushHistory: (nodes, edges) => {
    const { history, historyIndex } = get();
    const trimmed = history.slice(0, historyIndex + 1);
    trimmed.push({ nodes: deepClone(nodes), edges: deepClone(edges) });
    if (trimmed.length > MAX_HISTORY) trimmed.shift();

    set({
      history: trimmed,
      historyIndex: trimmed.length - 1,
      isDirty: true,
      canUndo: trimmed.length > 1,
      canRedo: false,
    });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return null;
    const idx = historyIndex - 1;
    set({
      historyIndex: idx,
      isDirty: true,
      canUndo: idx > 0,
      canRedo: true,
    });
    return deepClone(history[idx]);
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return null;
    const idx = historyIndex + 1;
    set({
      historyIndex: idx,
      isDirty: true,
      canUndo: true,
      canRedo: idx < history.length - 1,
    });
    return deepClone(history[idx]);
  },

  markSaved: () => set({ isDirty: false, lastSavedAt: Date.now() }),

  reset: () =>
    set({
      history: [],
      historyIndex: -1,
      isDirty: false,
      lastSavedAt: null,
      canUndo: false,
      canRedo: false,
    }),
}));
