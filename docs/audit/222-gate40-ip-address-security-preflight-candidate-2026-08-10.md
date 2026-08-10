# Gate 40 — saneamento do preflight de seguranca

Data: 2026-08-10

## Estado

`CANDIDATO LOCAL VALIDADO; REAUDITORIA INDEPENDENTE PENDENTE; SEM DEPLOY`.

## Causa

O preflight de release encontrou `ip-address@10.2.0` na cadeia transitiva
`whatsapp-web.js -> puppeteer -> @puppeteer/browsers -> proxy-agent ->
socks-proxy-agent -> socks -> ip-address`. O `npm audit --audit-level=high`
classificou a versao como vulneravel a bypass de fronteira de confianca e SSRF.

## Correcao minima

Somente `package-lock.json` mudou:

- `ip-address@10.2.0` foi substituido por `ip-address@10.5.0`;
- `package.json`, fontes do produto, testes e flags permaneceram inalterados;
- a faixa transitiva de `socks@2.8.9` (`^10.1.1`) admite a versao corrigida;
- nenhum script de alteracao automatica de produto foi aplicado.

## Evidencia local

- instalacao limpa pelo lockfile com download do Puppeteer desativado: verde;
- arvore instalada confirma `ip-address@10.5.0` na mesma cadeia transitiva;
- carga real de `ip-address`, `socks` e `proxy-agent`: verde;
- `npm audit --audit-level=high`: zero vulnerabilidades;
- suite hermetica ampla apos a atualizacao: `1632` testes, `1622` aprovados,
  zero falha, `10` skips esperados e cobertura valida;
- `git diff --check`: verde.

## Limite

As contagens acima sao execucao local relatada, nao execucao do auditor. O
deploy continua proibido ate a publicacao do hash, a revisao independente da
mudanca e os preflights operacionais OCI.
