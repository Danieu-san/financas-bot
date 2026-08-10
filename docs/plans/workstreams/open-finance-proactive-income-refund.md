# Gate 36 — revisão proativa read-only de entradas e estornos

Atualizado em: 2026-08-10

Estado: `RECOVERY LOCAL VERDE; AGUARDA REAUDITORIA INDEPENDENTE`.

O primeiro parecer independente encontrou duas lacunas: o comando explicito
ficava atras de um estado financeiro ativo e a expiracao nao removia payload de
revisao ja decidida. O recovery roteia o comando antes da maquina de estados e
purga payload cifrado em `pending` e `decided`, com provas focais e publicas.

## Objetivo

Oferecer revisão proativa para entradas genuínas e estornos observados pelo
Open Finance sem criar escrita financeira, sem reutilizar a revisão específica
de compras e sem absorver transferências internas ou movimentos de reserva.

## Contrato causal

- somente observação `POSTED`, reconciliada como `new`, pode originar revisão;
- crédito bancário continua inelegível quando houver uma ponta oposta de mesmo
  valor em outra conta familiar no intervalo de dois dias;
- `operation_type` de investimento ou marcador explícito de
  Caixinha/reserva/aplicação/resgate fica adiado para o Gate 37;
- estorno procura compra anterior na mesma conta, com valor absoluto igual e
  identidade forte: referência explícita compartilhada ou candidato único por
  valor, janela temporal e descrição normalizada compatível;
- compra ainda não salva seguida de estorno integral é neutralizada: a proposta
  da compra é suprimida/cancelada e nenhum dos dois vira receita ou despesa;
- estorno sem vínculo único continua revisável, mas não fica apto a salvamento;
- a decisão humana é persistida cifrada, escopada aos dois destinatários da
  política familiar e terminal: replay idêntico é aceito; conflito falha
  fechado;
- a mensagem usa código opaco e comandos explícitos `revisar <código> ...`, sem
  depender de um `sim` ambíguo ou criar uma segunda máquina de seleção numérica;
- `financial_writes=0` em toda classificação, persistência, entrega e revisão.

## Fora de escopo

- escrita em Sheets ou ledger;
- ativação ou deploy OCI;
- classificação definitiva de transferência, aplicação, resgate ou rendimento
  de Caixinha, pertencentes ao Gate 37;
- reconstrução do histórico de investimentos bloqueado no Gate 35;
- alteração da confirmação/finalização de compras existente.

## Evidência mínima

1. RED focal cobrindo entrada, transferência implícita, reserva, estorno
   pareado, estorno ambíguo e neutralização da compra não salva;
2. store real SQLite cifrado, idempotência, restart, autorização familiar e
   conflito terminal;
3. outbox e formatador reais com prompt acionável e nenhuma proposta de compra
   indevida;
4. entrada pública real consumindo o comando explícito;
5. bateria causal e uma única suíte hermética ampla após estabilização;
6. commit sanitizado, GitHub e auditoria independente por hash imutável.
