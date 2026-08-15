# Gate ativo — writer histórico idempotente do Gate 41

Atualizado em: 2026-08-15

## Estado

`GATE 41 WRITER: IMPLEMENTACAO E DRY-RUN; APLICACAO REAL BLOQUEADA`.

## Objetivo

Materializar na planilha familiar somente os 1.863 itens `ready` do plano RX
privado fechado, sem gravar existentes, duplicatas prováveis, excluídos ou itens
fora da janela, com idempotência, recibos, backup e rollback verificáveis.

## Entrada imutável

- 2.351 itens totais e cobertura completa;
- 1.863 `ready`;
- 2 `existing`;
- 34 `probable_duplicate`;
- 291 `excluded`;
- zero `review`;
- 161 `outside_window`;
- oito bindings de conta/cartão;
- hash privado do plano:
  `4b765e1a7c2ebdf3fa21d0b2659effbd1f8e979e884dc6d56c9c8a1f7230de92`.

## Pré-requisitos satisfeitos

- planejador RX read-only recebeu GO independente;
- resíduos bancários e de cartão receberam GO independente;
- mensagem proativa numerada, pré-preenchimento e escrita unitária receberam
  GO funcional de produção;
- despesas reais do smoke foram preservadas na planilha e devem ser detectadas
  como já existentes pelo dry-run atualizado.

## Escopo

- localizar e validar o artefato privado pelo hash, sem publicar seu conteúdo;
- definir contrato do writer e dos recibos por item/lote;
- usar as mesmas fronteiras canônicas de escrita de conta e cartão já provadas;
- produzir dry-run sem efeitos e conferir cardinalidade por estado e destino;
- criar backup verificável das abas afetadas e plano de rollback;
- provar replay, falha parcial, restart, itens já existentes e lote misto;
- publicar somente código, testes, contagens e hashes sanitizados;
- obter auditoria independente antes da aplicação real.

## Não escopo

- reclassificar o RX ou reabrir ambiguidades já decididas;
- gravar os 34 duplicados prováveis;
- tratar ausência como zero;
- misturar conta, cartão, transferência, estorno, reserva ou investimento;
- alterar gasto livre ou sua apresentação antes da reconciliação pós-escrita.

## Invariantes

1. Cada item recebe no máximo uma operação durável e idempotente.
2. Uma falha parcial não transforma item sem recibo em sucesso.
3. Replay reconcilia antes de escrever e não duplica linha existente.
4. Conta e cartão preservam identidade, titular, destino e esquema próprios.
5. O conjunto gravável é exatamente o `ready` ainda ausente no momento do
   dry-run; itens já escritos pelos smokes migram para `existing`.
6. Nenhum dado privado entra no Git, prompt de auditoria ou logs públicos.

## Etapas

1. [em andamento] localizar e validar o plano privado vigente pelo hash;
2. implementar o writer e o ledger de recibos sem habilitar aplicação real;
3. criar RED e executar bateria causal afetada;
4. executar uma única suíte ampla no candidato estável;
5. produzir dry-run atualizado e conferir cardinalidade;
6. publicar commit sanitizado e obter auditoria independente;
7. criar backup real e verificar restauração isolada;
8. aplicar o lote com recibos e parada segura em divergência;
9. reconciliar novamente e provar zero pendência gravável inesperada;
10. confirmar que o backlog importado deixou de gerar propostas;
11. recalcular e validar gasto livre sobre a planilha completa;
12. destacar os valores principais da resposta no WhatsApp.

## Critérios de GO para aplicação

- plano privado e dry-run possuem hash e cardinalidade coerentes;
- testes de idempotência, falha parcial, restart e mistura estão verdes;
- backup e rollback foram ensaiados sem tocar na planilha ativa;
- auditoria independente não possui lacuna bloqueante;
- diferença entre dry-run aprovado e aplicação é zero.

## Condições de parada

- hash ou cardinalidade do plano divergir;
- qualquer item não `ready` entrar no conjunto gravável;
- destino, titular, conta/cartão ou categoria ficarem ambíguos;
- backup ou restauração isolada falhar;
- auditoria independente emitir NO-GO;
- dry-run mudar antes da aplicação.

## Próxima ação

Localizar o artefato privado fechado, validar seu hash sem expor conteúdo e
mapear as fronteiras canônicas de escrita que o novo writer deve reutilizar.
