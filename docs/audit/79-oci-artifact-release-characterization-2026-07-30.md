# OPS-03 — caracterização do release OCI por artefato

Atualizado em: 2026-07-30

Base:
`508324403417a319cfe609eb43019b5fe682eeec`.

## Veredito

`LACUNA OPERACIONAL CONFIRMADA`.

A produção vigente foi migrada para Oracle/OCI por artefato, mas o repositório
ainda não contém um procedimento permanente compatível:

1. `docs/runbooks/release-checklist.md` ainda prescreve EC2, `git pull` e
   `git revert`;
2. `docs/agent-memory/workstreams/aws-oracle-migration.md` e seu plano ainda
   registram a migração como não iniciada;
3. não existe builder/verificador de artefato nem ensaio local do layout de
   instalação;
4. o diretório de produção não possui contrato aprovado de checkout Git;
5. estado, sessão WhatsApp, credenciais, stores e cache não podem ser
   substituídos por um pacote de código.

## Desenho a provar

- o artefato nasce de um commit Git completo e imutável;
- arquivos de estado/segredos são proibidos no pacote;
- checksum externo e manifesto interno são verificados antes da instalação;
- cada release ocupa `/home/ubuntu/financas-bot/releases/<hash>`;
- a raiz `/home/ubuntu/financas-bot` continua sendo o `cwd` e conserva todo o
  estado;
- dependências são instaladas no slot novo sem alterar `node_modules` ativo;
- a promoção aponta o PM2 para o novo `index.js` somente depois do preflight;
- o script anterior é capturado antes da troca e permanece disponível para
  rollback;
- Oracle e AWS nunca executam simultaneamente a mesma sessão WhatsApp.

## Não escopo

- SSH, upload, deploy, restart ou mudança de produção;
- alteração de flags ou segredos;
- remoção da AWS ou de releases antigos;
- execução de integração real.

## Critério de fechamento

O gate exige testes locais do builder/verificador/instalador em diretórios
temporários, teste adversarial de adulteração e path traversal, runbook OCI
coerente, commit sanitizado e auditoria independente por hash imutável.
