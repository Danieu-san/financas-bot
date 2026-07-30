# Gate ativo — menu numerado de pagamento pós-9P.4

Atualizado em: 2026-07-30

Base:
`6a94eb425f3a7bc58aad8b3382ddc8021ad7a07e`.

## Estado

`CORREÇÃO LOCAL VERDE; COMMIT IMUTÁVEL E AUDITORIA INDEPENDENTE PENDENTES`.

## Objetivo

Garantir que a forma de pagamento seja escolhida por menu numerado e que
Crédito, Débito, PIX e Dinheiro preservem somente cartão/conta compatíveis.

## Escopo

- catálogo fechado e ordenado de formas de pagamento;
- renderização numerada;
- seleção exclusivamente por índice válido;
- transições Crédito, Débito, PIX e Dinheiro;
- coerência entre conversa durável e revalidação final.

## Não escopo

- ativar flags ou produção;
- adicionar forma de pagamento;
- mudar titularidade de cartão/conta;
- integração real;
- expansão de categorias, próximo item da fila.

## Invariantes

1. O menu mostra Crédito, Débito, PIX e Dinheiro com números.
2. Crédito exige cartão e não preserva conta.
3. Débito/PIX exigem conta e não preservam cartão.
4. Dinheiro não preserva cartão nem conta.
5. A conversa não conclui estado que a revalidação final rejeitará.

## RED causal

- [x] PIX com conta seguido de Dinheiro preservava a conta antiga;
- [x] a resposta exibiu `Pagamento: Dinheiro` com conta ainda definida.

## Evidência GREEN

- conversa guiada: `19/19`;
- finalização: `11/11`;
- catálogo: `2/2`;
- sintaxe e diff: verdes.

## Etapas

1. [concluída] Inspecionar menu e dependências.
2. [concluída] Reproduzir divergência PIX → Dinheiro.
3. [concluída] Limpar conta e cartão ao selecionar Dinheiro.
4. [concluída] Provar menu completo e revalidação final.
5. [em andamento] Publicar e auditar o hash imutável.
6. [pendente] Fechar o item e seguir para categorias existentes.

## Critérios de GO

- menu numerado fechado;
- nenhuma dependência incompatível residual;
- conversa e finalização concordam;
- nenhum achado independente bloqueante.

## Condições de parada

- teste causal vermelho;
- forma de pagamento fora do catálogo fechado;
- estado aceito pela conversa e rejeitado na finalização;
- necessidade de integração real, flag, deploy ou produção;
- achado independente bloqueante.

## Próxima ação exata

Publicar o candidato sanitizado e auditar o hash imutável no Chat.

## Capacidade

`Codex → Sol → Alto → auditar o menu numerado e suas transições.`
