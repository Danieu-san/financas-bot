# ARQ-06 — fechamento de produção com canário desligado

Data: 2026-08-23

## Veredito

`GO DE PRODUÇÃO — RELEASE INSTALADO COM CANÁRIO OFF`.

Este fechamento não ativa o reasoner externo e não autoriza writer nem retirada
do pipeline legado.

## Release

- código e fechamento técnico: `ccafb858c44a4303a108f9dce83a8221160fe7b9`;
- código reauditado em GO: `889d6b97b1ec061a261baa074702ca41702b84cf`;
- SHA-256 do artefato:
  `aee853f611c47893ea98bad14bfe04a67601354dce9cc2b327a1511a7e4c38b9`;
- release anterior preservado para rollback:
  `982c2463ec0ac1c42fbbc4007b9708e8e75ee0e7`.

## Acesso e instalação

- produção confirmada como Oracle OCI, host `163.176.147.94`, usuário
  `ubuntu`, raiz `/home/ubuntu/financas-bot` e PM2 `financas-bot`;
- acesso SSH restabelecido pela chave permanente indicada no manifesto privado
  de recuperação e localizada no cofre montado; nenhuma chave foi versionada;
- referência portátil vigente da chave, sem conteúdo secreto:
  `E:\Users\horus\Documents\FinancasBot\private-recovery\financas_bot_oci_permanent_20260728`;
- configuração SSH portátil correspondente:
  `E:\Users\horus\Documents\FinancasBot\private-recovery\financasbot_prod_ssh_config`;
- pacote e instalador conferidos no servidor antes do prepare;
- manifesto remoto: `verified=true`, hash completo confirmado e `1.027`
  arquivos;
- preparação isolada concluiu dependências, SQLite e Chrome sem tocar no
  processo ativo;
- plano confirmou provider `oracle_oci`, processo único, estado protegido
  inalterado e rollback para o release anterior;
- promoção concluída sem rollback e sem bootstrap de estado.

## Evidência pós-deploy

- script PM2:
  `/home/ubuntu/financas-bot/releases/ccafb858c44a4303a108f9dce83a8221160fe7b9/index.js`;
- `cwd=/home/ubuntu/financas-bot`;
- `APP_COMMIT_SHA=ccafb858c44a4303a108f9dce83a8221160fe7b9`;
- um processo PM2 online, zero reinícios e cinco minutos de estabilidade na
  segunda aferição;
- health local e público: SQLite verde, WhatsApp `ready/healthy`;
- `pm2-ubuntu.service` e `caddy.service` ativos e habilitados;
- read-model, Google Sheets e agendador iniciaram;
- `FINANCIAL_ITERATIVE_CANARY_MODE=off` e allowlists vazias;
- `OPENROUTER_API_KEY` foi posteriormente gravada no `.env` da raiz estável,
  com modo `0600` e backup também `0600`; o valor não foi exibido, documentado
  nem versionado;
- a credencial foi validada por chamada de metadados sem pergunta ou evidência
  financeira: HTTP `200` e autenticação aceita;
- o processo não foi reiniciado nem o canário ativado depois dessa gravação.

O ready service registrou uma tentativa de backfill de não lidas esgotada após
o start, mas o processo permaneceu online, sem restart, e o liveness retornou
`healthy`. A ocorrência não promoveu o canário nem realizou escrita.

## Dependência transitiva

O advisory `GHSA-jmr9-qjv8-65gv`, sem patch disponível, permanece registrado.
O prepare forçou `PUPPETEER_SKIP_DOWNLOAD=true`, reutilizou o navegador
instalado e passou no teste isolado de Chrome; portanto o caminho de extração
do pacote vulnerável não foi executado neste release. O risco continua
acompanhado e não foi ocultado como auditoria npm verde.

## Próximo gate

A ativação read-only foi mantida separada deste fechamento. A chave OpenRouter
que Daniel decidiu manter até o fim dos testes foi gravada no `.env` privado da
OCI e validada sem dados financeiros. Como o canário envia ao provedor externo
a pergunta e evidência financeira sanitizada necessária ao raciocínio, a
ativação exigiu consentimento específico e informado para esse tratamento.
Daniel o forneceu posteriormente; a execução resultante está registrada no
documento 317. A sequência autorizada foi:

1. ativar um único domínio/fonte do casal pela allowlist server-side;
2. reiniciar uma vez para carregar a chave e aplicar a allowlist por `SIGHUP`;
3. executar smoke real e monitorar a janela finita pela telemetria sanitizada;
4. manter ou reverter o canário conforme os critérios do runbook;
5. rotacionar a chave ao final dos testes, como decidido por Daniel.
