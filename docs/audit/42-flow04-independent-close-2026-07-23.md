# Fechamento independente — FLOW-04

Data: 2026-07-23

Base original: `45a42ab2c155a544da674be3a3f8ffa853f664c3`.

Primeiro candidato: `7c8d2b290dca84943a661532717f94eea91c1c6c`.

Candidato final: `34f0f0cdcb470a2bcfa7152fecd45361edee28e4`.

## Veredito

`GO TÉCNICO LOCAL`.

O Chat confirmou os três hashes, a relação linear entre eles e os arquivos
exigidos. Não encontrou achado `CRITICAL`, `HIGH` ou `MEDIUM` no candidato
final e declarou explicitamente fechado o `HIGH` do primeiro candidato.

O parecer é estático. Não autoriza deploy, produção, Google, WhatsApp ou dados
reais.

## Contrato encerrado

- agenda, contas, resumos, check-in e relatório mensal atravessam a mesma
  fronteira durável;
- falha de um destinatário não interrompe os seguintes;
- deduplicação, retry limitado, terminal `dead`, lease e retenção sobrevivem a
  reinício;
- somente rejeição do transporte libera retry;
- falha posterior a transporte resolvido fica ambígua, sem voltar a `pending`;
- lease expirada vira `accepted_unconfirmed` e não recebe retry cego;
- payload usa AES-256-GCM e referências HMAC; arquivos são privados;
- ausência de chave válida falha fechada, sem envio direto;
- drenagem periódica ocorre a cada cinco minutos.

## Evidência

- RED causal do outbox ausente;
- focados após recuperação: `42/42`;
- diretamente afetados com auditoria negativa: `46/46`;
- sintaxe, diff, workflow e varredura de segredos: verdes;
- gate exaustivo final válido: `1.261` testes, `1.256` aprovados, zero falhas,
  cinco skips funcionais previstos e zero TODO;
- cobertura: linhas `89,86%`, branches `71,95%`, funções `89,67%`;
- nenhuma rede, produção, Google, WhatsApp ou dado real.

## Achados residuais

- `LOW`: a prova de falha de `releaseFailure` compõe dois testes para demonstrar
  a conversão posterior em `accepted_unconfirmed`;
- `LOW`: os corpos dos seis jobs provam o roteamento com mock, enquanto o
  dispatcher comum prova persistência/deduplicação real dos seis tipos.

A auditoria considerou ambas as composições correspondentes à arquitetura e
não bloqueantes.

## Limitação aceita

SQLite e WhatsApp não compartilham uma transação distribuída. Uma rejeição
assíncrona pode ser ambígua e, por política, continua retryable com limite. Para
um bot familiar privado de duas pessoas, a auditoria considerou o risco
proporcional e explicitamente documentado.

## Próximo gate

`STATE-03`: provar que o shutdown do backend de estado aguarda o último flush,
sem produção.
