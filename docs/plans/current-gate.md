# Gate ativo — pré-preenchimento da proposta Open Finance

Atualizado em: 2026-08-15

## Estado

`FLUXO NUMERICO E WRITER UNITARIO PROVADOS; QUALIDADE DA PROPOSTA PENDENTE`.

## Objetivo

Fazer a proposta proativa chegar com pessoa, conta/cartão e categoria já
preenchidos quando a origem Open Finance e regras determinísticas existentes
fornecerem evidência suficiente, preservando revisão humana e falha fechada em
ambiguidade real.

## Contexto causal

- o lote numerado, a seleção individual, a segunda confirmação, a escrita única
  e o recibo passaram em produção;
- a compra real identificava o cartão/titular na origem e continha sinal
  comercial inequívoco de lanche, mas a revisão pediu categoria e cartão;
- importar o RX agora apagaria o backlog disponível para provar essa correção;
  portanto, o writer histórico deve vir somente depois do novo smoke;
- o gasto livre não pode ser fechado antes de a planilha receber o RX completo.

## Escopo

- preservar na proposta o vínculo forte de origem com pessoa e conta/cartão;
- reutilizar somente categorização determinística já autorizada por catálogo,
  regra de comerciante ou descrição comercial inequívoca;
- não inferir pessoa, conta, cartão, categoria ou subcategoria por aproximação;
- provar que revisão permite alterar qualquer pré-preenchimento antes da
  confirmação final;
- repetir smoke com uma pendência real, sem salvar mais de uma linha.

## Não escopo

- importar o RX histórico;
- reclassificar itens já decididos no plano privado;
- alterar política ou apresentação do gasto livre;
- remover a conferência e o segundo consentimento;
- criar regra ampla a partir de uma única ocorrência ambígua.

## Invariantes

1. O alias Open Finance resolve somente a pessoa e a conta/cartão vinculados.
2. Conta e cartão nunca são misturados.
3. Categoria automática exige regra determinística e explicável.
4. Ambiguidade verdadeira continua visível e bloqueia conclusão sem revisão.
5. Nenhuma proposta é salva antes da confirmação final.
6. Replay e concorrência familiar continuam idempotentes.

## Etapas

1. localizar a perda de origem e de sinais de categorização entre reconciliador,
   fila numérica e revisão guiada;
2. criar RED causal com produto real;
3. implementar a correção mínima;
4. executar teste focal e bateria afetada;
5. executar uma única suíte ampla no candidato estável;
6. publicar hash sanitizado e obter auditoria independente;
7. promover por artefato e repetir o smoke em pendência real;
8. registrar fechamento dos gates proativos antigos;
9. só então abrir o writer histórico do Gate 41.

## Critérios de GO

- pessoa e conta/cartão fortes chegam preenchidos sem seleção manual;
- comerciante inequívoco recebe categoria determinística correta;
- caso ambíguo permanece sem preenchimento inventado;
- usuário consegue corrigir campos antes de salvar;
- escrita única, recibo, restart e replay permanecem verdes;
- auditoria independente e smoke real aprovados.

## Condições de parada

- origem Open Finance não fornecer vínculo forte;
- categoria depender de nova decisão de negócio de Daniel;
- correção ampliar regra para comerciantes não equivalentes;
- NO-GO independente.

## Fila posterior preservada

1. implementar, auditar e aplicar o writer histórico idempotente do Gate 41;
2. verificar que itens importados deixam de ser propostos;
3. recalcular o gasto livre automaticamente a partir da planilha completa;
4. destacar limite, gasto, restante e ritmo com asteriscos no WhatsApp.

## Próxima ação

Localizar a fronteira em que alias, pessoa/cartão e sinais de categoria deixam
de chegar à revisão guiada, sem escrita real adicional.
