# Candidato de auditoria — FLOW-04

Data: 2026-07-23

Base: `45a42ab2c155a544da674be3a3f8ffa853f664c3`.

Estado: candidato local aguardando commit imutável e auditoria independente.

## Objetivo

Impedir que falha de envio para um usuário interrompa os demais jobs agendados
e tornar retry/deduplicação persistentes entre reinícios.

## Escopo

- lembrete de agenda e de conta;
- resumo matinal e noturno;
- check-in semanal e relatório mensal;
- outbox SQLite local, payload AES-256-GCM e referências HMAC;
- claim atômico, lease, retry exponencial limitado, retenção e estados
  terminais;
- drenagem a cada cinco minutos e também depois de novos enqueues.

Alertas administrativos/operacionais, conteúdo dos jobs, integrações reais e
deploy permanecem fora.

## Contrato implementado

- a chave de deduplicação é determinística por usuário, tipo e período/item,
  mas somente seu HMAC é persistido;
- destinatário e mensagem ficam cifrados; identificador do transporte também é
  persistido somente como HMAC;
- uma rejeição do transporte volta a `pending` com backoff e limite de cinco
  tentativas, sem interromper o próximo destinatário;
- retorno aceito sem ID vira `accepted_unconfirmed` e não recebe retry cego;
- lease expirada após crash também vira `accepted_unconfirmed`;
- confirmação e estados ambíguos sobrevivem a reinício e bloqueiam replay;
- ausência de chave válida falha fechada, sem envio direto;
- diretório e arquivos persistentes usam modos privados; o journal é `DELETE`;
- logs e retornos contêm apenas códigos e contagens sanitizados.

O transporte do WhatsApp não oferece transação exatamente uma vez. Uma rejeição
assíncrona é tratada como retryable e, se o provedor tiver aceitado a mensagem
antes de rejeitar localmente, pode haver duplicação. Resultados aceitos e
crashes depois do claim são tratados conservadoramente para não repetir às
cegas.

## Mudança

- `src/jobs/schedulerMessageOutbox.js`: store e runtime duráveis;
- `src/jobs/scheduler.js`: os seis jobs passam pela fronteira e há drenagem
  periódica;
- `.env.example`: caminho opcional do banco documentado;
- `tests/schedulerMessageOutbox.test.js`: provas adversariais de persistência,
  concorrência, privacidade, retry, retenção e fail-closed;
- `tests/schedulerJobs.test.js`: prova de integração dos seis tipos;
- `docs/plans/current-gate.md`: contrato do gate.

## Evidência executada

- RED causal: antes do módulo, a prova falhou por ausência da fronteira durável;
- bateria focada final: `34/34`;
- bateria diretamente afetada, incluindo contrato de ambiente e auditoria
  negativa: `43/43`;
- sintaxe dos quatro arquivos JavaScript e `git diff --check`: verdes;
- gate exaustivo local válido: `1.258` testes, `1.253` aprovados, zero falhas,
  cinco skips funcionais previstos e zero TODO;
- cobertura do gate: linhas `89,85%`, branches `71,79%`, funções `89,65%`;
- inspeção estática: os seis jobs não possuem envio direto; o único
  `client.sendMessage` restante no scheduler pertence ao alerta administrativo
  fora do escopo;
- nenhuma rede, produção, Google, WhatsApp ou dado real foi acessado.

## Critério para GO

O candidato somente poderá receber `GO TÉCNICO LOCAL` após commit/push
sanitizado e auditoria independente por hash que confronte, em especial,
isolamento entre usuários, semântica de erro ambíguo, deduplicação, cifra,
permissões e ausência de bypass direto.
