# ROAD-00.4 — Saúde da telemetria Fase 8

Data da classificação: 2026-08-27
Workstream: `financial-roadmap-road00`
Status: `COMPLETE — CURRENT RUNTIME UNVERIFIED, NO FALSE ZERO`

## Regra de leitura

Esta classificação usa somente código e evidência versionada. Nenhum arquivo de telemetria atual da OCI, flag real, processo, segredo ou dado privado foi consultado. Portanto, quando a saúde atual depende do runtime, o estado correto é `UNKNOWN`, não zero.

Classes: `HEALTHY`, `STALE`, `BROKEN`, `UNKNOWN`.

## Instrumentação e mecanismo

- `src/telemetry/legacyUsageTelemetry.js` contém contrato allowlisted, heartbeat, evidência `synthetic|production_replay|real_user`, rotação por tamanho, backups limitados e escrita serializada em processo.
- O checkpoint `phase-8-legacy-retirement.md` de 2026-07-30 registra que o relatório oficial de tripwire ignorava backups rotacionados.
- `docs/audit/87-phase8-tripwire-rotation-proof-candidate-2026-07-30.md` documenta candidato local para incluir arquivo ativo e backups no agregado, mas o próprio documento está como `CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE` e não prova implantação atual.

Conclusão do mecanismo estático: `HEALTHY` como capacidade de código presente, mas isso **não** promove a saúde do runtime.

## Classificação por fronteira

| Fronteira | Última evidência versionada útil | Classificação em 2026-08-27 | Pode sustentar remoção? |
| --- | --- | --- | --- |
| heartbeat atual | mecanismo existe; arquivo/runtime atual não consultado | `UNKNOWN` | não |
| retenção atual | rotação/backups existem no código; arquivos atuais não consultados | `UNKNOWN` | não |
| leitura de rotacionados pelo relatório oficial implantado | candidato 87 corrige localmente; implantação/auditoria não comprovadas neste ROAD-00 | `UNKNOWN` | não |
| integridade/linhas inválidas do período atual | sem leitura runtime atual | `UNKNOWN` | não |
| `legacy_auth_utility` | em 2026-07-30 havia duas probes sintéticas e zero uso real nos dois arquivos observados | `STALE` | não; continua apenas candidato histórico |
| cartões | em 2026-07-30: 8.216 leituras legadas e 2.102 unificadas | `STALE` | não; evidência histórica aponta uso legado relevante |
| dashboard | em 2026-07-30: v1 com uso e v2 sem adoção observada; checkpoint raiz de 2026-08-21 diz dashboard v2 padrão, sem revalidação da telemetria Fase 8 | `STALE` | não |
| janela de observação acumulada | heartbeat/retention atuais não revalidados | `UNKNOWN` | não |

## Prova contra falso zero

O caso histórico do candidato 87 demonstra por construção que `0` no arquivo ativo não é evidência de uso zero se um backup rotacionado não foi lido. Por isso, ROAD-00 invalida qualquer decisão de aposentadoria baseada apenas em ausência de evento enquanto `heartbeat`, `retention`, `rotation` e `files_read` atuais não estiverem comprovados saudáveis.

## Estado dos três consumidores pedidos pelo roadmap

### `legacy_auth_utility`

Estado atual: `UNKNOWN`.

Última evidência: `STALE`, sem uso real observado em 2026-07-30, apenas probes sintéticas. Isso não autoriza soft-disable nem remoção porque a janela posterior e a saúde da telemetria atual não foram verificadas.

### cartões

Estado atual de uso: `UNKNOWN`; última evidência operacional: `STALE` e fortemente dependente do legado.

Decisão ROAD-00: **não candidato**. O roadmap só pode retomar retirada depois de telemetria atual saudável, paridade por consumer, janela e rollback.

### dashboard

Estado atual de uso por versão: `UNKNOWN` para a telemetria Fase 8; checkpoints mais recentes indicam evolução do dashboard v2, mas não substituem uma janela de aposentadoria com heartbeat/retention válidos.

Decisão ROAD-00: **não candidato**.

## Resultado 00.4

`ROAD-00.4 COMPLETE` porque todas as fronteiras foram classificadas com data e sem inferir zero. A classificação deliberadamente `UNKNOWN/STALE` bloqueia qualquer reaproveitamento automático da janela antiga, mas não bloqueia o fechamento documental de ROAD-00: o gate exige classificação honesta, não acesso remoto obrigatório.

Nenhuma flag, arquivo de runtime, deploy, restart, soft-disable ou remoção foi tocado.
