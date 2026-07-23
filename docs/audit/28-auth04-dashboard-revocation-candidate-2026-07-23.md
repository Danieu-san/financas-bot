# AUTH-04 — candidato à auditoria independente

Data: 2026-07-23

Estado: `CANDIDATO LOCAL VERDE; AUDITORIA INDEPENDENTE PENDENTE`.

## Escopo

Revogar imediatamente o acesso financeiro do dashboard quando o cadastro
associado a um token ainda válido deixa de estar ativo.

O candidato:

- preserva a validação criptográfica e temporal do token;
- consulta o cadastro fresco a cada requisição autenticada;
- nega usuário ausente, excluído ou com status diferente de `ACTIVE` antes de
  qualquer leitura financeira;
- falha fechado com resposta `503` distinta quando a fonte de status está
  indisponível;
- aplica a mesma decisão às APIs v1, v2 e wrappers autenticados;
- registra eventos sanitizados sem token, identificador cru ou erro privado.

## Arquivos do gate

- `src/services/dashboardServer.js`;
- `tests/dashboardApiContracts.test.js`;
- `docs/agent-memory/current.md`;
- `docs/plans/current-gate.md`;
- este pacote.

## Evidência executada

- RED causal anterior: `200 !== 403` após mudar o usuário de `ACTIVE` para
  `BLOCKED` com o mesmo token;
- testes causais `AUTH-04`: `3/3`;
- contratos de API e segurança do dashboard: `24/24`;
- rotas OAuth adjacentes: `7/7`;
- auditoria sanitizada do dashboard: `1/1`;
- seis pretests do `npm test`: verdes;
- runner principal: `1080/1080`;
- sintaxe dos arquivos alterados e `git diff --check`: verdes.

Uma execução ampla anterior apresentou `43` falhas ambientais de resolução ESM
na worktree isolada. A causa foi reproduzida em um caso representativo:
`@langchain/langgraph` não era localizado porque imports ESM ignoram
`NODE_PATH`. Uma junction local para o `node_modules` existente corrigiu o
ambiente sem instalar ou modificar dependências. O caso representativo passou e
o runner principal completo convergiu para `1080/1080`.

## Limites

- nenhuma produção, Oracle, AWS, Google, WhatsApp ou dado real foi acessado;
- nenhum deploy ou alteração de flag foi realizado;
- `STATE-04`, logout de navegador, blacklist de tokens, membership familiar e
  autorização administrativa permanecem fora do escopo;
- o parecer externo deve ser rotulado como revisão estática e não como execução
  dos testes.

## Pergunta de auditoria

Confirmar se o commit imutável:

1. fecha todas as rotas financeiras antes de qualquer leitura;
2. mantém distinção segura entre token inválido, acesso revogado e fonte de
   status indisponível;
3. evita cache, fallback permissivo e vazamento de dados;
4. possui cobertura causal suficiente sem enfraquecer as asserções;
5. pode receber `GO TÉCNICO LOCAL` dentro de `AUTH-04`, sem autorizar deploy.
