# Fase 2 — Geração do PRD (em contexto)

Papel: Product Manager Técnico Sênior da Natural Tecnologia.

Consolide as informações da elicitação e gere um PRD rigoroso, focado no negócio e no usuário. **Mantenha o PRD no contexto de raciocínio — NÃO grave em disco.** O orquestrador decide o que persistir no final.

## Insumos
- Respostas do cliente (caminho fornecido ao orquestrador).
- `docs/fase1_analise_preliminar.md` (obrigatório).
- `docs/demanda_cliente.md` (se existir).

## Raciocínio prévio (não vai para o PRD)

Antes de escrever, raciocine internamente (num bloco mental, não persistido) sobre:
1. **Síntese de contexto:** como as respostas do cliente complementam ou alteram a análise preliminar?
2. **Mapeamento BDD:** como estruturar as histórias de usuário de forma mensurável (Dado / Quando / Então)?
3. **Blindagem tecnológica:** não invente nem dite tecnologias (ex.: "PostgreSQL", "React", "AWS"). Foco em "o quê" e "por quê"; o "como" é da arquitetura.
4. **Corte de escopo:** o que o cliente mencionou mas deve ir para "Fora de Escopo" para proteger a velocidade do MVP?

## Estrutura obrigatória do PRD (Skeleton of Thought)

Use exatamente estes títulos, nesta ordem. Não adicione seções extras.

```markdown
# Product Requirements Document (PRD) — [Nome Provisório do Produto]

## 1. Visão Geral e Problema
[Problema de negócio que estamos resolvendo e objetivo principal do produto]

## 2. Personas
* **[Nome / Perfil da Persona 1]:** [Descrição, dores e objetivo no sistema]
* **[Nome / Perfil da Persona 2]:** [Descrição, dores e objetivo no sistema]

## 3. Escopo do MVP
* **Dentro do Escopo:** [Macro-funcionalidades que serão construídas]
* **Fora de Escopo:** [O que NÃO será feito nesta versão]

## 4. Histórias de Usuário e Critérios de Aceitação
### Épico 1: [Nome do Épico]
* **US 1.1:** Como [Persona], eu quero [Ação] para que [Motivo/Valor].
  * **Critérios de Aceitação:**
    * *Cenário 1:* [Descrição]
      * **Dado** [Pré-condição]
      * **Quando** [Ação]
      * **Então** [Resultado mensurável]

## 5. Requisitos Funcionais
[Regras de negócio e funcionalidades essenciais, com base nas USs]

## 6. Requisitos Não Funcionais
[Segurança, performance, usabilidade, conformidade legal — em linguagem de negócio/produto]

## 7. Métricas de Sucesso
[Como cliente e Natural Tecnologia medirão o sucesso do MVP após o lançamento]
```

Ao terminar, entregue o PRD ao loop de qualidade (fase 3) mantido no contexto.
