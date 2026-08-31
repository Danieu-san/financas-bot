# NEXT-00 — Resolução da terceira reauditoria

Atualizado em: 2026-08-31
Objeto reavaliado: `0beb543f9be52838ec6a8d04dc6a5787486561b2`
Veredito externo: `APROVÁVEL APÓS AJUSTES`

## Escopo fechado

Esta correção permanece exclusivamente documental. Ela não abre NEXT-01, não
cria runtime, não habilita writer e não acessa integração, credencial, produção
ou dado financeiro real.

## Achados confirmados e resolução

| Achado | Reprodução | Resolução |
| --- | --- | --- |
| H1 — valor era universalmente recalculado, mas entidade, período, coverage, evidence state e provenance eram apenas parciais | mutações em saldo, pagamento, parcela, orçamento e evidence ref do mesmo tipo podiam explorar dimensões ignoradas | o registro agora valida dimensão por família de métrica, conjunto causal exato de eventos quando aplicável, vínculos de conta/cartão/pessoa/família/plano/orçamento, intervalos, estado das fontes e cobertura declarada pela fixture fechada |
| M1 — 18 mutações não demonstravam os caminhos ignorados | a bateria escolhia métricas nas quais entidade/período já participavam do cálculo | foram adicionados REDs específicos para saldo, pagamento, parcela, orçamento, source ref do mesmo tipo, coverage, Calendar não vazio e estado da fonte |
| L1 — contagem 17/18 divergente e contador autorreferencial | o charter dizia 17 e o runner imprimia `redCount/redCount` | documentação alinhada e constante independente `EXPECTED_MUTATIONS=27`; remover uma mutação agora falha |

## Ajuste adicional de escopo

O orçamento de M-08 passou a carregar `budget-snack:person-b`. Isso torna
explícito que o zero e o restante de R$ 200,00 pertencem ao membro filtrado, em
vez de reutilizar silenciosamente o orçamento familiar que contém consumo de
outro membro.

## Evidência focal

- syntax checks dos dois scripts alterados: verdes;
- Golden Set: `48 casos`, `56 turnos`, `76 fatos`, `39 métricas`, `67/67`;
- bateria adversarial: `27/27 RED` com fragmento causal esperado;
- nenhum teste amplo repetido nesta etapa.

## Estado

Correção focal verde. Ainda faltam revisão de diff/segredos, uma única suíte
ampla sobre o candidato estável, novo commit sanitizado e reauditoria
independente. NEXT-01 permanece fechado.
