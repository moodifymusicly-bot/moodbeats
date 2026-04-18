FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# --- Build-time public config (baked into the client bundle) ---
# API_URL the browser should call and Clerk's publishable key are required.
# YouTube key is intentionally NOT accepted here -- it is server-side only.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

# Fail loudly if required build args are missing, rather than shipping a
# broken bundle that silently falls back to placeholders at runtime.
RUN test -n "$NEXT_PUBLIC_API_URL" \
 && test -n "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" \
 || (echo "Missing required build args NEXT_PUBLIC_API_URL or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" && exit 1)

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

EXPOSE 3000

CMD ["npm", "run", "start"]
