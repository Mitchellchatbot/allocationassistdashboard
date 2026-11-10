FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_CHAT_PORTAL_URL
ARG VITE_META_ACCESS_TOKEN
ARG VITE_GOOGLE_OAUTH_CLIENT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_CHAT_PORTAL_URL=$VITE_CHAT_PORTAL_URL
ENV VITE_META_ACCESS_TOKEN=$VITE_META_ACCESS_TOKEN
ENV VITE_GOOGLE_OAUTH_CLIENT_ID=$VITE_GOOGLE_OAUTH_CLIENT_ID
RUN npm run build

# Caddy, not `serve`: besides the dashboard it forwards Scaled Admissions'
# onboarding form (/get-started) so that link stays on this domain. See Caddyfile.
FROM caddy:2.10-alpine
COPY --from=builder /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
# Stale-asset recovery is handled at runtime in src/main.tsx — when the
# browser fails to fetch a hashed chunk (old index.html cached after a
# new deploy), main.tsx triggers a one-shot hard reload to pull the
# fresh entrypoint.
EXPOSE 3000
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
