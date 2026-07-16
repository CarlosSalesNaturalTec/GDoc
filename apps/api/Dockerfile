# Build a partir da raiz do monorepo:
#   docker build -f apps/api/Dockerfile .
# (precisa da raiz como contexto porque é um workspace npm — a API depende
# de packages/shared).

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# packages/shared precisa ser buildado antes de apps/api rodar em produção —
# ver package.json (main aponta para dist/, não para o src/TS) e o
# postinstall na raiz, que faz o mesmo em dev/CI.
RUN npm run build --workspace packages/shared && \
    npm run build --workspace apps/api && \
    npm prune --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist

USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
