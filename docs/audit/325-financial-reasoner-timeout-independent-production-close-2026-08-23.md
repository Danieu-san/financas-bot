# ARQ-06 — fechamento independente e operacional do timeout

Data: 2026-08-23

## Veredito independente

O Chat leu integralmente os dez arquivos do hash
`1cd2f7b3c93055dbf9dd620264fcc2ed729dab45` e emitiu `GO TÉCNICO LOCAL`.
Foram registrados zero achados críticos, altos, médios ou baixos e nenhuma
lacuna indispensável residual para o escopo estático.

O parecer confirmou: timeout padrão de 30 segundos limitado a 1–30 segundos,
uma única chamada sem retry, classificação fechada de falhas sem conteúdo
bruto, fallback com candidato nulo e zero efeitos, e ausência de ampliação de
família, owner, `personal_sheet`, domínio, plano, adequação, leituras, adapters
ou writers. As contagens locais não foram tratadas como execução do auditor.

## Promoção OCI

- artefato imutável do hash auditado;
- SHA-256 `5bdd6b57a79eb333f1911f08438748c0c56a48c8c16fe18e4e206ad68fc983d2`;
- manifesto e 1.037 arquivos verificados localmente e na OCI;
- slot preparado sem alterar produção;
- plano confirmou provider `oracle_oci`, cwd e rollback para `0fb7bd7...`;
- timeout privado atualizado para `30000` com backup;
- artefato promovido sem rollback e sem bootstrap de estado;
- um processo PM2, zero reinícios, script/hash correto;
- canário `off`, WhatsApp `ready/healthy`, SQLite e health local/público verdes.

## Gate operacional

A allowlist privada validada foi reativada apenas para dois membros familiares,
`expenses` e `personal_sheet`. Uma única pergunta base foi enviada. A resposta
visível permaneceu no baseline, e a telemetria sanitizada registrou:

- `outcome=fallback`;
- `reason=reasoner_invalid_decision`;
- `readCount=1`;
- `candidateAction=none`;
- `sideEffectsZero=true`.

Não houve follow-up nem repetição no mesmo hash. O canário foi revertido para
`off` por `SIGHUP`; o timeout de 30 segundos foi preservado, PM2 permaneceu com
zero reinícios e o health continuou verde.

## Conclusão

O recovery 324 está fechado tecnicamente e implantado, mas o gate operacional
do ARQ-06 continua aberto: a observabilidade distinguiu corretamente uma
decisão inválida de timeout. O próximo candidato deve corrigir o protocolo de
saída do modelo antes de qualquer nova ativação.
