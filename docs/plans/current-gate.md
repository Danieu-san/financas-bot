# Gate ativo — atribuição familiar uniforme pós-9P.4

Atualizado em: 2026-07-30

Base:
`bcc4afd012bf50278e65888ae8dd6d63be1d8336`.

## Estado

`GO TÉCNICO LOCAL; ITEM ENCERRADO`.

## Objetivo

Encerrar o primeiro item da fila posterior a 9P.4: Daniel ou Thaís pode
confirmar uma proposta e atribuir o lançamento a qualquer um dos dois membros
do casal, inclusive usando cartão ou conta do outro, sem conceder acesso a
terceiros.

## Escopo

- catálogo familiar autorizado;
- escolha numerada de pessoa na revisão guiada;
- preservação da pessoa na revalidação final;
- `user_id` e nome no plano de escrita;
- `options.userId` entregue ao adaptador Google;
- matriz Daniel → Thaís e Thaís → Daniel.

## Não escopo

- ampliar além do casal;
- mudar titularidade de cartão ou conta;
- ativar flags Open Finance;
- integração real, deploy ou produção;
- menu de pagamento e expansão de categorias, que são os próximos itens.

## Invariantes

1. O remetente precisa ser um dos atores familiares autorizados.
2. A pessoa selecionada precisa continuar no catálogo familiar relido.
3. A pessoa selecionada, não o remetente, determina `user_id` e pessoa da linha.
4. Cartão ou conta de outro membro não amplia o conjunto de pessoas autorizado.
5. Terceiro nunca aparece no catálogo, na revisão ou no writer.

## Evidência

- finalização/writer: `10/10`;
- conversa guiada: `18/18`;
- catálogo familiar: `2/2`;
- workflow e diff: pendentes da consolidação do commit.

## Etapas

1. [concluída] Inspecionar catálogo, conversa, revalidação e writer.
2. [concluída] Confirmar que o produto já implementa o contrato.
3. [concluída] Adicionar matriz causal cruzada dos dois atores.
4. [concluída] Commit sanitizado e auditoria independente: `GO TÉCNICO LOCAL`.
5. [concluída] Item encerrado; autorizado seguir ao menu numerado de pagamento.

## Critérios de GO

O Chat confirma que a pessoa escolhida atravessa o produto até o boundary de
escrita nos dois sentidos do casal e que os testes não substituem essa decisão.

## Condições de parada

- divergência entre pessoa escolhida, linha e `options.userId`;
- terceiro incluído no catálogo ou no writer;
- teste que substitua a decisão de atribuição;
- necessidade de integração real, flag, deploy ou produção;
- achado independente bloqueante.

## Próxima ação exata

Registrar o fechamento e verificar se o menu numerado de forma de pagamento já
está integralmente coberto no fluxo guiado.

## Capacidade

`Codex → Sol → Alto → auditar a atribuição familiar uniforme pós-9P.4.`
