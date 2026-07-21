const API_BASE = '/api';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function api<T = any>(path: string, options: RequestInit & { timeout?: number; retries?: number } = {}): Promise<T> {
  const { timeout = 30000, retries = 0, ...fetchOpts } = options;
  const url = `${API_BASE}${path}`;

  const headers: Record<string, string> = {};
  if (fetchOpts.method && fetchOpts.method !== 'GET' && fetchOpts.method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
    const csrf = getCookie('csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    if (fetchOpts.signal) {
      if (fetchOpts.signal.aborted) {
        controller.abort();
      } else {
        fetchOpts.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    try {
      const res = await fetch(url, { ...fetchOpts, headers, credentials: 'same-origin', signal: controller.signal });
      if (res.status === 401) {
        localStorage.removeItem('immeit_session');
        window.location.reload();
        throw new Error('Session expirée');
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error || `Erreur ${res.status}`;
        const detail = body.detail ? ` [${body.detail}]` : '';
        const code = body.code ? ` (${body.code})` : '';
        console.error(`[API ${res.status}] ${msg}${detail}${code}`, { url, method: fetchOpts.method });
        throw new Error(`${msg}${detail}${code}`);
      }
      return res.json();
    } catch (e: any) {
      lastError = e;
      if (e.name === 'AbortError' && attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

export const articleApi = {
  list: (params?: { statut?: string; limit?: number; page?: number }) => {
    const q = new URLSearchParams();
    if (params?.statut !== undefined && params.statut !== '') q.set('statut', params.statut);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.page) q.set('page', String(params.page));
    return api<any>(`/articles?${q}`);
  },
  get: (id: number) => api<any>(`/articles?id=${id}`),
  create: (data: any) => api<any>('/articles', { method: 'POST', body: JSON.stringify(data), timeout: 30000 }),
  update: (id: number, data: any) => api<any>(`/articles?id=${id}`, { method: 'PUT', body: JSON.stringify(data), timeout: 30000, retries: 1 }),
  delete: (id: number) => api<any>(`/articles?id=${id}`, { method: 'DELETE' }),
};

export const authApi = {
  login: (password: string) => api<{ success: boolean }>('/auth', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => api('/auth', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }),
};

export const dashboardApi = {
  get: (signal?: AbortSignal) => api<any>('/dashboard', { timeout: 60000, signal }),
  sync: () => api<any>('/sync', { method: 'POST', timeout: 90000 }),
};

export const generateApi = {
  create: (data: any) => api<any>('/generate', { method: 'POST', body: JSON.stringify(data), timeout: 120000 }),
};

export const modelsApi = {
  list: () => api<any>('/models'),
};

export const newsApi = {
  list: () => api<any>('/news'),
};

export const imagesApi = {
  search: (query: string) => api<any>(`/images?query=${encodeURIComponent(query)}`),
};
