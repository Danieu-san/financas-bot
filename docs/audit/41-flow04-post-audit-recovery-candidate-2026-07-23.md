# Recuperação pós-auditoria — FLOW-04

Data: 2026-07-23

Candidato recusado: `7c8d2b290dca84943a661532717f94eea91c1c6c`.

Estado: recuperação local aguardando novo commit imutável e reauditoria.

## Veredito confrontado

A auditoria independente confirmou SHA, base e os sete arquivos, mas emitiu
`NO-GO TÉCNICO LOCAL`.

O achado bloqueante era correto: o mesmo `catch` cobria a rejeição de
`client.sendMessage` e uma falha posterior de confirmação SQLite. Portanto, um
transporte já aceito poderia ser liberado novamente para retry.

Também foram apontados:

- prova de integração dos seis jobs baseada apenas em mock;
- comentário enganoso da chave em `.env.example`;
- prova de concorrência sequencial, sem contenção simultânea;
- ausência de captura explícita dos logs;
- documentos ainda no estado anterior ao commit.

## Correção

- rejeição do transporte e confirmação posterior agora têm blocos separados;
- somente a rejeição do transporte chama `releaseFailure`;
- falha de confirmação deixa a lease em `in_flight`, incrementa somente contador
  sanitizado e continua o dreno;
- falha ao persistir a própria liberação também mantém o estado conservador e
  continua o próximo job;
- `busy_timeout=5000` reduz indisponibilidade transitória entre conexões;
- prova causal força falha de confirmação depois de um ID aceito e exige zero
  retry, recuperação como `accepted_unconfirmed` e continuação do usuário
  seguinte;
- outra prova força falha de atualização após rejeição e exige continuação;
- os seis tipos atravessam também a implementação real, persistem e deduplicam
  em banco temporário;
- captura de log comprova que o fail-closed não expõe destinatário, mensagem ou
  erro cru;
- `.env.example` registra a chave como obrigatória para store em arquivo e
  outbox, com formato exato.

## Evidência após a recuperação

- bateria focada de scheduler, outbox e contrato de ambiente: `42/42`;
- bateria diretamente afetada com auditoria negativa: `46/46`;
- sintaxe, diff e workflow: verdes;
- gate exaustivo local válido: `1.261` testes, `1.256` aprovados, zero
  falhas, cinco skips funcionais previstos e zero TODO;
- cobertura: linhas `89,86%`, branches `71,95%`, funções `89,67%`;
- nenhuma rede, produção, Google, WhatsApp ou dado real;
- o gate amplo foi repetido uma vez porque houve mudança causal no dreno.

## Resíduos proporcionais

- SQLite continua sem uma prova de contenção simultânea entre processos, mas o
  claim é transacional, o `UPDATE` é condicionado e há `busy_timeout`;
- uma rejeição assíncrona do transporte continua inerentemente ambígua e
  retryable, limitação aceita pela própria auditoria no contexto familiar;
- não existe garantia distribuída de exatamente uma entrega entre SQLite e
  WhatsApp.

## Critério para GO

Novo hash publicado, testes e controles verdes, e reauditoria independente sem
achado bloqueante.
