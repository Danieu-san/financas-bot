# Gate local 5A - Contrato comum de planos

Data: 2026-07-13

## Decisão

`GO para encerramento da 5A`: contrato, armazenamento shadow, identidade
persistente e dry-run real sanitizado foram aprovados.

`NO-GO` permanece para dual-write, mudança dos comandos atuais ou escrita de
fatos financeiros no shadow. A 5B pode iniciar conforme o roadmap.

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
- a EC2 contém apenas um registro técnico de identidade, sem nome, usuário ou
  valor financeiro; fatos/projeções financeiras não foram persistidos;
- nenhuma escrita foi feita nas planilhas Google e o runtime não importa o
  módulo novo.

## Evidência

- TDD RED: falha por ausência de `projectedPlansContract`.
- Baterias 5A combinadas: `23/23`.
- Bateria contrato + fluxos legados + ledger: `128/128`.
- Suíte completa com Node 22/ABI SQLite correta: `815/815`.
- `npm audit --audit-level=high`: zero vulnerabilidades.
- `git diff --check`: limpo.
- `package-lock.json`: inalterado; nenhuma dependência adicionada.

Uma tentativa inicial de executar a suíte com `pnpm` deslocou dependências npm
locais e foi interrompida antes da instalação. As pastas foram restauradas sem
colisão; dependências críticas voltaram a resolver. A suíte definitiva usou o
Node 22 do projeto, compatível com o binário local do SQLite.

## Resíduos e próximo gate

- gate real no escopo próprio do único admin: 1 meta, 0 dívidas e 0 movimentos;
- paridade `GO`, zero divergências, privacidade aprovada e zero escrita Google;
- bootstrap criou 1 vínculo; replay seguinte criou 0 e permaneceu `GO`;
- dívida com formato atual foi coberta por teste sanitizado, pois não havia
  dívida real no escopo autorizado;
- mover a linha vinculada exige rebind explícito e falha fechado;
- persistência de fatos financeiros e dual-write continuam proibidos até 5C.

EC2 validada em `2f88a83`, PM2 online e health
`{"ok":true,"sqlite":true}`. Próximo passo: iniciar 5B.
