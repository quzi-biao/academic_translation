/**
 * api.js — Admin 后台 API 请求封装
 */

const BASE = '/api/admin';

function getToken() {
  return localStorage.getItem('admin_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    window.location.href = '/admin/login';
    throw new Error('登录已过期');
  }

  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

export const adminApi = {
  login:  (body)     => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me:     ()         => request('/auth/me'),

  // 设备
  devices: {
    list:   (params)   => request(`/devices?${new URLSearchParams(params)}`),
    get:    (id)       => request(`/devices/${id}`),
    patch:  (id, body) => request(`/devices/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id)       => request(`/devices/${id}`, { method: 'DELETE' }),
    stats:  (id)       => request(`/devices/${id}/stats`),
    points: {
      list:  (id, p)   => request(`/devices/${id}/points?${new URLSearchParams(p)}`),
      grant: (id, body)=> request(`/devices/${id}/points`, { method: 'POST', body: JSON.stringify(body) }),
    },
  },

  // 话题管理
  topics: {
    all:         (params) => request(`/topics/all?${new URLSearchParams(params)}`),
    create:      (body)   => request('/topics', { method: 'POST', body: JSON.stringify(body) }),
    deleteTopic: (id)     => request(`/topics/${id}`, { method: 'DELETE' }),
  },

  // 版本管理
  versions: {
    list:         ()          => request('/versions'),
    create:       (formData)  => {
      const token = getToken();
      return fetch(`${BASE}/versions`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) { localStorage.removeItem('admin_token'); window.location.href = '/admin/login'; throw new Error('登录已过期'); }
        if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
        return data;
      });
    },
    update:       (id, b)     => request(`/versions/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
    remove:       (id)        => request(`/versions/${id}`, { method: 'DELETE' }),
    setCurrent:   (id)        => request(`/versions/${id}/current`, { method: 'POST' }),
    clearCurrent: ()          => request('/versions/current', { method: 'DELETE' }),
  },

  // 全局配置
  config: {
    list:   ()           => request('/config'),
    update: (key, value) => request(`/config/${key}`, { method: 'PATCH', body: JSON.stringify({ value }) }),
  },

  // 音色管理
  voices: {
    list:    ()   => request('/voices'),
    sync:    ()   => request('/voices/sync',         { method: 'POST' }),
    toggle:  (id) => request(`/voices/${id}/toggle`, { method: 'PATCH' }),
    preview: (id) => request(`/voices/${id}/preview`),
  },

  // 套餐管理
  plans: {
    list:   ()           => request('/plans'),
    create: (body)       => request('/plans',          { method: 'POST',   body: JSON.stringify(body) }),
    update: (id, body)   => request(`/plans/${id}`,    { method: 'PATCH',  body: JSON.stringify(body) }),
    toggle: (id)         => request(`/plans/${id}/toggle`, { method: 'PATCH' }),
    remove: (id)         => request(`/plans/${id}`,    { method: 'DELETE' }),
  },

  // 提示词风格管理
  promptStyles: {
    list:   ()           => request('/prompt-styles'),
    get:    (id)         => request(`/prompt-styles/${id}`),
    create: (body)       => request('/prompt-styles',       { method: 'POST',   body: JSON.stringify(body) }),
    update: (id, body)   => request(`/prompt-styles/${id}`, { method: 'PUT',    body: JSON.stringify(body) }),
    remove: (id)         => request(`/prompt-styles/${id}`, { method: 'DELETE' }),
  },

  // 话题分类管理
  topicCategories: {
    list:   ()           => request('/topic-categories'),
    create: (body)       => request('/topic-categories',       { method: 'POST',   body: JSON.stringify(body) }),
    update: (id, body)   => request(`/topic-categories/${id}`, { method: 'PUT',    body: JSON.stringify(body) }),
    remove: (id)         => request(`/topic-categories/${id}`, { method: 'DELETE' }),
  },

  // 渠道管理
  channels: {
    list:   ()           => request('/channels'),
    get:    (id)         => request(`/channels/${id}`),
    create: (body)       => request('/channels', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body)   => request(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id)         => request(`/channels/${id}`, { method: 'DELETE' }),
    settlements: {
      list:   (id)       => request(`/channels/${id}/settlements`),
      create: (id, body) => request(`/channels/${id}/settlements`, { method: 'POST', body: JSON.stringify(body) }),
      preview: (id, body) => request(`/channels/${id}/settlements/preview`, { method: 'POST', body: JSON.stringify(body) }),
    }
  },

  // 订单管理
  orders: {
    list:   (params)   => request(`/orders?${new URLSearchParams(params)}`),
    update: (id, body) => request(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    refund: (id)       => request(`/orders/${id}/refund`, { method: 'POST' }),
  },

  // 工单系统
  tickets: {
    list:   (params = {}) => request(`/tickets?${new URLSearchParams(params)}`),
    create: (body)        => request('/tickets', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body)    => request(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    addMessage: (id, body)=> request(`/tickets/${id}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  },

  settlements: {
    list:     (params = {}) => request(`/settlements?${new URLSearchParams(params)}`),
    generate: (body)        => request('/settlements/generate', { method: 'POST', body: JSON.stringify(body) }),
  },

  // 后台看板
  dashboard: {
    metrics: () => request('/dashboard'),
  },

  agreements: {
    list:   ()         => request('/agreements'),
    get:    (id)       => request(`/agreements/${id}`),
    create: (body)     => request('/agreements', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/agreements/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id)       => request(`/agreements/${id}`, { method: 'DELETE' }),
  },

  users: {
    managers: () => request('/users/managers'),
  },
};
