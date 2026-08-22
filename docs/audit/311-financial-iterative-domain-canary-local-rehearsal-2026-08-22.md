# ARQ-05 — ensaio local de promoção e rollback

Data: 2026-08-22

## Base

- implementação auditada: `e74441d6bdc1fd6b3fd3db5a86fb15c79986361b`;
- fechamento independente: `GO TÉCNICO LOCAL` em
  `docs/audit/310-financial-iterative-domain-canary-independent-close-2026-08-22.md`;
- execução sem rede, OpenRouter, Google, WhatsApp, planilha, produção ou writer.

## Ensaio executado

Foi executado somente o recorte focal que representa o procedimento de
promoção e rollback, sem repetir a suíte ampla:

- configuração válida aplicada atomicamente;
- retirada de `expenses` preservando `budget` elegível;
- modo `off` sem chamar reasoner nem runner semântico;
- candidato read-only adequado promovido;
- candidato inadequado ou com escrita simulada recusado, preservando baseline;
- recarga inválida preservando integralmente a configuração anterior;
- falha contida na fronteira pública preservando a resposta vigente.

Resultado: `5/5` aprovados, zero falha, zero cancelamento e zero skip.

O aviso de restauração do state-store ocorreu durante o carregamento do handler
no ambiente hermético e não alterou o resultado do ensaio nem qualquer estado
financeiro. A fronteira avaliada registrou explicitamente a falha simulada como
contida e preservou o baseline.

## Veredito do ensaio

`GO LOCAL PARA PREPARAR CANÁRIO REAL READ-ONLY`.

O rollback por domínio funciona sem estado financeiro a desfazer, porque o
canário não escreve. Este ensaio não autoriza writer, retirada do legado nem
rollout amplo.

## Próximo estado

Preparar o ARQ-06 como promoção real mínima de um único domínio read-only para
o casal autorizado, com fonte explícita, fallback contabilizado, janela curta,
rollback imediato e legado mantido. Merge/release, configuração real, deploy e
smoke exigem artefato e evidência próprios antes da ativação.
