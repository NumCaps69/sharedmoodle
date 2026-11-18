// ============================================================
// Établissements (un client = un Moodle isolé dans sa pile "sm-<slug>")
// L'API ne pilote pas Docker : elle appelle le provisioner interne.
// Sans PROVISIONER_URL (lancement local), tous les clients utilisent
// le Moodle de démonstration (MOODLE_URL).
// ============================================================

const crypto = require('crypto');
const { readSetting } = require('../config/runtime');

function provisionerEnabled() {
  return Boolean(readSetting('PROVISIONER_URL'));
}

function tenantDomain() {
  return readSetting('TENANT_DOMAIN', { fallback: 'sharedmoodle' });
}

function tenantUrl(slug) {
  return `http://${slug}.${tenantDomain()}`;
}

// Même calcul que le provisioner : la clé maîtresse suffit pour
// retrouver le mot de passe de la base de chaque établissement.
function tenantDbPassword(slug) {
  const key = readSetting('TENANT_MASTER_KEY', { required: true });
  return crypto.createHmac('sha256', key).update(`db:${slug}`).digest('hex');
}

// Connexion à la base Moodle d'un établissement (réseau sm_admin)
function tenantDbConfig(stackName, slug) {
  return {
    host: `${stackName}_db`,
    port: 3306,
    database: 'moodle',
    user: 'moodle',
    password: tenantDbPassword(slug),
  };
}

async function call(method, path, body) {
  const base = readSetting('PROVISIONER_URL', { required: true });
  const token = readSetting('PROVISIONER_TOKEN', { required: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Provisioner-Token': token },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Provisioner : HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const createTenant = (tenant) => call('POST', '/tenants', tenant);
const changeTenantPlan = (slug, plan) => call('PUT', `/tenants/${encodeURIComponent(slug)}/plan`, { plan });
const tenantStatus = (slug) => call('GET', `/tenants/${encodeURIComponent(slug)}`);

module.exports = {
  provisionerEnabled, tenantUrl, tenantDbPassword, tenantDbConfig,
  createTenant, changeTenantPlan, tenantStatus,
};
