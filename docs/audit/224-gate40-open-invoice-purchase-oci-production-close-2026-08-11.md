# Gate 40 - promocao OCI de compra corrente em fatura aberta

Data: 2026-08-11

## Veredito operacional

`GO OPERACIONAL DE DEPLOY; SMOKE FUNCIONAL REAL PENDENTE`.

O release imutavel e auditado
`30e23da19db67af601ddec713876966899f3334f` foi promovido na OCI sem
rollback e sem bootstrap de estado. O fechamento nao afirma ainda que uma
nova compra real atravessou o caminho de proposta depois da promocao.

## Artefato e instalacao

- pacote SHA-256:
  `439653153c04cf18728802b9ddac734804830ba9274f60aa9162ea478cb265e5`;
- instalador SHA-256:
  `30452d41be2b0aa60649b17d0f18e2004e269edc05c2893b4c43d5db471dd507`;
- manifesto remoto: hash completo correto e 894 arquivos;
- `prepare`: novo slot criado com `production_changed=false`;
- `plan`: release anterior
  `38aa275d5928ffe350215727f158e962ff78a999` preservado para rollback;
- `promote`: novo script ativo, `rollback_performed=false` e
  `state_store_bootstrapped=false`.

## Evidencia pos-promocao

- um processo PM2 `financas-bot`, online, zero reinicios e script no release
  `30e23da19db67af601ddec713876966899f3334f`;
- health local e publico: `ok=true`, `sqlite=true`, `whatsapp=true`, status
  `ready` e liveness `healthy`;
- flags preservadas: proposta `prompt`, escrita `confirm`, aprovacao verdadeira
  e dashboard admin global desligado;
- checksum de `.env` preservado:
  `586d58b19220b43d145e18f162df837c35e56d7a31b2b26b1649a55e1d4cd9d5`;
- checksum de `state_store.json` preservado:
  `24723acb07f89c64c0377d9ffef6ac3ffa7ccbe9d86f26a7ceb0a60b2bf095d3`;
- read-model carregado e sincronizado; bot e cron inicializados;
- o ciclo Open Finance do restart terminou `NO_GO` com `writes=0`. A mesma
  assinatura ja aparecia antes do deploy, inclusive no ciclo das 08:17, logo
  nao caracteriza regressao causada pelo Gate 40. Ela mantem pendente a prova
  funcional da proxima coleta real;
- regra SSH temporaria `200.255.177.98/32` removida; HTTP/HTTPS publicos e a
  regra historica `10.0.0.30/32` permaneceram intactos; a tentativa externa na
  porta 22 voltou a expirar.

## Limite e proxima prova

O Gate 40 altera somente compra positiva, corrente, nao parcelada, em conta
`CREDIT`, reconciliada como nova. Transferencias continuam no contrato proprio
ja promovido pelo Gate 39. No proximo ciclo natural, conferir sem fabricar
evento:

1. compra elegivel gera lote numerado nos destinatarios autorizados;
2. promocao do mesmo evento de `PENDING` para `POSTED` nao duplica proposta;
3. transferencia nova segue proposta separada e nao vira compra ou entrada;
4. nenhum efeito financeiro ocorre antes da revisao e do segundo consentimento.
