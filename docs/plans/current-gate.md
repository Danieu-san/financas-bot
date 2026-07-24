# Gate ativo — FLOW-04

Atualizado em: 2026-07-23

Base: `45a42ab2c155a544da674be3a3f8ffa853f664c3`.

## Estado

Recuperação local após `NO-GO TÉCNICO LOCAL` do candidato
`7c8d2b290dca84943a661532717f94eea91c1c6c`.

O bloqueador pós-aceitação foi corrigido: somente rejeição do transporte pode
liberar retry. Falha posterior de confirmação mantém a lease `in_flight`, que
expira para `accepted_unconfirmed`, e não interrompe os jobs seguintes.

## Objetivo

Garantir entrega agendada isolada por usuário, com deduplicação durável e retry
limitado para mensagens gerais do scheduler.

## Escopo

- lembrete de agenda;
- lembrete de conta;
- resumo matinal;
- resumo noturno;
- check-in semanal;
- relatório mensal;
- outbox SQLite privada e payload cifrado;
- retry/backoff, retenção, lease e recuperação conservadora após crash;
- testes locais sem integrações reais.

## Não escopo

- alertas administrativos e operacionais, que possuem mecanismos próprios;
- exatamente uma entrega após falha ambígua do transporte;
- mudança de conteúdo, opt-in ou fontes financeiras dos jobs;
- produção, deploy, Google, WhatsApp ou dados reais;
- melhorias posteriores de Pluggy/Open Finance ou UX familiar.

## Contrato

1. cada mensagem possui chave determinística por usuário, tipo e período/item;
2. replay e reinício não reenviam item já confirmado ou aceito sem confirmação;
3. falha de um destinatário não interrompe os demais;
4. falhas reconhecidamente anteriores à aceitação recebem retry com backoff
   limitado;
5. lease expirada vira estado ambíguo, sem retry cego;
6. destinatário e mensagem ficam cifrados, banco e diretório são privados;
7. logs e resultados expõem apenas contagens e códigos sanitizados;
8. ausência de configuração segura bloqueia o envio, sem bypass direto.

## Critérios de GO

- testes adversariais reproduzem o defeito antes da correção;
- os seis jobs usam a fronteira durável;
- retry, deduplicação, crash ambíguo, retenção, criptografia e permissões passam;
- baterias focadas e controles estáticos ficam verdes;
- candidato sanitizado é publicado por hash imutável;
- auditoria independente no Chat não encontra severidade bloqueante.

## Condições de parada

- qualquer caminho de envio direto remanescente nos seis jobs;
- retry cego depois de resultado ambíguo;
- dado privado persistido em claro ou emitido em log;
- mudança necessária de produção ou integração real;
- regressão causal fora do escopo.

## Próxima ação exata

Publicar um novo commit imutável com a recuperação pós-auditoria e submetê-lo a
nova auditoria independente antes de declarar GO.

## Capacidade

`Codex → Sol → Alto → implementar e validar FLOW-04; Chat → modelo mais capaz
disponível → Alto → auditar o futuro hash imutável.`
