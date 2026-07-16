# Fase 9F - gate de lifecycle antes da auditoria total - 2026-07-16

## Veredito

`GO tecnico` para os passos automatizaveis de revogacao local,
backup/restauracao e retencao.

`NO-GO` para encerrar a Fase 9 ate a auditoria adversarial total solicitada pelo
usuario.

## Escopo executado

### Revogacao local

- a ordem fail-closed bloqueia e apaga alertas antes de limpar baseline e
  staging;
- baseline apaga conexao, eventos, observacoes e candidatos da fonte;
- staging apaga o payload e mantem apenas tombstone HMAC;
- outbox apaga alertas pendentes, em voo, bloqueados ou enviados da fonte;
- evento atrasado permanece bloqueado nos tres stores;
- replay da revogacao e idempotente;
- nenhum destes passos revoga consentimento no provedor: essa acao externa
  continua explicita e pertencente ao titular.

### Reconsentimento

- remover tombstones exige chamada explicita nos tres stores;
- a fonte reativada precisa de baseline silencioso novo;
- nenhuma observacao antiga vira alerta depois da reativacao.

### Backup, restore e retencao

- snapshot SQLite consistente dos tres stores;
- manifesto com SHA-256, tamanho e nomes allowlisted;
- `PRAGMA integrity_check` na criacao, verificacao e restauracao;
- restauracao somente em diretorio vazio;
- arquivos e manifesto em modo `600`;
- alteracao de um byte bloqueia restore;
- retencao operacional inicial de 30 dias, limitada pelo codigo ao intervalo de
  7 a 90 dias;
- exclusao somente depois da expiracao, com confirmacao explicita e diretorio
  contido no root autorizado.

A politica de 30 dias e uma configuracao operacional provisoria, nao uma
conclusao legal. A auditoria final deve confirmar ou alterar esse prazo.

## Evidencia

- lifecycle/backup focado: `4/4`;
- Open Finance combinado: `71/71`;
- suite completa: `964/964`;
- npm audit: zero vulnerabilidades;
- teste remoto focado: `7/7`;
- zero conta real revogada;
- zero backup real criado ou removido;
- zero escrita em ledger, Sheets ou movimentos financeiros.

## Estado recomendado ate a auditoria

- manter o canario somente para Daniel;
- manter alertas restritos a compra/estorno;
- manter escrita `off`;
- nao expandir para Thais/Cristina/Itau;
- nao contratar plano ou depender de recurso Pro;
- nao chamar a Fase 9 de concluida antes da auditoria total.

## Pontos que a auditoria total deve decidir

1. se o aceite local do transporte sem ID e risco aceitavel ou deve virar estado
   `accepted_unconfirmed`;
2. risco residual de duplicacao se o processo cair entre envio e ack;
3. prazo final de retencao e tratamento de backups anteriores a revogacao;
4. protecao de segredos e bancos privados na EC2;
5. continuidade operacional enquanto o GitHub publico permanece atras do
   deploy privado;
6. manter, recuar ou expandir o experimento read-only.
