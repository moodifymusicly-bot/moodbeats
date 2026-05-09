FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite bakes VITE_* vars at build time from .env.production (already in the repo).
# There are no runtime env vars for a static SPA — everything is in the bundle.
RUN npm run build

# -----------------------------------------------------------------
# Runner: nginx serving the Vite dist on port 3000
# -----------------------------------------------------------------
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
