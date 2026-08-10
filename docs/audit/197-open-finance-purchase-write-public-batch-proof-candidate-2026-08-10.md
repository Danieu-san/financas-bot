# Gate 38.1 - recovery probatorio da fila apos escrita

Data: 2026-08-10

## Estado proposto

`RECOVERY PROBATORIO LOCAL VERDE; AGUARDA REAUDITORIA INDEPENDENTE`.

O codigo de produto permanece identico ao candidato anterior. Nenhuma flag,
integracao, planilha ou producao foi alterada.

## Auditoria anterior

O auditor confirmou durante a leitura a exclusividade
`purchase/POSTED/new/nao parcelada`, a separacao `writing/uncertain` para o
reconciliador, o store duravel e o controlador fail-closed. O veredito final,
porem, foi `ACESSO INSUFICIENTE`; portanto nenhum GO foi aceito.

A fronteira probatoria destacada na analise foi o comportamento da fila
numerica depois do recibo de uma escrita bem-sucedida no handler publico.

## Prova acrescentada

O teste publico real agora cria duas compras elegiveis vinculadas ao mesmo lote
e atravessa `messageHandler` com stores, outbox, vault, catalogo e writer reais.
Ele exige que:

1. a preparacao final do primeiro item mantenha zero append;
2. o segundo `sim` grave somente o primeiro item;
3. falha sintetica de transporte do recibo preserve a finalizacao duravel;
4. o replay recupere o recibo sem novo append;
5. somente depois do recibo o segundo item abra sua propria revisao;
6. o `sim` enviado nessa nova revisao nao seja herdado como confirmacao nem
   provoque segunda escrita;
7. o cancelamento do segundo item encerre o lote com exatamente um append.

## Evidencia

- nova prova focal publica: `1/1`;
- par publico afetado, incluindo selecao numerica read-only: `2/2`;
- arquivo completo do handler financeiro publico: `130/130`;
- modulos causais anteriores, sem mudanca de produto: `94/94`;
- suite hermetica reutilizada, pois somente teste e documentos mudaram:
  `1592/1582/0/10`, zero falhas.

As contagens sao execucao local do Codex, nao execucao independente.

## Limites

O estado maximo continua sendo `GO TECNICO LOCAL` da classe compra. Producao,
flags e smoke real permanecem bloqueados enquanto Daniel estiver ausente.
