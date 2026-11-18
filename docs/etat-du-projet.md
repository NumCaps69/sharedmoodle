# État du projet SharedMoodle (application et infra)

Dernière mise à jour : 18/11/2026 (nuit)
Code : `depot-sharedmoodle/` (GitHub NumCaps69/sharedmoodle). Branche à fusionner dans `main` : `supervision-finitions` (contient tout le travail précédent).

Légende : ✅ fait · 🔶 en cours ou partiel · ⬜ à faire

---

## 1. Fait ✅

| # | Élément | Où |
|---|---|---|
| F1 | Swarm : 1 manager + 2 workers (Docker-in-Docker) | VM 10.3.16.177 |
| F2 | Réseaux overlay (`sharedmoodle_net`, `proxy`, `sm_admin`, `monitoring`) | `docker-compose.yml` |
| F3 | Placement par étiquettes (`role=manager / app / db`) | `docker-compose.yml` |
| F4 | Traefik : routage par nom (portail, api, grafana, un nom par établissement) | `docker-compose.yml` |
| F5 | Portainer | `docker-compose.yml` |
| F6 | Portail web (HTML/JS + nginx) | `portal/frontend/` |
| F7 | API Node : inscription, connexion JWT, abonnement | `portal/backend/` |
| F8 | Paiement simulé : carte acceptée ou refusée | `routes/subscription.js` |
| F9 | Bases : PostgreSQL (portail), MariaDB (une par établissement) | `docker-compose.yml`, `tenant-stack.yml` |
| F10 | Images sur Docker Hub (`kasupremacy/...`) | Docker Hub |
| F11 | Lancement local sur le Mac, modifications visibles en direct | `docker-compose.dev.yml` |
| F12 | Schéma PostgreSQL créé par l'API au démarrage | `src/config/migrate.js`, `sql/init.sql` |
| F13 | Consommation réelle mesurée dans Moodle + alerte à 80 % + offre de mise à niveau | `src/services/usage.js` |
| F14 | Forfait PLATINUM, passage à tout forfait supérieur, refus de paiement | `config/plans.js`, `routes/subscription.js` |
| F15 | Docker secrets à la place des mots de passe en clair | `docker-compose.yml`, `scripts/create-secrets.sh` |
| F16 | Portail vers API par nginx (`/api`) : marche derrière Traefik | `portal/frontend/nginx.conf` |
| F17 | A1. Healthchecks sur tous les services + Traefik route seulement vers les tâches saines | `docker-compose.yml` |
| F18 | A2. Réplicas (2 pour frontend et api) + limites CPU/mémoire + redémarrage auto | `docker-compose.yml` |
| F19 | A3. Mise à jour continue + retour arrière auto, images versionnées (1.1.0) | `docker-compose.yml`, `scripts/release.sh` |
| F20 | B1. Scalabilité horizontale (démo) | `scripts/scale-demo.sh horizontal` |
| F21 | B2. Scalabilité verticale : service et nœud (démo) | `scripts/scale-demo.sh vertical`, `noeud` |
| F22 | B3. Autoscaler (CPU vers nombre de copies) | `scripts/autoscaler.sh` |
| F23 | B4. Test de charge `ab` | `scripts/load-test.sh` |
| F24 | D1. Un Moodle par établissement : sa base, ses volumes, son réseau, ses secrets | `portal/provisioner/tenant-stack.yml` |
| F25 | D2. Tests d'isolation Pau / Bayonne (8/8) | `scripts/test-isolation.sh` |
| F26 | D3. Création automatique du Moodle à l'inscription (provisioner) | `portal/provisioner/`, `routes/auth.js` |
| F27 | D4. Limites appliquées dans Moodle (suspension / masquage), rétablies à l'upgrade | `services/usage.js` |
| F28 | D5. Consommation par établissement + rapport d'usage (JSON / CSV) | `services/usage.js`, `routes/subscription.js` |
| F29 | C1. Prometheus + cAdvisor + node-exporter + métriques de l'API et de Traefik | `monitoring/prometheus/`, `services/metrics.js` |
| F30 | C2. Grafana : tableau par établissement, tableau plateforme, alertes de limite | `monitoring/grafana/`, `monitoring/prometheus/alerts.yml` |
| F31 | C3. Autoscaler branché sur Prometheus | `scripts/autoscaler.sh` |
| F32 | E2. Stockage partagé NFS pour les fichiers Moodle | `portal/provisioner/tenant-nfs.yml`, `scripts/setup-nfs.sh` |
| F33 | E3. README complet (architecture, local, VM, multi-tenant, élasticité, supervision, NFS, tests) | `README.md` |
| F34 | E4. Tests Swarm : panne d'un nœud, retour, maintenance, quorum | `scripts/test-swarm.sh`, `docs/preuves/` |
| F35 | Revue du code : 6 bugs corrigés | voir section 6 |

