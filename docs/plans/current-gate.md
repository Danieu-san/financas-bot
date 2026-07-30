# Gate ativo — 9P.4 finalização idempotente da proposta Open Finance

Atualizado em: 2026-07-30

Base:
`20b8b7873c6626a3e74019ef025624e75303df7f`.

## Estado

`GO TÉCNICO LOCAL; 9P.4 ENCERRADO`.

O primeiro candidato, no hash
`a512a07a8f18c9dffcf62676357c35f41f50395d`, recebeu `NO-GO` independente por
dois achados `HIGH` e um `MEDIUM`. A recuperação separa o writer inicial do
reconciliador, torna retomadas `writing/uncertain` estritamente
`reconcileOnly` e preserva `FINANCIAL_WRITE_UNCERTAIN` no ledger.

## Objetivo

Transformar uma revisão 9P.3 em estado `ready` numa confirmação final
restart-safe que:

1. relê a observação no cofre Open Finance autorizado;
2. revalida status, escopo, valor, data, descrição e identidade da transação;
3. relê a fonte financeira familiar e exige reconciliação ainda `new`;
4. relê o catálogo familiar e rejeita pessoa, categoria, pagamento, conta ou
   cartão que deixaram de ser autorizados;
5. produz uma operation key estável ligada à proposta e ao rascunho validado;
6. somente depois de nova confirmação explícita chama um writer idempotente;
7. persiste estado e recibo sem payload financeiro em claro.

## Escopo

- store cifrado de finalização e recibo, no banco privado já governado;
- revalidador final do cofre, da fonte familiar e do catálogo;
- plano determinístico de uma única escrita de despesa ou cartão;
- confirmação final `sim`/`não` com retomada após restart;
- operação idempotente pelo `FinancialWriteLedger` usado por
  `appendRowToSheet`;
- resultado incerto sem replay cego;
- entrada pública serializada e testes com dependências falsas, sem Google,
  Pluggy ou WhatsApp reais;
- código dormente quando `OPEN_FINANCE_WRITE_MODE=off`.

## Não escopo

- deploy, restart, QR ou alteração de produção Oracle;
- ativar `OPEN_FINANCE_WRITE_MODE`;
- alterar o rollout Open Finance, que continua proibindo write mode;
- chamadas reais a Pluggy, Google ou WhatsApp;
- múltiplos lançamentos, parcelamento ou importação;
- renda, transferência, estorno, tarifa, pagamento de fatura ou investimento;
- expansão além do casal familiar já autorizado.

## Invariantes

1. Revisão diferente de `ready`, proposta não aceita, expirada, cancelada ou
   revogada nunca gera confirmação final.
2. A transação atual deve ser a mesma observação `POSTED` e continuar
   classificada como compra simples.
3. Mudança em valor, data, descrição, conta, tipo da conta, geração ou
   identidade do provedor invalida a finalização.
4. `matched`, `possible_duplicate`, `uncertain`, fonte incompleta ou escopo
   ambíguo bloqueiam antes do writer.
5. Todo item escolhido no rascunho deve existir novamente no catálogo familiar
   autorizado e preservar os campos usados na escrita.
6. `sim` é exigido depois da revalidação; conclusão da conferência 9P.3 não
   grava.
7. Operation key é determinística para proposta + rascunho validado e nunca é
   exibida ao usuário.
8. Crash antes, durante ou depois do append retoma pelo mesmo recibo; estado
   incerto não faz retry cego.
9. Recusa, cancelamento, expiração e revogação são terminais.
10. Com `OPEN_FINANCE_WRITE_MODE=off`, a entrada pública preserva o comportamento
    9P.3 e `financial_writes=0`.

## RED causal

- [x] revisão pronta cuja transação já existe na planilha é bloqueada;
- [x] transação alterada ou não mais `POSTED` é bloqueada;
- [x] item removido do catálogo é bloqueado;
- [x] completar 9P.3 não chama writer;
- [x] duas confirmações/restart produzem um único append e o mesmo recibo;
- [x] falha ambígua permanece incerta e reconcilia pela mesma operation
  key sem duplicar;
- [x] ator fora do casal não lê, confirma ou obtém recibo;
- [x] banco não contém descrição, valor, conta, cartão ou pessoa em claro;
- [x] revogação remove proposta, revisão e finalização antes de nova confirmação;
- [x] falha de envio após append recupera o recibo sem segundo lançamento.
- [x] restart entre stores distintos sem ledger bloqueia antes do append;
- [x] retomada somente conclui por ledger committed ou prova positiva no Sheets;
- [x] `FINANCIAL_WRITE_UNCERTAIN` nunca é rebaixado a `failed`.

## Etapas

1. [concluída] RED do revalidador, store e confirmação idempotente.
2. [concluída] Implementação mínima dos contratos puros e duráveis.
3. [concluída] Integração na entrada pública, ainda dormente por flag.
4. [concluída] Baterias focal, causal, Open Finance e entrada pública.
5. [concluída] Runner hermético, contrato de ambiente, diff e segredos.
6. [concluída] Primeiro commit sanitizado e auditoria independente: `NO-GO`.
7. [concluída] Recovery publicado e reauditoria independente: `GO TÉCNICO LOCAL`.
8. [fora deste gate] Deploy OCI por artefato com rollback e ativação controlada.

## Critérios de GO

- todos os invariantes possuem prova causal;
- um único efeito financeiro para replay, restart e confirmação concorrente;
- resultado incerto não autoriza sucesso nem segundo append;
- recibo é durável, sanitizado e escopado;
- nenhuma integração real é usada nos testes;
- `OPEN_FINANCE_WRITE_MODE=off` permanece o padrão e a configuração vigente;
- auditoria independente não encontra achado bloqueante.

## Condições de parada

- divergência de branch, base ou árvore fora dos arquivos declarados;
- descoberta de segredo, dado real ou payload financeiro no candidato;
- falha do runner hermético, do workflow ou de qualquer prova causal afetada;
- necessidade de chamada real a WhatsApp, Pluggy, Google ou produção;
- achado independente `CRITICAL`, `HIGH` ou `MEDIUM`, ou lacuna causal
  indispensável;
- próxima ação exigir capacidade diferente de `Codex → Sol → Alto`.

## Próxima ação exata

Registrar o fechamento documental e, sem ativar flags ou produção, verificar o
primeiro item da fila posterior: atribuição familiar uniforme a Daniel ou
Thaís no fluxo 9P.3/9P.4.

## Capacidade

`Codex → Sol → Alto → verificar a atribuição familiar uniforme pós-9P.4.`
