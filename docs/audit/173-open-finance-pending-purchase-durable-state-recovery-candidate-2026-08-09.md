# Gate 34 - recovery probatorio do estado duravel

Atualizado em: 2026-08-09

## Origem

O commit `809930a5f516cc33d61db42d020bfc279738e7a3` recebeu `NO-GO`
independente estritamente probatorio. A implementacao da mensagem foi julgada
suficiente, mas o teste causal usava um `Map` cuja `setStateDurably` apenas
gravava em memoria. O auditor classificou como `MEDIUM` a ausencia de prova de
persistencia e reabertura do estado `awaiting_open_finance_save_selection`.

## Recovery

O teste do runtime nao usa mais um double para o estado de conversa. Ele agora:

1. configura o `userStateManager` real em diretorio temporario com chave de
   teste e persistencia cifrada;
2. executa o primeiro ciclo com duas compras `PENDING` e exige ausencia de
   estado de conversa;
3. executa o segundo ciclo com as mesmas compras `POSTED`, exige duas propostas,
   um unico lote numerado e `financial_writes=0`;
4. confirma que o snapshot existe e nao contem em claro a acao nem identidades
   sinteticas da transacao;
5. fecha o store, remove o modulo do cache, reabre o produto real e exige a
   acao duravel com duas propostas numeradas `[1,2]`.

Os doubles restantes fornecem snapshot do provedor, fonte interna, usuarios e
transporte. Eles nao decidem elegibilidade, criacao de proposta, lote, binding
ou persistencia.

## Evidencia local

- teste focal do recovery: `1/1`;
- bateria causal de runtime, entrega e fluxo numerico: `38/38`;
- syntax check: verde;
- suite hermetica final unica: `1.555` testes, `1.545` aprovados, zero
  falhas e `10` skips esperados;
- cobertura da suite: linhas `90,89%`, branches `73,56%` e funcoes `90,52%`.

## Invariantes

- nenhum codigo de produto foi alterado pelo recovery probatorio;
- mensagem continua restrita a `purchase/PENDING`;
- proposta continua restrita a `purchase/POSTED/new`;
- estorno continua apenas informativo;
- escrita permanece `off`, aprovacao falsa e `financial_writes=0`;
- producao continua no hash
  `b6f8edc37bd46ba977a7a4a4e59f54ad092300d6`.

## Estado

`CANDIDATO LOCAL VERDE; AGUARDA NOVO HASH E REAUDITORIA INDEPENDENTE`.
