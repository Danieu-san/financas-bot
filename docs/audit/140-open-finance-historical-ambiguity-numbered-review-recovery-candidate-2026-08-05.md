# RX-HIST-AMBIGUITY-REVIEW-01 - recovery da revisao numerada

Data: 2026-08-05

## Origem

O commit `2dc025580a1e105d0c29163cc73c76881acd0677` recebeu `NO-GO`
independente com dois achados altos: consistencia RX-evidencia apenas unilateral
e contexto de pagina/selecionado ainda causalmente compartilhado entre os dois
telefones. O auditor tambem pediu prova usando a saida real do builder RX.

## Recovery

- o catalogo agora deriva independentemente das linhas privadas todas as series
  de parcela com numeros duplicados e todos os movimentos de investimento com
  semantica ambigua;
- referencias de segmentos, series/numeros duplicados, contagem de movimentos e
  blockers declarados devem coincidir nos dois sentidos; omissao ou invencao
  falha fechado com `private_evidence_mismatch`;
- classificacao de investimento e agrupamento de parcelas continuam reutilizando
  as funcoes reais exportadas pelo RX;
- cada ator possui pagina e selecao cifradas independentes;
- quando ambos selecionam o mesmo item e um decide primeiro, a selecao obsoleta
  do outro e preservada ate sua proxima resposta, que recebe aviso explicito e
  nao e reinterpretada como outro item;
- a decisao continua familiar e unica, a persistencia continua central e
  reiniciavel e todos os caminhos mantem `financial_writes=0`.

## Evidencia executada

- RED do recovery: ambiguidade privada omitida nao era detectada; pagina do
  segundo telefone herdava a do primeiro; numero apos selecao obsoleta era
  reinterpretado;
- focal RX + revisao: 31/31;
- bateria causal Open Finance: 367/367;
- suite hermetica final: 1.492 testes, 1.482 aprovados, zero falhas e 10 skips
  conhecidos;
- cobertura: linhas 90,68%, branches 73,24%, funcoes 90,38%;
- prova adicional constrói o RX pela funcao real `buildOpenFinanceHistoricalRx`
  e entrega sua saida ao catalogo real de revisao;
- nenhuma rede real, mensagem, escrita financeira, flag, deploy ou producao.

## Arquivos para auditoria

- `src/openFinance/openFinanceHistoricalAmbiguityReview.js`
- `src/openFinance/openFinanceHistoricalRx.js`
- `tests/openFinanceHistoricalAmbiguityReview.test.js`
- `tests/openFinanceHistoricalRx.test.js`
- `docs/audit/139-open-finance-historical-ambiguity-numbered-review-candidate-2026-08-05.md`
- este manifesto.

## Alcance solicitado

Reavaliar somente o `GO TECNICO LOCAL` do nucleo. Envio proativo, entrada
publica do WhatsApp, consumo das decisoes, salvamento numerado, deploy e
producao permanecem fora do gate mesmo em caso de GO.
