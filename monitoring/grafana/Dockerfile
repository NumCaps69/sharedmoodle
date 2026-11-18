# Grafana avec la source Prometheus et les tableaux SharedMoodle intégrés à l'image.
# Tableaux hors de /var/lib/grafana (volume) : une nouvelle image les met à jour.
FROM grafana/grafana:11.2.0
COPY provisioning /etc/grafana/provisioning
COPY dashboards /etc/grafana/dashboards
ENV GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH=/etc/grafana/dashboards/etablissements.json \
    GF_USERS_ALLOW_SIGN_UP=false \
    GF_AUTH_ANONYMOUS_ENABLED=false \
    GF_ANALYTICS_REPORTING_ENABLED=false \
    GF_ANALYTICS_CHECK_FOR_UPDATES=false \
    GF_NEWS_NEWS_FEED_ENABLED=false
