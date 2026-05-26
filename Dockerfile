# Pin to Node 20.15.x — ships with npm 10.7.0, which predates the 10.8.x
# "Exit handler never called!" regression that silently dropped ~30% of
# packages from node_modules on cosh prod 2026-05-26. The default
# node:20-bookworm-slim tracks newer Node minor versions and would pull
# in npm 10.8.x again. Using a fixed minor also means we don't need to
# `npm install -g npm@X` at build time, which avoids registry fetches
# that have been intermittently ECONNREFUSED from the prod host.
FROM node:20.15-bookworm-slim AS builder

WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=4096

# Be patient with the registry — same host had ECONNREFUSED bursts during
# the 2026-05-26 incident. 5 retries with backoff up to 2min covers most
# transient blips without making a permanent outage take forever to fail.
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=30000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

# COPY first, install second — guarantees nothing in the build context
# can shadow the install.
COPY . .

RUN npm ci --no-audit --no-fund

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ── Runtime image ────────────────────────────────────────────────────────────

FROM node:20.15-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=2048
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=30000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["npm", "start"]
