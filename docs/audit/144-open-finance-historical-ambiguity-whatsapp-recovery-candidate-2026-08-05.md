# RX-HIST-AMBIGUITY-WHATSAPP-01 - recovery candidato

Data: 2026-08-05

Commit anterior: `f96717328de3f1e9ca8d259b5bed06af5f1fb039`

## Motivo do recovery

A auditoria independente do candidato 143 retornou `NO-GO`. A confrontacao
local confirmou as lacunas materiais: ingresso sem vinculo temporal com a
tentativa, gate abaixo de handlers capazes de produzir efeitos, TTL atrasado,
ID de provedor malformado, retry definitivo sem executor proprio e recovery
global da outbox.

## Fechamentos

- a outbox migra de forma aditiva para `attempted_at` e o grava no claim;
- a entrada publica exige timestamp WhatsApp posterior ao segundo da
  tentativa; mensagem anterior ou sem timestamp e consumida como bloqueada e
  nunca avanca a revisao;
- o handler consulta a revisao depois de autorizacao/seguranca e de uma conversa
  ja ativa, mas antes de onboarding, lifecycle, settings, dashboard, admin,
  recibo, OCR, importacao, metas, writers e LLM;
- ID do provedor so confirma entrega quando e texto nao vazio em um dos campos
  conhecidos; objeto malformado vira `accepted_unconfirmed`;
- falha marcada como definitivamente nao enviada permanece retry-safe e um
  timer proprio drena novamente somente os jobs da revisao;
- claim, recovery de lease e purge recebem o mesmo escopo de job refs;
- revisao expirada terminaliza sem decisao e cada ator recebe no maximo uma
  resposta duravel de expiracao, sempre com zero escrita.

## Evidencia focal

- testes novos iniciaram RED para ID malformado/pre-attempt, retry isolado e
  TTL expirado;
- bateria focal composta: 164/164; depois do aperto temporal final, os testes
  afetados ficaram 137/137 e o runtime isolado 9/9;
- a prova composta atravessa backfill, handler publico, runtime, review store e
  outbox reais com transporte sintetico, exige bloqueio da mensagem anterior,
  decisao zero, writer zero e LLM zero;
- bateria causal Open Finance final: 381/381;
- suite hermetica ampla final: 1.507 testes, 1.497 aprovados, zero falhas e 10
  skips conhecidos;
- cobertura final: linhas 90,74%, branches 73,31%, funcoes 90,41%;
- nenhuma rede real, WhatsApp real, Pluggy, planilha, ledger, OCI, deploy ou
  producao foi acessado.

## Alcance

O recovery continua exclusivamente read-only e `off` por padrao. Nao consome
decisoes para salvamento, nao ativa `prompt`, nao escreve dados financeiros e
nao autoriza deploy ou producao. O estado maximo e candidato aguardando nova
auditoria independente em outro hash imutavel.
