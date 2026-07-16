# Fase 8 Dia 0 e Open Finance multi-fonte - gate de producao

Data: 2026-07-16

## Veredito

`GO` para observacao duravel da Fase 8 e para canario read-only de Daniel
Nubank + Thais Nubank.

`NO-GO` para soft-disable imediato, exclusao fisica, escrita financeira,
Update Item, Cristina Nubank ou Thais Itau no WhatsApp.

## Evidencia local e remota

- suite global local: `978/978`;
- gate Fase 8 local/remoto: `24/24` na versao final;
- gate Open Finance local/remoto: `86/86`;
- auditoria de entrypoints: todos os sete candidatos com tripwire;
- PM2 online, WhatsApp pronto e health `ok=true/sqlite=true`;
- outbox: total 3, bloqueado 1, `legacy_sent` 2, pendente 0, in-flight 0,
  `accepted_unconfirmed` 0;
- primeiro ciclo multi-fonte: `new=0`, `delivered=0`, `writes=0`.

## Fase 8

- inicio da observacao: `2026-07-16T18:34:25.000Z`;
- schema 2: 29 eventos considerados, um heartbeat e zero linha invalida;
- tripwire real/runtime: zero para todos os candidatos;
- probes controlados: duas ocorrencias de `legacy_auth_utility`, marcadas
  `evidence_type=synthetic`; a segunda confirmou o heartbeat duravel;
- `LEGACY_RETIREMENT_SOFT_DISABLED_CANDIDATES` permanece vazio;
- nenhum legado foi removido ou desabilitado.

O probe apenas prova que a instrumentacao grava e classifica o evento. Ele nao
e evidencia de uso real nem reduz sozinho a janela.

## Open Finance

- aliases ativos: `daniel_nubank,thais_nubank`;
- ativacao por fonte: `2026-07-16T18:41:23.693Z`;
- compra/estorno continuam sendo as unicas classificacoes alertaveis;
- escrita financeira e Update Item permanecem desligados;
- cutoff bloqueia alertas pendentes criados antes da ativacao;
- rollback: helper allowlisted retorna `OPEN_FINANCE_ALERT_CANARY_ALIAS` para
  `daniel_nubank` e limpa configuracao multi-fonte.

Cristina Nubank e Thais Itau continuam separadas no staging/read-only, mas nao
foram adicionadas ao transporte WhatsApp neste gate.

## Proximo gate

1. Reemitir o relatorio sanitizado ao completar 72 horas.
2. Se houver qualquer evento `runtime`/`real_user`, investigar e reiniciar o
   relogio do candidato afetado.
3. Se continuar zero, executar testes ativos, rollback e auditoria do candidato
   antes de decidir um soft-disable reversivel em deploy separado.
4. Nao realizar exclusao fisica nesse mesmo deploy.
