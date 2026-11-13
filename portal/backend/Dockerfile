FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache docker-cli

COPY portal/backend/package*.json ./
RUN npm ci --omit=dev

COPY portal/backend/src/ ./src/
COPY infra/templates/client-stack.yml.template ./infra/templates/client-stack.yml.template

ENV STACK_TEMPLATE_PATH=/app/infra/templates/client-stack.yml.template
ENV STACK_OUTPUT_DIR=/app/infra/stacks

RUN mkdir -p /app/infra/stacks

EXPOSE 3000

CMD ["node", "src/index.js"]
