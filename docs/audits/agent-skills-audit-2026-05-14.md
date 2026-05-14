# Auditoria Agent Skills - 2026-05-14

## Objective
Verificar se o FinancasBot esta funcionando corretamente, encontrar bugs e propor melhorias de logica com foco em uso multiusuario, seguranca, custo de IA, operacao em producao e capacidade de lancamento.

Usuario-alvo: Daniel como operador/admin e usuarios finais que registram dados financeiros pelo WhatsApp.

Sucesso significa:
- Fluxos criticos passam em testes automatizados.
- Nenhum fluxo novo aceita ou mistura dados sem `user_id`.
- Dependencias nao possuem vulnerabilidades conhecidas altas ou criticas.
- O caminho de deploy tem comandos e rollback claros.

## Skill Sequence
1. idea-refine
2. using-agent-skills
3. spec-driven-development
4. planning-and-task-breakdown
5. incremental-implementation
6. test-driven-development
7. code-review-and-quality
8. security-and-hardening
9. shipping-and-launch

## Assumptions
- Sheets segue sendo fonte da verdade no curto prazo.
- SQLite/read-model segue sendo camada de consulta e dashboard.
- WhatsApp real deve ser validado manualmente apos deploy, mas testes locais podem simular mensagens.
- Dados financeiros reais podem ser limpos durante esta fase porque o projeto esta recomecando do zero.

## Commands
- Syntax check: `node --check <arquivo>`
- Unit/default tests: `npm test`
- Functional smoke with real Sheets: `npm run test:functional`
- Reset spreadsheet: `npm run reset:spreadsheet`
- Security audit: `npm audit --audit-level=high`
- Production restart: `pm2 restart financas-bot --update-env`
- Logs: `pm2 logs financas-bot --lines 120 --nostream`
- Health: `curl http://localhost:8787/dashboard/health`

## Project Structure
- `src/handlers/` - fluxos de WhatsApp e estados de conversa.
- `src/services/` - Google APIs, read-model, dashboard, usuarios.
- `src/jobs/` - cron jobs.
- `tests/unit.test.js` - testes unitarios pequenos.
- `tests/functional.test.js` - smoke funcional com Sheets real e IA mockada.
- `docs/audits/` - relatorios e decisoes desta auditoria.

## Testing Strategy
- Unitarios para isolamento multiusuario e funcoes puras.
- Funcional opt-in para fluxos criticos com Google Sheets real.
- Teste manual no WhatsApp apos deploy para cobrir Puppeteer/whatsapp-web.js.
- `npm audit` como gate de seguranca antes de lancamento.

## Boundaries
- Always: manter `user_id` obrigatorio em dados financeiros; rodar testes antes de deploy; resetar a planilha apos testes destrutivos.
- Ask first: deploy em EC2, mudanca de schema maior, troca de banco, novos servicos pagos.
- Never: commitar `.env`, tokens, `.pem`, dados locais de runtime ou logs sensiveis.

## Implementation Plan

### Task 1: Formalizar comandos de teste
Acceptance:
- `npm test` roda a suite padrao sem travar.
- `npm run test:functional` roda o smoke real com `RUN_FUNCTIONAL_TESTS=true`.
Verify:
- `npm test`
- `npm run test:functional`

### Task 2: Revalidar seguranca
Acceptance:
- `npm audit --audit-level=high` sem vulnerabilidades.
- Nenhum segredo novo em diff versionado.
Verify:
- `npm audit --audit-level=high`
- `git diff --cached` antes de commit.

### Task 3: Revisar isolamento multiusuario
Acceptance:
- Consultas, exclusoes, dividas e crons financeiros filtram por `user_id`.
- Testes unitarios cobrem helpers de filtragem.
Verify:
- `npm test`
- `npm run test:functional`

### Task 4: Preparar lancamento
Acceptance:
- Checklist de deploy, smoke e rollback documentado no resumo final.
- Planilha resetada apos testes.
Verify:
- `npm run reset:spreadsheet`
- `git status --short`

## Not Doing
- Nao trocar Sheets por Postgres agora; SQLite read-model ja reduz custo/latencia.
- Nao criar novos recursos financeiros antes de estabilizar multiusuario.
- Nao automatizar deploy sem confirmacao humana.
- Nao testar WhatsApp real via automacao local sem ferramenta confiavel de controle do WhatsApp Web.

