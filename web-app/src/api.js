const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export function getToken() {
  return localStorage.getItem('wenyi_token');
}

export function setSession(token, customer) {
  localStorage.setItem('wenyi_token', token);
  localStorage.setItem('wenyi_customer', JSON.stringify(customer));
}

export function clearSession() {
  localStorage.removeItem('wenyi_token');
  localStorage.removeItem('wenyi_customer');
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!(options.body instanceof FormData) && options.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, body: options.body instanceof FormData ? options.body : options.body !== undefined ? JSON.stringify(options.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `HTTP ${res.status}`);
    Object.assign(error, data);
    throw error;
  }
  return data;
}
