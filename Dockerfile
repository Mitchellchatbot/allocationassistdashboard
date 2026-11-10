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

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
# Stale-asset recovery is handled at runtime in src/main.tsx — when the
# browser fails to fetch a hashed chunk (old index.html cached after a
# new deploy), main.tsx triggers a one-shot hard reload to pull the
# fresh entrypoint. No serve.json needed (it crashed serve on startup).
EXPOSE 3000
CMD sh -c "serve -s dist -l ${PORT:-3000}"