## Open Questions
- Deploy imediato: executado em 2026-05-14 apos testes locais e commit.
- Dominio HTTPS antes de aumentar usuarios: pendencia futura recomendada antes de escala real.
- Politica formal de retencao de dados financeiros: pendencia futura recomendada antes de escala real.

## Execution Results

### Bugs and improvements found by the first audit pass
- Fallback analitico lia ranges antigos sem `user_id`; corrigido para filtrar linhas por usuario.
- Registro de pagamento de divida podia localizar dividas de outro usuario; corrigido com filtro por `user_id`.
- Exclusao de itens podia operar sobre linhas de outro usuario; corrigido com filtro por `user_id`.
- Resumo matinal podia enviar dividas agregadas de todos para todos; corrigido para montar mensagem por usuario.
- `UserService` fazia leituras repetidas de Sheets em caminhos quentes; mitigado com cache curto de 30s.
- Teste funcional precisava tolerar consistencia eventual do Google Sheets; ajustado retry.

### Additional issues found by the ordered skill sequence
- Faltavam scripts padrao de teste no `package.json`; adicionados `npm test`, `npm run test:unit` e `npm run test:functional`.
- `npm audit --audit-level=high` encontrava vulnerabilidades altas em dependencias transitivas; `npm audit fix` atualizou 9 pacotes e zerou vulnerabilidades conhecidas.
- O dashboard usa `innerHTML`, mas os campos de texto atuais passam por `esc()`. Resultado: monitorar como risco, sem bug aberto na implementacao atual.

### Verification run
- `node --check scripts/runFunctionalTest.js` passou.
- `npm audit --audit-level=high` passou com 0 vulnerabilidades.
- `npm test` passou.
- `npm run test:functional` passou com Google Sheets real e IA mockada.
- `npm run reset:spreadsheet` passou apos o funcional.

### Shipping run
- Commit local criado: `9fb1a02 Harden multi-user flows and formalize bot audit`.
- Push para `origin/main` concluido.
- EC2 atualizado com `git pull origin main`.
- `npm install` executado no EC2; auditoria retornou 0 vulnerabilidades.
- PM2 reiniciado com `pm2 restart financas-bot --update-env`.
- Health do dashboard respondeu `{"ok":true,"sqlite":true}`.
- PM2 mostrou `financas-bot` online.
- Pendencia manual: WhatsApp Web precisa ser reautenticado por QR Code no servidor. O bot ainda nao deve ser considerado totalmente operacional ate o QR ser escaneado e o log mostrar `Bot pronto para receber mensagens!`.

### Post-deploy smoke checklist
- [x] Codigo em GitHub.
- [x] Dependencias atualizadas no EC2.
- [x] PM2 online.
- [x] Dashboard health OK.
- [x] SQLite/read-model disponivel.
- [ ] WhatsApp autenticado e pronto.
- [ ] Smoke manual no WhatsApp: `Oi`, `dashboard`, `admin stats`, registrar um gasto pequeno e consultar resumo.

### Rollback plan
Se o smoke manual falhar apos autenticar WhatsApp:
1. No EC2: `cd /home/ubuntu/financas-bot`.
2. Reverter para commit anterior conhecido: `git reset --hard ce2e567`.
3. Restaurar dependencias: `npm install`.
4. Reiniciar: `pm2 restart financas-bot --update-env`.
5. Verificar: `curl http://localhost:8787/dashboard/health` e `pm2 logs financas-bot --lines 120 --nostream`.

## Method Comparison

### Initial proposal
Mais eficiente para encontrar bugs de logica rapidamente. Ela foi direta ao codigo e aos testes, encontrou os vazamentos multiusuario mais graves e produziu correcoes de alto impacto em menos etapas.

### Ordered developer sequence
Mais eficiente para completude operacional. Ela encontrou lacunas que a primeira passada nao priorizou: scripts oficiais de teste, gate de seguranca com `npm audit`, documento de especificacao/auditoria e checklist de lancamento.

### Verdict
O melhor caminho e hibrido:
- Use a abordagem direta para debugging e bugs criticos.
- Use a sequencia completa antes de merge/deploy, porque ela captura governanca, seguranca, documentacao e lancamento.
