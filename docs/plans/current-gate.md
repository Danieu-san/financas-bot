# Gate ativo — menu numerado de pagamento pós-9P.4

Atualizado em: 2026-07-30

Base:
`6a94eb425f3a7bc58aad8b3382ddc8021ad7a07e`.

## Estado

`RECOVERY LOCAL VERDE; NOVO COMMIT IMUTÁVEL E REAUDITORIA PENDENTES`.

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
- [x] o candidato `6b1ba3ffb105149bd04207a1fced6d18d9b7d624`
  recebeu `NO-GO`: a edição direta permitia Dinheiro → conta, Crédito → conta e
  Débito/PIX → cartão;
- [x] faltavam entradas adversariais de texto, decimal e índice fora da faixa.

## Evidência GREEN

- conversa guiada: `21/21`;
- finalização e catálogo: `13/13`;
- sintaxe e diff: verdes.

## Etapas

1. [concluída] Inspecionar menu e dependências.
2. [concluída] Reproduzir divergência PIX → Dinheiro.
3. [concluída] Limpar conta e cartão ao selecionar Dinheiro.
4. [concluída] Provar menu completo e revalidação final.
5. [concluída] Primeiro hash recebeu `NO-GO` com `HIGH 1`, `MEDIUM 1`.
6. [concluída] Bloquear edição direta incompatível e ampliar a matriz.
7. [em andamento] Publicar e reauditar o recovery imutável.
8. [pendente] Fechar o item e seguir para categorias existentes.

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

Publicar o recovery sanitizado e reauditar o novo hash no Chat.

## Capacidade

`Codex → Sol → Alto → reauditar o recovery das dependências de pagamento.`
