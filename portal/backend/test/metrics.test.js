const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
const { render } = require('../src/services/metrics');

const pau = {
  slug: 'pau', plan: 'FREE', statut: 'RUNNING',
  nb_utilisateurs: 45, nb_cours: 3, stockage_utilise_mo: '12.50',
  max_utilisateurs: 50, max_cours: 5, stockage_go: 1,
  bloques_utilisateurs: '2', bloques_cours: '0', derniere_maj: '2026-11-18T10:00:00Z',
};

test('render : métriques par établissement avec ratio de consommation', () => {
  const t = render([pau]);
  assert.match(t, /sharedmoodle_tenant_info\{tenant="pau",plan="FREE",status="RUNNING"\} 1/);
  assert.match(t, /sharedmoodle_tenant_users\{tenant="pau",plan="FREE"\} 45/);
  assert.match(t, /sharedmoodle_tenant_usage_ratio\{tenant="pau",plan="FREE",resource="utilisateurs"\} 0.9/);
  assert.match(t, /sharedmoodle_tenant_storage_limit_mb\{tenant="pau",plan="FREE"\} 1024/);
  assert.match(t, /sharedmoodle_tenant_blocked\{tenant="pau",plan="FREE",type="utilisateur"\} 2/);
  assert.match(t, /# TYPE sharedmoodle_tenant_users gauge/);
});

test('render : pas de ratio pour une limite illimitée', () => {
  const t = render([{ ...pau, max_cours: -1 }]);
  assert.match(t, /sharedmoodle_tenant_courses_limit\{tenant="pau",plan="FREE"\} -1/);
  assert.doesNotMatch(t, /resource="cours"/);
});

test('render : compteurs HTTP et échappement des étiquettes', () => {
  const t = render([{ ...pau, slug: 'a"b' }], new Map([['GET 200', 3]]), { memoire: 10, uptime: 5 });
  assert.match(t, /tenant="a\\"b"/);
  assert.match(t, /sharedmoodle_http_requests_total\{method="GET",status="200"\} 3/);
  assert.match(t, /process_uptime_seconds 5/);
});
