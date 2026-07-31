# PROD-ACT-01 — fechamento independente e instalação do controlador

Data: 2026-07-31

## Escopo

Fechar tecnicamente e instalar na Oracle o controlador transacional de
ativação do Open Finance, sem habilitar proposta ou escrita financeira.

## Hash auditado e instalado

`bae6454ba5ab1cc109ce608e41cb0b849b6266af`

## Evidência local

- controlador: `12/12`;
- controlador mais instalador OCI: `35/35`;
- sintaxe e `git diff --check`: verdes;
- tentativa ampla interrompida pelo limite local depois de `278` testes verdes
  e nenhuma falha; não foi contabilizada como suíte concluída.

## Auditoria independente

O Chat leu integralmente, no mesmo hash imutável, o manifesto candidato, o
controlador, seus testes, o runbook, a política de ativação e o instalador OCI.
O veredito final foi `GO TÉCNICO LOCAL`, sem lacuna indispensável residual.

O parecer confirmou:

1. substituição marcada imediatamente após o `rename` e antes do fsync;
2. falha no fsync inicial força restauração;
3. falha no fsync do rollback ainda reinicia com os bytes seguros, valida
   health e salva o PM2 antes de reportar erro;
4. testes causais exercitam renames reais e os dois pontos de falha;
5. nenhum enfraquecimento de plan somente leitura, confirmações, hash, PM2,
   health, backup, atomicidade, fail-closed ou tolerância Windows.

## Release OCI

- artefato: 719 arquivos;
- SHA-256 do artefato:
  `3064d7c9e2e2f116e3753abe705029a7ae90de6d0e893d5cc1fe5dd459ad8c49`;
- SHA-256 do instalador:
  `30452d41be2b0aa60649b17d0f18e2004e269edc05c2893b4c43d5db471dd507`;
- preparação isolada: `production_changed=false`;
- script anterior:
  `/home/ubuntu/financas-bot/releases/8f89aec906439dba0024318bddee8d255747b54f/index.js`;
- script atual:
  `/home/ubuntu/financas-bot/releases/bae6454ba5ab1cc109ce608e41cb0b849b6266af/index.js`;
- promoção: `promoted=true`;
- rollback: `false`;
- bootstrap de state store: `false`.

## Pós-deploy

- PM2 único, online, zero reinícios e zero reinícios instáveis;
- `APP_COMMIT_SHA` igual ao hash auditado;
- health local e público: SQLite verde e WhatsApp `ready/healthy`;
- `pm2-ubuntu` e `caddy`: ativos e habilitados;
- `data` e `data/backups`: modo `0700`;
- `.env` e `state_store.json`: modo `0600`;
- ciclo Open Finance: `GO`, `writes=0`;
- plano `prompt` lido com sucesso e `financial_write_enabled=false`.

Flags preservadas:

- alerta, reconciliação e preview: `canary`;
- proposta: `off`;
- escrita: `off`;
- aprovação: `false`.

## Estado autorizado

`GO TÉCNICO LOCAL; CONTROLADOR INSTALADO; ATIVAÇÃO REAL PENDENTE`.

O código seguro pode permanecer em produção, mas `prompt` e `confirm` só podem
ser ativados com Daniel presente para operar o WhatsApp e conferir o smoke
real. Este fechamento não autoriza escrita financeira por si só.
