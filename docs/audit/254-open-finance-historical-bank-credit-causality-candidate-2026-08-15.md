# Gate 41.6 - causalidade final dos creditos bancarios historicos

Data: 2026-08-15

## Veredito solicitado

Avaliar se o candidato sustenta `GO TECNICO LOCAL` para encerrar o residual
bancario sem autorizar writer, importacao real, planilha, WhatsApp ou producao.

## Base e arquivos do produto

- base publicada: `68f786d223b10447b1629d9ef4da8b83a609f396`;
- `scripts/buildOpenFinanceHistoricalImportConfig.js`;
- `src/openFinance/openFinanceHistoricalImportPlanner.js`;
- `tests/openFinanceHistoricalImportConfig.test.js`;
- `tests/openFinanceHistoricalImportPlanner.test.js`.

O hash imutavel do candidato sera preenchido pela publicacao deste documento e
dos quatro arquivos acima no mesmo commit.

## Contrato implementado

1. transferencia interna recebida exige decisao privada exata e conta de origem
   textual; somente credito bancario positivo pode produzir o plano de
   transferencia na direcao origem para conta vinculada;
2. duas transferencias iguais e proximas so podem ser desambiguadas por decisoes
   exatas e reciprocas entre suas referencias;
3. o par reciproco ainda exige contas bancarias distintas, valores opostos,
   BRL, estado `POSTED`, identidade de provedor unica e datas dentro da janela
   causal;
4. par invalido, incompleto ou nao reciproco permanece em revisao e produz zero
   plano de escrita;
5. credito de emprestimo so e neutralizado por decisao privada exata e quando o
   fato e credito bancario positivo `POSTED`; debito ou pendencia falha fechado;
6. nenhuma decisao privada, referencia, descricao, pessoa, valor ou conta real
   e versionada.

## Evidencia privada agregada

- cardinalidade preservada: `2.351 -> 2.351`;
- decisoes exatas aplicadas: 27;
- entradas alteradas: 27; inesperadas: 0; ausentes: 0;
- transicoes: 20 `needs_review -> ready`, 5
  `needs_review -> excluded` e 2 `ready -> ready` com correcao causal do plano;
- plano final: 1.846 prontos, 2 existentes, 34 duplicatas provaveis, 284
  excluidos, 24 em revisao e 161 fora da janela;
- os 24 itens restantes sao tecnicos: creditos de cartao sem vinculo forte,
  taxas de Pix financiado e moedas nao suportadas;
- cobertura completa, oito bindings, hash privado
  `24ee5ded6b0e63b2d00afdea43a86a68a2cbf5f52858eeb12cdc6685edb0a494`
  e `financial_writes=0`.

## Testes executados

- syntax check dos dois arquivos executaveis alterados: verde;
- bateria focal de configurador e planejador: 73/73, sem falhas;
- controles negativos: falta de reciprocidade, valor divergente, status
  pendente, origem de cartao, direcao invalida e emprestimo nao confirmado;
- unica suite ampla final: 138 arquivos, 1.705 testes aprovados, 0 falhas e 10
  skips controlados; cobertura de linhas 91,47%;
- `git diff --check`: sem erro;
- nenhuma suite ampla foi repetida.

## Limites

- o planejador continua `writable=false`;
- nao houve chamada ao writer, alteracao de planilha, consulta live adicional,
  deploy, restart ou teste de producao;
- este candidato nao decide os 24 residuos tecnicos e nao autoriza os Gates 10
  ou 11 do plano de importacao.

## Perguntas para a auditoria

1. A validacao privada falha fechado para campos direcionais, pares reciprocos
   e creditos de emprestimo?
2. O planejador impede efeito duplicado no par explicito e conserva exatamente
   um plano no lado de debito?
3. Os controles negativos cobrem as fronteiras causais indispensaveis?
4. Ha achado material ou lacuna indispensavel para o fechamento tecnico local
   deste escopo read-only?
