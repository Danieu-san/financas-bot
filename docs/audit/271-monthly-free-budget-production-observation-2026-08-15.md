# Orçamento mensal livre — observação de produção

Data: 2026-08-15

## Release

O hash auditado `37e58c57c9cccd622556fe849dbc6230416ec8b3` foi promovido na
Oracle OCI por artefato imutável. Manifesto e checksum foram verificados,
estado e credenciais foram preservados, o processo permaneceu único e os
health checks local e público ficaram verdes.

## WhatsApp

A pergunta `Quais categorias compõem meu gasto livre neste ciclo?` retornou o
ciclo correto de 28/07/2026 a 27/08/2026 e declarou a lista positiva aprovada:
restaurante, delivery, lanche, lazer, presentes, vestuário, cuidados pessoais
e compras discricionárias. Também declarou corretamente as exclusões de
supermercado, combustível, transporte, saúde, educação, moradia,
transferências, fatura, dívidas, reserva/Caixinha, investimentos e recorrentes.

A formulação `Quanto de supermercado entrou...` foi roteada para entradas e a
formulação iniciada por `No orçamento mensal...` foi interceptada como comando
de configuração. Essas duas respostas não foram usadas como prova de
elegibilidade. A pergunta suportada de categorias respondeu corretamente.

## Limite da observação

O valor exibido de gasto livre não pode receber `GO DE VERACIDADE FINANCEIRA`:
o planejamento histórico possui itens prontos ainda não materializados na
planilha. O smoke numérico gravou uma despesa real, mas não substitui o lote
histórico idempotente.

## Veredito

- código e release do cálculo: `GO`;
- política pública de categorias no WhatsApp: `GO`;
- completude do realizado e do restante: `NO-GO CONTROLADO` até aplicar e
  conferir o writer histórico do Gate 41;
- o pré-preenchimento da proposta fica antes do writer histórico, para usar o
  backlog real como prova; a apresentação em negrito fica depois da completude
  da base, sem confundir melhoria visual com verdade financeira.
