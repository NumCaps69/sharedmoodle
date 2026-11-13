# SharedMoodle

Prototype simple d'une plateforme permettant à des clients de gérer un abonnement FREE ou GOLD et d'accéder à un Moodle de démonstration.

## Ce que contient le projet

- un portail web d'inscription et de connexion ;
- une API Node.js et Express ;
- PostgreSQL pour les comptes et les abonnements ;
- un Moodle de test avec MariaDB ;
- une page de consommation ;
- un paiement simulé pour passer de FREE à GOLD.

## Démarrage

Prérequis : Docker Desktop.

```bash
docker compose up --build
```

Puis ouvrir :

- portail SharedMoodle : `http://localhost:8080` ;
- Moodle de démonstration : `http://localhost:8081` ;
- API : `http://localhost:3000/api/health`.

Compte administrateur du Moodle de démonstration :

```text
Utilisateur : admin
Mot de passe : admin12345
```

Pour arrêter le projet :

```bash
docker compose down
```

## Fonctionnement simple

1. Le client s'inscrit sur le portail.
2. Il reçoit automatiquement le forfait FREE.
3. Il peut ouvrir le Moodle de démonstration.
4. Il consulte son abonnement et sa consommation.
5. Il peut tester le passage à GOLD avec la carte `4242 4242 4242 4242`.

## Forfaits

| Fonction | FREE | GOLD |
|---|---:|---:|
| Utilisateurs | 50 | 500 |
| Cours | 5 | Illimités |
| Stockage | 1 Go | 20 Go |
| Plugins personnalisés | Non | Oui |

## Structure

```text
db/                 Schéma PostgreSQL
portal/backend/     API, authentification et abonnements
portal/frontend/    Interface web
docker-compose.yml  Lancement local du projet
```

Docker Swarm, Traefik, NFS et la création automatique d'un Moodle par client ne font pas partie de cette première version. Ils pourront être ajoutés plus tard si le cahier des charges final les exige.
