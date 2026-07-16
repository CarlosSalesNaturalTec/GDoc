.PHONY: dev dev-api dev-web migrate seed

# apps/web ainda é só o layout reservado (sem package.json) — a SPA é
# escopo de uma mudança futura. `dev` sobe apenas a API por ora.
dev: dev-api

dev-api:
	npm run dev --workspace apps/api

dev-web:
	@echo "apps/web ainda não tem aplicação (fora de escopo do bootstrap-infrastructure)"; exit 1

migrate:
	npm run migrate --workspace apps/api

seed:
	npm run seed --workspace apps/api
