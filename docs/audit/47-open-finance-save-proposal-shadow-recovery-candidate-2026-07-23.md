# 9P.0 — recuperação pós-NO-GO das propostas Open Finance

Atualizado em: 2026-07-23

Candidato anterior:
`826807aab29871713305131a92931cc288dc7071`.

Base anterior:
`f8d124f785f89479642fbf4847a9f4c3860a268d`.

## Veredito recebido

O Chat confirmou o hash, o pai direto e os oito arquivos do candidato e emitiu
`NO-GO` estático. Não houve achado crítico. O bloqueador alto era replay que
mantinha a mesma referência enquanto substituía silenciosamente o conteúdo
privado. Os dois pontos médios eram validação tardia da configuração e prova
incompleta do backup/restore v3 para a nova tabela.

## Recuperação implementada

- replay idêntico é no-op e não altera payload, `updated_at`, `created_at` nem
  `expires_at`;
- divergência de valor, descrição, data, estado, conta, principal,
  classificação, estado do provedor, decisão ou referência de reconciliação
  falha com `save_proposal_replay_conflict`;
- colisão de `transaction_ref` falha com o mesmo código fixo e a transação
  inteira é revertida;
- metadados imutáveis são duplicados dentro do payload cifrado e comparados na
  leitura privada, fechando adulteração externa;
- configuração inválida e dependências ausentes de `shadow` são rejeitadas
  sincronamente antes da instalação dos timers;
- estatísticas operacionais de backup incluem propostas totais, pendentes e
  canceladas;
- restore v3 prova estado, payload e expiração de proposta pendente/cancelada,
  além da remoção posterior por revogação e retenção.

O estado terminal de cancelamento continua mutável somente pela operação
autorizada e nunca é reaberto por replay.

## Evidência local

- bateria causal, operacional e backup: `16/16`;
- bateria diretamente afetada: `32/32`;
- blocos adicionais de regressão Open Finance: `41/41`, `26/26`, `4/4` e
  `113/113`, todos verdes e parcialmente sobrepostos;
- gate exaustivo hermético: `1.274` testes, `1.269` aprovados, zero falhas,
  cinco skips funcionais previstos e zero TODO;
- cobertura: linhas `89,99%`, branches `72,04%`, funções `89,75%`;
- sintaxe dos sete arquivos JavaScript e `git diff --check`: verdes;
- workflow portátil: verde;
- auditoria independente do recovery: pendente.

Nenhum teste usou Pluggy, Google, WhatsApp ou produção reais. O modo de escrita
continua desligado.

## Arquivos do recovery

- `src/openFinance/openFinanceShadowPreviewStore.js`;
- `src/openFinance/openFinanceCanaryRuntime.js`;
- `src/openFinance/openFinanceStateBackup.js`;
- `scripts/runOpenFinanceOperationalBackupGate.js`;
- `tests/openFinanceSaveProposalShadow.test.js`;
- `tests/openFinanceOperationalBackupGate.test.js`;
- `tests/openFinanceStateBackup.test.js`;
- `docs/agent-memory/current.md`;
- `docs/agent-memory/known-issues.md`;
- `docs/plans/current-gate.md`;
- este documento.

## Estado

`RECOVERY LOCAL VALIDADO; COMMIT IMUTÁVEL E REAUDITORIA PENDENTES`.
