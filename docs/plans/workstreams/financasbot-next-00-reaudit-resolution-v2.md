# NEXT-00 — Resolução da segunda reauditoria

Data: 2026-08-31
Candidato reavaliado: `6aa658d9eef5b17217e30ac946139473022fd276`
Estado: `ACHADOS REPRODUZIDOS E CORRIGIDOS LOCALMENTE; NOVO SHA E REAUDITORIA PENDENTES`

## Alcance

Esta resolução trata apenas a evidência documental do NEXT-00. Não abre
NEXT-01, não implementa runtime e não autoriza produção, writer, integração ou
dado real.

## Confronto independente

- Claude: `APROVÁVEL`.
- Chat: `APROVÁVEL APÓS AJUSTES`, com três HIGH, três MEDIUM e resíduos LOW.
- A decisão local adotou o parecer mais restritivo sempre que havia cadeia
  causal reproduzível.

## Resolução dos achados

| Achado | Reprodução | Correção verificável |
|---|---|---|
| H1 — apenas algumas sentinelas tinham recomputação factual | alterar `M-13.safe_daily_pace` não era detectado | registro determinístico cobre 76/76 fatos em 39 métricas e valida valor, unidade, base temporal, estado e tipo de evidência |
| H2 — somente parte dos limiares normativos tinha assertion explícita | alterar `lease TTL` não atingia as regexes selecionadas | SHA-256 independente congela integralmente Tool Budget e Quality/Stability/Retention; qualquer alteração exige nova versão e auditoria |
| H3 — M-05 chamava um pagamento genérico de correspondente à fatura | a fixture só ligava o pagamento ao cartão | pergunta e oracle agora distinguem `target_card` de correspondência; sem statement/competência explícita, o estado obrigatório é `unproven` |
| M1 — Calendar era consultado sem resultado congelado | M-15 só materializava bill e reminder | `calendar_event_count=0` entrou no oracle e no avaliador causal |
| M2 — orçamento, bills e regra usavam `committed` sem receipt | a fixture não sustentava efeito confirmado por writer | registros sintéticos passam a declarar `confirmed`; oracles e policy de métricas rejeitam `committed` incompatível |
| M3 — sete mutações não cobriam os falsos verdes novos | faltavam erros fora das sentinelas e semântica de evidência | bateria ampliada para 18 mutações, incluindo valor não sentinela, unidade, entidade, período, time basis, tipo de evidência, saída ausente, vínculo falso e limiar não coberto |
| L2 — checkpoint tinha contagem e estado obsoletos | registrava 24 arquivos e candidato não publicado | checkpoint passa a registrar 29 arquivos e o hash reavaliado `6aa658d...` |

## Limite do guardião de hash

O SHA-256 não substitui revisão do conteúdo: ele impede mudança silenciosa
depois que os dois contratos foram lidos e julgados. Uma mudança legítima exige
nova versão do contrato, atualização explícita do hash, testes afetados e nova
auditoria.

## Condição de saída

Novo candidato só pode substituir `6aa658d...` após testes focais, uma única
validação ampla final, diff sanitizado, commit publicado e reauditoria
independente sem lacuna indispensável. NEXT-01 permanece fechado até decisão
explícita posterior de Daniel.
