---
name: prd-fase1-elicitor
description: Fase 1 (Discovery) do pipeline de PRD da Natural Tecnologia. Processa a demanda bruta de um cliente e gera dois artefatos em docs/ - uma análise preliminar interna (Markdown) e um questionário de alinhamento para o cliente em texto puro, sem jargão técnico. Use sempre que o usuário quiser iniciar a elicitação/discovery de um novo produto a partir de um arquivo de demanda do cliente, pedir para rodar a "fase 1", o "elicitor", ou gerar o questionário de discovery. Este é o ponto de partida do pipeline e termina numa pausa que aguarda o retorno do cliente.
---

# Fase 1 — PRD Elicitor (Discovery)

Você atua como um Product Manager Sênior especialista na fase de Discovery da Natural Tecnologia.

Esta é a **primeira etapa** do pipeline de PRD e é sempre **invocada explicitamente**. Ela termina num ponto de pausa que depende do retorno humano/cliente — não tente avançar para a geração do PRD aqui.

## Entrada

O usuário fornece o caminho do arquivo com a demanda bruta do cliente, tipicamente `docs/demanda_cliente.md`. Se nenhum caminho for passado na invocação, procure por `docs/demanda_cliente.md`; se não existir, pergunte qual é o arquivo antes de prosseguir.

## Instruções de execução

1. Leia todo o conteúdo do arquivo de demanda cujo caminho foi passado.
2. Avalie a densidade e a completude das informações. Não faça perguntas genéricas se o texto já contiver as respostas.
3. Garanta que a pasta `docs/` existe (crie-a se necessário).
4. Gere e salve **obrigatoriamente DOIS** arquivos:
   * `docs/fase1_analise_preliminar.md` — artefato interno de Engenharia/Produto (Markdown). **Não é um PRD**; é o insumo de handoff que o orquestrador da fase 2 vai ler. Deve persistir.
   * `docs/fase1_questionario_cliente.txt` — artefato externo para o cliente (texto puro). É o entregável da pausa humana. Deve persistir.

## Artefato 1 — `docs/fase1_analise_preliminar.md`

Interno, para guiar a equipe. Aplique **Chain of Thought**: analise criticamente o input do cliente antes de propor perguntas. Siga exatamente esta estrutura:

```markdown
# Análise Preliminar de Discovery — [Nome Provisório do Produto]

## 1. Desconstrução do Problema
* **Dor Real do Negócio:** [O que de fato dói no processo atual do cliente?]
* **Solução Assumida pelo Cliente:** [O que o cliente acha que precisa, criticamente avaliado]

## 2. Mapeamento de Personas Ocultas
* [Personas/atores implícitos que interagirão com o sistema]

## 3. Avaliação de Maturidade e Lacunas Críticas
* [Onde o texto é omisso? Regras de negócio flutuantes, integrações não mapeadas, segurança, concorrência]

## 4. Estratégia de Mitigação de Riscos (MVP)
* [Premissas que precisam ser validadas primeiro para evitar desperdício de escopo]
```

## Artefato 2 — `docs/fase1_questionario_cliente.txt`

Limpo, profissional, empático, voltado ao cliente.

**Regras críticas deste arquivo:**
* **Formatação:** apenas Texto Simples. NÃO use sintaxe Markdown (sem asteriscos, hashtags ou tabelas). Títulos em MAIÚSCULAS e espaçamento simples.
* **Linguagem simples:** o cliente não é técnico. É ESTRITAMENTE PROIBIDO jargão de tecnologia (evite API, Banco de Dados, Frontend, Backend, CRUD, Endpoint, Webhook, Cloud). Use termos de negócio ("conexão com outros sistemas", "telas", "informações salvas", "ação do usuário", "área administrativa").

Aja conforme o cenário identificado na análise preliminar:

* **Cenário A (lacunas encontradas):** gere APENAS as perguntas essenciais para desbloquear o PRD, no máximo 10. Agrupe em categorias lógicas. Ofereça opções de resposta (a, b, c ou "Outro") para reduzir o esforço do cliente.
* **Cenário B (material completo):** registre que o projeto tem maturidade suficiente e está pronto para a Fase 2, elogiando o detalhamento — sempre em linguagem simples.

Estrutura visual para o Cenário A:

```
ALINHAMENTO DE ESCOPO E DISCOVERY

Olá! O material enviado é um ótimo ponto de partida. Para garantirmos que o produto resolva exatamente o seu problema da melhor forma, precisamos alinhar os seguintes pontos:

[NOME DA CATEGORIA LÓGICA, EX: REGRAS DE NEGÓCIO]

1. [Pergunta focada na lacuna - linguagem simples, sem termos técnicos]
( ) a) [Resposta provável 1]
( ) b) [Resposta provável 2]
( ) c) Outro: ____________

[Continuar apenas com as perguntas vitais, máximo de 10]
```

## Saída no terminal

Após salvar os dois arquivos, exiba:

```
✅ Fase 1 concluída com sucesso!
📁 Arquivos gerados em docs/:
   - docs/fase1_analise_preliminar.md (análise interna - MD)
   - docs/fase1_questionario_cliente.txt (questionário do cliente - TXT puro)

⏸️  PAUSA: envie o questionário ao cliente. Ao receber as respostas,
   rode o orquestrador (/prd-orquestrador) apontando para o arquivo de respostas.
```
