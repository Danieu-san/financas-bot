# ARQ-06 — sequência base + follow-up — fechamento de produção

## Identidade do release

- candidato de código auditado: `4dbac7738b76e4160509fb80e0a7b114626bbab4`;
- release documental promovido: `b9a6370662242331b17f93d7f3d4856d1ec7b43f`;
- pai operacional: `b0e0c1965d460aee792d8ddfa4402ab150240b72`;
- SHA-256 do artefato:
  `a92a6d19f0db4ee7b9f49afb54c867b98170ef160fef918d8305ccc2aae134a5`;
- fechamento independente anterior:
  `332-financial-resolved-ranking-deterministic-presentation-independent-close-2026-08-24.md`.

## Promoção OCI

O artefato imutável foi verificado, preparado e promovido pelo instalador
vigente. A primeira tentativa não alcançou `ready` dentro da janela padrão de
60 segundos e executou rollback automático íntegro. Como o WhatsApp precisou de
mais tempo para ficar pronto e não havia evidência de falha do release, a mesma
promoção foi repetida com a janela já suportada pelo instalador, limitada a 300
segundos. A segunda promoção concluiu sem rollback.

Após a promoção final:

- processo único no PM2;
- PID `202226` e zero reinícios;
- release ativo `b9a6370662242331b17f93d7f3d4856d1ec7b43f`;
- SQLite, WhatsApp e health local/público em `ready/healthy`;
- canário inicialmente `off`, com allowlists vazias.

## Smoke real controlado

O canário foi ativado por `SIGHUP` somente para os dois membros familiares,
domínio `expenses` e fonte `personal_sheet`. Foi executada exatamente uma
sequência:

1. pergunta-base sobre os maiores gastos familiares do mês;
2. follow-up restritivo sobre alimentação, enviado apenas depois da promoção
   confirmada da base.

Nos dois ingressos, a resposta exibida preservou a ordem do ranking já resolvido
pela evidência autoritativa. A telemetria sanitizada registrou, em ambos:

- `outcome=selected`;
- `reason=candidate_answer`;
- `reads=1`;
- `adequacy=adequate`;
- `adequacy_reason=none`;
- domínio `expenses` e fonte `personal_sheet`.

O follow-up preservou o checkpoint analítico familiar e restringiu o ranking à
categoria solicitada. Nenhuma segunda chamada de modelo foi necessária para a
apresentação do ranking resolvido. Nenhuma escrita financeira, mensagem
auxiliar ou efeito colateral foi habilitado pelo canário.

## Restauração e veredito

O `.env` exato anterior foi restaurado e recarregado por `SIGHUP`. O PID
permaneceu `202226`; a telemetria confirmou `mode=off`, zero usuários, zero
domínios e zero fontes. Health local e público permaneceram verdes.

`GO DE PRODUÇÃO CONTROLADO` para o ARQ-06 dentro do escopo read-only auditado.
O canário permanece desligado após a prova. Este fechamento não autoriza writer
financeiro, retirada do pipeline legado nem ampliação de usuários, domínios ou
fontes.
