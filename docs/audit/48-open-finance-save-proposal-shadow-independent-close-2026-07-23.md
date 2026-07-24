# 9P.0 — fechamento independente das propostas Open Finance em shadow

Atualizado em: 2026-07-23

Commit auditado:
`195ac58af68acdec87c0fb80617d0ddcf1d1de3b`.

Pai direto:
`826807aab29871713305131a92931cc288dc7071`.

## Veredito

`GO TÉCNICO LOCAL`.

O Chat confirmou o SHA completo, o pai direto e exatamente os 11 arquivos do
recovery. A revisão foi estática e independente no GitHub; ela não executou os
testes locais e não autoriza deploy, produção, polling real, pergunta remota ou
escrita financeira.

Não houve achado `CRITICAL` ou `HIGH`. Os três bloqueadores anteriores foram
fechados:

- replay idêntico é no-op e divergência causal falha fechada;
- modos inválidos e dependências lógicas de shadow falham antes dos timers;
- backup/restore v3 prova propostas pendentes e canceladas, payload, expiração,
  revogação, retenção e paridade operacional.

## Evidência local confrontada

- causal, operacional e backup: `16/16`;
- diretamente afetada: `32/32`;
- regressões Open Finance adicionais: blocos `41/41`, `26/26`, `4/4` e
  `113/113`, parcialmente sobrepostos;
- gate exaustivo hermético: `1.274` testes, `1.269` aprovados, zero falhas,
  cinco skips funcionais previstos e zero TODO;
- cobertura: linhas `89,99%`, branches `72,04%`, funções `89,75%`;
- sintaxe, diff, workflow e varredura básica de segredos: verdes.

## Condição operacional sobre payload v1

O parecer registrou um `MEDIUM` condicional: o pai gravava propostas
`payload_version=1`, enquanto o recovery aceita somente v2.

Essa condição não bloqueia o GO local porque:

- o pai recebeu `NO-GO`;
- não foi implantado nem executado contra banco persistente;
- o modo permanece `off` por padrão;
- os testes do candidato usaram bancos temporários;
- nenhum banco produzido pelo candidato será reutilizado.

Uma futura ativação deve usar banco anterior a 9P.0, sem linhas de propostas, ou
um banco novo. Se for encontrada qualquer linha v1, o gate deve parar e
eliminá-la fail-closed antes de polling ou entrega; não tentar migrar uma
proposta que nunca recebeu autorização financeira.

## Riscos baixos aceitos

- metadados externos são conferidos na leitura/replay, mas não possuem MAC
  próprio antes da seleção por retenção/revogação;
- o teste de duas conexões não cria contenção interprocesso simultânea;
- fixtures de restore usam datas absolutas e devem ser renovadas ou receber
  relógio injetável antes de expirar;
- o initializer valida modos antes dos timers; arquivos físicos continuam
  sendo validados no ciclo, antes de qualquer chamada Pluggy.

Esses riscos são proporcionais ao bot familiar privado, banco `0600`, uma
instância ativa e ausência de interface remota para editar o SQLite.

## Decisão

9P.0 está encerrado como fundação shadow. Não houve promoção de mensagem,
transporte ou escrita. A próxima fatia é 9P.1: contrato de proposta proativa e
confirmação de uso único, ainda local e com
`OPEN_FINANCE_WRITE_MODE=off`.
