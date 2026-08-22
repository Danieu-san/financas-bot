# Parecer ChatGPT — arquitetura conversacional financeira

Data: 2026-08-22

## Proveniência e alcance

- revisão independente, defensiva e somente leitura;
- commit confirmado: `18f1bd9585b1fba9cfe74fbf26d3e50696655b78`;
- o revisor comparou a base técnica declarada pelo dossiê,
  `efc762deaa031dab691e9328b7cbf0d2b88caaf8`, com o commit solicitado e
  confirmou que a diferença contém somente o pacote documental desta revisão;
- leitura integral relatada do dossiê, do benchmark JSON e dos 18 arquivos
  primários listados na seção 9;
- nenhuma suíte ou smoke foi executado pelo revisor; contagens de testes foram
  tratadas como evidência registrada no repositório.

## Veredito

`DIREÇÃO ARQUITETURAL APROVADA COM RESSALVAS.`

A caracterização central foi considerada substancialmente correta. A causa não
é determinismo financeiro em excesso, mas determinismo linguístico espalhado
por autoridades concorrentes antes e depois da IA. O LangGraph é recuperável
como infraestrutura, mas o grafo linear atual não oferece observação e
replanejamento.

## Causas

- C1, múltiplas autoridades semânticas: confirmada e considerada a causa mais
  forte;
- C2, contexto comprimido cedo e reconstruído por heurística: confirmada;
- C3, ontologia interna transformada em objetivo do modelo: confirmada com a
  ressalva de que a ontologia continua útil como representação interna;
- C4, IA estreita e não agentic: confirmada;
- C5, mistura de segurança, cálculo e linguagem: parcial, porque o kernel
  matemático atual é adequado e deve permanecer determinístico;
- C6, múltiplas autoridades de dados: parcialmente confirmada; coexistência de
  fontes é legítima, mas roteamento distribuído e fallback silencioso não são;
- C7, verificação centrada no plano/texto: parcial; o verificador atual é forte
  em coerência factual, mas não prova adequação e suficiência da consulta;
- C8, suíte verde não prova trajetória real: fortemente confirmada pelos
  incidentes 3F1H, 4A, 4D e 5B.

## Benchmark

O revisor confirmou 33 saídas estruturadas válidas, 18 corretas e seis dos 11
casos estáveis nas três repetições. A evidência é forte contra a tese de que
basta substituir o modelo mantendo o mesmo `FinancialQueryPlan` rígido. Ela é
insuficiente para provar a nova arquitetura ponta a ponta, pois não executa
tools, não observa dados reais e não mede cobertura, fonte ou follow-up.

O benchmark deve separar invariantes estritos de equivalência semântica de
resultado e evidência. Duas trajetórias diferentes podem ser corretas se
consultarem dados autorizados equivalentes e responderem adequadamente.

## Fronteiras determinísticas preservadas

- autenticação, vínculo familiar, principals e IDs autorizados;
- roteamento de fonte e regra `indisponível != zero`;
- cálculos, períodos, competência, parcelas, orçamento, forecast e
  reconciliação;
- redaction, SQL allowlist, limites de custo e execução;
- toda escrita: resolução, preview, confirmação explícita, operation key,
  idempotência, replay, recibo e auditoria.

## Autonomia e arquitetura recomendadas

A IA recebe contexto sanitizado, escolhe poucas ferramentas semânticas de
leitura, observa o envelope de evidência e pode responder, fazer uma segunda ou
terceira consulta ou pedir esclarecimento. Ela não escolhe IDs, amplia escopo,
troca silenciosamente de fonte, calcula números nem inicia escrita.

O `FinancialQueryPlan` e o `FinancialQueryEngine` podem permanecer abaixo das
tools como representação e kernel internos. Deixam de ser a linguagem exata
que o modelo precisa produzir antes de ver qualquer evidência.

O envelope de evidência deve conter fatos, período efetivo, base temporal,
escopo público, cobertura, provenance, limitações e referência opaca. O
verificador evolui para checar também se a evidência cobre pessoa, período e
dimensão pedida.

## Migração e rollback

O parecer recomenda baseline de trajetória, tools semânticas sobre o kernel
existente, shadow, canário read-only real, cutover por domínio e retirada do
legado somente após uso zero durável. O rollback permanece uma flag por domínio
para o pipeline anterior; a escrita não participa desta mudança.

## Correções e divergências factuais

- o contrato contém 15 domínios, 16 operações e sete bases temporais, não 18
  operações e seis bases;
- a bateria oficial possui 265 perguntas, não 250;
- `CARD-018` e `CARD-019` exigem `purchase_date`, inexistente entre as bases
  aceitas pelo plano atual;
- o verificador atual é mais forte do que descrito inicialmente, mas não valida
  adequação semântica da consulta escolhida.

## Parecer final

Reaproveitar a infraestrutura LangGraph e o kernel determinístico, substituindo
o grafo linear e a obrigação de acertar antecipadamente um plano fechado por um
agente read-only limitado a duas ou três consultas. Não reduzir controles de
escopo, fonte, cálculo ou escrita.
