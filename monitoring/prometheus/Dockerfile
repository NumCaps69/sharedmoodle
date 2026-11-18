# Prometheus avec la configuration de SharedMoodle intégrée à l'image :
# "docker stack deploy -c -" (depuis la VM) ne peut pas lire de fichiers locaux.
FROM prom/prometheus:v2.53.2
COPY prometheus.yml alerts.yml /etc/prometheus/
