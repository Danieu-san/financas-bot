# Gate 34 - promocao controlada do release OCI

Atualizado em: 2026-08-09

## Alcance

Este registro fecha a promocao operacional do candidato do Gate 34. Ele nao
substitui o smoke funcional de um lote numerado `purchase/POSTED/new`, que
continua indispensavel para encerrar o gate inteiro.

## Release

- commit promovido: `09b6dab6e679ce28202cb87f83d38549f64e6ae8`;
- release anterior: `b6f8edc37bd46ba977a7a4a4e59f54ad092300d6`;
- artefato imutavel: checksum local e remoto coincidentes;
- manifesto interno: mesmo hash completo e `819` arquivos;
- instalador: verificado, preparado, planejado e promovido sem rollback;
- `state_store` nao precisou de bootstrap nem gerou arquivo de recuperacao.

## Estado preservado

Os checksums de `.env`, `credentials.json` e `state_store.json` permaneceram
identicos entre preflight e pos-promocao. Nenhum segredo, token, payload
financeiro ou identificador privado foi levado ao Git.

## Validacao do runtime

- exatamente um processo PM2 `financas-bot`, online e com zero reinicios;
- script ativo no slot do commit `09b6dab6e679ce28202cb87f83d38549f64e6ae8`;
- `APP_COMMIT_SHA` igual ao commit promovido;
- `pm2-ubuntu.service` e `caddy.service` ativos;
- health local e publico: SQLite verde, WhatsApp `ready` e liveness `healthy`;
- Google, Sheets, read-model, dashboard e cron inicializados;
- flags preservadas: alerta, reconciliacao e shadow em `canary`, proposta em
  `prompt`, escrita `off` e aprovacao `false`.

Os logs registraram uma exaustao nao fatal do unread backfill. O health final
permaneceu verde, o WhatsApp continuou `ready/healthy` e sincronizacoes
posteriores do read-model foram concluidas. O aviso fica como observacao
operacional, nao como falha desta promocao.

## Smoke seguro executado

Na conversa real de Daniel com o FinancasBot foi enviado apenas `admin stats`.
Houve exatamente uma resposta, sem duplicidade e sem escrita financeira. Esse
smoke prova transporte, handler publico e resposta do novo processo; nao prova
ainda a experiencia numerada de compra elegivel.

## Acesso temporario e limpeza

O acesso foi obtido por Bastion OCI temporario, limitado ao endereco privado da
instancia. O fingerprint Ed25519 da instancia coincidiu com o valor esperado
antes de qualquer comando remoto. Ao final:

- as duas sessoes temporarias ficaram `Deleted`;
- o Bastion temporario ficou `Deleted`;
- o plugin Bastion da instancia ficou `Disabled`;
- a regra privada temporaria TCP/22 foi removida;
- a VCN voltou a ter apenas ICMP e as portas publicas 80/443;
- nao existe regra TCP/22 publica ou privada na Security List;
- o tunel local foi encerrado e a porta local 22022 deixou de ouvir;
- o arquivo local temporario de host key foi removido;
- AWS nao foi usada.

## Veredito

`GO OPERACIONAL DA PROMOCAO OCI; GATE 34 FUNCIONAL AINDA PENDENTE`.

O release esta correto, preservou estado, iniciou saudavel e deixou toda a
superficie SSH temporaria removida. O Gate 34 somente pode ser encerrado depois
de uma nova compra genuina elegivel produzir um lote numerado no WhatsApp e o
smoke confirmar, nos dois telefones, selecao/revisao sem escrita nem segunda
confirmacao.
