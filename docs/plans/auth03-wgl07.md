# Gate AUTH-03/WGL-07 — remoção familiar por lifecycle

Atualizado em: 2026-07-22

## Objetivo

Quando dono ou membro de uma planilha familiar entrar em `INACTIVE`, `BLOCKED`
ou `DELETED`, retirar imediatamente o membership do caminho operacional e
remover de forma idempotente a permissão Drive, com recovery durável e sem
apagar planilha ou revogar o OAuth da outra pessoa.

## Ordem já decidida

Este gate é o item 6 do relatório exaustivo, imediatamente posterior ao
fechamento de WGL-03/WGL-04. Não é uma fase escolhida pelo agente.

## Invariantes

1. Lifecycle terminal deixa de expor a planilha compartilhada localmente antes
   de qualquer espera de rede.
2. Membro terminal perde somente sua permissão; dono terminal encerra todos os
   memberships ativos de sua planilha.
3. OAuth individual e planilha da outra pessoa não são apagados.
4. Falha/timeout/resposta perdida do Drive fica em job persistente com lease,
   backoff, limite de tentativas e retenção.
5. Tokens do dono permanecem cifrados somente enquanto o retry é possível e
   são destruídos em sucesso, expiração ou exaustão.
6. `404` e permissão já ausente convergem; e-mail pode reconciliar linha legada
   sem `permissionId`.
7. Resultado tardio não conclui lease substituído.
8. Novo compartilhamento não atravessa OAuth terminal nem cleanup pendente.
9. Falha local do cleanup não impede persistir o lifecycle terminal; ela deve
   produzir estado sanitizado e ação manual, nunca falso sucesso.
10. Reatribuição remove a permissão anterior antes de conceder a nova.
11. Grant remoto seguido de falha local cria compensação durável; não deixa a
    permissão nova órfã sem estado de recovery.

## Implementação validada e publicada

O candidato está publicado no commit imutável
`2d0092da691985bf945c35d7041b5ef4e2d2fd1d` e altera:

- `src/services/oauthTokenStore.js`;
- `src/services/google.js`;
- `src/services/googleOAuthRevocationService.js`;
- `src/services/googleSharedMembershipRevocationService.js` (novo);
- `src/services/userService.js`;
- `src/handlers/messageHandler.js`;
- `src/jobs/scheduler.js`.

O candidato adiciona ledger de revogação de membership, tombstone local,
credenciais cifradas do dono, claim/lease, recovery agendado e limitado,
reconciliação por e-mail e hook após o tombstone OAuth. Leituras reais de
membership exigem OAuth ativo do dono e do membro; cleanup pendente ou manual
bloqueia novo compartilhamento.

Cobertura adicionada/atualizada:

- `tests/googleSharedMembershipRevocation.test.js` (novo);
- `tests/auditGoogleRevocationRecovery.test.js`;
- `tests/userLifecycle.test.js`;
- `tests/schedulerJobs.test.js`;
- registro da bateria no `package.json`.

Evidência local atual:

- sintaxe dos módulos e testes alterados: verde;
- ensaios causais dedicados + auditoria de lifecycle: `21/21` verdes;
- prova negativa estática: `4/4` verde;
- bateria focal ampliada: `399/399` verde;
- `npm test`: pretests verdes e runner principal `1.066/1.066`, sem falhas ou
  skips;
- `git diff --check` e `package.json` válido: verdes;
- nenhum acesso a Google/WhatsApp real, produção ou deploy.

## Fechamento independente

A revisão independente confirmou o hash integral e leu o manifesto, os dois
testes focais e os sete arquivos de produto citados. Não encontrou achado
`CRITICAL`, `HIGH` ou `MEDIUM`, nem lacuna causal indispensável, e emitiu `GO
TÉCNICO LOCAL` para `AUTH-03/WGL-07`.

O parecer foi estático: não executou a suíte, não acessou Google/WhatsApp real,
não avaliou restart/contenção multiprocesso real e não autorizou deploy. A
execução local permanece evidência do executor, separada do parecer.

Relatório de fechamento:
`docs/audit/16-auth03-wgl07-independent-close-2026-07-22.md`.

## Próxima ação exata

Mapear `FLOW-03`, o item 7 já ordenado no relatório exaustivo, e fechar a
divergência entre leituras do scheduler e escritas em planilhas pessoais, sem
deploy.

## Fora do escopo

Deploy, EC2/Oracle, Google/WhatsApp real, exclusão da planilha, acesso admin a
dados financeiros, migração de servidor e qualquer mudança em arquivos do
workstream AWS/Oracle.
