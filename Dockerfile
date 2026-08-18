# syntax=docker/dockerfile:1.7
# Même forme que le Dockerfile du hub LiNX : trois étages, utilisateur non privilégié,
# `npm run start` plutôt qu'une sortie standalone — pour rester lisible par qui exploite déjà
# l'autre projet sur la même machine.
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# Les seules dépendances dont l'exécution a besoin. L'étage `deps` ci-dessus en contient
# bien davantage, et cette chaîne de construction n'a rien à faire dans l'image finale : elle
# n'y sert à rien et y traîne ses propres avertissements de sécurité.
FROM node:${NODE_VERSION}-alpine AS deps-prod
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# `next build` importe les modules de page pour les analyser, et src/lib/db refuse de se
# charger sans DATABASE_URL. Aucune connexion n'est ouverte ici : `postgres()` est paresseux,
# et toutes les pages lisent les cookies, donc aucune n'est prérendue. Cette valeur ne sert
# qu'à laisser le module se charger — elle ne survit pas à l'étage suivant.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=4100 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache libc6-compat \
 && addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=deps-prod --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Les pages /donnees et /questions lisent ces fichiers sur le disque : ils doivent voyager
# avec le serveur, sinon les parents tomberaient sur une erreur à l'endroit précis où on leur
# promet la clarté. Le joker embarque aussi les traductions (DONNEES.sq.md…) — sans elles,
# le repli silencieux vers le français cacherait leur absence en production.
COPY --from=builder --chown=nextjs:nodejs /app/DONNEES*.md /app/QUESTIONS*.md ./

USER nextjs
EXPOSE 4100

CMD ["npm", "run", "start"]
