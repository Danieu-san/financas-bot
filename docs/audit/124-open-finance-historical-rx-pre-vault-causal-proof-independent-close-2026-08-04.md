# RX-HIST-TIME-INV-01 - fechamento independente do recovery probatorio

Data: 2026-08-04

## Candidato auditado

- commit imutavel: `19c9df0c624c658860d9d4e39fceffa08b78deaf`;
- gate: `RX-HIST-TIME-INV-01`;
- parecer: `GO TECNICO LOCAL`;
- auditoria: conversa limpa no Chat, leitura integral de quatro arquivos
  publicos no mesmo hash.

## Arquivos lidos pelo auditor

- `docs/audit/123-open-finance-historical-rx-pre-vault-causal-proof-candidate-2026-08-04.md`;
- `src/openFinance/openFinanceHistoricalRx.js`;
- `scripts/runOpenFinanceHistoricalRx.js`;
- `tests/openFinanceHistoricalRx.test.js`.

## Veredito confrontado

O auditor confirmou que:

1. JSON sintaticamente malformado falha antes de snapshot, copia e abertura do
   vault;
2. todos os cenarios de rejeicao pre-vault exigem zero snapshot, zero copia,
   zero vault e nenhuma saida criada;
3. as dependencias injetaveis sao tripwires observacionais, enquanto as funcoes
   reais permanecem os defaults de `main` e da entrada executavel;
4. o subprocesso percorre a CLI real e exige status 1, stdout vazio e stderr
   JSON exato com o gate novo, motivo sanitizado e `financial_writes=0`;
5. nenhuma lacuna causal indispensavel residual foi identificada para o
   fechamento tecnico, estatico e local deste recovery.

## Evidencia local confrontada

- syntax checks: verdes;
- teste focal: 15/15;
- bateria causal Open Finance: 340/340;
- suite hermetica final: 1.469 testes, 1.459 aprovados, 0 falhas e 10 skips
  conhecidos;
- cobertura: linhas 90,62%, branches 72,96%, funcoes 90,22%;
- workflow, `git diff --check` e varredura de segredos: verdes.

As contagens sao execucao local relatada pelo Codex, nao execucao do auditor.
O parecer independente foi confrontado com o codigo e a evidencia local antes
deste fechamento.

## Alcance autorizado

Fica encerrado tecnicamente o recovery local de `RX-HIST-TIME-INV-01`.

Este fechamento nao autoriza abrir o backup privado, executar preview real,
alterar planilha, escrever dados financeiros, acessar Pluggy, deployar ou
alterar producao. A previa privada read-only permanece uma etapa separada e
depende de autorizacao especifica.
