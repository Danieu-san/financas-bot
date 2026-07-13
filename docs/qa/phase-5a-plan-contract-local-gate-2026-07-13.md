# Gate local 5A - Contrato comum de planos

Data: 2026-07-13

## Decisão

`GO local` somente para a primeira fatia da 5A: contrato, adapters e projetor
puro read-only.

`NO-GO` para encerrar a 5A, criar dual-write, mudar comandos, persistir shadow
em produção ou iniciar a 5B. Ainda faltam identidade legada persistente,
armazenamento versionado e dry-run sobre fotografia real sanitizada.

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

## Compatibilidade

- nenhum handler ou comando foi alterado;
- nenhuma aba, linha ou dado real foi escrito;
- nenhuma flag foi criada ou modificada;
- o dashboard e o WhatsApp continuam usando os caminhos anteriores;
- o caminho novo de `debt.pay` permanece intacto e o caminho legado continua
  existente para adaptação posterior na 5C.

## Evidência

- TDD RED: falha por ausência de `projectedPlansContract`.
- Bateria nova: `7/7`.
- Bateria contrato + fluxos legados + ledger: `128/128`.
- Suíte completa com Node 22/ABI SQLite correta: `799/799`.
- `npm audit --audit-level=high`: zero vulnerabilidades.
- `git diff --check`: limpo.
- `package-lock.json`: inalterado; nenhuma dependência adicionada.

Uma tentativa inicial de executar a suíte com `pnpm` deslocou dependências npm
locais e foi interrompida antes da instalação. As pastas foram restauradas sem
colisão; dependências críticas voltaram a resolver. A suíte definitiva usou o
Node 22 do projeto, compatível com o binário local do SQLite.

## Resíduos e próximo gate

- referências baseadas somente em número de linha continuam provisórias;
- não existem ainda tabelas persistentes `plans`/`plan_movements`;
- versionamento histórico ainda é apenas parte do contrato, não armazenamento;
- restore persistente e fotografia real ainda não foram executados.

Próximo passo dentro da 5A: desenhar e testar o armazenamento shadow versionado
e a referência legada persistente, ainda sem alterar comandos ou produção.
