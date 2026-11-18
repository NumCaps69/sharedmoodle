# SharedMoodle

Prototype simple d'une plateforme permettant à des clients de gérer un abonnement FREE ou GOLD et d'accéder à un Moodle de démonstration.

## Ce que contient le projet

- un portail web d'inscription et de connexion ;
- une API Node.js et Express ;
- PostgreSQL pour les comptes et les abonnements ;
- un Moodle dédié par client (sa base, son volume, son réseau), créé à l'inscription ;
- une page de consommation ;
- un paiement simulé pour passer de FREE à GOLD.

## Démarrage en local (Mac ou PC, Docker Desktop)

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

- portail : `http://localhost:8080` (l'API est servie sous `/api`) ;
- Moodle : `http://localhost:8081` (compte admin défini dans `docker-compose.dev.yml`, valeurs de test uniquement) ;
- API : `http://localhost:8080/api/health`.

Les fichiers de `portal/frontend` et `portal/backend/src` sont montés dans les conteneurs : une modification est visible sans reconstruire l'image.

Arrêter : `docker compose -f docker-compose.dev.yml down` (ajouter `-v` pour effacer les données).

## Déploiement sur le Swarm (VM)

1. Créer les secrets une seule fois (mots de passe aléatoires, copie dans `~/sharedmoodle-secrets.txt`) :
   ```bash
   ./scripts/create-secrets.sh
   ```
2. Déployer ou mettre à jour la pile (`--prune` retire les anciens services `moodle` et `mariadb` de la pile, remplacés par un Moodle par établissement) :
   ```bash
   docker exec -i manager1 docker stack deploy --prune -c - sharedmoodle < ~/sharedmoodle/docker-compose.yml
   ```
3. Après un changement de code : construire l'image en amd64 et mettre à jour le service, par exemple :
   ```bash
   docker buildx build --platform linux/amd64 -t kasupremacy/sharedmoodle-api:latest --push portal/backend
   docker exec -it manager1 docker service update --image kasupremacy/sharedmoodle-api:latest --force sharedmoodle_api
   ```

Aucun mot de passe n'est écrit dans `docker-compose.yml` : les services lisent les Docker secrets montés dans `/run/secrets/`. L'API crée les tables PostgreSQL au démarrage si elles n'existent pas.

## Un Moodle par établissement (multi-tenant)

À l'inscription, l'API demande au **provisioner** de créer la pile `sm-<slug>` du client (`portal/provisioner/tenant-stack.yml`) :

- son Moodle et sa base MariaDB, ses volumes, son réseau, ses secrets ;
- adresse `http://<slug>.sharedmoodle` (Traefik) ; admin Moodle = `admin` / mot de passe du portail ;
- ressources selon le forfait (FREE 0,5 CPU / 768 Mo, GOLD 1 CPU / 1 Go, PLATINUM 2 CPU / 2 Go), mises à jour au changement de forfait.

Le provisioner est le seul service qui accède au socket Docker ; il n'est pas exposé et n'accepte que l'API (jeton secret). L'API joint les bases des établissements par le réseau `sm_admin` pour mesurer la consommation et appliquer les limites : au-delà du forfait, les utilisateurs les plus récents sont suspendus et les cours les plus récents masqués ; ils sont rétablis au passage à un forfait supérieur. Rapport d'usage : `GET /api/subscription/report` (`?format=csv`).

Tests d'isolation entre deux établissements : `./scripts/test-isolation.sh pau bayonne` (exemple : `docs/preuves/isolation-pau-bayonne.txt`).

Pour tester sur un poste, ajouter les noms dans `/etc/hosts` (adresse de la VM) : `portail.sharedmoodle api.sharedmoodle pau.sharedmoodle bayonne.sharedmoodle`.

## Élasticité (sur la VM)

| Script | Rôle |
|---|---|
| `scripts/scale-demo.sh horizontal api 4` | Scalabilité horizontale : passer à 4 copies puis revenir |
| `scripts/scale-demo.sh vertical api` | Scalabilité verticale d'un service : changer ses limites CPU/mémoire |
| `scripts/scale-demo.sh noeud worker1` | Scalabilité verticale d'un nœud : changer le CPU/mémoire du conteneur DinD |
| `scripts/autoscaler.sh` | Ajoute ou retire des copies selon le CPU (70 % / 25 % de la limite) ; journal dans `autoscaler.csv` |
| `scripts/load-test.sh api 120 50` | Test de charge avec `ab` pour déclencher l'autoscaler |

Swarm ne fait pas d'autoscaling seul : `autoscaler.sh` mesure le CPU des tâches sur chaque nœud (`docker stats`) et appelle `docker service scale`. Exemple de résultat : `docs/preuves/autoscaler-test-local.csv`.

## Fonctionnement simple

1. Le client s'inscrit sur le portail.
2. Il reçoit automatiquement le forfait FREE.
3. Il peut ouvrir le Moodle de démonstration.
4. Il consulte son abonnement et sa consommation.
5. Il peut passer en GOLD ou PLATINUM avec la carte `4242 4242 4242 4242` ; toute autre carte est refusée et il reste sur son forfait.

## Forfaits

| Fonction | FREE | GOLD | PLATINUM |
|---|---:|---:|---:|
| Prix | 0 € | 29,99 €/mois | 99,99 €/mois |
| Utilisateurs | 50 | 500 | 5000 |
| Cours | 5 | Illimités | Illimités |
| Stockage | 1 Go | 20 Go | 100 Go |
| Plugins personnalisés | Non | Oui | Oui |
| Support | 48h | 4h | 1h |

La consommation est mesurée dans la base Moodle ; une alerte apparaît à 80 % d'une limite, avec la proposition du forfait supérieur.

## Structure

```text
portal/backend/         API, authentification, abonnements, mesure de consommation
portal/backend/sql/     Schéma PostgreSQL (appliqué par l'API)
portal/frontend/        Interface web (nginx, transmet /api à l'API)
portal/provisioner/     Création des piles Moodle des établissements
scripts/                secrets, publication, élasticité, tests d'isolation
docker-compose.yml      Pile Docker Swarm
docker-compose.dev.yml  Lancement local
```

À venir : supervision (Prometheus/Grafana), stockage NFS.
