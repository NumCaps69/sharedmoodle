// ============================================================
// SharedMoodle — Client API
// ============================================================

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000/api'
  : `https://api.${window.location.hostname.replace(/^www\./, '')}/api`;

class SharedMoodleAPI {
  constructor() {
    this.client = this.getClient();
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    });

    const data = await response.json();

    if (response.status === 401) {
      this.clearAuth();
    }

    if (!response.ok) {
      throw { status: response.status, ...data };
    }

    return data;
  }

  // ---- Auth ----
  async register(email, password, nom, organisation) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, nom, organisation }),
    });
    this.setAuth(data);
    return data;
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setAuth(data);
    return data;
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch (e) { /* ok */ }
    this.clearAuth();
  }

  async restoreSession() {
    try {
      const data = await this.request('/auth/me');
      this.setAuth(data);
      return data.client;
    } catch (error) {
      this.clearAuth();
      return null;
    }
  }

  // ---- Abonnement ----
  async getSubscription() {
    return this.request('/subscription');
  }

  async getConsumption() {
    return this.request('/subscription/consumption');
  }

  async getInstance() {
    return this.request('/subscription/instance');
  }

  async upgrade(numeroCarte) {
    return this.request('/subscription/upgrade', {
      method: 'POST',
      body: JSON.stringify({ numeroCarte }),
    });
  }

  // ---- Helpers ----
  setAuth(data) {
    if (data.client) {
      this.client = data.client;
      localStorage.setItem('sm_client', JSON.stringify(data.client));
    }
  }

  clearAuth() {
    this.client = null;
    localStorage.removeItem('sm_client');
  }

  isLoggedIn() {
    return !!this.client;
  }

  getClient() {
    try {
      return JSON.parse(localStorage.getItem('sm_client'));
    } catch {
      return null;
    }
  }
}

// Instance globale
const api = new SharedMoodleAPI();
