# sports-app — the state service behind the offline-first PWA.
#
# The lightest image in the estate: the service's only runtime dependency is
# Fastify, and its storage is `node:sqlite`, which is BUILT IN. There is no
# native module to compile and no build step — the server is plain .mjs.
#
# Build context is the REPO ROOT (one root lockfile covers shared/client/server).
#
# Runs as root, which under the VPS's ROOTLESS Docker daemon means the
# unprivileged account that owns the daemon — see the note in Ward's Dockerfile.
# It has to, because /data is a bind mount of the host's state directory.

FROM node:24-alpine AS proddeps
WORKDIR /app
# Manifests first for layer caching. All three workspace manifests are needed:
# `npm ci` validates the lockfile against every workspace the root declares and
# bails on a missing one, even though only the server's deps get installed.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/
COPY server/package.json ./server/
# Scoped to the server: unscoped this would pull the client's React tree, which
# was built on the deploy machine and shipped to Caddy as static files.
RUN npm ci --omit=dev -w @sports-app/server --include-workspace-root

FROM node:24-alpine AS prod
LABEL org.opencontainers.image.title="sports-app state service"
WORKDIR /app
COPY --from=proddeps /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
COPY server ./server
ENV NODE_ENV=production \
    SPORTS_APP_HOST=0.0.0.0 \
    SPORTS_APP_PORT=8794 \
    SPORTS_APP_DB=/data/app.db
# Every user's training history. A bind mount on the VPS, so it survives every
# deploy and stays where the backups already point.
VOLUME /data
EXPOSE 8794
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${SPORTS_APP_PORT}/api/health" || exit 1
CMD ["node", "server/state-server.mjs"]
