---
name: prd-orquestrador
description: Orquestra de forma autônoma as fases 2, 3 e 4 do pipeline de PRD da Natural Tecnologia. Gera o PRD a partir das respostas do cliente, audita com um score de prontidão e aplica correções em loop até atingir score 8 ou o limite de iterações, salvando APENAS o PRD final em docs/prd_final.md. Use sempre que o usuário já tiver as respostas do questionário de discovery (fase 1) e quiser gerar o PRD final automaticamente, pedir para rodar "as fases 2 a 4", o "orquestrador de PRD", ou consolidar o PRD. Todos os artefatos intermediários (PRDs de rascunho, relatórios de review, patches) ficam apenas no contexto e nunca são gravados em disco.
---

# Orquestrador de PRD — Fases 2 → 3 → 4 (autônomo)

Você orquestra as três últimas fases do pipeline de PRD da Natural Tecnologia num único disparo autônomo. O ponto de pausa humano (questionário) já aconteceu na Fase 1.

**Princípio central deste orquestrador:** todo o trabalho intermediário — a geração do PRD (fase 2), as auditorias (fase 3) e os patches (fase 4) — acontece **no seu contexto de raciocínio**, NÃO em disco. O único arquivo que você grava é o PRD final aprovado: `docs/prd_final.md`. Não crie `fase2_prd.md`, `fase3_review.md`, cópias com timestamp, nem qualquer outro arquivo intermediário.

## Entradas

1. **Respostas do cliente** — caminho passado na invocação (ex.: `/prd-orquestrador docs/respostas_cliente.md`). Se não for passado, procure por `docs/respostas_cliente.md`; se não existir, pergunte antes de prosseguir.
2. **Análise preliminar** — leia obrigatoriamente `docs/fase1_analise_preliminar.md` (gerado na Fase 1).
3. **Demanda bruta (opcional)** — se `docs/demanda_cliente.md` existir, leia para contexto adicional.

## Parâmetros do loop

* **Limite de iterações:** 10 (padrão). Se o usuário pedir outro limite na invocação (ex.: "máximo 5 iterações"), respeite-o.
* **Critério de aprovação:** Score de Prontidão ≥ 8.
* **Parada:** o loop encerra assim que o score atingir 8, OU ao completar o limite de iterações — o que vier primeiro.

## Fluxo de orquestração

Execute nesta ordem, mantendo o PRD "vivo" no seu contexto entre as etapas:

1. **Fase 2 — Gerar PRD (em contexto).** Leia `references/fase2_generator.md` e siga sua lógica para produzir o PRD inicial. **Não grave em disco** — mantenha o rascunho no contexto.

2. **Loop de qualidade (fases 3 e 4).** Inicialize `iteracao = 1`. Repita:
   1. **Fase 3 — Auditar (em contexto).** Leia `references/fase3_reviewer.md` e audite o rascunho atual. Produza o Score de Prontidão (0–10) e a lista de correções diretas — tudo em contexto, sem gravar `fase3_review.md`.
   2. **Registre** a iteração e o score num log interno (para o resumo final).
   3. **Se score ≥ 8:** marque como `APROVADO` e saia do loop.
   4. **Se `iteracao` ≥ limite:** marque como `LIMITE_ATINGIDO` e saia do loop (guarde a melhor versão obtida — a de maior score; em empate, a mais recente).
   5. **Senão — Fase 4 — Patch (em contexto).** Leia `references/fase4_patcher.md` e aplique cirurgicamente as correções da fase 3 ao rascunho **no contexto**. Não crie cópias com timestamp nem renomeie nada. Incremente `iteracao` e volte ao passo 2.1.

3. **Gravar o resultado final.** Garanta que `docs/` existe e grave **um único arquivo**: `docs/prd_final.md`, contendo:
   * Se `APROVADO`: o PRD aprovado, sem nenhuma anotação de review no corpo.
   * Se `LIMITE_ATINGIDO`: o PRD de maior score obtido, **precedido de um bloco de aviso** no topo do arquivo (ver abaixo).

### Bloco de aviso (apenas quando não atingiu score 8)

Insira no topo de `docs/prd_final.md`:

```markdown
> ⚠️ **PRD NÃO APROVADO AUTOMATICAMENTE** — score máximo atingido: {melhor_score}/10 após {n} iterações.
> Requer revisão humana antes de enviar para Engenharia/OpenSpec.
> Pontos pendentes: {resumo curto das lacunas que impediram o score 8}.

---
```

## Saída no terminal

Não exiba o conteúdo do PRD. Exiba um resumo do percurso:

```
✅ Orquestração concluída.
🔁 Iterações: {n} (limite: {limite})
📈 Scores por iteração: {ex.: 6 → 7 → 8}
🏷️ Status: {APROVADO (score 8+) | REVISÃO HUMANA NECESSÁRIA (não atingiu 8)}
📄 PRD final salvo em: docs/prd_final.md
🚀 {Pronto para OpenSpec/SDD. | Revise os pontos pendentes antes do handoff.}
```

## Regras invioláveis

* **Um único arquivo gravado:** apenas `docs/prd_final.md`. Nenhum artefato intermediário em disco.
* **Blindagem tecnológica:** o PRD descreve "o quê" e "por quê", nunca "como". Não deixe passar bancos de dados, linguagens ou frameworks específicos (isso é papel da arquitetura/OpenSpec depois).
* **Sem intervenção manual no meio:** uma vez disparado, rode as fases 2→3→4 sem pedir confirmação a cada etapa. Só pare para perguntar se faltar um insumo obrigatório (respostas do cliente ou análise preliminar).
* **Limpeza opcional:** por padrão, mantenha `docs/fase1_analise_preliminar.md` e `docs/fase1_questionario_cliente.txt` como registro de discovery. Só remova-os se o usuário pedir explicitamente um repositório "limpo" com apenas o PRD final.
