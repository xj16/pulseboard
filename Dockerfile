# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# PulseBoard — single self-contained image.
#
# Stage 1 installs every workspace and builds the server, the Vue flagship, and
# the Svelte parity app. Stage 2 is a slim runtime that carries only the built
# server + client/dist and the server's *production* dependencies, then serves
# the whole thing (API + WebSocket + static Vue app) from one Node process.
#
#   docker build -t pulseboard .
#   docker run -p 4000:4000 pulseboard      # open http://localhost:4000
# ---------------------------------------------------------------------------

# ---- Stage 1: build -------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install with the full workspace lockfile for reproducible builds.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/
COPY svelte/package.json ./svelte/
RUN npm ci

# Bring in the sources and build all three workspaces. Each workspace carries
# its own tsconfig, so there is nothing to copy at the repo root.
COPY server ./server
COPY client ./client
COPY svelte ./svelte
RUN npm run build

# Prune dev dependencies so we can copy a lean node_modules into the runtime.
RUN npm prune --omit=dev

# ---- Stage 2: runtime -----------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
# Persist room boards to a mounted volume by default.
ENV DATA_DIR=/data

# Copy the pruned dependency tree and only the built artifacts we serve.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

# Run as the built-in non-root user shipped with the node image.
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]

EXPOSE 4000

# Lightweight healthcheck against the REST probe.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
