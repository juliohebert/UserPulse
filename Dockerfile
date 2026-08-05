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

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
