# WGL-03/WGL-04 — saga OAuth durável e compensação recuperável

Data: 2026-07-22

Escopo: commit imutável que contém este manifesto.

Natureza: implementação e testes locais; sem deploy, Google, WhatsApp, AWS,
Oracle, dados reais ou credenciais.

## Objetivo

Tornar a conclusão da conexão Google convergente diante de replay,
concorrência, reinício e cortes entre efeitos remotos e commits locais.

## Controles implementados

- state persistido, único e versionado por geração;
- claim SQLite atômico com lease, limite de tentativas e backoff;
- transições explícitas entre token, conta, planilha, template, conexão e
  lifecycle;
- código OAuth nunca repetido após troca ambígua;
- tokens candidatos cifrados e promovidos atomicamente;
- criação de planilha identificada por `appProperties` da tentativa e
  reconciliação sem segunda criação cega;
- recibo durável para replay HTTP sem repetir efeitos ou WhatsApp;
- intenção de compensação persistida antes da exclusão remota;
- compensação com lease, backoff, retenção limitada e recuperação horária;
- exclusão restrita à planilha criada e marcada pela tentativa;
- planilha preexistente, conectada ou referenciada por membership familiar não
  é apagada;
- writers locais de conexão, metadata e membership são bloqueados enquanto a
  exclusão compensatória está em voo;
- expiração remove material criptográfico e resultados retidos.

## Arquivos de produto centrais

- `src/services/oauthTokenStore.js`
- `src/services/googleOAuthService.js`
- `src/services/userSpreadsheetService.js`
- `src/services/dashboardServer.js`
- `src/jobs/scheduler.js`
- `.env.example`

## Evidência local

- `node --check` nos módulos centrais e teste focal: verde;
- `node --test tests/googleOAuthConnectionSaga.test.js`: `20/20`;
- baterias diretamente afetadas após o último endurecimento: `62/62`;
- `node --test tests/auditGoogleNegativeProof.test.js`: `4/4`;
- `node --test tests/schedulerJobs.test.js`: `20/20`;
- `node scripts/runExhaustiveLocalTestCoverage.js`:
  - `local_only=true`;
  - `external_network_blocked=true`;
  - 94 arquivos de teste;
  - 1.190 testes, 1.185 passes, 0 falhas e 5 skips funcionais previstos;
  - cobertura: 89,41% linhas, 71,7% branches, 89,35% funções.

## Limites da prova

- nenhum serviço remoto foi exercitado;
- os testes não autorizam deploy;
- o veredito independente deve confirmar o hash completo, ler este manifesto e
  os arquivos citados e distinguir compensação de conexão de revogação OAuth
  individual;
- alterações do workstream AWS/Oracle e arquivos não rastreados do usuário não
  pertencem a este candidato.

## Critério de fechamento

`GO` técnico somente se o commit sanitizado contiver exclusivamente o WGL, os
testes locais permanecerem verdes e a auditoria independente não encontrar
violação material das invariantes. Produção permanece decisão separada.
