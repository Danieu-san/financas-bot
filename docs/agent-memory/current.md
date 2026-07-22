# Estado atual portátil do FinancasBot

Atualizado em: 2026-07-22

## Objetivo ativo

Executar a fila de correções da auditoria exaustiva. `STATE-01` possui candidato
local testado e publicado no hash imutável
`facf53d8f605165375e35cc0ae6f95491c7f849f`. A tentativa automática única no
Chat não conseguiu ler os arquivos e não produziu veredito; o gate aguarda a
resposta da auditoria manual. A decisão pós-Fase 9 sobre proposição de salvamento
segue registrada no roadmap sem alterar o escopo deste gate.

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
- produto auditado mais recente: `4c1001338ca1ed919b55be4e9566258178a0175e`;
- candidato publicado aguardando auditoria: `facf53d8f605165375e35cc0ae6f95491c7f849f`;
- alterações concorrentes do workstream AWS/Oracle e arquivos não rastreados do
  usuário permanecem fora do gate e não devem ser adicionados, alterados ou
  removidos;
- raiz canônica: repositório `financas-bot` no SSD portátil.

## Gate ativo

`STATE-01`: a entrada pública agora serializa mensagens do mesmo remetente,
preserva paralelismo entre remetentes, libera a fila após falha e contém
rejeições antes de entregá-las ao `EventEmitter`. O RED observou sobreposição e
efeito duplo; o final ficou verde em `5/5` focal, `124/124` afetado e
`1.073/1.073` no runner principal do `npm test`.

Plano corrente: `docs/plans/current-gate.md`.

## Decisões vigentes

- manter `Codex → Sol → Extra Alto` até a auditoria e o confronto final de
  `STATE-01`, por ser concorrência crítica sobre estado e efeitos financeiros;
- parar e avisar Daniel antes de reduzir ou trocar capacidade;
- não tocar deploy, EC2/Oracle ou serviços reais sem autorização específica;
- preservar o bot familiar privado do casal; expansão multiusuário não faz
  parte do escopo;
- usar commit sanitizado e imutável em auditorias independentes e separar
  evidência executada localmente de revisão estática externa.

## Próxima ação exata

Daniel envia manualmente o prompt defensivo de `STATE-01` numa conversa limpa do
Chat e cola a resposta integral aqui. O Codex confere hash e arquivos, confronta
o parecer com o candidato e só então registra ou nega `GO TÉCNICO LOCAL`. Não
acessar produção nem fazer deploy.

## Capacidade para retomar

`Chat → padrão atual da conta → Alto → auditar o hash STATE-01; depois Codex → Sol → Extra Alto → validar o parecer.`

## Histórico dirigido

- fechamento atual:
  `docs/audit/18-flow03-independent-close-2026-07-22.md`;
- candidato STATE-01:
  `docs/audit/19-state01-sender-serialization-candidate-2026-07-22.md`;
- tentativa automática sem acesso:
  `docs/audit/20-state01-chat-access-pending-2026-07-22.md`;
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
