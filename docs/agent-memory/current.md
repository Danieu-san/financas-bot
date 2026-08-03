# Estado atual portatil do FinancasBot

Atualizado em: 2026-08-03

## Objetivo ativo

Fechar o recovery de compatibilidade de estado de `OF-ALERT-BIND-01`, auditar o
hash imutavel e promover um novo artefato na OCI com proposta `prompt`, escrita
`off`, aprovacao falsa e `confirm` bloqueado.

## Estado vigente

`STALE PROPOSAL INVALIDATION RECOVERY CANDIDATE; AWAITING INDEPENDENT AUDIT;
CONFIRM BLOCKED`.

O commit `c781365d1b6b5524b3ae5ac0ce821d9461821a28` recebeu GO tecnico local
independente para o recovery de dependencias e foi promovido na OCI. O release
ficou com processo unico, WhatsApp ready/healthy, health local e publico verdes,
flags seguras e zero escrita. O primeiro ciclo Open Finance, porem, terminou em
`NO_GO`; portanto o fechamento de producao nao foi declarado.

O diagnostico reproduziu `save_proposal_replay_conflict` sobre copias
consistentes do estado real, com WhatsApp simulado. Propostas persistidas antes
do refinamento do classificador continuam imutaveis, mas algumas deixaram de ser
elegiveis, como o marcador `bill_balance` antes tratado como compra. O recovery
adiciona uma transicao fail-closed: invalida somente a proposta cuja identidade
e payload financeiro permanecem identicos, registra cancelamento no terminal
journal e impede reabertura por replay ou restart. Alteracao de valor,
descricao, conta, principal ou identidade continua sendo conflito.

Manifesto:
`docs/audit/108-open-finance-stale-proposal-invalidation-recovery-candidate-2026-08-03.md`.

## Evidencia

- Pluggy real somente leitura: verde, sem WhatsApp e sem escrita;
- ensaio completo com estado copiado e codigo candidato: `GO`, duas propostas
  inelegiveis invalidadas, quatro entregas simuladas e zero escrita;
- save proposal shadow `10/10`;
- confirmation `9/9`;
- family alerts `6/6`;
- state machine `124/124`;
- suite hermetica: `1.433` testes, `1.428` aprovados, zero falha e cinco skips
  funcionais esperados;
- cobertura: linhas `90,58%`, branches `72,90%`, funcoes `90,13%`.

As contagens sao execucao local do Codex e ainda nao substituem a auditoria
independente obrigatoria.

## Git e workspace

- raiz canonica:
  `C:\Users\Administrador\Documents\FinancasBot\financas-bot`;
- branch: `codex/open-finance-finalization`;
- parent implantado: `c781365d1b6b5524b3ae5ac0ce821d9461821a28`;
- o SSD antigo nao e raiz canonica e nao deve receber edicoes deste gate.

## Producao vigente

- provedor: Oracle/OCI;
- host, usuario, chave, diretorio e processo devem ser redescobertos nos
  runbooks antes de nova acao remota;
- release vigente: `c781365d1b6b5524b3ae5ac0ce821d9461821a28`;
- processo e WhatsApp saudaveis na ultima verificacao;
- proposta `prompt`, escrita `off`, aprovacao falsa;
- AWS nao participa de deploy ou rollback;
- nao executar Git no diretorio de producao: usar artefato imutavel, checksum e
  rollback.

## Limites preservados

- eventos ausentes no provedor nao sao sintetizados;
- propostas proativas continuam restritas a compras reconciliadas;
- entrada, transferencia, saida bancaria, pagamento e tarifa sao apenas
  alertaveis;
- `confirm` continua bloqueado;
- nenhuma resposta antiga `sim` deve ser usada como smoke do recovery.

## Próxima ação exata

Commitar e publicar o recovery sanitizado, submeter o hash imutavel a auditoria
independente no Chat e, somente apos GO, construir e promover o novo artefato na
OCI. No primeiro ciclo real exigir invalidacao das propostas legadas,
`cycle=GO`, health completo e `writes=0`.

## Capacidade para retomar

`Codex -> Sol -> Alto -> auditar o recovery imutavel e promover o artefato na OCI.`

## Referencias dirigidas

- plano vigente: `docs/plans/current-gate.md`;
- recovery atual:
  `docs/audit/108-open-finance-stale-proposal-invalidation-recovery-candidate-2026-08-03.md`;
- recovery de dependencias:
  `docs/audit/107-runtime-dependency-security-recovery-candidate-2026-08-03.md`;
- fechamento funcional anterior:
  `docs/audit/106-open-finance-alert-binding-independent-close-2026-08-03.md`;
- release OCI anterior:
  `docs/audit/99-oci-whatsapp-readiness-window-independent-production-close-2026-07-31.md`;
- arquitetura: `docs/agent-memory/architecture-map.md`;
- riscos: `docs/agent-memory/known-issues.md`;
- testes: `docs/agent-memory/testing-playbook.md`.