## 2. En cours ou partiel 🔶

| # | Élément | Ce qui manque |
|---|---|---|
| P1 | Tout F12 à F35 sur la VM | Testé sur le Mac seulement (Swarm jetable en Docker-in-Docker). Kaisse doit publier les images et déployer : section 7 |
| P2 | NFS sur la VM | Le serveur `sm-nfs` est en image amd64 : testé en local avec une image équivalente. À lancer sur la VM avec `./scripts/setup-nfs.sh` |

## 3. Étapes

### Étape A : solidité du cluster ✅
1. ✅ **A1. Healthchecks**
2. ✅ **A2. Réplicas et limites CPU/mémoire**
3. ✅ **A3. Mise à jour continue et rollback**

### Étape B : élasticité ✅
4. ✅ **B1. Scalabilité horizontale**
5. ✅ **B2. Scalabilité verticale**
6. ✅ **B3. Autoscaler**
7. ✅ **B4. Test de charge**

### Étape C : supervision ✅ (18/11)
8. ✅ **C1. Prometheus + cAdvisor + node-exporter**, plus les métriques de l'API (consommation de chaque établissement) et de Traefik (requêtes par site)
9. ✅ **C2. Grafana** : tableau « Établissements » (choix de l'établissement) et « Plateforme » ; alertes à 80 % et 100 % du forfait
10. ✅ **C3. Autoscaler relié à Prometheus** (règle `sharedmoodle:service_cpu_ratio`)

### Étape D : multi-établissements (SaaS) ✅
11. ✅ **D1. 2e établissement (Bayonne)**
12. ✅ **D2. Tests d'isolation**
13. ✅ **D3. Création automatique d'un Moodle à l'inscription**
14. ✅ **D4. Limites appliquées dans Moodle**
15. ✅ **D5. Consommation par client + rapport d'usage**

### Étape E : finitions ✅ (18/11)
16. ✅ **E2. Stockage partagé NFS** (fichiers Moodle sur NFS, bases en local)
17. ✅ **E3. README**
18. ✅ **E4. Tests Swarm** : panne, retour, drain, quorum

---

## Journal (ce que chaque changement apporte)

| Date | Changement | Ce que ça apporte |
|---|---|---|
| 18/11 | Schéma créé par l'API | <mark style="background-color:#b7f5c4;color:#000">Une base neuve sur n'importe quel nœud a ses tables, sans fichier à copier sur la VM</mark> |
| 18/11 | PLATINUM + upgrade | <mark style="background-color:#b7f5c4;color:#000">3 niveaux de service réels ; le serveur refuse de descendre ou de payer deux fois</mark> |
| 18/11 | Proxy `/api` dans nginx | <mark style="background-color:#b7f5c4;color:#000">Le portail parle à l'API derrière Traefik</mark> |
| 18/11 | Consommation réelle | <mark style="background-color:#b7f5c4;color:#000">Le client voit ses vrais chiffres Moodle, une alerte et l'offre de mise à niveau (service mesuré)</mark> |
| 18/11 | Docker secrets | <mark style="background-color:#b7f5c4;color:#000">Plus aucun mot de passe dans le dépôt</mark> |
| 18/11 | Healthchecks (A1) | <mark style="background-color:#b7f5c4;color:#000">Un service bloqué est remplacé seul, Traefik ne lui envoie plus de trafic</mark> |
| 18/11 | Réplicas + limites (A2) | <mark style="background-color:#b7f5c4;color:#000">Si une copie tombe, l'autre répond ; aucun service ne prend toutes les ressources</mark> |
| 18/11 | Mise à jour continue + rollback (A3) | <mark style="background-color:#b7f5c4;color:#000">Nouvelle version sans coupure ; retour seul à l'ancienne si elle plante</mark> |
| 18/11 | Scalabilité horizontale et verticale (B1, B2) | <mark style="background-color:#b7f5c4;color:#000">Plus de copies (horizontal) ou plus de CPU/mémoire (vertical)</mark> |
| 18/11 | Autoscaler + test de charge (B3, B4) | <mark style="background-color:#b7f5c4;color:#000">Le nombre de copies suit la charge tout seul : élasticité prouvée</mark> |
| 18/11 | Un Moodle par établissement (D1, D3) | <mark style="background-color:#b7f5c4;color:#000">Chaque client reçoit son propre Moodle à l'inscription : vrai SaaS multi-tenant</mark> |
| 18/11 | Isolation prouvée (D2) | <mark style="background-color:#b7f5c4;color:#000">Un établissement ne peut ni joindre ni ouvrir la base d'un autre (8/8)</mark> |
| 18/11 | Limites réelles + rapport (D4, D5) | <mark style="background-color:#b7f5c4;color:#000">Le forfait est appliqué dans Moodle et levé à l'upgrade</mark> |
| 18/11 | Supervision (C1, C2) | <mark style="background-color:#b7f5c4;color:#000">On voit en direct le CPU, la mémoire, le trafic et la consommation de chaque établissement ; une alerte part à 80 % du forfait</mark> |
| 18/11 | Autoscaler sur Prometheus (C3) | <mark style="background-color:#b7f5c4;color:#000">Décision sur une moyenne d'une minute de tous les nœuds : plus stable que `docker stats` ; test : 2, 3, 4 copies sous charge, puis 3, 2 au repos</mark> |
| 18/11 | Stockage NFS (E2) | <mark style="background-color:#b7f5c4;color:#000">Les fichiers d'un Moodle ne dépendent plus d'un nœud : il peut redémarrer ailleurs sans les perdre</mark> |
| 18/11 | Tests Swarm (E4) | <mark style="background-color:#b7f5c4;color:#000">Prouvé : un nœud tombe, ses tâches repartent ailleurs, le portail reste en ligne ; avec 3 managers le cluster survit à la perte d'un manager</mark> |

## 4. Lancer l'application sur le Mac

Prérequis : Docker Desktop lancé.

```bash
cd "/Users/mouhamed/Desktop/M1-SIGLIS/Cloud C/6 - Projet SharedMoodle/depot-sharedmoodle"
```

Tout, avec Moodle (premier lancement : plusieurs minutes) :
```bash
docker compose -f docker-compose.dev.yml up -d --build
```

Avec la supervision en plus (Prometheus, Grafana, cAdvisor) :
```bash
docker compose -f docker-compose.dev.yml --profile monitoring up -d --build
```

Ouvrir :
- Portail : http://localhost:8080
- API : http://localhost:8080/api/health
- Moodle : http://localhost:8081
- Grafana : http://localhost:3001 (`admin` / `devgrafana`)
- Prometheus : http://localhost:9090 (onglet Alerts : alertes de limite)

Tester dans le portail :
1. S'inscrire (email, mot de passe de 8 caractères, organisation) : forfait FREE
2. Voir « Mon abonnement » et la consommation
3. Passer en GOLD ou PLATINUM avec la carte `4242 4242 4242 4242`
4. Tester un refus avec une autre carte, ex. `1111 1111 1111 1111`
5. Voir l'alerte : 4 cours de test dans le Moodle local (4/5 = 80 % pour FREE), aussi visible dans Grafana et Prometheus

Voir ce qui se passe :
```bash
docker compose -f docker-compose.dev.yml ps
```
```bash
docker compose -f docker-compose.dev.yml logs -f api
```

Arrêter :
```bash
docker compose -f docker-compose.dev.yml --profile monitoring down
```

---

## 5. Rôle de chaque point

<mark style="background-color:#b7f5c4;color:#000">En vert</mark> : l'idée à retenir pour la soutenance.

- **Swarm 1 manager + 2 workers** : <mark style="background-color:#b7f5c4;color:#000">plusieurs machines vues comme une seule</mark> ; le manager décide où tourne chaque service, les workers l'exécutent.
- **Réseaux overlay** : <mark style="background-color:#b7f5c4;color:#000">réseau virtuel commun à tous les nœuds</mark> ; les services se parlent par leur nom, quel que soit le nœud.
- **Étiquettes de placement** : <mark style="background-color:#b7f5c4;color:#000">choisir sur quel nœud tourne un service (ex. bases de données sur `role=db`)</mark>.
- **Traefik** : <mark style="background-color:#b7f5c4;color:#000">porte d'entrée unique</mark> ; <mark style="background-color:#b7f5c4;color:#000">envoie chaque requête au bon service selon le nom demandé</mark> (portail, api, grafana, pau, bayonne).
- **Portainer** : <mark style="background-color:#b7f5c4;color:#000">interface web pour voir et gérer nœuds, services et piles</mark>.
- **Portail + API** : <mark style="background-color:#b7f5c4;color:#000">le libre-service du client (inscription, abonnement, paiement)</mark> ; c'est ce qui fait du projet un SaaS.
- **Paiement simulé** : <mark style="background-color:#b7f5c4;color:#000">montre l'achat d'un niveau supérieur, et le refus côté serveur</mark>.
- **PostgreSQL / MariaDB** : <mark style="background-color:#b7f5c4;color:#000">PostgreSQL garde les clients et abonnements</mark> ; chaque établissement a sa MariaDB.
- **Images sur Docker Hub** : <mark style="background-color:#b7f5c4;color:#000">chaque nœud peut télécharger l'image, donc le service peut tourner n'importe où</mark>.
- **Healthchecks** : <mark style="background-color:#b7f5c4;color:#000">chaque service est testé toutes les 30 s, après 3 échecs le Swarm le remplace</mark>, et <mark style="background-color:#b7f5c4;color:#000">Traefik ne lui envoie plus de trafic</mark>.
- **Réplicas** : <mark style="background-color:#b7f5c4;color:#000">plusieurs copies d'un service</mark> ; si une tombe, les autres répondent.
- **Limites CPU/mémoire** : <mark style="background-color:#b7f5c4;color:#000">un service ne peut pas prendre toutes les ressources d'un nœud</mark>.
- **Mise à jour continue et rollback** : <mark style="background-color:#b7f5c4;color:#000">mettre à jour sans coupure, et revenir à la version précédente si ça casse</mark>.
- **Scalabilité horizontale** : <mark style="background-color:#b7f5c4;color:#000">ajouter ou retirer des copies d'un service</mark>.
- **Scalabilité verticale** : <mark style="background-color:#b7f5c4;color:#000">donner plus ou moins de CPU/mémoire à un service ou un nœud</mark>.
- **Autoscaler** : <mark style="background-color:#b7f5c4;color:#000">fait la scalabilité horizontale tout seul selon la charge (Swarm ne le fait pas nativement)</mark> ; il lit le CPU dans Prometheus.
- **Test de charge** : <mark style="background-color:#b7f5c4;color:#000">simuler beaucoup d'utilisateurs pour prouver que l'autoscaler réagit</mark>.
- **cAdvisor / node-exporter** : <mark style="background-color:#b7f5c4;color:#000">un sur chaque nœud, mesurent le CPU, la mémoire et le réseau des conteneurs et des nœuds</mark>.
- **Prometheus** : <mark style="background-color:#b7f5c4;color:#000">collecte toutes les mesures toutes les 15 s, les garde 7 jours et déclenche les alertes</mark> ; pas de mot de passe, donc jamais publié.
- **Grafana** : <mark style="background-color:#b7f5c4;color:#000">affiche les mesures en tableaux, par établissement et pour la plateforme</mark> ; protégé par mot de passe (secret).
- **Métriques de l'API** : <mark style="background-color:#b7f5c4;color:#000">la consommation de chaque client (utilisateurs, cours, stockage) devient visible dans Grafana</mark> : preuve du « service mesuré » du NIST.
- **2e établissement + isolation** : <mark style="background-color:#b7f5c4;color:#000">prouve la multi-location : chaque client a ses données séparées</mark>.
- **Création automatique d'un Moodle** : <mark style="background-color:#b7f5c4;color:#000">le client obtient son espace sans intervention humaine (libre-service)</mark>.
- **Provisioner** : <mark style="background-color:#b7f5c4;color:#000">seul service qui a le droit de piloter Docker</mark> ; l'API lui demande de créer le Moodle d'un client (moindre privilège).
- **Réseau sm_admin** : <mark style="background-color:#b7f5c4;color:#000">seule l'API joint les bases des établissements</mark> ; les Moodle n'y sont pas.
- **PLATINUM et limites côté serveur** : <mark style="background-color:#b7f5c4;color:#000">les niveaux de service sont réellement appliqués, pas seulement affichés</mark>.
- **Docker secrets** : <mark style="background-color:#b7f5c4;color:#000">mots de passe chiffrés et donnés seulement aux services qui en ont besoin</mark>.
- **Stockage NFS** : <mark style="background-color:#b7f5c4;color:#000">les fichiers d'un Moodle suivent le service s'il change de nœud</mark> ; les bases restent en local (une base sur NFS est déconseillée).
- **Quorum** : <mark style="background-color:#b7f5c4;color:#000">les managers votent ; avec 3 managers, le cluster continue si 1 tombe, avec 1 seul manager sa panne bloque tout changement</mark>.
- **README** : <mark style="background-color:#b7f5c4;color:#000">permet à n'importe qui (et au prof) de redéployer le projet</mark>.
- **Tests Swarm** : <mark style="background-color:#b7f5c4;color:#000">prouvent que le cluster survit à une panne de nœud</mark>.

---

## 6. Mouhamed a modifié

Branches GitHub : `finitions-partiel`, `healthchecks`, `replicas-limites`, `mise-a-jour-rollback`, `elasticite`, `multi-etablissements`, `supervision-finitions` (chacune contient la précédente : fusionner seulement la dernière dans `main`).

| Date | Mouhamed a changé | Fichiers | Ce que ça change |
|---|---|---|---|
| 18/11 | Création du schéma PostgreSQL par l'API | `migrate.js`, `sql/init.sql` | <mark style="background-color:#b7f5c4;color:#000">Les tables sont créées au démarrage de l'API, sur n'importe quel nœud</mark> |
| 18/11 | Forfait PLATINUM | `config/plans.js`, `sql/init.sql` | <mark style="background-color:#b7f5c4;color:#000">3 niveaux FREE / GOLD / PLATINUM avec leurs limites et leurs prix</mark> |
| 18/11 | Upgrade vers tout forfait supérieur, refus de paiement | `routes/subscription.js` | <mark style="background-color:#b7f5c4;color:#000">Le serveur refuse de descendre ; carte refusée : code 402, le client garde son forfait</mark> |
| 18/11 | Consommation réelle et alertes | `services/usage.js`, `js/app.js` | <mark style="background-color:#b7f5c4;color:#000">Utilisateurs, cours et stockage comptés dans Moodle ; alerte à 80 % et 100 %</mark> |
| 18/11 | Portail : forfaits dynamiques, proxy `/api`, cache court | `portal/frontend/` | <mark style="background-color:#b7f5c4;color:#000">Le portail marche derrière Traefik et charge toujours la dernière version</mark> |
| 18/11 | Docker secrets | `docker-compose.yml`, `create-secrets.sh` | <mark style="background-color:#b7f5c4;color:#000">Plus aucun mot de passe dans le dépôt</mark> |
| 18/11 | Lancement local | `docker-compose.dev.yml` | <mark style="background-color:#b7f5c4;color:#000">Toute l'application tourne sur un Mac/PC</mark> |
| 18/11 | Healthchecks, routage selon la santé (A1) | `docker-compose.yml` | <mark style="background-color:#b7f5c4;color:#000">Tâche malade remplacée, Traefik l'évite</mark> |
| 18/11 | Réplicas, limites, redémarrage, verrou de migration (A2) | `docker-compose.yml`, `migrate.js` | <mark style="background-color:#b7f5c4;color:#000">2 copies, plafonds CPU/mémoire, plusieurs API démarrent ensemble sans conflit</mark> |
| 18/11 | Mise à jour continue, rollback, versions, `release.sh` (A3) | `docker-compose.yml`, `scripts/release.sh` | <mark style="background-color:#b7f5c4;color:#000">Mise à jour sans coupure, retour arrière seul, une commande pour publier</mark> |
| 18/11 | Démos d'élasticité, autoscaler, test de charge (B1 à B4) | `scripts/` | <mark style="background-color:#b7f5c4;color:#000">Horizontal, vertical et automatique prouvés</mark> |
| 18/11 | Provisioner, pile par établissement, ressources selon le forfait (D1, D3) | `portal/provisioner/` | <mark style="background-color:#b7f5c4;color:#000">Un Moodle isolé par client, créé à l'inscription en ~3 min</mark> |
| 18/11 | Réseau `sm_admin`, mots de passe dérivés (HMAC) | `docker-compose.yml`, `services/tenants.js` | <mark style="background-color:#b7f5c4;color:#000">Seule l'API joint les bases ; rien à stocker par client</mark> |
| 18/11 | Limites dans Moodle, consommation par client, rapport (D4, D5) | `services/usage.js`, `routes/subscription.js` | <mark style="background-color:#b7f5c4;color:#000">Forfait appliqué, chiffres propres à chaque client, rapport CSV</mark> |
| 18/11 | Tests d'isolation (D2) | `scripts/test-isolation.sh` | <mark style="background-color:#b7f5c4;color:#000">8/8 réussis</mark> |
| 18/11 | Métriques de l'API (C1) | `services/metrics.js`, `src/index.js` | <mark style="background-color:#b7f5c4;color:#000">Port interne 9464 : consommation et limites de chaque établissement pour Prometheus, jamais exposé</mark> |
| 18/11 | Prometheus, cAdvisor, node-exporter, Grafana (C1, C2) | `docker-compose.yml`, `monitoring/` | <mark style="background-color:#b7f5c4;color:#000">Supervision complète dans la pile ; configuration intégrée aux images (déploiement par `stack deploy -c -` possible)</mark> |
| 18/11 | Métriques Traefik | `docker-compose.yml` (port interne 8082) | <mark style="background-color:#b7f5c4;color:#000">Requêtes par seconde de chaque site, codes d'erreur</mark> |
| 18/11 | Règles et alertes Prometheus + tests (C2) | `monitoring/prometheus/alerts.yml`, `alerts.test.yml` | <mark style="background-color:#b7f5c4;color:#000">Alerte à 80 % et 100 % du forfait, éléments bloqués, mémoire, cible en panne, CPU élevé, nœud sans mémoire ; testées avec `promtool`</mark> |
| 18/11 | Tableaux Grafana (C2) | `monitoring/grafana/dashboards/` | <mark style="background-color:#b7f5c4;color:#000">« Établissements » (forfait, jauges, CPU, mémoire, trafic, alertes) et « Plateforme » (copies, CPU en % de la limite, nœuds)</mark> |
| 18/11 | Secret Grafana | `create-secrets.sh`, `docker-compose.yml` | <mark style="background-color:#b7f5c4;color:#000">Nouveau secret `sm_grafana_admin_password` ; Grafana sur http://grafana.sharedmoodle</mark> |
| 18/11 | Autoscaler sur Prometheus (C3) | `scripts/autoscaler.sh` | <mark style="background-color:#b7f5c4;color:#000">`SOURCE=auto` : Prometheus s'il répond, sinon `docker stats` ; requête faite dans le conteneur Prometheus, aucun port ouvert</mark> |
| 18/11 | Stockage NFS (E2) | `tenant-nfs.yml`, `provisioner/src/index.js`, `scripts/setup-nfs.sh` | <mark style="background-color:#b7f5c4;color:#000">Avec `NFS_ADDR: sm-nfs`, les nouveaux établissements ont leurs fichiers Moodle sur NFS ; les anciens gardent leur stockage</mark> |
| 18/11 | Tests de panne (E4) | `scripts/test-swarm.sh` | <mark style="background-color:#b7f5c4;color:#000">Panne, retour et maintenance d'un nœud ; résultat dans `docs/preuves/`</mark> |
| 18/11 | README (E3) | `README.md` | <mark style="background-color:#b7f5c4;color:#000">Architecture, lancement, déploiement pas à pas, supervision, NFS, tests</mark> |
| 18/11 | Revue du code | provisioner, `metrics.js`, `autoscaler.sh`, `setup-nfs.sh` | <mark style="background-color:#b7f5c4;color:#000">6 bugs corrigés : stockage gardé à l'upgrade, API qui ne plante plus si le port des métriques est pris, test NFS qui continue après un échec, journal CSV, nombre de copies mesuré, tests de santé non comptés</mark> |
| 18/11 | Textes sans tirets longs | portail, commentaires, preuves | <mark style="background-color:#b7f5c4;color:#000">Documents plus naturels</mark> |
| 18/11 | Tests | `npm test` (backend 16, provisioner 4), `promtool test rules` | <mark style="background-color:#b7f5c4;color:#000">Tout passe</mark> |

### Résultats des tests (Mac, Swarm jetable)

| Test | Résultat | Preuve |
|---|---|---|
| Autoscaler sur Prometheus | 2, 3, 4 copies sous charge, puis 3, 2 au repos (seuils de test 40 % / 10 %, car la charge du Mac plafonne à ~65 %) | `docs/preuves/autoscaler-prometheus-test.csv` |
| Cibles Prometheus | api (2 copies), cadvisor, node-exporter, traefik, prometheus : toutes `up` | |
| Alertes | `EtablissementLimiteProche` déclenchée pour les comptes à 4/5 cours | Prometheus, onglet Alerts |
| NFS | provisioner crée les dossiers, Moodle monté sur NFS, base en local | `docs/preuves/nfs-test-local.txt` |
| Panne d'un nœud | nœud vu Down en 12 s, portail toujours en ligne, Moodle lié au seul nœud `app` en attente jusqu'au retour | `docs/preuves/swarm-panne-test-local.txt` |
| Quorum | 3 managers : 1 en panne, le cluster accepte les changements ; 2 en panne, il les refuse | `docs/preuves/quorum-test-local.txt` |

Conclusion du test de panne : <mark style="background-color:#b7f5c4;color:#000">avec un seul nœud `app`, le Moodle d'un établissement attend le retour du nœud ; avec 2 nœuds `app` et NFS, il repart tout de suite sur l'autre</mark>.

### Démos pour la soutenance (sur la VM)

Healthcheck :
```bash
docker exec manager1 docker service update --health-cmd "exit 1" --health-interval 5s --health-retries 1 sharedmoodle_api
docker exec manager1 docker service ps sharedmoodle_api
docker exec manager1 docker service rollback sharedmoodle_api
```

Mise à jour et rollback :
```bash
docker exec manager1 docker service update --image kasupremacy/sharedmoodle-api:inexistante sharedmoodle_api
docker exec manager1 docker service ps sharedmoodle_api
```

Élasticité (2 terminaux, Grafana « Plateforme » ouvert à côté) :
```bash
./scripts/autoscaler.sh
```
```bash
./scripts/load-test.sh api 120 50
```

Multi-établissements :
```bash
./scripts/test-isolation.sh pau bayonne
```

Supervision : ouvrir http://grafana.sharedmoodle, tableau « Établissements », choisir `pau`.

Panne d'un nœud :
```bash
./scripts/test-swarm.sh
```

### Valeurs de test (uniquement pour les tests)

| Usage | Valeur |
|---|---|
| Carte acceptée | `4242 4242 4242 4242` (date et CVC : n'importe lesquels, ex. `12/28`, `123`) |
| Carte refusée | n'importe quelle autre, ex. `1111 1111 1111 1111` |
| Comptes portail créés en local | `test@pau.fr`, `plat@bayonne.fr` (PLATINUM), `conso@pau.fr` (FREE, alerte cours) ; mot de passe `testtest1` |
| Admin Moodle local | défini dans `docker-compose.dev.yml` (`MOODLE_USERNAME` / `MOODLE_PASSWORD`) |
| Admin Moodle d'un établissement (Swarm) | `admin` / mot de passe du compte portail du client |
| Grafana local | `admin` / `devgrafana` |
| Grafana sur la VM | `admin` / valeur de `sm_grafana_admin_password` dans `~/sharedmoodle-secrets.txt` |
| Secrets de la plateforme sur la VM | `~/sharedmoodle-secrets.txt` sur la VM (ne pas partager dans le groupe) |

---

## 7. Pour Kaisse : tout récupérer et déployer

### 7.1 Sur ta machine : récupérer le code et publier les images

Les images doivent être construites en amd64 (la VM), même depuis un Mac M1/M2.

```bash
git clone https://github.com/NumCaps69/sharedmoodle.git
cd sharedmoodle
```

Si le dépôt est déjà cloné :
```bash
cd sharedmoodle
git fetch origin
```

Fusionner le travail dans `main` (aucun conflit : `main` est déjà contenu dans la branche) :
```bash
git checkout main
git pull origin main
git merge --ff-only origin/supervision-finitions
git push origin main
```

Se connecter à Docker Hub (compte `kasupremacy`) et préparer buildx (une seule fois) :
```bash
docker login -u kasupremacy
docker buildx create --name sm-builder --use
```

Construire et publier les 5 images en version 1.1.0 (api, frontend, provisioner, prometheus, grafana) :
```bash
./scripts/release.sh 1.1.0
```

Vérifier sur Docker Hub : `kasupremacy/sharedmoodle-api`, `-frontend`, `-provisioner`, `-prometheus`, `-grafana` avec le tag `1.1.0`.

### 7.2 Sur la VM : déployer

```bash
ssh <utilisateur>@10.3.16.177
```

Récupérer le code :
```bash
cd ~/sharedmoodle
git checkout main
git pull origin main
```
(premier clonage : `git clone https://github.com/NumCaps69/sharedmoodle.git ~/sharedmoodle`)

Étiqueter les nœuds (une seule fois) :
```bash
docker exec manager1 docker node update --label-add role=manager manager1
docker exec manager1 docker node update --label-add role=app worker1
docker exec manager1 docker node update --label-add role=db worker2
```

Réseau public (s'il n'existe pas déjà ; sinon le message « already exists » est sans gravité) :
```bash
docker exec manager1 docker network create -d overlay --attachable proxy
```

Créer les secrets (les secrets déjà présents sont gardés) :
```bash
./scripts/create-secrets.sh
```
Attention : PostgreSQL garde le mot de passe choisi à la création de son volume. Si le volume `sharedmoodle_postgres-data` existe déjà, donner l'ancien mot de passe :
```bash
SM_POSTGRES_PASSWORD=ancien_mot_de_passe ./scripts/create-secrets.sh
```

Déployer toute la pile (`--prune` retire l'ancien Moodle partagé) :
```bash
docker exec -i manager1 docker stack deploy --prune -c - sharedmoodle < docker-compose.yml
```

Vérifier :
```bash
docker exec manager1 docker service ls
```
Toutes les lignes doivent finir par `n/n` (ex. `2/2`). cAdvisor et node-exporter : une copie par nœud.

### 7.3 Stockage NFS (optionnel mais conseillé)

```bash
./scripts/setup-nfs.sh
```
Le script lance `sm-nfs` et vérifie que chaque nœud y écrit. Puis, dans `docker-compose.yml`, service `provisioner`, remplacer `NFS_ADDR: ""` par `NFS_ADDR: sm-nfs` et redéployer :
```bash
docker exec -i manager1 docker stack deploy -c - sharedmoodle < docker-compose.yml
```

### 7.4 Poste de démo

Ajouter dans `/etc/hosts` (Mac/Linux) ou `C:\Windows\System32\drivers\etc\hosts` (Windows) :
```text
10.3.16.177 portail.sharedmoodle api.sharedmoodle grafana.sharedmoodle pau.sharedmoodle bayonne.sharedmoodle
```

Ouvrir http://portail.sharedmoodle, inscrire « Pau » et « Bayonne », puis http://grafana.sharedmoodle.

### 7.5 Tests sur la VM (preuves pour le rapport)

```bash
./scripts/test-isolation.sh pau bayonne
```
```bash
./scripts/test-swarm.sh
```
```bash
./scripts/autoscaler.sh
```
```bash
./scripts/load-test.sh api 120 50
```
Les résultats sont écrits dans `docs/preuves/` : les ajouter au dépôt (`git add docs/preuves && git commit -m "preuves VM" && git push`).

Sécurité : changer le mot de passe admin de Portainer (il a circulé dans le groupe) et créer un compte Portainer par personne.
