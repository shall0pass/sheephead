# syntax=docker/dockerfile:1
#
# The Clabber Automerge sync server: a dumb relay + on-disk document store,
# plus the tiny join-code registry. Built independently of the web app.

FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY server.mjs ./

ENV PORT=3030 \
    DATA_DIR=/data
VOLUME /data
EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "server.mjs"]
