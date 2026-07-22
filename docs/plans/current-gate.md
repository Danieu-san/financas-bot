# Gate ativo — WGL-03/WGL-04

Atualizado em: 2026-07-22

## Objetivo

Tornar a conclusão OAuth Google idempotente, versionada e recuperável diante de
replay, concorrência, restart e falhas entre efeitos externos e commits locais.

Commit de partida do estado atual: `94449eea355f2c0f796a2ec0bd7b3c253e595715`.

## Escopo

- state persistido e uso único;
- claim atômico por tentativa, geração e lease;
- checkpoints de token, conta, planilha, template, conexão e lifecycle;
- reconciliação de criação remota ambígua por marcador;
- promoção atômica de credenciais candidatas;
- resposta HTTP e notificação idempotentes;
- compensação limitada a recurso criado pela tentativa e ainda não adotado;
- retry/backoff/retenção limitados e observabilidade sanitizada;
- testes locais, multiprocesso e auditoria independente.

## Não escopo

Deploy, EC2, serviços Google/WhatsApp reais, membership/permissão familiar,
Open Finance, escrita financeira, flags de produção e remoção ampla de legado.

## Invariantes

1. O mesmo state não troca o code nem cria recursos duas vezes.
2. Somente a geração mais recente pode avançar ou concluir.
3. Lease vencido/substituído não grava resultado tardio.
4. Código OAuth com resultado ambíguo não é reutilizado automaticamente.
5. Planilha com marcador é reconciliada; nunca há segunda criação cega.
6. Tokens candidatos permanecem cifrados e invisíveis até promoção atômica.
7. Conexão saudável anterior não é perdida por falha da nova tentativa.
8. Compensação nunca apaga planilha preexistente ou já referenciada.
9. Falha de compensação possui caminho persistente e limitado de recuperação.
10. Replay após conclusão apenas devolve recibo e não repete notificação.

## Etapas

- [x] caracterização de replay, corrida e cortes;
- [x] persistência de tentativas/generation/lease/checkpoints;
- [x] planilha marcada e reconciliação sem segunda criação;
- [x] promoção atômica, recibo durável e resposta HTTP repetível;
- [x] estabilizar transições estritas e conclusão somente após lifecycle;
- [x] demonstrar recuperação de compensação falha e retenção limitada;
- [x] rodar testes focais e baterias diretamente afetadas;
- [x] executar uma única suíte hermética abrangente e checks estáticos;
- [x] publicar candidato sanitizado e obter auditoria independente.

## Testes obrigatórios

Focal:

```powershell
node --test tests/googleOAuthConnectionSaga.test.js
```

Afetados, em série:

```powershell
node --test --test-concurrency=1 tests/auditOAuthStatusPrecedence.test.js tests/googleOAuthService.test.js tests/userSpreadsheetService.test.js tests/oauthRoutes.test.js tests/schedulerJobs.test.js tests/auditGoogleConnectionIdempotency.test.js tests/auditGoogleConnectionCausality.test.js tests/auditGoogleRevocationRecovery.test.js tests/auditGoogleNegativeProof.test.js tests/userLifecycle.test.js
```

Gate final local: `node scripts/runExhaustiveLocalTestCoverage.js`, uma vez
depois de a bateria afetada ficar estável.

## Critérios de GO

- invariantes acima cobertas por testes causais verdes;
- zero efeito externo repetido em replay/concorrência/restart;
- nenhuma credencial candidata exposta ou retida além do limite;
- compensação recuperável demonstrada e restrita ao recurso da tentativa;
- testes focais, afetados e runner hermético verdes;
- diff sanitizado e sem arquivos alheios;
- auditor independente confirma o hash e não encontra achado material.

## Condições de parada

- necessidade de reduzir/trocar capacidade;
- necessidade de ampliar escopo ou mudar roadmap;
- acesso a produção, cofre, EC2, Google ou WhatsApp real;
- segredo/dado pessoal necessário à prova;
- conflito com alterações preexistentes do usuário;
- auditoria automática bloqueada por segurança.

## Estado e próxima ação

Gate encerrado com `GO TÉCNICO LOCAL` no commit imutável
`867be43265ed363a8bf235a87a77787d013a5abb`. A revisão independente confirmou o
pai, leu os sete artefatos exigidos e não encontrou achado CRITICAL, HIGH ou
MEDIUM nem lacuna indispensável. WGL-03 e WGL-04 estão tecnicamente concluídos;
o relatório está em
`docs/audit/14-wgl03-wgl04-independent-close-2026-07-22.md`. Deploy, produção e
serviços reais continuam fora do escopo. A próxima fatia já ordenada é
`AUTH-03/WGL-07`, remoção de membership/permissão Drive familiar.
