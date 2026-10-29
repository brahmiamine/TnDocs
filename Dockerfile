FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Resource-limited background processing, separate from the web process.
FROM dependencies AS worker
RUN apk add --no-cache chromium font-noto font-noto-arabic
COPY . .
RUN addgroup -S -g 1001 workers && adduser -S -u 1001 worker -G workers && mkdir -p /app/.data/storage && chown -R worker:workers /app/.data
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV STORAGE_ROOT=/app/.data/storage
# Browser executes only escaped internal content, without JS or network resources.
# The worker container supplies process isolation; use a sandbox-enabled host where available.
ENV RENDER_CHROMIUM_NO_SANDBOX=true
USER worker
CMD ["npm", "run", "worker"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
RUN mkdir -p /app/.data/storage && chown -R nextjs:nodejs /app/.data
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV STORAGE_ROOT=/app/.data/storage
CMD ["node", "server.js"]
