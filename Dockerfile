# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: build do frontend 
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS web-builder

WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
ARG VITE_USERPULSE_WIDGET_URL
ENV VITE_USERPULSE_WIDGET_URL=${VITE_USERPULSE_WIDGET_URL}
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: build do servidor
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS server-builder

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci

COPY server/ ./

RUN npx prisma generate
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 3: imagem final
# ──────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev

COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/prisma ./server/prisma

RUN cd server && npx prisma generate

COPY --from=web-builder /app/web/dist ./web/dist

# Versão do widget pra cache-busting (?v=<hash> em /widget.js) — SHA-256 (12
# chars) do próprio arquivo que esta imagem serve em runtime
# (./web/dist/widget.js, o mesmo que server/src/index.ts lê em WEB_DIST —
# ver a rota GET /widget.js). Calculado DEPOIS do COPY acima, sobre o
# artefato final já no lugar de runtime, nunca sobre uma cópia intermediária
# que possa divergir. server/src/lib/widgetVersion.ts lê esse arquivo (ver
# server/src/index.ts) — mesmo conteúdo de widget.js em todas as réplicas do
# mesmo deploy produz o mesmo hash; qualquer alteração no widget.js produz
# um hash diferente. Sem depender de git/.git (fica ignorado no
# .dockerignore), npm_package_version ou timestamp.
RUN sha256sum web/dist/widget.js | cut -c1-12 > .widget-version

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
