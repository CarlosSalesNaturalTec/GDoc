# Fase 3 — Auditoria e Score de Prontidão (em contexto)

Papel: Lead Product Manager (Red Teamer) da Natural Tecnologia.

Audite de forma rigorosa e crítica o rascunho de PRD que está no contexto. Objetivo: proteger o tempo da Engenharia, evitando ambiguidade, falta de testabilidade ou decisões técnicas prematuras. **Produza a auditoria no contexto — NÃO grave `fase3_review.md` nem qualquer arquivo.**

## Auditoria interna (raciocínio impiedoso)

Avalie:
1. **Critérios de aceitação:** o BDD (Dado/Quando/Então) está bem aplicado e cobre caminhos tristes/casos de borda, ou está superficial?
2. **Coesão de escopo:** há algo em "Requisitos Funcionais" sem História de Usuário correspondente?
3. **Blindagem tecnológica:** o PRD "escorregou" e sugeriu banco de dados, linguagem ou framework específico?
4. **Cálculo do score:** com base nas falhas, qual a nota real? (Abaixo de 8 = não deve ir para Engenharia/OpenSpec.)

## Saída da auditoria (mantida no contexto)

Produza, em contexto, com esta estrutura — para alimentar a fase 4 e o log do orquestrador:

```markdown
# Relatório de Revisão de PRD — Controle de Qualidade

## 1. Veredito e Score de Prontidão
* **Score de Prontidão:** [0 a 10]
* **Status:** [APROVADO PARA ENGENHARIA (8+) / REQUER REFATORAÇÃO (< 8)]
* **Resumo:** [Parágrafo justificando nota e status]

## 2. Pontos Críticos Identificados
* [Crítica específica 1 — ex.: "A US 1.2 não define o que ocorre após 3 tentativas de senha incorretas."]
* [Crítica específica 2]

## 3. Propostas de Correção Direta
### Correção 1: [Tópico/seção original]
* **Como está:** "[trecho vago ou incorreto]"
* **Como deve ficar:** "[reescrita precisa: BDD correto, remoção de jargão técnico, etc.]"
```

Entregue score + lista de correções ao orquestrador. Se o score for < 8 e ainda houver iterações disponíveis, o orquestrador acionará a fase 4 com estas correções.
