# Candidato de auditoria — FLOW-02

Data: 2026-07-23

Base: `711f3ecfb3bf985a7374bf19bbdab0e99aa68b28`.

Estado: candidato local aguardando commit imutável e auditoria independente.

## Objetivo

Garantir que o rate limit global seja consumido antes de comprovantes, OCR,
exportação, importação e gerenciamento de metas, sem alterar as políticas
internas desses handlers.

## Contrato

- identidade, lifecycle e modo familiar continuam antes de qualquer efeito;
- áudio continua consumindo exatamente um limite antes da transcrição;
- comandos legais, lifecycle, configurações, dashboard e administração mantêm
  as exceções preexistentes;
- mensagens de texto consomem o limite antes dos cinco handlers pesados;
- quando bloqueada, a mensagem não baixa mídia, lê planilha financeira, chama
  parser/OCR/Drive ou responde pelo handler pesado;
- integrações e produção permanecem fora do gate.

## Mudança

- `src/handlers/messageHandler.js`: o bloco existente de rate limit foi movido
  para imediatamente antes dos handlers pesados;
- `tests/financialStateMachine.test.js`: prova adversarial cobre comprovante,
  OCR, exportação, importação e meta.

## Evidência executada

- RED causal: o novo teste falhou antes da mudança porque o handler de
  comprovante respondeu antes do limite;
- prova causal após a mudança: `1/1`;
- arquivo completo do handler/estado: `121/121`;
- sete módulos diretamente afetados: `56/56`;
- sintaxe dos dois arquivos e `git diff --check`: verdes;
- gate exaustivo local válido: `1.246` testes, `1.240` aprovados, uma falha,
  cinco skips permitidos e zero TODO;
- a única falha ampla foi `cardSheetUsageReport.test.js`, domínio não tocado,
  e passou isoladamente `2/2` logo depois; por isso a execução ampla não é
  rotulada como verde;
- nenhuma rede, E2E real, produção, Google, WhatsApp ou Pluggy.

## Critério para GO

O candidato somente poderá receber `GO TÉCNICO LOCAL` após commit/push
sanitizado e parecer independente que confirme a ordem causal e avalie
explicitamente a falha ampla não reproduzida.

