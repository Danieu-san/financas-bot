# Gate encerrado — FLOW-04

Atualizado em: 2026-07-23

Base: `45a42ab2c155a544da674be3a3f8ffa853f664c3`.

## Estado

`GO TÉCNICO LOCAL` independente no candidato final
`34f0f0cdcb470a2bcfa7152fecd45361edee28e4`.

O primeiro candidato recebeu `NO-GO` por um retry cego pós-aceitação. A
recuperação separou transporte e confirmação, recebeu zero achado
`CRITICAL`/`HIGH`/`MEDIUM` e fechou explicitamente o bloqueador anterior.

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

Publicar este fechamento documental e abrir `STATE-03` em worktree isolado,
sem produção.

## Capacidade

`Codex → Sol → Alto → caracterizar e corrigir STATE-03; Chat → modelo mais
capaz disponível → Alto → auditar o futuro hash imutável.`
