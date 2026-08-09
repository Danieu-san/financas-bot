# Gate 34 - segunda janela rapida e observacao operacional

Data: 2026-08-09

## Alcance

Retomar o Gate 34 pela raiz portatil vigente, abrir uma segunda janela curta de
polling na Oracle/OCI e observar o primeiro ciclo sem habilitar confirmacao ou
escrita financeira. Nenhum acesso AWS, deploy, mensagem manual ou resposta em
nome dos usuarios participou.

## Acesso e preflight

- o host e a chave publica do servidor coincidiram com a identidade registrada;
- a chave historica foi corretamente recusada e a chave permanente ja existente
  no cofre privado foi usada, sem criar ou instalar nova identidade na OCI;
- a ACL local da chave permanente foi ajustada para o usuario deste computador e
  Sistema, sem ler, copiar ou publicar seu conteudo;
- a producao estava no release imutavel
  `b6f8edc37bd46ba977a7a4a4e59f54ad092300d6`;
- havia um unico processo PM2 online, sem reinicio anterior, no script e cwd
  esperados;
- health local, SQLite, WhatsApp e liveness estavam verdes;
- as seis flags estavam em `canary/canary/canary/prompt/off/false`.

## Janela e evidencias

- um backup privado da `.env` foi criado em diretorio `0700`, com arquivo
  `0600`, e comparado integralmente antes da alteracao;
- somente `OPEN_FINANCE_POLL_INTERVAL_MS=900000` e uma nova
  `OPEN_FINANCE_FAST_POLL_UNTIL` foram aplicados pelo script do release;
- a expiracao foi fixada em `2026-08-09T14:04:52.000Z`, por 115 minutos;
- houve exatamente um restart; o processo permaneceu unico, online e sem
  reinicio instavel;
- o health ficou transitoriamente `503` enquanto o WhatsApp inicializava e
  depois retornou `200`, com SQLite e WhatsApp ready/healthy;
- o runtime confirmou `fast_polling=active`, intervalo de 15 minutos e
  `writes=0`;
- o ciclo automatico de inicializacao terminou `GO`, com `new=0`,
  `delivered=0`, `retries=0` e `writes=0`;
- os cinco stores existiam em arquivo `0600` e diretorio `0700`; a leitura
  agregada do outbox nao expos payloads, nao chamou transporte e confirmou
  `financial_writes=0`.

## Fechamento do acesso

A lista de seguranca continha uma unica regra SSH `/32`. A origem coincidiu com
a conexao SSH desta janela; somente essa regra foi removida. As regras ICMP,
HTTP e HTTPS foram preservadas e a porta 22 foi confirmada fechada externamente.

O health publico nao pode ser validado desta rede porque o trafego HTTPS foi
interceptado por uma autoridade Fortinet local nao confiada pelo ambiente do
Codex. O certificado observado era da interceptacao, nao prova do certificado
servido diretamente pela OCI. Nenhuma validacao insegura foi aceita como verde.

## Estado

`JANELA RAPIDA ATIVA; PRIMEIRO CICLO GO SEM LOTE NOVO; SMOKE PENDENTE; CONFIRM BLOQUEADO`.

Nao surgiu lote `purchase/POSTED/new` numerado. O Gate 34 continua aguardando
uma observacao genuinamente nova nos dois celulares; o smoke deve parar antes
de qualquer confirmacao ou escrita.
