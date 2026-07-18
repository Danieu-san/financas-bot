# Relatório de domínio — cobertura e configuração

Objeto: tree `363ef7fcbbeb18bbc3eb4810e0d4e9cce48755ae`.

## COV-01 — P2 — bateria padrão omite gates ativos

Existem 104 arquivos `tests/*.test.js`. A execução efetiva de `npm test`,
incluindo `pretest`, referencia 81 arquivos únicos. Os 23 ausentes incluem:

- 16 testes centrais do runtime/lifecycle/backup/report do Open Finance;
- três testes sandbox/webhook/polling com comandos dedicados;
- o contrato read-only Pluggy;
- confirmação de delivery Open Finance;
- política de custo do agente;
- `functional.test.js` e o E2E WhatsApp real.

E2Es reais não devem entrar cegamente na suíte local, mas os testes mockados do
canário e backup podem e devem compor um gate padrão de release ou um comando
único obrigatório. Hoje, “`npm test` verde” não prova o canário ativo.

## OPS-01 — P2 — contrato de ambiente divergente

O inventário reproduzível por acesso direto `process.env.NOME` localizou 72
nomes em `src/` e `index.js`, contra 119 entradas no `.env.example`; 22 nomes
do runtime não aparecem no exemplo. Ao ampliar para código, scripts e testes,
são 153 nomes diretos e 68 ausentes. A lista ampliada mistura variáveis de E2E
e operação, mas a lacuna estritamente de runtime já inclui logs de admin e
dashboard, flag de acesso admin amplo, planner, retry/cache Google, manual do
usuário, unread backfill e timeouts do WhatsApp.

O problema não significa que produção esteja sem essas variáveis. Significa
que o artefato de configuração não é fonte suficiente para reconstruir ou
auditar o deploy com segurança.

## Recomendação futura

- separar `test:release` (todos os testes locais/mockados obrigatórios) de
  `test:e2e` (efeitos externos e aprovação explícita);
- incluir os gates Open Finance ativos no release;
- gerar/validar um schema de ambiente com tipo, default, sensibilidade e dono;
- falhar startup para combinações inválidas, sem imprimir valores secretos;
- testar que `.env.example` e o schema permanecem sincronizados.

A auditoria executará os 22 arquivos omitidos que são locais/seguros e excluirá
explicitamente o E2E WhatsApp real.
