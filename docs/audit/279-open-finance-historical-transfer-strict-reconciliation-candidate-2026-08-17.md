# Gate 41 — reconciliação estrita de transferências históricas

Data: 2026-08-17

## Estado

`CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE`.

## Origem do recovery

A auditoria independente do commit `a70d03a2979f22b6245c0cb97173e2c482c06821`
rejeitou o candidato porque os campos textuais da aba `Transferências` eram
comparados após normalização de caixa, acentos, pontuação e espaços. Isso era
mais permissivo que o contrato declarado de igualdade estrita. Também faltavam
provas positivas explícitas para transferências unilaterais e de reserva e
provas negativas isoladas para cada campo textual.

## Correção

- data continua comparada como data ISO;
- valor continua comparado semanticamente pelo parser monetário, para aceitar
  número bruto e a representação monetária devolvida pelo Google;
- descrição, conta de origem, conta de destino, método, observação, status e
  `user_id` agora exigem igualdade textual exata, sem normalização ou `trim`;
- nenhuma regra de classificação, decisão privada ou operação de escrita foi
  alterada.

## Provas causais

- RED: a variante de descrição normalizada indevidamente foi reconhecida como
  existente antes da correção;
- verde: transferências familiar, unilateral revisada e de reserva são
  reconhecidas pelos caminhos reais quando todos os campos coincidem;
- variações isoladas de descrição, origem, destino, método, observação e status
  permanecem `ready`, nunca `existing`;
- divergência de conta ou usuário continua falhando fechada;
- bateria causal ampliada: 107/107, zero falhas;
- suíte hermética anterior à correção do fixture: 1.738 aprovações, três falhas
  não causais e dez skips controlados; as três falhas eram exclusivamente um
  relógio fixo expirado e atraso de liberação do SQLite no Windows e ficaram
  verdes na bateria causal após ajuste determinístico do teste;
- nenhuma mudança de produto ocorreu depois da suíte hermética.

## Arquivos para auditoria

- `src/openFinance/openFinanceHistoricalImportPlanner.js`;
- `tests/openFinanceHistoricalImportPlanner.test.js`;
- `tests/openFinanceHistoricalAmbiguityLocalReview.test.js`;
- este manifesto.

## Limites

Este candidato não autoriza escrita real. O lote só poderá ser retomado após
GO independente neste hash, novo snapshot da planilha, novo plano/fingerprint
e novo ledger. A janela histórica permanece 01/07/2025–27/07/2026; as compras
novas serão tratadas em lote separado de 28/07/2026–17/08/2026.