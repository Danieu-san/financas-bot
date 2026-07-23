# Estado atual portátil do FinancasBot

Atualizado em: 2026-07-23

## Objetivo ativo

Executar a fila de correções da auditoria exaustiva. `STATE-01` recebeu `GO
TÉCNICO LOCAL` independente no commit imutável
`afc961fadd3f62a69c9e02ea1eb527f380d6d42f`. `PRIV-01` recebeu `GO TÉCNICO
LOCAL` independente no commit
`6e360782ce98e45673b7fae9554d84c13478c23d`, após dois ciclos de `NO-GO`,
reprodução e correção. `AUTH-04` recebeu `GO TÉCNICO LOCAL` independente no
commit imutável `beb8e0ff7f2eccd74688aa347de6b7d79170d094`. O gate ativo agora
é o candidato local de `STATE-04`, proteção do snapshot conversacional local,
aguardando auditoria independente por hash. A
decisão pós-Fase 9 sobre proposição de salvamento segue registrada no roadmap
sem alterar essa ordem.

## Último gate encerrado

`AUTH-04` recebeu `GO TÉCNICO LOCAL` independente no commit imutável
`beb8e0ff7f2eccd74688aa347de6b7d79170d094`.

As APIs financeiras v1, v2 e wrappers autenticados agora validam assinatura/TTL
e consultam o cadastro fresco antes de qualquer leitura. Ausência, exclusão ou
status diferente de `ACTIVE` negam com `403`; indisponibilidade da fonte nega
com `503` distinto. O Chat confirmou hash, base e os cinco arquivos, sem achado
`CRITICAL`, `HIGH` ou `MEDIUM`.

Evidência executada pelo Codex: RED causal `200 !== 403`; cenários `3/3`;
dashboard `24/24`; OAuth `7/7`; auditoria sanitizada `1/1`; pretests verdes e
runner principal `1.080/1.080`. O parecer externo foi estático e não reproduziu
essas execuções. Os dois achados `LOW` de cobertura e o ponto informativo de
telemetria pré-roteamento não abrem bypass nem vazamento.

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

- branch ativa: `codex/state04-snapshot-hardening`, baseada em
  `fd7146c3604fe41bb2ae44de695099254fb30aa4`;
- produto com último `GO TÉCNICO LOCAL`:
  `beb8e0ff7f2eccd74688aa347de6b7d79170d094`;
- alterações concorrentes do workstream AWS/Oracle e arquivos não rastreados do
  usuário permanecem fora do gate e não devem ser adicionados, alterados ou
  removidos;
- raiz canônica: repositório `financas-bot` no SSD portátil.

## Gate ativo

`STATE-04`: candidato local verde. O snapshot usa envelope autenticado
AES-256-GCM com chave exclusiva, cria o temporário em `0600`, preserva esse modo
no `rename`, restaura somente envelope íntegro e limita retenção a 24 horas por
padrão e 30 dias no máximo. Chave ausente/inválida, corrupção e falha de
persistência negam de forma sanitizada.

Evidência: RED `3/3`; bateria causal final `336/336`; runner hermético final
`1.229` testes, `1.224` aprovados, zero falhas e cinco funcionais
intencionalmente desativados; rede externa bloqueada; sintaxe e
`git diff --check` verdes. Uma tentativa anterior foi invalidada quando o SSD
desmontou; após remontagem, dependências e toda a bateria convergiram.

Plano corrente: `docs/plans/current-gate.md`.

## Decisões vigentes

- manter `Codex → Sol → Alto` na caracterização e correção de `STATE-04`; esse
  é o menor nível suficiente para proteção de estado, compatibilidade de restore
  e testes adversariais;
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

Congelar o commit sanitizado, publicar a branch e obter auditoria independente
do Chat pelo hash imutável. Não acessar produção nem fazer deploy nesta etapa.

## Capacidade para retomar

`Chat → modelo mais capaz disponível → Alto → auditar o hash imutável de
STATE-04; Codex → Sol → Alto → ler e confrontar o parecer.`

## Histórico dirigido

- fechamento independente AUTH-04:
  `docs/audit/29-auth04-independent-close-2026-07-23.md`;
- candidato AUTH-04:
  `docs/audit/28-auth04-dashboard-revocation-candidate-2026-07-23.md`;
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
