# Client Docker + Node.js : le provisioner lance "docker stack deploy"
# sur le socket du manager Swarm (monté en lecture/écriture).
FROM docker:27-cli
RUN apk add --no-cache nodejs
WORKDIR /app
COPY package.json ./
COPY src/ ./src/
COPY tenant-stack.yml ./tenant-stack.yml
EXPOSE 4000
# L'image docker:cli préfixe la commande par "docker" : on remplace son point d'entrée
ENTRYPOINT ["node", "src/index.js"]
