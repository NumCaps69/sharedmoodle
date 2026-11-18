# Alertmanager avec la configuration de SharedMoodle intégrée à l'image
# (même raison que Prometheus : "docker stack deploy -c -" ne lit pas de fichiers locaux).
# 0.28 minimum : lecture du webhook Discord depuis un fichier (secret).
FROM prom/alertmanager:v0.28.1
COPY alertmanager.yml /etc/alertmanager/alertmanager.yml
