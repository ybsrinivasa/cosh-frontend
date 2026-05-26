FROM node:20-bookworm-slim AS builder

WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=4096

# Pin npm to 10.7.0. The npm shipped with node:20-bookworm-slim (10.8.2) has a
# regression where parallel package downloads can leave the process in a state
# it can't exit from — surface symptom is "Exit handler never called!", but
# critically npm exits 0 with a PARTIAL node_modules. On cosh prod 2026-05-26
# this dropped ~130 of 440 packages including `next`, then npm run build fell
# over with "next: not found". 10.7.0 predates that regression.
RUN npm install -g npm@10.7.0

# COPY first, install second — guarantees nothing in the build context can
# shadow the install. We pay a tiny layer-cache cost for build reliability.
COPY . .

RUN npm ci --no-audit --no-fund

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ── Runtime image ────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=2048

# Same npm pin reason as above — production install must complete fully.
RUN npm install -g npm@10.7.0

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["npm", "start"]
