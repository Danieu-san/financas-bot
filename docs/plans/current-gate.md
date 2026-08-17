# Gate ativo — writer histórico idempotente do Gate 41

Atualizado em: 2026-08-15

## Estado

`GATE 41 WRITER: CANDIDATO AGUARDANDO AUDITORIA INDEPENDENTE DO RECOVERY`.

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
- fingerprint integral do artefato:
  `6a88bffd275292e6365538e7f146859d5af12bd2de5af877499d23df5d574bf7`.

## Pré-requisitos satisfeitos

- planejador RX read-only recebeu GO independente;
- resíduos bancários e de cartão receberam GO independente;
- mensagem proativa numerada, pré-preenchimento e escrita unitária receberam
  GO funcional de produção;
- despesas reais do smoke foram preservadas na planilha e devem ser detectadas
  como já existentes pelo dry-run atualizado.
- writer e primeiro recovery receberam `GO TECNICO LOCAL` independente no hash
  `ba4b2f9fff2ad3e199bd6d8d2a0850a62c90009d`;
- a reconciliação posterior do primeiro lote real exigiu igualdade textual
  estrita em transferências; o primeiro hash corretivo recebeu `NO-GO` somente
  por leitura incompleta dos arquivos longos, e o recovery de acesso curto
  também recebeu `ACESSO INSUFICIENTE` porque o Chat não tinha o conector GitHub
  instalado para buscar os arquivos públicos; aguarda conexão do conector e
  novo hash antes de nova tentativa.

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

1. [concluido] localizar e validar o plano privado vigente pelo hash;
2. [concluido] implementar o writer e o ledger de recibos sem habilitar aplicação real;
3. [concluido] criar RED e executar bateria causal afetada;
4. [concluido] executar suíte ampla final proporcional ao candidato e recovery;
5. [concluido] provar dry-run estrutural contra o plano fechado anterior;
6. [concluido] publicar commits sanitizados e obter auditoria independente;
7. [em andamento] fechar a auditoria independente da reconciliação estrita;
8. criar backup real, snapshot vigente, novo dry-run e verificar restauração isolada;
9. aplicar o lote com recibos e parada segura em divergência;
10. reconciliar novamente e provar zero pendência gravável inesperada;
11. confirmar que o backlog importado deixou de gerar propostas;
12. recalcular e validar gasto livre sobre a planilha completa;
13. destacar os valores principais da resposta no WhatsApp.

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

Publicar o recovery curto e obter `GO` independente lendo integralmente os
patches imutáveis e a prova causal curta. Só depois capturar o snapshot privado
vigente e retomar a pré-aplicação operacional.
