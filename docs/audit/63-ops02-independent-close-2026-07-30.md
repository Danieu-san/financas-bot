# OPS-02 — fechamento independente de liveness e recuperação do WhatsApp

Atualizado em: 2026-07-30

Commit de recuperação auditado:
`ccd4d2e2bb8689d4f838cab21f92ffc6b8b5b6ff`.

Primeiro candidato:
`4647ea775f801dcd277d0282a8cc424a43d3f4f3`.

Manifestos:

- `docs/audit/61-ops02-whatsapp-liveness-recovery-candidate-2026-07-30.md`;
- `docs/audit/62-ops02-post-audit-recovery-candidate-2026-07-30.md`.

## Estado

`GO TÉCNICO LOCAL`.

## Sequência probatória

O primeiro candidato recebeu `NO-GO` independente com `HIGH 1`, `MEDIUM 2` e
`LOW 1`:

1. a falha do handler era absorvida, de modo que o retry descrito para o
   backfill não existia na fronteira pública;
2. faltava provar que o sucesso tardio de um probe não desfazia uma decisão de
   recovery;
3. faltava provar que causas concorrentes atravessavam uma única saída do
   supervisor;
4. faltava o negativo do ready rescue para erro diferente do binding aceito.

O commit de recuperação:

- limita retry à descoberta anterior a qualquer handler;
- executa o handler público serializado por remetente em regime at-most-once;
- propaga falha ambígua por código sanitizado e interrompe o lote sem replay;
- mantém o listener ao vivo contendo rejeições;
- impede sucesso tardio de restaurar saúde depois de `recoveryRequested`;
- centraliza liveness e `disconnected` numa guarda síncrona idempotente;
- absorve no rescue somente o erro permitido de binding já existente.

## Veredito independente

O Chat confirmou o hash completo e a leitura integral dos 14 arquivos
solicitados. A revisão foi estática, independente e somente leitura; o auditor
não executou o repositório e tratou as contagens locais apenas como evidência
relatada.

O parecer concluiu:

- `GO TÉCNICO LOCAL`;
- o `HIGH` foi encerrado pela nova fronteira de retry, propagação sanitizada e
  ausência de replay;
- os dois `MEDIUM` foram encerrados pelas provas de sucesso tardio e de saída
  idempotente composta;
- o `LOW` foi encerrado pelo negativo do rescue;
- achados residuais: `HIGH 0`, `MEDIUM 0`, `LOW 0`;
- nenhuma lacuna indispensável residual dentro do gate de processo único e da
  deduplicação temporal existente.

## Evidência executada pelo Codex

Antes da publicação do commit auditado:

- bateria focal pós-auditoria: `142/142`;
- runner hermético após as mudanças de produto: `1.325/1.330`, zero falhas e
  cinco skips funcionais previstos;
- cobertura: linhas `90,39%`, branches `72,31%`, funções `89,81%`;
- contrato de ambiente: 188 nomes referenciados, 201 documentados, sem ausência,
  duplicidade ou acesso dinâmico não aprovado;
- sintaxe, workflow portátil, `git diff --check` e varredura dirigida de
  segredos: verdes.

A última adição depois do runner exaustivo foi somente a prova composicional já
executada na bateria focal; nenhum código de produto mudou depois dela.

## Alcance

O fechamento autoriza somente encerrar tecnicamente o gate local OPS-02. Ele
não autoriza:

- deploy ou restart na Oracle/OCI;
- QR ou alteração da sessão WhatsApp real;
- produção, Google ou escrita financeira;
- encerramento do gate separado de deploy OCI por artefato;
- abertura de writer financeiro sem os controles próprios de 9P.4.

## Próximo estado

OPS-02 está encerrado localmente. O próximo elo de produto é 9P.4:
revalidação final da proposta revisada contra a fonte autorizada, confirmação
idempotente, operation key e recibo, preservando escrita financeira desligada
até o gate autorizar explicitamente outra coisa.
