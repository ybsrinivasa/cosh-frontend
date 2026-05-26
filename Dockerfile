FROM node:20-bookworm-slim AS builder

WORKDIR /app

# COPY first, install second — guarantees nothing in the build context
# (e.g. a stray host node_modules that bypasses .dockerignore) can shadow
# the install. We sacrifice a tiny bit of layer-cache locality for build
# reliability; npm ci is fast on bookworm-slim.
COPY . .
RUN npm ci --no-audit --no-fund

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ── Runtime image ────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["npm", "start"]
