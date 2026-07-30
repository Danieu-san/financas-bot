# Gate ativo — composição operacional fail-closed da escrita Open Finance

Atualizado em: 2026-07-30

Base:
`10c7dc025938c4206e92996a4dbc94709f9687c5`.

## Estado

`CANDIDATO LOCAL VERDE; AUDITORIA INDEPENDENTE PENDENTE`.

## Objetivo

Conectar de forma configurável e fail-closed a proposta proativa já encerrada
ao writer 9P.4, sem alterar defaults, flags reais ou produção.

## Escopo

- decisão central de autorização da escrita confirmada;
- composição entre alerta, reconciliação, preview, proposta e writer;
- entrega da pergunta com zero escrita;
- segunda confirmação como única fronteira de escrita;
- rollback por flags e retomada de estado durável.

## Não escopo

- ativar flags, integração real, escrita financeira, deploy ou produção;
- ampliar acesso além do casal autorizado.

## Invariantes

1. Todos os defaults continuam sem escrita.
2. `confirm` isolado ou qualquer combinação parcial falha fechado.
3. O ciclo de polling e a entrega da proposta sempre produzem zero escrita.
4. Somente a segunda confirmação explícita alcança o writer idempotente.
5. Rollback desabilita nova escrita sem apagar ou converter estado durável.

## Etapas

1. [concluída] Caracterizar a contradição entre runtime, rollout e writer.
2. [concluída] Criar provas RED da combinação impossível e dos defaults.
3. [concluída] Implementar uma decisão central de autorização fail-closed.
4. [concluída] Provar entrega sem escrita e finalização somente após confirmação.
5. [concluída] Executar regressão proporcional e controles.
6. [em andamento] Publicar candidato sanitizado e auditar no Chat.
7. [pendente] Registrar o fechamento sem autorizar ativação ou deploy.

## Critérios de GO

- combinação completa e explicitamente aprovada é a única habilitada;
- combinações parciais preservam zero escrita;
- polling e transporte não escrevem;
- finalização mantém revalidação, idempotência e destino user-scoped;
- nenhum achado independente bloqueante.

## Condições de parada

- qualquer default que passe a escrever;
- aprovação implícita ou herdada;
- transporte ou polling alcançando writer;
- necessidade de integração real, flag, deploy ou produção;
- achado independente bloqueante.

## Próxima ação exata

Publicar o candidato sanitizado e submetê-lo ao Chat por hash imutável.

## Capacidade

`Codex → Sol → Alto → compor a autorização fail-closed da escrita confirmada.`
