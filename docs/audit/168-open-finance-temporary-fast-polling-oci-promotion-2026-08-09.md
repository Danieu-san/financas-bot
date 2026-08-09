# OF-FAST-POLL-OCI-01 - janela temporaria promovida

Data: 2026-08-09

Hash promovido:
`b6f8edc37bd46ba977a7a4a4e59f54ad092300d6`.

## Auditoria independente

- o Chat abriu o hash completo, o pai e os seis arquivos solicitados;
- o veredito teve zero achado critical, high ou medium;
- um low probatorio, sobre cobertura explicita de todas as flags nos testes,
  foi aceito como nao bloqueante porque o contrato de produto valida as seis;
- o GO ficou restrito a uma promocao OCI controlada, com janela de 15 minutos
  por no maximo duas horas e escrita financeira desligada.

## Artefato, configuracao e promocao

- o artefato foi construido e verificado exatamente do hash auditado;
- manifesto, pacote e instalador passaram nos checksums local e remoto, com
  812 arquivos declarados;
- o slot foi preparado com `production_changed=false` e rollback preso ao
  release anterior `f5806e1b071b47d6441354928740d2139fb5ae51`;
- um backup privado do ambiente foi criado antes da alteracao;
- o intervalo temporario foi definido em 15 minutos e a expiracao em 115
  minutos, dentro do limite auditado de duas horas;
- a promocao terminou sem rollback e sem bootstrap de estado.

## Verificacao posterior

- permaneceu um unico processo online, no script e cwd esperados;
- health local e publico, SQLite, WhatsApp e liveness ficaram verdes;
- as seis flags permaneceram em `canary/canary/canary/prompt/off/false`;
- o runtime confirmou a janela rapida ativa e o fallback natural de seis horas;
- o ciclo automatico de inicializacao terminou `GO`, sem observacao nova, sem
  entrega, sem retry e com `financial_writes=0`;
- cinco stores existiam em modo `0600` e seus diretorios em `0700`;
- outbox, preview, propostas e journals foram consultados somente em modo
  read-only, sem lease ou retencao vencida e sem confirmacao pronta;
- logs recentes nao continham erro severo novo, segredo, identidade privada ou
  marcador de escrita financeira diferente de zero;
- a regra SSH `/32` temporaria foi removida e a porta voltou a ficar fechada.

Nenhum polling foi forcado, nenhuma transacao foi criada, nenhuma mensagem foi
enviada pelo Codex e nenhuma resposta foi dada nos celulares.

## Decisao

`PROMOCAO VERDE; JANELA RAPIDA ATIVA; SMOKE NATURAL PENDENTE`.

A expiracao faz o processo voltar efetivamente a seis horas mesmo que o timer
curto ainda acorde. O Gate 34 continua sem GO final ate surgir um lote numerado
genuinamente novo e o smoke familiar ser executado com Daniel e os dois
celulares, parando antes de qualquer confirmacao ou escrita.
