# 9P.3 — fechamento independente da revisão guiada da proposta

Atualizado em: 2026-07-30

Commit de recuperação auditado:
`f8a1e9f41eee3c904f0de69ae465219ef874212d`.

Parent direto:
`c452b9b999a6caf6af62696b5c8927ec5970c1f2`.

Manifestos:

- `docs/audit/57-open-finance-save-proposal-guided-review-candidate-2026-07-24.md`;
- `docs/audit/58-open-finance-save-proposal-guided-review-reaudit-candidate-2026-07-24.md`.

## Estado

`GO TÉCNICO LOCAL`.

## Sequência probatória

O primeiro candidato, no commit
`c452b9b999a6caf6af62696b5c8927ec5970c1f2`, recebeu `NO-GO` independente
com `CRITICAL 0`, `HIGH 0`, `MEDIUM 3` e `LOW 0`:

1. revisão `prepared` podia permanecer órfã depois de falha anterior à
   aceitação seguida de recusa ou cancelamento;
2. categorias e contas legadas sem `user_id` explícito ainda podiam integrar o
   catálogo, e a fronteira familiar dos cartões precisava ficar inequívoca;
3. faltava a prova causal exata de queda depois de persistir `accepted` e antes
   de ativar a revisão, com restart e retomada pela entrada de produto.

O commit de recuperação:

- terminaliza ou reconcilia a revisão `prepared` depois de decisão terminal;
- exige `userId`, `requireUserScoped=true` e linha autorizada nas cinco fontes
  do catálogo;
- mantém cartões compartilhados somente dentro da planilha familiar
  autorizada, sem transformar titularidade em autorização;
- prova `prepared` + `accepted`, falha em `activateReview`, fechamento e
  reabertura dos stores e retomada pela entrada pública até `editing`;
- mantém `financial_writes=0` em todos esses caminhos.

## Veredito independente

Daniel forneceu integralmente o parecer final da revisão manual no Chat. O
auditor confirmou o hash completo e a leitura integral dos dois manifestos,
dos módulos de handler, conversa, catálogo, stores e fronteiras Google/OAuth,
além das três suítes causais solicitadas.

O parecer concluiu:

- M1 encerrado no caminho nominal e na reconciliação posterior à queda;
- M2 encerrado por negação sem escopo, leituras user-scoped e fronteira
  familiar explícita;
- M3 encerrado pela falha injetada somente em `activateReview`, restart real dos
  stores e retomada pela função de produto;
- entrada pública preserva o fluxo normal de `sim` quando não existe revisão;
- `CRITICAL 0`, `HIGH 0`, `MEDIUM 0`, `LOW 0`;
- nenhuma lacuna indispensável residual dentro do contrato local de 9P.3;
- `9P.3: GO TÉCNICO LOCAL`.

O auditor fez revisão independente, estática e somente leitura. Ele não
executou os testes e tratou as contagens locais como evidência relatada.

## Evidência executada pelo Codex

Antes da publicação do candidato de recuperação:

- RED das novas provas: `17/19`, com falhas esperadas de M1 e M2;
- GREEN focal: `20/20`;
- bateria causal: `150/150`;
- toda a bateria Open Finance: `259/259`;
- máquina de estados e entrada pública: `122/122`;
- runner hermético: `1.305/1.310`, zero falhas e cinco skips funcionais
  previstos;
- cobertura: linhas `90,18%`, branches `72,27%`, funções `90,03%`;
- sintaxe, workflow portátil e `git diff --check`: verdes.

Não houve mudança em produto ou testes do 9P.3 entre o commit auditado e este
fechamento. Por isso, as suítes verdes não foram repetidas sem causa nova.

## Alcance

O fechamento autoriza somente encerrar tecnicamente o gate local 9P.3. Ele não
autoriza:

- 9P.4 ou qualquer writer financeiro;
- revalidação final, operation key, recibo ou persistência;
- alteração de `OPEN_FINANCE_WRITE_MODE=off`;
- promoção do modo proativo, que continua desligado por padrão;
- deploy, produção, Pluggy, Google ou WhatsApp reais.

## Próximo estado

9P.3 está encerrado. O incidente operacional de 2026-07-30 revelou que a
sessão WhatsApp/Puppeteer pode perder liveness e acumular
`Runtime.callFunctionOn timed out` enquanto PM2 e `/dashboard/health` continuam
verdes. Essa correção de confiabilidade deve ser delimitada e fechada antes de
abrir 9P.4.

Depois dela, o próximo elo de produto continua sendo revalidar a proposta
revisada contra a fonte autorizada e exigir confirmação final idempotente antes
de qualquer escrita.
