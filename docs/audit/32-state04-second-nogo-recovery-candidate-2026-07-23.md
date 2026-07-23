# STATE-04 — recuperação após o segundo NO-GO

Data: 2026-07-23

Estado: `CANDIDATO LOCAL CORRIGIDO; TERCEIRA AUDITORIA INDEPENDENTE PENDENTE`.

Base funcional:
`fd7146c3604fe41bb2ae44de695099254fb30aa4`.

Segundo candidato auditado:
`8f0f185eb0cc785faff71c7046457f319bd62cce`.

## Parecer independente

O Chat confirmou o hash final, a base, a cadeia de dois commits e os 15 arquivos
do diff. A revisão foi estática, somente leitura e não reproduziu a evidência
local. O veredito foi `NO-GO TÉCNICO LOCAL`, sem achado `CRITICAL`.

Achados bloqueantes:

- `HIGH`: o digest revogado era calculado sobre a serialização textual do
  envelope; reordenar as mesmas propriedades JSON alterava o digest sem alterar
  o conteúdo autenticado;
- `MEDIUM`: `STATE_STORE_DRIVER` desconhecido caía implicitamente no backend de
  arquivo e podia adiar a descoberta de chave ausente;
- `MEDIUM`: journal existente sem `state_store.json` iniciava vazio em vez de
  negar a perda inconsistente.

Lacunas `LOW`: crash abrupto não reproduzido, journal sem limite/compactação,
runner sem preservar modo e base funcional divergente no plano.

## Correção incremental

O candidato atual:

- deriva o digest da identidade binária autenticada — AAD, IV, tag e
  ciphertext canônicos —, tornando whitespace e ordem JSON irrelevantes;
- rejeita qualquer driver diferente de `file` ou `redis` no startup com código
  constante;
- falha fechado quando snapshot está ausente mas temporário ou journal
  demonstra persistência incompleta/anterior;
- usa journal versão 2 com expiração por revogação, compacta registros expirados
  no próximo replacement e limita a 10.000 revogações ativas; atingir o limite
  bloqueia a persistência sem promover novo snapshot;
- prova por subprocesso uma interrupção abrupta depois da confirmação durável
  do journal e antes da promoção do snapshot: o restart rejeita o estado antigo;
- prova a ordem de `fsync` dos dois temporários e a promoção do journal antes do
  snapshot;
- captura e restaura também o modo dos arquivos mutáveis isolados pelo runner;
- normaliza a base funcional do plano para
  `fd7146c3604fe41bb2ae44de695099254fb30aa4`.

## Evidência executada

- testes diretamente afetados: `21/21`;
- bateria causal/afetada: `352/352`;
- runner hermético: `1.237` testes, `1.232` aprovados, zero falhas, cinco skips
  funcionais previstos e rede externa bloqueada;
- cobertura ampla: linhas `89,75%`, branches `71,86%`, funções `89,62%`;
- sintaxe dos quatro arquivos JavaScript alterados e `git diff --check`:
  verdes;
- nenhuma asserção causal foi suavizada.

## Limites

O journal protege rollback isolado do snapshot. Rollback conjunto e coerente de
todo o diretório permanece ameaça operacional declarada. Redis/`STATE-03`,
snapshot real, segredo operacional, migração do legado e prova de modo no Linux
continuam fora deste fechamento local.

Nenhuma produção, Oracle, AWS, Google, WhatsApp, dado real, deploy, restart ou
alteração de flag foi acessado.

## Pergunta para a terceira auditoria

Confirmar no novo hash imutável se o bypass de reserialização, os dois caminhos
`MEDIUM` e as quatro lacunas `LOW` foram fechados sem introduzir bypass de
autenticação, retenção, atomicidade, disponibilidade fail-closed ou perda de
estado. O parecer solicitado é `GO/NO-GO TÉCNICO LOCAL` para STATE-04 e não
autoriza deploy.
