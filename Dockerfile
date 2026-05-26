# Pinned to Node 20.15 (ships npm 10.7.0). Earlier theory that 10.8.x was
# the cause of mid-install failures turned out to be wrong — 10.7.0 has the
# same "Exit handler never called!" surface message. The actual cause was
# the cosh prod host having flaky outbound to registry.npmjs.org (some
# package fetches getting ECONNREFUSED). 10.7.0 still helps because it
# exits non-zero instead of silently partial-installing, but the real
# durability gain is the registry mirror below.
FROM node:20.15-bookworm-slim AS builder

WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=4096

# Use the npmmirror.com mirror — historically more reliable from India
# than registry.npmjs.org when the prod host has flaky outbound to npmjs.
# replace-registry-host=npmjs makes npm ci treat package-lock.json's
# npmjs.org resolved URLs as referring to whatever registry is configured,
# so we don't have to regenerate the lockfile.
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REPLACE_REGISTRY_HOST=npmjs
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
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
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REPLACE_REGISTRY_HOST=npmjs
ENV NPM_CONFIG_FETCH_RETRIES=5
ENV NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
ENV NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["npm", "start"]
