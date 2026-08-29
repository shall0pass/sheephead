# syntax=docker/dockerfile:1
#
# The Clabber web app: a static single-page app built with SvelteKit
# (adapter-static) and served by nginx. The Automerge sync server is a
# separate image - see sync-server/Dockerfile and docker-compose.yml.

# --- Stage 1: build the static site ---
FROM node:22-alpine AS build
WORKDIR /app

# PUBLIC_SYNC_URL is a SvelteKit $env/static/public value: it is baked into
# the client bundle at build time. Set it to the WebSocket URL the browser
# will use to reach the sync server (e.g. wss://sync.example.com). The default
# suits a local `docker compose up` on the same machine.
ARG PUBLIC_SYNC_URL=ws://localhost:3030
ENV PUBLIC_SYNC_URL=$PUBLIC_SYNC_URL

COPY package.json package-lock.json ./
# --ignore-scripts: nothing in the tree needs a postinstall (the
# Vite/Rolldown/Tailwind platform binaries arrive as optional deps), and it
# keeps the build fast and deterministic.
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# --- Stage 2: serve it ---
FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
