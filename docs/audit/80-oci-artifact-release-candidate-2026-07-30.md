# OPS-03 — candidato de release OCI por artefato

Atualizado em: 2026-07-30

Base:
`508324403417a319cfe609eb43019b5fe682eeec`.

## Veredito local

`CANDIDATO LOCAL VERDE; AUDITORIA INDEPENDENTE PENDENTE`.

## Contrato implementado

`scripts/release/ociArtifactRelease.js` fornece cinco comandos separados:

1. `build`: arquiva somente o commit completo informado;
2. `verify`: confere checksum externo, caminhos e manifesto interno;
3. `prepare`: instala dependências e preflight em um slot novo, sem reiniciar;
4. `plan`: mostra destino e rollback sem alterar processo;
5. `promote`: exige confirmação literal, processo PM2 único, troca sem
   sobreposição, health com janela limitada e rollback automático.

O builder publica também uma cópia imutável do instalador e seu checksum. Isso
permite verificar o código que fará a instalação antes de executá-lo no host
sem checkout Git.

## Preservação de estado

O pacote rejeita `.env`, credenciais, tokens, `.wwebjs_auth`, `.wwebjs_cache`,
`data`, `private`, stores, logs, backups e `node_modules`. A preparação escreve
somente em `/home/ubuntu/financas-bot/releases/<hash>`, usa a raiz estável como
`cwd`, não lê a sessão WhatsApp e não toca no slot ativo.

`npm ci` usa `PUPPETEER_SKIP_DOWNLOAD=true`, preservando o cache ativo. Antes
da promoção, o slot carrega `better-sqlite3` e abre/fecha um Chrome headless
isolado com o cache já vigente. Falha de dependência nativa ou browser bloqueia
a promoção.

## Promoção e rollback

O promotor:

- valida novamente todos os arquivos-fonte do slot preparado;
- lê `pm2 jlist` sem expor seu ambiente;
- exige exatamente um `financas-bot` online, com script e `cwd` dentro da raiz
  OCI;
- captura script, `cwd` e `APP_COMMIT_SHA` anteriores;
- remove o processo anterior antes de iniciar o novo;
- espera health local por janela limitada;
- executa `pm2 save` somente depois do health;
- em falha, remove o candidato, restaura script/hash capturados, exige health
  verde do rollback e só então salva o PM2.

O tooling não contém host, chave, token, segredo nem caminho AWS. O runbook
exige confirmação externa de que a AWS continua parada antes da promoção.

## Evidência executada pelo Codex

- RED inicial: módulo ausente e suíte bloqueada;
- GREEN focal sequencial: `11/11`;
- o builder real foi exercitado contra um repositório Git temporário;
- adulteração, arquivo extra, traversal, estado e segredo falham fechado; o
  verificador também rejeita symlink por contrato;
- preparação bem-sucedida e falha preservam uma raiz sintética com sessão,
  credenciais, stores e `node_modules` ativos;
- promoção, espera de startup e rollback foram exercitados com PM2/health
  controlados;
- sintaxe, `git diff --check` e workflow portátil: verdes.

O preflight real de Chrome depende do cache Linux vigente e será executado
somente na preparação OCI autorizada; o teste local usa dependências injetadas
e não lê sessão WhatsApp.

## Limites

- nenhum SSH, upload, PM2, Caddy, WhatsApp ou health de produção foi acessado;
- nenhum artefato foi instalado na OCI;
- nenhuma flag, segredo ou estado real foi alterado;
- o candidato não autoriza deploy ou restart.

## Perguntas para auditoria

1. Hash, manifesto e checksum sustentam imutabilidade e integridade?
2. O denylist e a verificação impedem empacotar ou sobrescrever estado?
3. Preparação e promoção estão causalmente separadas?
4. A troca impede dois processos simultâneos e captura rollback antes de parar?
5. Falha de start/health restaura deterministicamente o script anterior?
6. Testes e runbooks deixam lacuna indispensável dentro do gate local?
