# Gate 43 - preflight de dependencia OCI

Data: 2026-08-15

## Resultado do audit

`npm audit --omit=dev --audit-level=high` reportou cinco ocorrencias altas na
mesma cadeia transitiva:

`whatsapp-web.js -> puppeteer -> @puppeteer/browsers -> extract-zip`.

O advisory e `GHSA-jmr9-qjv8-65gv` / `CVE-2026-56876`, publicado em
2026-06-26 e atualizado em 2026-08-12. A versao `extract-zip <= 2.0.1` e
afetada e nao existe versao corrigida publicada.

## Classificacao para esta release

`DIVIDA ALTA PREEXISTENTE; NAO BLOQUEANTE PARA O GATE 43`.

Evidencia:

- `package.json` e `package-lock.json` nao mudaram entre o release OCI ativo
  `579afb2abffb47f470b19a827a5c3a8c441add82` e o hash auditado
  `72e526fac3dde1d00907d4e03725472ea8c67c60`;
- o produto e os scripts nao importam nem chamam `extract-zip` diretamente;
- o instalador OCI executa `npm ci` com `PUPPETEER_SKIP_DOWNLOAD=true`, portanto
  nao baixa nem extrai Chromium durante a preparacao do slot;
- o deploy recebe somente o artefato TAR.GZ gerado localmente, validado por
  checksum e pelo verificador proprio; nenhum ZIP externo e aceito;
- nao existe correcao upstream disponivel que possa ser aplicada sem substituir
  a cadeia principal de WhatsApp/Puppeteer.

A excecao nao reduz a severidade do advisory. Ela somente conclui que o caminho
vulneravel nao e exercitado na instalacao nem no runtime desta release e que o
Gate 43 nao introduz regressao de dependencia.

## Controle residual

Registrar como trabalho separado a atualizacao/substituicao da cadeia
`whatsapp-web.js`/Puppeteer quando houver versao compativel que retire
`extract-zip` vulneravel. Ate la, manter bloqueados downloads/extracoes de ZIP
externo e continuar usando o release OCI por artefato verificado.
