# Gate 38.2 - escrita gradual de entrada genuina Open Finance

Atualizado em: 2026-08-10

Estado: `RECOVERY PROBATORIO LOCAL VERDE; AGUARDA REAUDITORIA`.

## Objetivo

Permitir que uma movimentacao `POSTED/new`, revisada explicitamente como
entrada genuina no Gate 36, siga para conferencia guiada e segunda confirmacao
antes de criar exatamente uma linha em `Entradas`.

## Origem autorizada

- revisao proativa duravel com `review_kind=income`;
- decisao terminal `income` emitida por ator familiar autorizado;
- lifecycle atual `income_candidate/POSTED`;
- reconciliacao atual `new`;
- mesma fonte, alias, geracao, conta, transacao, valor, data e descricao;
- proposta ainda valida, nao revogada e vinculada a mesma revisao.

Transferencia, resgate, rendimento, estorno, compra, saida, incerteza e revisao
expirada nao entram neste gate.

## Consentimento e conferencia

1. `revisar <codigo> entrada` apenas fixa a classificacao.
2. O bot oferece continuar para conferir; essa resposta ainda nao escreve.
3. A conferencia exige pessoa, categoria de entrada, forma de recebimento e
   conta financeira autorizada; cartao nunca e opcao.
4. A conclusao revalida fonte, ledger, catalogo e decisao proativa.
5. Somente um segundo `sim`, vinculado a finalizacao duravel, pode chamar o
   writer.
6. Replay, concorrencia, restart e resultado incerto preservam no maximo um
   append e o mesmo recibo.

## Plano de escrita

- operacao: `income.create`;
- destino: `Entradas`;
- valor positivo absoluto vindo da fonte;
- data e descricao preservadas;
- categoria de entrada, pessoa, recebimento e conta escolhidos no catalogo
  familiar autorizado;
- recorrente: `Nao`;
- observacao de origem Open Finance confirmada;
- `user_id` da pessoa escolhida;
- operation key duravel e escopada.

## Nao escopo

- estornos e reembolsos: Gate 38.3;
- transferencias e reservas: gate posterior proprio;
- escrita no momento da deteccao ou classificacao;
- inferencia de PIX, conta ou categoria ausente;
- mudanca de flags, deploy, restart, Sheets, Pluggy ou WhatsApp reais.

## Criterios de saida local

- testes RED/green para promocao, autorizacao, revalidacao e escrita unica;
- regressao integral da classe compra;
- uma suite hermetica ampla somente quando o candidato estiver estavel;
- commit sanitizado e imutavel;
- auditoria independente sem lacuna causal indispensavel.

O resultado maximo nesta ausencia de Daniel e `GO TECNICO LOCAL; SEM DEPLOY`.

## Evidencia do candidato

- focais e regressao de compra: `46/46`;
- handler publico completo do fluxo de entrada: `1/1`;
- suite hermetica ampla unica: `1599/1589/0/10`, zero falhas;
- manifesto: `docs/audit/199-open-finance-income-write-candidate-2026-08-10.md`.

## Recovery probatorio

O primeiro parecer independente aprovou a implementacao estatica, mas emitiu
NO-GO porque o double de Google deduplicava `operationKey` antes da contagem e
o teste nao explicitava replay apos reabertura. O recovery conta tentativas de
append antes dessa deduplicacao, recarrega o modulo de finalizacao, reabre os
stores duraveis e exige que o replay nao invoque novamente a borda de escrita.
Manifesto:
`docs/audit/200-open-finance-income-write-proof-recovery-candidate-2026-08-10.md`.
Focais verdes `1/1` e `28/28`; suite hermetica ampla final
`1599/1589/0/10`, zero falhas.
