# Gate 38.3 - fechamento independente da escrita de estorno/reembolso

Data: 2026-08-10

## Hashes auditados

- candidato funcional: `6450934dde573b33c8c840cf28cda77a4208e17c`;
- primeiro recovery causal: `65198a53ebb693abc802c72b7012a93834cda6c0`;
- recovery fail-closed: `61feb2a706517c7f1e080edd20133d5d498ad815`;
- pacote focal de acesso: `718b93fd7f4d42e43c5a020ed774067a772cdabc`.

## Veredito

`GO TECNICO LOCAL; SEM DEPLOY`.

A auditoria final leu integralmente o pacote focal e o patch tecnico imutavel,
confirmou os hashes e declarou zero achados criticos, altos, medios ou baixos e
nenhuma lacuna indispensavel residual no delta.

## Cadeia de correcoes

O candidato inicial implementou a escrita de estorno fortemente vinculado, mas
a primeira revisao encontrou que um `sim` de proposta nova podia ser consumido
por uma finalizacao antiga do mesmo ator. O primeiro recovery vinculou o
roteamento ao `proposalRef` exato. A reauditoria seguinte encontrou a variante
de snapshot malformado sem identidade. O segundo recovery passou a falhar
fechado antes de finalizador ou revisor nesses estados.

## Semantica financeira fechada

- somente decisao duravel `confirm_pair`, vinculo forte e fonte atual
  `POSTED/new` podem ser promovidos;
- estorno de cartao gera uma linha negativa no mesmo cartao da compra original;
- reembolso bancario usa `Entradas` na mesma conta da saida original;
- conta e cartao permanecem separados;
- o recibo canonico mantem `refund_pair`, reduz o impacto da despesa original e
  nao cria receita genuina nem verba livre;
- segundo consentimento, revalidacao, operation key, replay, restart e resultado
  incerto preservam no maximo uma tentativa de append.

## Evidencia local confrontada

- caminhos publicos Gate 38.1 + Gate 38.3: `2/2`;
- bateria causal: `61/61`;
- suite hermetica ampla final unica do ultimo recovery:
  `1608/1598/0/10`, zero falhas;
- cobertura: linhas `91,09%`, branches `73,59%`, funcoes `90,74%`;
- diff check e sintaxe: verdes.

As contagens sao execucao local relatada pelo Codex, nao execucao do auditor.

## Alcance

O fechamento e exclusivamente local. Nenhuma flag, planilha, sessao WhatsApp,
Pluggy ou servidor real foi alterado. Producao continua com escrita desligada;
smoke e promocao permanecem bloqueados enquanto Daniel estiver ausente.
