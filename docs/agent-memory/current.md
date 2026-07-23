# Estado atual portátil do FinancasBot

Atualizado em: 2026-07-23

## Objetivo ativo

Executar a fila de correções da auditoria exaustiva. O gate encerrado mais
recente é `OPS-01`, com `GO TÉCNICO LOCAL` independente no commit imutável
`f26e627864d45d2b9b4317844313faf84411b8a7`. O primeiro candidato recebeu
`NO-GO` por não reconhecer quatro variantes de acesso dinâmico ao ambiente; a
lacuna foi reproduzida, corrigida e reauditada. O próximo gate é `FLOW-02`.
A decisão pós-Fase 9 sobre proposição de salvamento e as melhorias de produto
posteriores continuam na fila sem alterar essa ordem.

## Último gate encerrado

`OPS-01` recebeu `GO TÉCNICO LOCAL` independente no commit imutável
`f26e627864d45d2b9b4317844313faf84411b8a7`.

O contrato versionado cobre `183` nomes de ambiente usados pelo produto, com
`196` nomes documentados, zero lacuna, zero duplicata e zero acesso dinâmico não
aprovado. O detector reconhece concatenação e optional chaining e mantém apenas
dois helpers dinâmicos conhecidos na allowlist.

Evidência executada: bateria diretamente afetada `88/88`; contrato e inventário
após a correção causal `9/9`; sintaxe e `git diff --check` verdes. A tentativa
da suíte completa excedeu dez minutos sem resultado consolidado e permanece
neutra.

Não houve leitura de valores reais, produção, Google, WhatsApp ou Pluggy reais
nem deploy.

## Gate encerrado anterior — STATE-04

`STATE-04` recebeu `GO TÉCNICO LOCAL` independente no commit imutável
`22fff090192269e71d71025653f1b5450b3132e2`.

O snapshot local preserva o estado necessário dentro de envelope AES-256-GCM
estrito, privado e autenticado, com journal de replay, ordem durável, retenção,
restore fail-closed e arquivos `0600`. Redis permanece indisponível e falha
antes de qualquer efeito até o gate separado `STATE-03`.

Evidência executada pelo Codex: RED Redis reproduzido; teste dedicado `14/14`;
bateria causal `345/345`; runner hermético `1.238` testes, `1.233` aprovados,
zero falhas e cinco skips previstos. O Chat confirmou o hash, os cinco commits,
os 19 arquivos e a ausência de achado bloqueante, sem executar os testes.

Não houve acesso a snapshot real, Redis real, produção, Google, WhatsApp ou
deploy.

## Gate encerrado anterior — AUTH-04

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

## Gate encerrado anterior — AUTH-03/WGL-07

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

- branch ativa: `codex/ops01-env-contract`, baseada em
  `240f15827fa682bd2f83d8139b25e7270128e010`;
- produto com último `GO TÉCNICO LOCAL`:
  `f26e627864d45d2b9b4317844313faf84411b8a7`;
- alterações concorrentes do workstream AWS/Oracle e arquivos não rastreados do
  usuário permanecem fora do gate e não devem ser adicionados, alterados ou
  removidos;
- raiz canônica: repositório `financas-bot` no SSD portátil.

## Próximo gate

`FLOW-02`: assegurar que o rate limit global antecede os caminhos pesados de
OCR, recibos, importação e exportação. `OPS-01` está encerrado.

Plano corrente: `docs/plans/current-gate.md`.

## Decisões vigentes

- manter `Codex → Sol → Alto` na caracterização e correção de `FLOW-02`; esse é
  o menor nível suficiente para revisar a ordem causal entre gates e efeitos
  pesados;
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

Abrir um workstream isolado para `FLOW-02`, reproduzir os caminhos pesados que
antecedem o rate limit e implementar a menor correção causal. Não acessar
integrações reais ou fazer deploy.

## Capacidade para retomar

`Codex → Sol → Alto → caracterizar e corrigir FLOW-02; Chat → modelo mais capaz
disponível → Alto → auditar o futuro hash imutável.`

## Fila de produto posterior

Somente depois das correções da auditoria e das melhorias já previstas para
Pluggy/Open Finance:

1. permitir atribuição familiar uniforme de um lançamento a Daniel ou Thaís;
2. apresentar a forma de pagamento como menu numerado;
3. na dúvida de categoria, oferecer mais categorias existentes antes da opção
   de criar uma nova.

## Histórico dirigido

- fechamento independente de OPS-01:
  `docs/audit/37-ops01-independent-close-2026-07-23.md`;
- fechamento independente de COV-01:
  `docs/audit/36-cov01-independent-close-2026-07-23.md`;
- fechamento independente de STATE-04:
  `docs/audit/35-state04-independent-close-2026-07-23.md`;
- recuperação da fronteira Redis de STATE-04:
  `docs/audit/34-state04-redis-boundary-recovery-candidate-2026-07-23.md`;
- recuperação da terceira revisão de STATE-04:
  `docs/audit/33-state04-third-review-recovery-candidate-2026-07-23.md`;
- recuperação após o segundo `NO-GO` de STATE-04:
  `docs/audit/32-state04-second-nogo-recovery-candidate-2026-07-23.md`;
- recuperação após `NO-GO` de STATE-04:
  `docs/audit/31-state04-independent-nogo-recovery-candidate-2026-07-23.md`;
- primeiro candidato STATE-04:
  `docs/audit/30-state04-snapshot-hardening-candidate-2026-07-23.md`;
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
