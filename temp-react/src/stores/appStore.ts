import { create } from 'zustand';
import type { Article, ArticleStatus, DashboardData, ModelsResponse } from '../types';
import { articleApi, authApi } from '../lib/api';

interface AppState {
  session: boolean;
  view: 'articles' | 'dashboard' | 'insights';
  articles: Article[];
  filter: ArticleStatus | '';
  currentPage: number;
  totalArticles: number;
  editingId: number | null;
  isDirty: boolean;
  dashboardData: DashboardData | null;
  models: ModelsResponse | null;

  setSession: (v: boolean) => void;
  setView: (v: 'articles' | 'dashboard' | 'insights') => void;
  setFilter: (f: ArticleStatus | '') => void;
  setCurrentPage: (p: number) => void;
  setEditingId: (id: number | null) => void;
  setDirty: (d: boolean) => void;
  setDashboardData: (d: DashboardData | null) => void;
  setModels: (m: ModelsResponse | null) => void;

  loadArticles: () => Promise<void>;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  session: localStorage.getItem('immeit_session') === '1',
  view: (localStorage.getItem('immeit_last_view') as 'articles' | 'dashboard' | 'insights') || 'articles',
  articles: [],
  filter: '',
  currentPage: 1,
  totalArticles: 0,
  editingId: null,
  isDirty: false,
  dashboardData: null,
  models: null,

  setSession: (v) => set({ session: v }),
  setView: (v) => { localStorage.setItem('immeit_last_view', v); set({ view: v }); },
  setFilter: (f) => set({ filter: f, currentPage: 1 }),
  setCurrentPage: (p) => set({ currentPage: p }),
  setEditingId: (id) => set({ editingId: id }),
  setDirty: (d) => set({ isDirty: d }),
  setDashboardData: (d) => set({ dashboardData: d }),
  setModels: (m) => set({ models: m }),

  loadArticles: async () => {
    const { filter, currentPage } = get();
    const res = await articleApi.list({ statut: filter || undefined, limit: 10, page: currentPage });
    set({ articles: res.articles || [], totalArticles: res.total || 0 });
  },

  login: async (password) => {
    try {
      await authApi.login(password);
      localStorage.setItem('immeit_session', '1');
      set({ session: true });
      return true;
    } catch {
      return false;
    }
  },

  logout: async () => {
    try { await authApi.logout(); } catch {}
    localStorage.removeItem('immeit_session');
    set({ session: false, view: 'articles' });
  },
}));
