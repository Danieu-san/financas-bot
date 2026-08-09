# Gate 34 - preflight de release OCI em hold seguro

Atualizado em: 2026-08-09

## Release candidata

- HEAD: `09b6dab6e679ce28202cb87f83d38549f64e6ae8`;
- Gate 34: `GO TECNICO LOCAL` independente;
- workflow versionado: verde;
- suite hermetica final: `1.555/1.545/0/10`;
- artefato OCI: construido e verificado localmente;
- manifesto interno: mesmo hash completo, `819` arquivos;
- checksum externo e inventario protegido: verdes.

## Dependencias

O `npm audit --audit-level=high` relatou nove ocorrencias `HIGH` na mesma cadeia
transitiva sem correcao disponivel, sob `whatsapp-web.js -> puppeteer ->
proxy-agent -> socks -> ip-address`. `package.json` e `package-lock.json` nao
mudaram em relacao ao release produtivo, e o produto nao configura proxy SOCKS
nem entrega enderecos nao confiaveis a essa cadeia. O achado foi classificado
como divida preexistente nao regressiva e nao foi aplicado `npm audit fix`.

## Descoberta OCI

A console autenticada confirmou a instancia Oracle correta em `Running`. A
porta SSH estava fechada. Uma regra `/32` baseada no IP observado pelo navegador
nao alcancou o executor, pois as duas superficies usam saidas de rede diferentes.

Uma tentativa de descobrir a origem por janela global minima foi interrompida
pela politica de seguranca antes de qualquer autenticacao SSH. Nenhum comando
remoto foi executado. A regra global e a regra `/32` ineficaz foram removidas e
a tabela voltou a conter somente as quatro regras originais.

## Mutacoes ausentes

- nenhum arquivo foi enviado a OCI;
- nenhum slot foi preparado;
- PM2 e Caddy nao foram tocados;
- nao houve restart, troca de script ou flag;
- nenhum smoke ou mensagem foi iniciado;
- producao permanece no release anterior conhecido;
- AWS nao foi usada nem iniciada.

## Hold e desbloqueio

`HOLD SEGURO ANTES DE UPLOAD`.

O proximo passo exige autorizacao explicita para o executor consultar
`https://checkip.amazonaws.com/` e obter apenas seu IP publico de saida. Depois
disso, a OCI recebera uma regra SSH temporaria limitada ao `/32` correto; o
fingerprint sera confirmado antes do preflight e a regra sera removida ao fim.
