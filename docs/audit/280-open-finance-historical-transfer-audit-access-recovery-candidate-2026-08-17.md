# Gate 41 — recovery de acesso da reconciliação estrita

Data: 2026-08-17

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

## Motivo deste recovery

O commit `c1e6deda511ca1348cf8101dde8e87f838b22531` recebeu `NO-GO`
exclusivamente porque o auditor não conseguiu ler integralmente dois arquivos
longos: o raw respondeu 429 e a interface do GitHub truncou o conteúdo. O
parecer não demonstrou defeito técnico no trecho acessível.

Este recovery não altera o produto. Ele cria uma superfície causal curta que
executa a função pública `planOpenFinanceHistoricalImport` e cobre exatamente a
fronteira que ficou incompleta para o auditor.

## Prova curta e integral

`tests/openFinanceHistoricalTransferStrictReconciliation.test.js` prova:

1. transferência familiar reconhecida pelo planejador real, aceitando o valor
   que o Google devolve formatado como moeda;
2. transferência unilateral revisada e movimento de reserva reconhecidos por
   seus caminhos públicos reais;
3. falha fechada, isoladamente, para descrição, origem, destino, método,
   observação, status e `user_id` diferentes;
4. nenhum componente sintético substitui a decisão do planejador: os objetos
   locais são somente snapshots de entrada e as asserções observam sua saída.

O teste original também passou a incluir `user_id` como variante isolada no
mesmo laço que cobre os demais campos textuais.

## Evidência anterior que permanece válida

- RED causal anterior: a descrição normalizada indevidamente era aceita;
- bateria causal ampliada anterior: 107/107;
- suíte hermética anterior: 1.738 aprovações, três falhas não causais e dez
  skips; as três falhas eram apenas fixtures de relógio/SQLite e ficaram verdes
  após estabilização somente de teste;
- nenhuma mudança de produto ocorreu depois dessa suíte;
- prova curta adicionada neste recovery: 3/3;
- teste focal completo do planejador após a variante isolada: 62/62.

As contagens são execução local relatada e não devem ser tratadas como execução
do auditor.

## Superfície imutável de auditoria

O auditor deve ler integralmente:

- este manifesto;
- `tests/openFinanceHistoricalTransferStrictReconciliation.test.js`;
- o patch canônico completo do commit
  `c1e6deda511ca1348cf8101dde8e87f838b22531`, cujo pai é
  `a70d03a2979f22b6245c0cb97173e2c482c06821`;
- o patch canônico completo do commit que contém este manifesto.

Esses dois patches mostram toda a mudança causal sem exigir a leitura integral
dos arquivos longos não alterados fora do recorte.

## Limite

Este recovery não autoriza escrita real. O lote histórico continua bloqueado
até `GO` independente, snapshot novo da planilha, plano/fingerprint novo e
ledger novo.
