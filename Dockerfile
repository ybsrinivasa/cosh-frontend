FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Bump Node's heap so npm doesn't get OOM-killed mid-install — observed on
# small-memory prod hosts as the cryptic "Exit handler never called!" error
# at the tail of npm ci. 4GB is comfortable headroom for Next 16 + Tailwind v4.
ENV NODE_OPTIONS=--max-old-space-size=4096

# COPY first, install second — guarantees nothing in the build context
# (e.g. a stray host node_modules that bypasses .dockerignore) can shadow
# the install.
COPY . .

# --ignore-scripts skips lifecycle scripts that try to download platform-
# specific native binaries (sharp, lightningcss, turbo); those native deps
# are what most often crash npm with "Exit handler never called!" on slim
# Linux images. Next 16 + Tailwind v4 build successfully without them
# pre-installed — Next will JIT-load what it needs at build time.
RUN npm ci --no-audit --no-fund --ignore-scripts

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ── Runtime image ────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=2048

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["npm", "start"]
