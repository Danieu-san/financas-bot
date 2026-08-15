# Gate 43 - fechamento de producao da recuperacao de conversa orfa

Data: 2026-08-15

## Release

- hash de produto auditado: `72e526fac3dde1d00907d4e03725472ea8c67c60`;
- release anterior: `579afb2abffb47f470b19a827a5c3a8c441add82`;
- provedor: Oracle OCI;
- processo: `financas-bot`;
- rollback automatico: nao acionado.

## Promocao por artefato

O artefato local e remoto confirmou o mesmo hash e `946` arquivos. A preparacao
criou o slot isolado e manteve producao inalterada. O plano confirmou o script
anterior como rollback e o promotor trocou uma unica instancia PM2 para:

`/home/ubuntu/financas-bot/releases/72e526fac3dde1d00907d4e03725472ea8c67c60/index.js`.

O processo ficou online, com zero reinicios, `cwd=/home/ubuntu/financas-bot` e
`APP_COMMIT_SHA` igual ao hash auditado.

## Estado e saude

- `.env`: checksum identico antes/depois;
- `credentials.json`: checksum identico antes/depois;
- `state_store.json`: mudou como esperado pela remocao dos dois estados orfaos
  e gravacao dos novos lotes numerados;
- health local: verde, SQLite e WhatsApp `ready/healthy`;
- health publico HTTPS: verde, SQLite e WhatsApp `ready/healthy`;
- Google, planilha, read-model, SQLite, bot e cron inicializaram verdes.

O primeiro `ready rescue` registrou uma falha recuperavel e concluiu a conexao
WhatsApp logo depois. O backfill de nao lidas esgotou tentativas, sem degradar
o health, duplicar resposta ou impedir o transporte do Gate 43.

## Primeiro ciclo Open Finance

O primeiro ciclo do novo release registrou:

- `cycle=GO`;
- `recovered_states=2`;
- `accepted_unconfirmed=2`;
- contador cumulativo de transportes nao confirmados: `268 -> 276`;
- oito propostas transportadas, quatro por principal;
- `financial_writes=0`.

No WhatsApp de Daniel havia exatamente uma mensagem nova do FinancasBot, com
quatro compras em lista numerada e as opcoes `salvar 1`, `salvar 1 e 3` e
`salvar todas`. Nao havia mensagem duplicada. A segunda entrega familiar foi
comprovada pelo ciclo e pelos oito novos transportes cumulativos.

Os comandos gerais de smoke por WhatsApp nao foram enviados porque poderiam
interromper o novo estado financeiro pendente. Health local/publico, startup e
transporte real forneceram a evidencia necessaria sem destruir o lote.

## Veredito

`GO DE PRODUCAO DO GATE 43`.

O defeito que impedia as mensagens proativas numeradas esta fechado. A escrita
financeira automatica permanece desligada e cada item ainda exige conferencia e
confirmacao separadas.
