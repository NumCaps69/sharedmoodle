# SharedMoodle

Plateforme SaaS qui donne à chaque établissement scolaire son propre Moodle, créé à l'inscription, sur un cluster Docker Swarm. Trois forfaits (FREE, GOLD, PLATINUM) fixent les limites et les ressources de chaque Moodle.

Projet de groupe, cours Cloud Computing, M1 SIGLIS, UPPA.

## Sommaire

1. [Architecture](#architecture)
2. [Lancer en local](#lancer-en-local-mac-ou-pc)
3. [Déployer sur le Swarm](#déployer-sur-le-swarm-vm)
4. [Un Moodle par établissement](#un-moodle-par-établissement-multi-tenant)
5. [Élasticité](#élasticité)
6. [Supervision et alertes](#supervision-prometheus-grafana-alertmanager)
7. [Stockage partagé NFS et 2e nœud](#stockage-partagé-nfs-et-2e-nœud-app)
8. [Cours partagés entre établissements](#cours-partagés-entre-établissements)
9. [Administration](#administration)
10. [Tests et preuves](#tests-et-preuves)
11. [Forfaits](#forfaits)
12. [Structure du dépôt](#structure-du-dépôt)

## Architecture

```text
                     Traefik (port 80, routage par nom)
     ┌──────────────┬──────────────┼───────────────┬──────────────────┐
portail.sharedmoodle  api.        grafana.     <slug>.sharedmoodle (un par client)
     │                 │              │               │
  frontend (nginx) ─► api (Node) ─► provisioner ─► pile sm-<slug> : Moodle + MariaDB
     x2                x2   │          (socket Docker)   volumes, réseau, secrets propres
                            ├─► PostgreSQL (clients, forfaits, paiements, consommation)
                            └─► bases des établissements (réseau sm_admin : mesure, limites)

Supervision : cAdvisor + node-exporter (chaque nœud) ─► Prometheus ─► Grafana
                                                        └─► Alertmanager ─► Discord
```

| Service | Rôle | Copies |
|---|---|---|
| `traefik` | Porte d'entrée, routage par nom, routage selon la santé des tâches | 1 (manager) |
| `frontend` | Portail web, transmet `/api` à l'API | 2 |
| `api` | Inscription, connexion, abonnement, paiement simulé, consommation, limites | 2 |
| `provisioner` | Seul service qui pilote Docker : crée la pile Moodle de chaque client | 1 (manager) |
| `postgres` | Base du portail | 1 (nœud `db`) |
| `prometheus`, `grafana` | Métriques, alertes, tableaux | 1 chacun (manager) |
| `alertmanager` | Envoie les alertes sur Discord | 1 (manager) |
| `cadvisor`, `node-exporter` | Métriques des conteneurs et des nœuds | 1 par nœud |
| `portainer` | Interface web du cluster | 1 (manager) |

Chaque service a un healthcheck, des limites CPU et mémoire, une mise à jour continue avec retour arrière automatique, et des images versionnées.

## Lancer en local (Mac ou PC)

Prérequis : Docker Desktop.

```bash
git clone https://github.com/NumCaps69/sharedmoodle.git
cd sharedmoodle
docker compose -f docker-compose.dev.yml up -d --build
```

| Adresse | Contenu |
|---|---|
| http://localhost:8080 | Portail (l'API est servie sous `/api`) |
| http://localhost:8080/api/health | État et version de l'API |
| http://localhost:8081 | Moodle de démonstration (compte admin dans `docker-compose.dev.yml`, valeurs de test) |

Avec la supervision en plus :

```bash
docker compose -f docker-compose.dev.yml --profile monitoring up -d --build
```

Grafana : http://localhost:3001 (`admin` / `devgrafana`), Prometheus : http://localhost:9090, Alertmanager : http://localhost:9093, Adminer (bases de données) : http://localhost:8082. En local, les alertes vont à un faux Discord : `docker compose -f docker-compose.dev.yml logs -f alert-receiver`.

Les dossiers `portal/frontend` et `portal/backend/src` sont montés dans les conteneurs : une modification est visible sans reconstruire. En local il n'y a pas de provisioner : tous les comptes partagent le Moodle de démonstration.

Arrêter : `docker compose -f docker-compose.dev.yml down` (ajouter `-v` pour effacer les données).

Guide complet pas à pas (comptes de test, cours de test, admin, bases de données, problèmes courants) : [docs/etat-du-projet.md](docs/etat-du-projet.md), section 4.

## Déployer sur le Swarm (VM)

Le cluster est fait de conteneurs Docker-in-Docker (`manager1`, `worker1`, `worker2`) sur la VM. Toutes les commandes se lancent sur la VM.

1. Récupérer le code :
   ```bash
   git clone https://github.com/NumCaps69/sharedmoodle.git ~/sharedmoodle
   cd ~/sharedmoodle
   ```
2. Étiqueter les nœuds (où tourne quoi) :
   ```bash
   docker exec manager1 docker node update --label-add role=manager manager1
   docker exec manager1 docker node update --label-add role=app worker1
   docker exec manager1 docker node update --label-add role=db worker2
   ```
3. Créer le réseau public et les secrets (une seule fois) :
   ```bash
   docker exec manager1 docker network create -d overlay --attachable proxy
   ./scripts/create-secrets.sh
   ```
   Les valeurs sont gardées dans `~/sharedmoodle-secrets.txt` (dont le mot de passe Grafana). Pour les alertes Discord, donner le webhook dès la création : `SM_ALERT_DISCORD_WEBHOOK='https://discord.com/api/webhooks/...' ./scripts/create-secrets.sh` (ou plus tard : `./scripts/set-discord-webhook.sh '<url>'`).
4. Déployer :
   ```bash
   docker exec -i manager1 docker stack deploy --prune -c - sharedmoodle < docker-compose.yml
   docker exec manager1 docker service ls
   ```
5. Sur le poste de démo, ajouter dans `/etc/hosts` (adresse de la VM) :
   ```text
   10.3.16.177 portail.sharedmoodle api.sharedmoodle grafana.sharedmoodle pau.sharedmoodle bayonne.sharedmoodle
   ```

Nouvelle version : `./scripts/release.sh 1.2.0` construit les images en amd64 (même depuis un Mac arm64), les publie sur Docker Hub et écrit le numéro dans `docker-compose.yml`. Ensuite `git push`, puis `git pull` et l'étape 4 sur la VM. Le Swarm met à jour une copie à la fois et revient seul à l'ancienne version si la nouvelle échoue (retour manuel : `docker service rollback <service>`).

Aucun mot de passe n'est écrit dans le dépôt : les services lisent les Docker secrets dans `/run/secrets/`. L'API crée les tables PostgreSQL au démarrage.

## Un Moodle par établissement (multi-tenant)

À l'inscription, l'API demande au provisioner de créer la pile `sm-<slug>` du client (`portal/provisioner/tenant-stack.yml`) :

- son Moodle et sa base MariaDB, ses volumes, son réseau, ses secrets ;
- l'adresse `http://<slug>.sharedmoodle` ; admin Moodle : `admin` avec le mot de passe du portail ;
- des ressources selon le forfait (FREE 0,5 CPU / 768 Mo, GOLD 1 CPU / 1 Go, PLATINUM 2 CPU / 2 Go), agrandies au passage à un forfait supérieur.

Le provisioner est le seul service qui accède au socket Docker. Il n'est pas exposé et n'accepte que l'API (jeton secret). L'API joint les bases des établissements par le réseau `sm_admin` pour mesurer la consommation et appliquer les limites : au-delà du forfait, les utilisateurs les plus récents sont suspendus et les cours les plus récents masqués, puis rétablis au passage à un forfait supérieur. Rapport d'usage : `GET /api/subscription/report` (`?format=csv`).

## Élasticité

| Script | Rôle |
|---|---|
| `scripts/scale-demo.sh horizontal api 4` | Scalabilité horizontale : 4 copies, puis retour |
| `scripts/scale-demo.sh vertical api` | Scalabilité verticale d'un service : limites CPU et mémoire |
| `scripts/scale-demo.sh noeud worker1` | Scalabilité verticale d'un nœud : CPU et mémoire du conteneur DinD |
| `scripts/autoscaler.sh` | +1 copie au-dessus de 70 % de la limite CPU, -1 sous 25 % ; journal `autoscaler.csv` |
| `scripts/load-test.sh api 120 50` | Test de charge avec `ab` |

Swarm ne fait pas d'autoscaling seul. `autoscaler.sh` lit le CPU moyen de chaque service dans Prometheus (règle `sharedmoodle:service_cpu_ratio`, moyenne sur 1 minute, tous les nœuds) et appelle `docker service scale`. Sans Prometheus, il revient à `docker stats` (`SOURCE=stats` pour le forcer).

## Supervision (Prometheus, Grafana, Alertmanager)

- **cAdvisor** et **node-exporter** tournent sur chaque nœud (mode global) : CPU, mémoire, réseau des conteneurs et des nœuds.
- **L'API** publie la consommation de chaque établissement sur un port interne (`9464`, jamais exposé) : utilisateurs, cours, stockage, limites du forfait, éléments bloqués.
- **Traefik** publie le nombre de requêtes par site.
- **Prometheus** collecte toutes les 15 s, garde 7 jours et calcule les alertes (`monitoring/prometheus/alerts.yml`) : établissement à 80 % puis 100 % de son forfait, éléments bloqués, mémoire pleine, cible injoignable, service au-dessus de 70 % de son CPU, nœud sans mémoire.
- **Grafana** (http://grafana.sharedmoodle, compte `admin`, mot de passe dans `~/sharedmoodle-secrets.txt`) contient deux tableaux :
  - *Établissements* : forfait, jauges de consommation, CPU et mémoire du Moodle et de sa base, requêtes, alertes, avec un choix de l'établissement ;
  - *Plateforme* : copies par service (l'autoscaler en action), CPU en % de la limite, mémoire, trafic, nœuds, alertes actives.

- **Alertmanager** envoie chaque alerte sur un salon Discord de l'équipe, une par établissement, avec un message « Résolu » quand elle s'arrête. Une limite atteinte remplace l'avertissement « limite proche ». Le webhook est un Docker secret. Test : `./scripts/set-discord-webhook.sh test`. Le mail est prévu en commentaire dans `monitoring/alertmanager/alertmanager.yml`.

Prometheus et Alertmanager n'ont pas de mot de passe : ils restent sur le réseau interne `monitoring`. Seul Grafana est publié.

## Stockage partagé NFS et 2e nœud app

Sans NFS, les fichiers d'un Moodle sont sur le disque du nœud où il tourne. Avec NFS, ils sont sur un serveur commun : si le nœud tombe, le Swarm relance le Moodle sur un autre nœud `app` avec les mêmes fichiers.

```bash
./scripts/setup-nfs.sh          # lance le serveur sm-nfs sur la VM et teste chaque nœud
```

Puis mettre `NFS_ADDR: sm-nfs` dans le service `provisioner` de `docker-compose.yml` et redéployer. Les nouveaux établissements ont leurs fichiers Moodle sur NFS (`portal/provisioner/tenant-nfs.yml`). Les bases MariaDB restent sur un volume local du nœud `db`, car une base de données sur NFS est déconseillée.

Ajouter un 2e nœud `app`, pour que le Moodle d'un établissement reparte sur l'autre nœud si le sien tombe :

```bash
./scripts/add-node.sh worker3            # CPUS=2 MEMORY=3g pour fixer ses ressources
```

Le script crée le conteneur Docker-in-Docker sur le réseau du manager, le fait entrer dans le Swarm, lui met l'étiquette `role=app` et télécharge à l'avance les images Moodle et MariaDB. Test : `NODE=worker1 ./scripts/test-swarm.sh`.

## Cours partagés entre établissements

Les établissements mettent leurs cours en commun (intelligence collective) sans mélanger leurs données : seul le fichier choisi est partagé.

1. Dans son Moodle, l'enseignant sauvegarde le cours (menu **Plus**, **Sauvegarde**, sans les utilisateurs) et télécharge le fichier `.mbz`.
2. Sur le portail, page **Cours partagés**, il dépose le fichier avec un titre, une discipline, un niveau et une licence libre (Creative Commons).
3. Un autre établissement le télécharge et le restaure dans son Moodle (**Administration du site**, **Cours**, **Restaurer un cours**).

Le catalogue est public en lecture ; déposer et télécharger demandent un compte. Le serveur vérifie que le fichier est bien une sauvegarde Moodle, limite sa taille (20 Mo, `MAX_COURSE_MB`) et le nombre de cours par établissement (20, `MAX_SHARED_COURSES`), compte les téléchargements et garde l'empreinte SHA-256 du fichier. Seul l'établissement auteur (ou un admin) peut retirer un cours.

Le catalogue est aussi publié en données ouvertes liées (JSON-LD, vocabulaire schema.org `Course`) : `GET /api/catalogue/jsonld`.

## Administration

La page **Admin** du portail liste tous les établissements : forfait, état réel de leur pile Moodle (demandé au provisioner), consommation par rapport au forfait, éléments bloqués, cours partagés, ainsi qu'un résumé (nombre par forfait, revenu mensuel simulé, établissements proches de leur limite).

Aucune page ne permet de devenir admin. Le droit se donne en ligne de commande, sur un compte déjà inscrit :

```bash
./scripts/make-admin.sh admin@exemple.fr               # sur la VM
LOCAL=1 ./scripts/make-admin.sh test@pau.fr            # en local
```

## Tests et preuves

| Commande | Vérifie |
|---|---|
| `cd portal/backend && npm test` | Forfaits, consommation, limites, métriques, catalogue, admin (21 tests) |
| `cd portal/provisioner && npm test` | Noms d'établissement, mots de passe dérivés, ressources, NFS (4 tests) |
| `docker run --rm --entrypoint promtool -v "$PWD/monitoring/prometheus":/c -w /c prom/prometheus:v2.53.2 test rules alerts.test.yml` | Alertes de limite et calcul CPU de l'autoscaler |
| `./scripts/test-isolation.sh pau bayonne` | Isolation entre deux établissements (réseau, identifiants, secrets, volumes, sites) |
| `./scripts/test-swarm.sh` | Quorum, maintenance d'un nœud, panne d'un nœud, retour |
| `./scripts/setup-nfs.sh test` | Chaque nœud écrit sur le serveur NFS |
| `./scripts/set-discord-webhook.sh test` | Une alerte de test arrive sur Discord |

Résultats déjà obtenus : `docs/preuves/`.

## Forfaits

| | FREE | GOLD | PLATINUM |
|---|---:|---:|---:|
| Prix | 0 € | 29,99 €/mois | 99,99 €/mois |
| Utilisateurs | 50 | 500 | 5000 |
| Cours | 5 | illimités | illimités |
| Stockage | 1 Go | 20 Go | 100 Go |
| Moodle (CPU / mémoire) | 0,5 / 768 Mo | 1 / 1 Go | 2 / 2 Go |
| Plugins personnalisés | non | oui | oui |
| Support | 48 h | 4 h | 1 h |

Paiement simulé : la carte `4242 4242 4242 4242` est acceptée, toute autre est refusée et le client garde son forfait.

## Structure du dépôt

```text
portal/backend/          API : authentification, abonnements, consommation, limites, métriques
portal/backend/sql/      Schéma PostgreSQL (appliqué par l'API au démarrage)
portal/frontend/         Portail web (nginx, transmet /api à l'API)
portal/provisioner/      Création des piles Moodle (tenant-stack.yml, tenant-nfs.yml)
monitoring/prometheus/   Configuration, règles et tests des alertes
monitoring/grafana/      Source de données et tableaux
monitoring/alertmanager/ Envoi des alertes (Discord)
scripts/                 Secrets, publication, élasticité, NFS, nœuds, admin, alertes, tests
docs/preuves/            Résultats des tests
docker-compose.yml       Pile Docker Swarm
docker-compose.dev.yml   Lancement local
```
