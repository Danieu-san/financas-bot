# RX-HIST-AMBIGUITY-REVIEW-01 - recovery antirreplay da persistencia

Data: 2026-08-05

## Origem

O commit `b50511ca1d28f0983d29d3dc0aab30bc0130a77c` recebeu `NO-GO`
independente. O parecer confirmou o fechamento dos dois achados altos anteriores,
mas identificou que o MAC da linha nao cobria o `sealed_state`. Assim, a troca
isolada do envelope por uma versao anterior, ainda valida em AES-GCM, nao era
detectada pela persistencia.

## Recovery

- o MAC da linha agora autentica tambem o SHA-256 exato do `sealed_state`;
- depois de validar o MAC, a persistencia abre o envelope e exige que
  `review_ref`, `family_scope_ref` e `status` coincidam com a linha externa;
- o conjunto interno de dois atores autorizados continua sendo confrontado com
  o escopo configurado da store;
- `handleReply` e `readPrivate` passam necessariamente por essa validacao antes
  de consumir o estado;
- uma substituicao isolada por envelope antigo falha fechado com
  `store_state_invalid`, sem interpretar resposta e sem escrita financeira;
- o alcance continua local, cifrado, reiniciavel e estritamente read-only, com
  `financial_writes=0`.

## Evidencia executada

- teste adversarial: a revisao avanca uma revisao duravel, o SQLite recebe o
  envelope GCM anterior e tanto `handleReply` quanto `readPrivate` rejeitam o
  replay;
- focal RX + revisao: 32/32;
- bateria causal Open Finance: 371/371;
- suite hermetica final: 1.493 testes, 1.483 aprovados, zero falhas e 10 skips
  conhecidos;
- cobertura: linhas 90,68%, branches 73,26%, funcoes 90,37%;
- nenhuma rede real, mensagem, escrita financeira, flag, deploy ou producao.

## Arquivos para auditoria

- `src/openFinance/openFinanceHistoricalAmbiguityReview.js`
- `tests/openFinanceHistoricalAmbiguityReview.test.js`
- `docs/audit/140-open-finance-historical-ambiguity-numbered-review-recovery-candidate-2026-08-05.md`
- este manifesto.

## Alcance solicitado

Reavaliar somente o `GO TECNICO LOCAL` do nucleo e o fechamento do replay
isolado de `sealed_state`. Envio proativo, entrada publica do WhatsApp, consumo
das decisoes, salvamento numerado, deploy e producao permanecem fora do gate
mesmo em caso de GO.
