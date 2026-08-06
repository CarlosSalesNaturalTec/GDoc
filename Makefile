.PHONY: dev dev-api dev-web migrate seed

# `dev` sobe apenas a API (:8080). A SPA roda em outro processo
# (`make dev-web`), com o proxy do Vite apontando para essa mesma origem —
# ver API_PROXY_PREFIXES em apps/web/vite.config.ts.
dev: dev-api

dev-api:
	npm run dev --workspace apps/api

dev-web:
	npm run dev --workspace apps/web

migrate:
	npm run migrate --workspace apps/api

seed:
	npm run seed --workspace apps/api
