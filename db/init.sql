-- ============================================================
-- SharedMoodle — Schéma PostgreSQL du portail
-- Exécuté automatiquement au premier lancement de PostgreSQL
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Types énumérés
-- ============================================================

CREATE TYPE plan_type AS ENUM ('FREE', 'GOLD');
CREATE TYPE client_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
CREATE TYPE instance_status AS ENUM ('PROVISIONING', 'RUNNING', 'STOPPED', 'ERROR');
CREATE TYPE payment_status AS ENUM ('ACCEPTED', 'REFUSED');

-- ============================================================
-- Table : clients
-- ============================================================

CREATE TABLE clients (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    nom             VARCHAR(100) NOT NULL,
    organisation    VARCHAR(150) NOT NULL,
    slug            VARCHAR(100) UNIQUE NOT NULL,
    plan            plan_type NOT NULL DEFAULT 'FREE',
    statut          client_status NOT NULL DEFAULT 'PENDING',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_slug ON clients(slug);
CREATE INDEX idx_clients_statut ON clients(statut);

-- ============================================================
-- Table : limites (par forfait)
-- ============================================================

CREATE TABLE limites (
    plan                plan_type PRIMARY KEY,
    max_utilisateurs    INTEGER NOT NULL,
    max_cours           INTEGER NOT NULL,       -- -1 = illimité
    stockage_go         INTEGER NOT NULL,
    plugins_custom      BOOLEAN NOT NULL DEFAULT FALSE,
    frequence_backup    VARCHAR(20) NOT NULL DEFAULT 'hebdomadaire',
    support_delai       VARCHAR(20) NOT NULL DEFAULT '48h'
);

-- Valeurs par défaut des forfaits
INSERT INTO limites (plan, max_utilisateurs, max_cours, stockage_go, plugins_custom, frequence_backup, support_delai)
VALUES
    ('FREE', 50, 5, 1, FALSE, 'hebdomadaire', '48h'),
    ('GOLD', 500, -1, 20, TRUE, 'quotidien', '4h');

-- ============================================================
-- Table : abonnements
-- ============================================================

CREATE TABLE abonnements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    plan            plan_type NOT NULL,
    date_debut      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_fin        TIMESTAMPTZ,                -- NULL = en cours
    actif           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_abonnements_client ON abonnements(client_id);
CREATE INDEX idx_abonnements_actif ON abonnements(actif);

-- ============================================================
-- Table : paiements
-- ============================================================

CREATE TABLE paiements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    montant         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    numero_carte    VARCHAR(19) NOT NULL,       -- masqué : "4242 **** **** 4242"
    statut          payment_status NOT NULL,
    motif           VARCHAR(100),               -- ex: "Upgrade FREE -> GOLD"
    date            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_paiements_client ON paiements(client_id);

-- ============================================================
-- Table : instances_moodle
-- ============================================================

CREATE TABLE instances_moodle (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id           UUID UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    slug                VARCHAR(100) NOT NULL,
    url                 VARCHAR(255) NOT NULL,
    docker_stack_name   VARCHAR(150),
    docker_service_id   VARCHAR(100),
    statut              instance_status NOT NULL DEFAULT 'PROVISIONING',
    version_moodle      VARCHAR(20) DEFAULT '4.3',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_instances_client ON instances_moodle(client_id);
CREATE INDEX idx_instances_statut ON instances_moodle(statut);

-- ============================================================
-- Table : consommation
-- ============================================================

CREATE TABLE consommation (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id           UUID UNIQUE NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    nb_utilisateurs     INTEGER NOT NULL DEFAULT 0,
    nb_cours            INTEGER NOT NULL DEFAULT 0,
    stockage_utilise_mo DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    derniere_maj        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consommation_client ON consommation(client_id);

-- ============================================================
-- Table : logs_audit (traçabilité des actions)
-- ============================================================

CREATE TABLE logs_audit (
    id          BIGSERIAL PRIMARY KEY,
    client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
    action      VARCHAR(100) NOT NULL,
    details     JSONB,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_logs_client ON logs_audit(client_id);
CREATE INDEX idx_logs_action ON logs_audit(action);
CREATE INDEX idx_logs_date ON logs_audit(created_at);

-- ============================================================
-- Fonction : mise à jour automatique de updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_updated
    BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_instances_updated
    BEFORE UPDATE ON instances_moodle
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
