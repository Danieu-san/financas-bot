# OF-ALERT-BIND-01 — fechamento independente e produção

Data: 2026-08-03

## Veredito

`GO TÉCNICO E OPERACIONAL DO RECOVERY; CONFIRM BLOQUEADO`.

O recovery de proposta obsoleta foi fechado no commit imutável
`1a1630949cf6acb301a2a054e61987d1cf516fb4` após dois NO-GOs independentes e
uma reauditoria final com todas as severidades zeradas.

Esse fechamento cobre somente identificação, terminalização e não reabertura
de propostas obsoletas. Não habilita escrita, não conclui o smoke financeiro
real de 9P.4 e não autoriza `confirm`.

## Sequência de auditoria

1. `63d7bb66dba9040047b22935760b32344e9059e1`: NO-GO; mudança de
   conta podia deslocar observation/proposal ref e esconder a proposta antiga;
   faltava prova completa de journal, rollback e restart.
2. `f5768a03ea57fa7665dd1b0f5fd2dea5749fe9b6`: NO-GO; o mapa da
   identidade estável não incorporava a primeira inserção do mesmo ingest.
3. `1a1630949cf6acb301a2a054e61987d1cf516fb4`: GO TÉCNICO LOCAL;
   bloqueante, alto, médio e baixo iguais a zero, sem lacuna indispensável no
   escopo defensivo e estático.

O parecer final confirmou que a segunda representação da mesma transação fonte
encontra a primeira inserção, atravessa `insertedThisRun`, lança
`save_proposal_replay_conflict` dentro da transação SQLite e desfaz a primeira
linha. Também confirmou preservação do deslocamento persistido e da recuperação
journal/preview/restart.

## Evidência local

- save proposal shadow `13/13`;
- confirmation `9/9`;
- family alerts `6/6`;
- state machine `124/124`;
- bateria causal relacionada `152/152`;
- suíte hermética `1.436` testes, `1.431` aprovados, zero falha e cinco skips
  funcionais esperados;
- cobertura: linhas `90,59%`, branches `72,90%`, funções `90,15%`;
- `npm audit --audit-level=high`: zero vulnerabilidade;
- workflow, syntax check e diff check verdes.

## Artefato OCI

- commit: `1a1630949cf6acb301a2a054e61987d1cf516fb4`;
- arquivos verificados no manifesto: `731`;
- artefato SHA-256:
  `4c686f287254fcbba884425812b50ed877d4b37467ba140059ef3be937bab3a0`;
- instalador SHA-256:
  `30452d41be2b0aa60649b17d0f18e2004e269edc05c2893b4c43d5db471dd507`;
- preparo isolado confirmou `production_changed=false`;
- plano apontou rollback para
  `releases/c781365d1b6b5524b3ae5ac0ce821d9461821a28/index.js`.

## Promoção e saúde

- `promoted=true`;
- `rollback_performed=false`;
- `state_store_bootstrapped=false`;
- um único PM2 `financas-bot`, online, zero reinícios;
- script ativo em `releases/1a1630949cf6acb301a2a054e61987d1cf516fb4/index.js`;
- `APP_COMMIT_SHA` corresponde ao hash completo;
- health local e público: SQLite e WhatsApp verdes,
  `whatsappStatus=ready`, `whatsappLiveness=healthy`;
- `pm2-ubuntu` e Caddy ativos;
- hashes de `.env`, `credentials.json` e `state_store.json` idênticos antes e
  depois da promoção;
- flags preservadas: proposal `prompt`, write `off`, approved `false` e admin
  amplo do dashboard `false`.

## Primeiro ciclo do novo release

Às 16:46:59 UTC, depois do startup do novo processo, o ciclo Open Finance
terminou em `GO`:

- `new=4`;
- `delivered=0`;
- `accepted_unconfirmed=4`;
- `writes=0`.

A leitura agregada e somente leitura do preview mostrou duas propostas
`cancelled/pending` e uma `pending/pending`. As duas propostas obsoletas foram
encerradas; nenhuma mensagem foi entregue no ciclo e nenhuma escrita financeira
ocorreu. O estado pendente remanescente não foi utilizado como confirmação nem
como smoke real.

## Alcance e próximo gate

- `OF-ALERT-BIND-01` está encerrado técnica e operacionalmente;
- respostas antigas `sim` continuam inválidas para smoke;
- eventos ausentes no Pluggy continuam não sendo sintetizados;
- o próximo passo de 9P.4 depende de uma nova compra genuína e de Daniel
  presente para revisar a proposta; `confirm` permanece bloqueado até esse gate.
