# Gate local 5A - Contrato comum de planos

Data: 2026-07-13

## Decisão

`GO local` para as duas primeiras fatias da 5A: contrato/adapters read-only e
armazenamento shadow versionado, ainda isolado e desativado por padrão.

`NO-GO` para encerrar a 5A, criar dual-write, mudar comandos, persistir shadow
em produção ou iniciar a 5B. Ainda faltam dry-run sobre fotografia real
sanitizada e prova de equivalência das views legadas.

## Entregas

- `projected-plan-v1` e `projected-plan-movement-v1`;
- adapters para linhas atuais de `Metas`, `Dívidas` e
  `Movimentações Metas`;
- tipos meta, dívida, financiamento e consórcio;
- valores monetários exclusivamente em centavos inteiros;
- identidade derivada de referência legada, com fallback de linha marcado
  `provisional`;
- vínculo de movimento por meta/proprietário com falha explícita em ambiguidade;
- proibição de movimento projetado/simulado no histórico realizado;
- visão pública sem usuário, domicílio, referência legada ou chave de operação;
- backup/restore portátil com checksum e detecção de adulteração.
- SQLite shadow com escrita desativada por padrão e sem import em runtime;
- identidade persistente e rebind explícito que preserva `plan_id` após mover
  linha e renomear;
- versões imutáveis, conflito otimista, idempotência por movimento/operação e
  sobrevivência a reinício;
- rollback transacional diante de falha parcial;
- correção por estorno compensatório único e append-only;
- backup/restore persistente de snapshot, identidades, versões e movimentos;
- readiness falha fechado para identidade provisória, plano órfão ou issue.

## Compatibilidade

- nenhum handler ou comando foi alterado;
- nenhuma aba, linha ou dado real foi escrito;
- nenhuma flag foi criada ou modificada;
- o dashboard e o WhatsApp continuam usando os caminhos anteriores;
- o caminho novo de `debt.pay` permanece intacto e o caminho legado continua
  existente para adaptação posterior na 5C.
- o banco shadow existe apenas nos testes locais; nenhum arquivo foi criado ou
  habilitado na EC2.

## Evidência

- TDD RED: falha por ausência de `projectedPlansContract`.
- Baterias 5A combinadas: `16/16`.
- Bateria contrato + fluxos legados + ledger: `128/128`.
- Suíte completa com Node 22/ABI SQLite correta: `808/808`.
- `npm audit --audit-level=high`: zero vulnerabilidades.
- `git diff --check`: limpo.
- `package-lock.json`: inalterado; nenhuma dependência adicionada.

Uma tentativa inicial de executar a suíte com `pnpm` deslocou dependências npm
locais e foi interrompida antes da instalação. As pastas foram restauradas sem
colisão; dependências críticas voltaram a resolver. A suíte definitiva usou o
Node 22 do projeto, compatível com o binário local do SQLite.

## Resíduos e próximo gate

- referências baseadas somente em número de linha continuam provisórias e
  bloqueiam readiness até rebind explícito;
- fotografia real sanitizada e paridade das views legadas ainda não foram
  executadas;
- persistência shadow em produção e dual-write continuam proibidos.

Próximo passo dentro da 5A: executar dry-run read-only sanitizado e provar
equivalência das views, ainda sem alterar comandos ou produção.
