# Estado atual portátil do FinancasBot

Atualizado em: 2026-07-22

## Objetivo ativo

Executar a fila de correções da auditoria exaustiva. `STATE-01` recebeu `GO
TÉCNICO LOCAL` independente no commit imutável
`afc961fadd3f62a69c9e02ea1eb527f380d6d42f`. `PRIV-01` recebeu `GO TÉCNICO
LOCAL` independente no commit
`6e360782ce98e45673b7fae9554d84c13478c23d`, após dois ciclos de `NO-GO`,
reprodução e correção. O gate ativo agora é `AUTH-04`, revogação imediata do
dashboard quando o cadastro deixa de estar ativo. A
decisão pós-Fase 9 sobre proposição de salvamento segue registrada no roadmap
sem alterar essa ordem.

## Último gate encerrado

`FLOW-03` recebeu `GO TÉCNICO LOCAL` independente no commit imutável
`4c1001338ca1ed919b55be4e9566258178a0175e`.

Todos os reads financeiros abrangidos do scheduler agora usam o `userId`
resolvido, exigem fonte pessoal por `requireUserScoped: true` e mantêm telemetria
do consumidor. O fallback de cartões preserva apenas o schema legado, nunca a
fonte central. O Chat confirmou o hash e leu manifesto, scheduler, testes e o
contrato de leitura do Google, sem achado bloqueante nem lacuna indispensável.

Evidência executada pelo Codex: RED causal antes da correção, scheduler `23/23`,
bateria afetada `279/279` e `npm test` com pretests verdes e runner principal
`1.068/1.068`. O parecer externo foi estático e não reproduziu essas execuções.

Não houve acesso a Google/WhatsApp real, produção ou deploy.

## Gate encerrado anterior

`AUTH-03/WGL-07` recebeu `GO TÉCNICO LOCAL` independente no commit imutável
`2d0092da691985bf945c35d7041b5ef4e2d2fd1d`.

O gate fecha localmente a remoção e a reatribuição causal de memberships e
permissões Drive familiares quando o lifecycle exigir. O tombstone local
precede a rede; retry/compensação são persistentes, cercados por geração e
lease, limitados por backoff/retenção e destroem credenciais cifradas em estados
terminais. Reatribuição bloqueia o novo grant enquanto o acesso anterior não
estiver resolvido, e grant remoto seguido de falha local gera compensação
durável.

## Evidência anterior de AUTH-03/WGL-07

- sintaxe dos módulos e testes alterados: verde;
- ensaios causais dedicados + lifecycle: `21/21`;
- prova negativa: `4/4`;
- bateria focal ampliada: `399/399`;
- `npm test`: pretests verdes e runner principal `1.066/1.066`, sem falha ou
  skip;
- `git diff --check`, `package.json` e varredura de segredos: verdes;
- auditor independente leu o hash e os dez artefatos exigidos, não encontrou
  `CRITICAL`, `HIGH`, `MEDIUM` ou lacuna causal indispensável e emitiu `GO
  TÉCNICO LOCAL`.

O parecer independente foi estático e não executou testes. Não houve acesso a
Google/WhatsApp real, produção ou deploy.

## Git e workspace

- branch: `main`;
- produto com último `GO TÉCNICO LOCAL`:
  `6e360782ce98e45673b7fae9554d84c13478c23d`;
- alterações concorrentes do workstream AWS/Oracle e arquivos não rastreados do
  usuário permanecem fora do gate e não devem ser adicionados, alterados ou
  removidos;
- raiz canônica: repositório `financas-bot` no SSD portátil.

## Gate ativo

`AUTH-04`: caracterizado para exigir consulta fresca ao cadastro depois da
assinatura/expiração e antes de qualquer leitura financeira nas APIs v1/v2. O
RED deve provar que o mesmo token funciona enquanto o usuário está `ACTIVE` e
é negado imediatamente depois de bloqueio/inativação/exclusão. `STATE-04`,
proteção do snapshot, permanece P2 separado.

Plano corrente: `docs/plans/current-gate.md`.

## Decisões vigentes

- manter `Codex → Sol → Alto` em `AUTH-04`; esse é o menor nível suficiente
  para a mudança transversal de autorização e seus testes causais;
- parar e avisar Daniel antes de reduzir ou trocar capacidade;
- a produção vigente é Oracle/OCI; não reutilizar caminhos AWS e não executar
  Oracle e AWS simultaneamente com a mesma sessão WhatsApp;
- antes do próximo deploy funcional, definir e ensaiar instalação por artefato
  imutável com preservação de estado, checksums e rollback;
- preservar o bot familiar privado do casal; expansão multiusuário não faz
  parte do escopo;
- usar commit sanitizado e imutável em auditorias independentes e separar
  evidência executada localmente de revisão estática externa.

## Próxima ação exata

Criar o RED causal de `AUTH-04` para o mesmo token antes/depois da mudança de
status, cobrindo v1/v2 e exigindo zero leitura financeira depois da revogação.
Não acessar produção nem fazer deploy nesse gate.

## Capacidade para retomar

`Codex → Sol → Alto → implementar e auditar AUTH-04 sem deploy.`

## Histórico dirigido

- fechamento atual:
  `docs/audit/18-flow03-independent-close-2026-07-22.md`;
- candidato PRIV-01:
  `docs/audit/24-priv01-runtime-log-boundary-candidate-2026-07-22.md`;
- recuperação pós-NO-GO PRIV-01:
  `docs/audit/25-priv01-post-audit-recovery-candidate-2026-07-22.md`;
- recuperação dos escapes multilinha PRIV-01:
  `docs/audit/26-priv01-multiline-log-recovery-candidate-2026-07-22.md`;
- fechamento independente PRIV-01:
  `docs/audit/27-priv01-independent-close-2026-07-22.md`;
- candidato STATE-01:
  `docs/audit/19-state01-sender-serialization-candidate-2026-07-22.md`;
- correção pós-commit candidata:
  `docs/audit/22-state01-post-commit-recovery-candidate-2026-07-22.md`;
- fechamento independente de STATE-01:
  `docs/audit/23-state01-independent-close-2026-07-22.md`;
- tentativa automática sem acesso:
  `docs/audit/20-state01-chat-access-pending-2026-07-22.md`;
- tentativa manual sem acesso e integridade dos anexos:
  `docs/audit/21-state01-manual-access-insufficient-2026-07-22.md`;
- candidato FLOW-03:
  `docs/audit/17-flow03-scheduler-personal-source-candidate-2026-07-22.md`;
- fechamento anterior:
  `docs/audit/16-auth03-wgl07-independent-close-2026-07-22.md`;
- candidato AUTH-03/WGL-07:
  `docs/audit/15-auth03-wgl07-candidate-2026-07-22.md`;
- fechamento anterior:
  `docs/audit/14-wgl03-wgl04-independent-close-2026-07-22.md`;
- fila original:
  `docs/audit/11-exhaustive-path-independent-review-2026-07-18.md`.
