# Candidato de auditoria — AUTH-03/WGL-07 — 2026-07-22

## Escopo

Este candidato fecha localmente a remoção e a reatribuição de membership e
permissão Google Drive familiar. Não inclui deploy, produção, Google/WhatsApp
real, exclusão de planilha ou revogação do OAuth da outra pessoa.

Base anterior ao candidato:
`86c7d8a9487175aa6d5d41f04e5aadd85306dee2`.

O hash imutável a auditar é o commit que contém este manifesto e deve ser
confirmado diretamente no GitHub pelo auditor.

## Contrato implementado

1. `INACTIVE`, `BLOCKED` e `DELETED` ocultam imediatamente memberships reais.
2. Membro terminal perde sua relação; dono terminal encerra todas as relações
   que possui, sem revogar o OAuth dos demais e sem apagar a planilha.
3. Remoção Drive usa job SQLite com geração, lease, fencing, backoff, limite de
   tentativas e retenção; credenciais do dono ficam cifradas somente enquanto o
   retry é possível.
4. `404`, permissão ausente e reconciliação por e-mail convergem de forma
   idempotente.
5. Cleanup pendente ou manual e OAuth terminal bloqueiam novo compartilhamento.
6. Reatribuição remove a permissão anterior antes de conceder a nova; falha na
   remoção anterior impede a nova concessão.
7. Se a permissão nova for criada mas o membership não puder ser persistido,
   uma compensação durável remove essa permissão ou a deixa em retry explícito.
8. Falha local complementar não impede o lifecycle terminal e nunca gera falso
   sucesso remoto.

## Arquivos de produto centrais

- `src/services/oauthTokenStore.js`;
- `src/services/googleSharedMembershipRevocationService.js`;
- `src/services/googleOAuthRevocationService.js`;
- `src/services/google.js`;
- `src/services/userService.js`;
- `src/handlers/messageHandler.js`;
- `src/jobs/scheduler.js`.

## Provas locais

- sintaxe dos módulos e testes alterados: verde;
- bateria causal dedicada e auditoria de lifecycle: `21/21`;
- prova negativa estática: `4/4`, com um writer OAuth e dois writers locais de
  membership explicitamente delimitados;
- bateria focal ampliada: `399/399`;
- `npm test`: pretests verdes e runner principal `1.066/1.066`, sem falhas,
  skips, cancelamentos ou itens `todo`;
- `git diff --check`: verde antes do commit.

## Casos adversariais demonstrados

- invisibilidade local antes da espera de rede;
- member-only versus owner-all;
- falha remota, timeout/retry e resposta perdida seguida de `404`;
- concorrência de workers e fencing de lease antigo;
- expiração e exaustão com destruição das credenciais retidas;
- ausência de `permissionId` com reconciliação por e-mail;
- cleanup manual/pending bloqueando novo share;
- reatribuição ordenada e bloqueada quando a permissão anterior não sai;
- compensação após grant remoto e falha/race da persistência local;
- falha do cleanup complementar sem impedir status terminal.

## Limites do veredito

As provas são locais, herméticas e usam clientes Google sintéticos. Elas não
demonstram configuração produtiva, execução no provedor real nem deploy. Um
eventual `GO TÉCNICO LOCAL` não autoriza nenhuma dessas ações.
