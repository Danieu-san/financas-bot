# Fase 6C - comprovantes financeiros vinculados

Data: 2026-07-14

## Objetivo e escopo

Permitir guardar e recuperar um comprovante somente quando existe um evento
financeiro escolhido de forma explicita. A fatia aceita PDF, JPEG, PNG e WebP;
nao executa OCR, nao interpreta valores e nunca cria ou altera transacao.

## Contrato de seguranca

- comandos aceitos vinculam ao ultimo gasto, entrada ou compra no cartao;
- o evento precisa existir e pertencer exatamente ao `user_id` autorizado;
- o bot mostra o evento antes de pedir a midia;
- o estado persistente recebe apenas chave opaca; detalhes ficam em memoria por
  15 minutos;
- o evento e revalidado antes do upload. Se o ultimo lancamento mudar, o fluxo
  cancela sem arquivo;
- tipos sao validados por MIME e assinatura binaria; limite padrao de 5 MiB;
- hash SHA-256 impede upload duplicado para o mesmo evento;
- pasta e arquivo ficam privados no Drive do dono, usando `drive.file`;
- metadados escopados ficam em SQLite sob `data/`, fora do Git;
- busca baixa o arquivo pelo bot sem expor Drive file id, hash ou event key;
- falha entre upload e metadado apaga o arquivo do Drive como rollback.

## Rollout e rollback

- padrao `FINANCIAL_RECEIPTS_MODE=off`;
- canario exige allowlist exata em `FINANCIAL_RECEIPTS_USER_IDS`;
- modo invalido falha fechado para `off`;
- producao ficou em `canary` para exatamente um usuario;
- rollback: `FINANCIAL_RECEIPTS_CANARY_ACTION=disable`, seguido de restart PM2
  com ambiente atualizado.

## Evidencia local

- TDD RED por modulo ausente;
- gate final `8/8` para politica, escopo, assinatura, idempotencia, privacidade,
  revalidacao concorrente e adapter Drive;
- suite integral `851/851`, zero falha, skip ou cancelamento;
- audit high zero, sintaxe e diff check verdes;
- E2E local real retornou NO_GO limpo porque o PC nao possui a conexao OAuth
  individual no banco local. Nenhum upload ocorreu e o cleanup temporario foi
  executado; o adapter foi validado com cliente Drive injetado.

## Evidencia de producao

- commit `cbb7065799001c63d04ddbf19d0a0a263ab15f0d` implantado por
  fast-forward;
- backup `.env.pre-6c-cbb7065-20260714T064500Z`;
- gate remoto `8/8` e audit high zero;
- canario para exatamente um usuario;
- PM2 online, WhatsApp pronto e health `{"ok":true,"sqlite":true}`;
- E2E no OAuth/Drive real: `uploads=1`, `downloads=1`, `writes=zero`,
  `cleanup=zero`, `privacy=true`;
- E2E usou SQLite temporario e apagou o arquivo sintetico no `finally`;
- hash remoto exato, worktree rastreado limpo e nenhum smoke manual necessario.

## Decisao

`GO de producao`. A 6C esta encerrada e a 6D - OCR/PDF/imagem com preview -
esta autorizada a iniciar. Comprovantes permanecem em canario; OCR continua
desligado e nao foi antecipado nesta fatia.
