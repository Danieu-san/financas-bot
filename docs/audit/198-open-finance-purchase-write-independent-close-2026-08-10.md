# Gate 38.1 - fechamento independente da escrita de compra

Data: 2026-08-10

## Estado

`GO TECNICO LOCAL INDEPENDENTE; SEM DEPLOY`.

O parecer independente leu o commit imutavel
`f14849ce0da78b94a8c2c981f94242c113cf43cb` e confirmou a prova publica da
composicao atual entre handler, fila numerica, finalizacao duravel e writer da
classe compra.

## Veredito independente

- produto real exercitado: handler, outbox, preview, vault, review store,
  finalization store, revalidacao e avanco de lote;
- antes da confirmacao final ha zero append;
- a primeira compra produz exatamente um append;
- falha no transporte do recibo preserva `committed` e o recibo duravel;
- replay retorna o recibo antes de qualquer nova chamada ao writer;
- somente depois do recibo a fila avanca para a segunda proposta;
- o novo `sim` entra na revisao da segunda proposta, sem consentimento herdado
  e sem segundo append;
- achados CRITICAL/HIGH/MEDIUM: zero;
- nenhuma lacuna causal indispensavel residual.

O auditor observou que a fronteira Google sintetica deduplica por operation
key, mas confirmou estaticamente que o fast-path `committed` retorna antes do
writer. Portanto esse componente nao substitui nem mascara a decisao de replay
avaliada.

## Evidencia local correlata

- prova focal: `1/1`;
- par publico afetado: `2/2`;
- handler financeiro completo: `130/130`;
- modulos causais: `94/94`;
- suite hermetica no mesmo codigo de produto: `1592/1582/0/10`, zero falhas.

As contagens sao execucao local do Codex, nao execucao do auditor.

## Alcance

O GO fecha somente o Gate 38.1 local para a classe compra. Nao autoriza flags,
deploy, restart nem smoke. Producao permanece `OPEN_FINANCE_WRITE_MODE=off` e a
ativacao real continua bloqueada enquanto Daniel estiver ausente.

