# ---- build stage ----
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile --config.confirmModulesPurge=false; \
    pnpm config set enable-pre-post-scripts true; \
    pnpm rebuild
COPY . .
RUN pnpm build
RUN pnpm prune --prod

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

EXPOSE 4000
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/index.js"]