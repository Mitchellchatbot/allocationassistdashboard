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
# serve picks up dist/serve.json for routing + cache headers:
#   index.html = no-store (users always fetch the latest entrypoint, so
#                stale builds don't keep pointing at deleted chunks)
#   /assets/*  = immutable, 1yr (safe — Vite hashes every filename)
COPY serve.json ./dist/serve.json
EXPOSE 3000
CMD sh -c "serve -s dist -l ${PORT:-3000}"
