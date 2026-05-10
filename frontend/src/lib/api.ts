const normalizeBaseUrl = (rawBaseUrl?: string): string => {
  const trimmed = (rawBaseUrl || '').trim();
  const fallback = '/api';
  if (!trimmed) return fallback;
  if (trimmed === '/') return fallback;

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
  if (withoutTrailingSlash.startsWith('http://') || withoutTrailingSlash.startsWith('https://')) {
    return withoutTrailingSlash;
  }

  return withoutTrailingSlash.startsWith('/') ? withoutTrailingSlash : `/${withoutTrailingSlash}`;
};

const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
const DEFAULT_API_BASE_URL = '/api';

const getAuthToken = () => localStorage.getItem('auth_token');

const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const handleResponse = async (res: Response) => {
  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  return res;
};

export const api = {
  async get(endpoint: string) {
    let res = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        ...getAuthHeaders(),
      },
    });
    if (res.status === 404 && API_BASE_URL !== DEFAULT_API_BASE_URL) {
      res = await fetch(`${DEFAULT_API_BASE_URL}${endpoint}`, {
        headers: {
          ...getAuthHeaders(),
        },
      });
    }
    await handleResponse(res);
    return res.json();
  },

  async post<TBody>(endpoint: string, data: TBody) {
    let res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (res.status === 404 && API_BASE_URL !== DEFAULT_API_BASE_URL) {
      res = await fetch(`${DEFAULT_API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(data),
      });
    }
    await handleResponse(res);
    return res.json();
  },

  async postStream<TBody>(endpoint: string, data: TBody) {
    let res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (res.status === 404 && API_BASE_URL !== DEFAULT_API_BASE_URL) {
      res = await fetch(`${DEFAULT_API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(data),
      });
    }

    if (res.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    return res;
  }
};
