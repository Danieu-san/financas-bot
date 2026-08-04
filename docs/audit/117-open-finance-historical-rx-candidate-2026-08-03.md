# RX-HIST-SEG-01 - candidato de RX historico segmentado

Data: 2026-08-03

## Veredito local

`CANDIDATO LOCAL AGUARDANDO AUDITORIA INDEPENDENTE`.

Este documento nao autoriza preview com dados reais, escrita financeira,
integracao Pluggy, producao ou deploy.

## Base e objetivo

- commit de partida: `98913fb3098e6b6017ba61401fbc8c638a1a3586`;
- objetivo: gerar um RX privado e agregado a partir de snapshot normalizado,
  com corte temporal explicito e `financial_writes=0`;
- data de corte e lifecycle de cada fonte sao entradas obrigatorias ou
  bloqueadoras; nenhuma data ausente e presumida.

## Fronteiras comprovadas

- conta bancaria, cartao, fatura e investimento permanecem produtos separados;
- `account.balance` de cartao e rotulado somente como saldo semantico do
  provedor/limite utilizado, nunca como fatura;
- saldo bancario no corte so e reconstruido a partir de saldo atual e movimentos
  `POSTED`, com confianca condicional a historia completa;
- saldo ausente permanece `null`; nao vira zero;
- fonte inexistente no corte fica `not_applicable_before_source_start`;
- lifecycle contraditorio falha fechado;
- parcelas usam numero, total e competencia recebidos; numero fora da serie
  falha e nenhuma linha e sintetizada;
- referencias publicas usam HMAC; IDs, nomes e descricoes brutas nao entram no
  relatorio;
- a CLI abre o vault com `readonly:true`, compara SHA-256 antes/depois, exige
  saida nova fora do repositorio e grava atomicamente com modo privado;
- stdout contem somente estado, contagens, blockers e hashes sanitizados.

## Evidencia local

- syntax checks: verdes;
- bateria causal ampliada: 58/58;
- suite hermetica final: 1.458 testes, 1.448 aprovados, 0 falhas, 10 skips
  conhecidos, 0 todo;
- cobertura: linhas 90,56%, branches 72,79%, funcoes 90,18%;
- a suite bloqueia rede, descendentes Node e subprocessos nao autorizados;
- os cinco testes PowerShell que essa propria trava impede foram declarados
  skips esperados somente no runner hermetico e passaram 5/5 quando executados
  diretamente fora dele.

## Arquivos do candidato

- `src/openFinance/openFinanceHistoricalRx.js`;
- `scripts/runOpenFinanceHistoricalRx.js`;
- `tests/openFinanceHistoricalRx.test.js`;
- `scripts/runExhaustiveLocalTestCoverage.js`;
- `tests/exhaustiveLocalTestCoverageRunner.test.js`;
- `tests/codexTelemetryCollector.test.js`;
- `package.json`;
- checkpoints deste workstream.

## Lacunas preservadas

- nenhuma copia real foi aberta por este candidato;
- nenhuma data de corte final foi escolhida silenciosamente;
- o lifecycle das fontes reais ainda precisa ser fornecido/validado;
- o RX privado ainda precisa de conferencia humana antes de qualquer futura
  reconciliacao;
- fluxo numerico, limpeza de planilha e gravacoes permanecem fora do gate.

## Gate seguinte

Publicar este candidato em commit sanitizado, obter auditoria independente por
hash imutavel e somente com GO executar a CLI sobre copia isolada do backup OCI.
