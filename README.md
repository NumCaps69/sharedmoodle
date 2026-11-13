# SharedMoodle

Plateforme SaaS multi-tenant pour l'hébergement d'instances Moodle isolées.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Internet (HTTPS)                      │
└──────────────────────┬──────────────────────────────────┘
                       │
              ┌────────▼────────┐
              │   Traefik v3    │  Reverse proxy + TLS auto
              │  (Let's Encrypt)│  *.sharedmoodle.fr
              └───┬────┬────┬───┘
                  │    │    │
    ┌─────────────┘    │    └─────────────┐
    ▼                  ▼                  ▼
┌────────┐     ┌─────────────┐    ┌──────────────┐
│Frontend│     │  API Node.js│    │ Moodle Client│
│ (Nginx)│     │  (Express)  │    │  (par stack) │
└────────┘     └──────┬──────┘    └──────┬───────┘
                      │                  │
               ┌──────▼──────┐    ┌──────▼───────┐
               │ PostgreSQL  │    │  MariaDB     │
               │ (portail)   │    │  (par client)│
               └─────────────┘    └──────────────┘
                                         │
                                  ┌──────▼───────┐
                                  │   NFS v4     │
                                  │  (fichiers)  │
                                  └──────────────┘
```

## Structure du projet

```
sharedmoodle/
├── docker-compose.yml          # Stack principale (portail + infra)
├── db/
│   └── init.sql                # Schéma PostgreSQL complet
├── infra/
│   ├── traefik/
│   │   └── traefik.yml         # Config Traefik statique
│   └── templates/
│       └── client-stack.yml.template  # Template stack Moodle/client
├── portal/
│   ├── backend/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── .env.example
│   │   └── src/
│   │       ├── index.js        # Point d'entrée Express
│   │       ├── config/
│   │       │   ├── database.js # Pool PostgreSQL
│   │       │   └── plans.js    # Définition des forfaits
│   │       ├── middleware/
│   │       │   ├── auth.js     # JWT auth + génération tokens
│   │       │   └── rateLimiter.js
│   │       ├── routes/
│   │       │   ├── auth.js     # POST /register, /login, /logout
│   │       │   └── subscription.js  # GET/POST abonnement, conso, upgrade
│   │       └── services/
│   │           └── provisioning.js  # Déploiement stacks Docker
│   └── frontend/
│       ├── Dockerfile
│       ├── nginx.conf
│       ├── index.html
│       ├── css/style.css
│       └── js/
│           ├── api.js          # Client API (fetch)
│           └── app.js          # SPA (router hash, pages)
└── README.md
```

## Démarrage rapide (dev)

### Option recommandée : environnement complet Docker

```bash
docker compose -f docker-compose.dev.yml up --build
```

- Portail : `http://localhost:8080`
- API : `http://localhost:3000/api/health`
- PostgreSQL : `localhost:5432`
- Le provisioning Moodle est simulé localement avec `PROVISIONING_MODE=simulate`.

Pour arrêter l'environnement :

```bash
docker compose -f docker-compose.dev.yml down
```

### Prérequis
- Docker + Docker Compose
- Node.js 20+
- PostgreSQL 16

### 1. Base de données

```bash
# Lancer PostgreSQL en local
docker run -d --name sm-postgres \
  -e POSTGRES_DB=sharedmoodle \
  -e POSTGRES_USER=smadmin \
  -e POSTGRES_PASSWORD=devpassword \
  -p 5432:5432 \
  postgres:16-alpine

# Initialiser le schéma
docker exec -i sm-postgres psql -U smadmin -d sharedmoodle < db/init.sql
```

### 2. API Backend

```bash
cd portal/backend
cp .env.example .env
# Éditer .env avec vos paramètres
npm install
npm run dev
# API dispo sur http://localhost:3000
```

### 3. Frontend

```bash
cd portal/frontend
# Ouvrir index.html directement ou avec un serveur
npx serve .
# Portail dispo sur http://localhost:3000 (ou 5500 avec Live Server)
```

### 4. Déploiement Docker Swarm (production)

```bash
# Initialiser le Swarm
docker swarm init

# Labelliser les nœuds
docker node update --label-add role=app <node-id>
docker node update --label-add role=db <node-id>

# Créer les secrets
echo "mot-de-passe-fort" | docker secret create postgres_password -
echo "jwt-secret-32-chars-minimum" | docker secret create jwt_secret -

# Déployer
docker stack deploy -c docker-compose.yml sharedmoodle
```

## API Endpoints

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | `/api/auth/register` | Non | Inscription + provisioning Moodle |
| POST | `/api/auth/login` | Non | Connexion (retourne JWT) |
| POST | `/api/auth/logout` | Non | Déconnexion |
| GET | `/api/subscription` | Oui | Mon abonnement actuel |
| GET | `/api/subscription/consumption` | Oui | Ma consommation |
| GET | `/api/subscription/instance` | Oui | Mon instance Moodle |
| POST | `/api/subscription/upgrade` | Oui | Passer en GOLD (carte test: 4242...) |
| GET | `/api/health` | Non | Health check |

## Forfaits

| | FREE | GOLD |
|---|---|---|
| Prix | 0€ | 29,99€/mois |
| Utilisateurs | 50 | 500 |
| Cours | 5 | Illimité |
| Stockage | 1 Go | 20 Go |
| Plugins custom | Non | Oui |
| Backup | Hebdo | Quotidien |
| Support | 48h | 4h |

## Équipe

- Anir
- Axel G.
- Axel Guyot
- Ferdinand Guicheteau
- Kaisse Belalem
