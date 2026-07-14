# Fase 8B.1 - correcao BILL-015 e gate analitico - 2026-07-14

## Veredito

`GO de producao` para encerrar a 8B.1.

O gate analitico passou `265/265`, inclusive `BILL-015`. O GO corrige a lacuna
de roteamento de faturas, mas nao autoriza desabilitar nem remover o fallback
analitico. A janela duravel iniciada na 8B.0 continua obrigatoria.

## Causa raiz e correcao

`BILL-015` representa a pergunta `tem conta sem categoria?` e exige a rota
`bills/detect/current_state`.

O sinal generico `sem categoria` tinha precedencia sobre o substantivo `conta`
em `inferAnalyticalQueryPlan`. Com isso, o caso era roteado indevidamente para
`quality/list/transaction_date`; quando `canonical_transactions` estava
indisponivel, o gate retornava `canonical_transactions_unavailable`.

A correcao separou:

- sinal de categoria ausente;
- sujeito transacional explicito, como `lancamento`;
- sujeito de fatura/conta.

Assim, `conta sem categoria` usa o detector de faturas, enquanto `lancamento
sem categoria` continua na qualidade transacional. Nenhuma flag canonica foi
forcada e nenhum zero foi inventado para mascarar fonte indisponivel.

## Evidencia local

- TDD RED: o novo teste mostrou `quality` quando esperava `bills`.
- Teste focado apos a correcao: `6/6`.
- Protecao explicita: `tem lancamento sem categoria?` permanece em
  `quality/list/transaction_date`.
- Gate analitico: `GO`, acceptance `265/265`, zero lacunas.
- Migration gaps: `6/6`, zero missing e zero unsafe.
- Chamadas Gemini no gate: zero.
- Suite principal: `863/863`.
- Pretest 6A-6E: verde.
- `npm audit`: zero vulnerabilidades.

## Evidencia de producao

- commit/runtime `f2e2210853264fa15dbef6361fc32c7041aaadfd`;
- backup do `.env` criado fora do repositorio antes do deploy;
- instalacao remota e teste focado: `6/6`;
- gate analitico remoto: acceptance `265/265`, migration `6/6`, zero missing,
  zero unsafe e zero Gemini;
- a telemetria foi desligada apenas no processo sintetico do gate remoto para
  nao contaminar a serie duravel de uso real; a flag produtiva permaneceu ativa;
- smoke sintetico read-only de `BILL-015`: `accepted=true`, `action=answer`,
  `verified=true`, `domain=bills`, `operation=detect`,
  `tool=query_financial_plan`, `unavailable=false`;
- heartbeat duravel apos o restart: schema 1, `reason=self_check`, commit
  `f2e2210`, 23 campos allowlisted e nenhuma referencia de ator/sessao;
- arquivo de telemetria com permissao `600`;
- PM2 online, WhatsApp pronto, cron inicializado e health
  `{"ok":true,"sqlite":true}`.

## Decisao de seguranca

- fallback analitico continua ligado;
- nenhum caminho antigo foi removido;
- nenhuma fonte de verdade mudou;
- o smoke nao escreveu em planilha, ledger ou movimentos;
- uma passagem de corpus nao prova uso zero em producao.

## Rollback

O commit anterior pode ser restaurado por deploy normal. Nao houve migration de
schema ou dado. O fallback permaneceu disponivel, portanto o rollback nao exige
reconstrucao de estado.

## Proximo gate

8B.2: caracterizar de forma duravel o Dashboard v1/v2, distinguindo emissao de
link, abertura/sessao humana, refresh, chamada interna e health check. Promover
v2 somente de forma reversivel; v1 permanece como rollback e nao pode ser
removido nesta fatia.
