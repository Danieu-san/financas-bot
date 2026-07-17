# Pos-Fase 9 - gate de reconciliacao read-only no runtime - 2026-07-17

## Veredito

`GO` para reconciliar candidatos Open Finance com a planilha familiar
compartilhada antes do outbox, em canario e sem escrita financeira.

`NO-GO` permanece para revisao persistente em producao, proposta
`salvar <referencia>`, escrita automatica, alteracao de mensagem e qualquer
mudanca de consentimento no provedor.

## Contrato aprovado

- `matched`: silenciar e guardar apenas resolucao sanitizada;
- `new`: unico estado elegivel ao outbox;
- `possible_duplicate` e `uncertain`: bloquear;
- planilha familiar ausente, incompleta ou sem escopo integral do casal:
  falhar fechado;
- replay de lifecycle, parcelamento e conta ambigua: nunca promover a `new`;
- `OPEN_FINANCE_WRITE_MODE=off` continua obrigatorio.

A fonte interna faz seis leituras de Sheets por ciclo, a cada seis horas, e
nao usa Gemini. O guard `requireUserScoped` impede fallback silencioso para a
planilha central. Linhas de usuarios fora do escopo sao descartadas antes da
reconciliacao e nao aparecem na saida sanitizada.

## Evidencias

- testes focados locais e remotos: `12/12`;
- suite Open Finance local: `182/182`;
- `git diff --check`: OK;
- canario real isolado em `shadow`: fonte `available`, sete observacoes
  historicas classificadas como `new`, fila nova `0`, transporte stub `0` e
  escrita `0`;
- ciclo real apos ativacao: `GO`, observacoes novas `0`, entregas `0`, retries
  `0` e escritas `0`;
- outbox final: total `4`, pendente `0`, in-flight `0`, bloqueado `1`,
  `delivered_confirmed` `1`, `legacy_sent` `2`;
- health `ok=true/sqlite=true`, PM2 online e WhatsApp pronto;
- local `81c0486`, EC2 `f7007bf`, ambos com tree
  `f8c69fe1ec89811fbc0c97e294c720c92b4237b8`;
- GitHub publico permaneceu inalterado.

## Estado operacional

- `OPEN_FINANCE_RECONCILIATION_MODE=canary`;
- `OPEN_FINANCE_WRITE_MODE=off`;
- `OPEN_FINANCE_SHADOW_PREVIEW_DB` nao configurado;
- rollback de configuracao:
  `.env.pre-open-finance-reconciliation-f7007bf-20260717T1421Z`.

Sem preview persistente, duplicidade ou incerteza permanece bloqueada e volta
a ser avaliada no ciclo seguinte. Isso evita criar um novo deposito de dados
privados antes de backup, retencao e revogacao cobrirem esse estado.

## Proximo gate

Cobrir o preview cifrado com revogacao, backup/restore e retencao. Somente
depois abrir a proposta canario `salvar <referencia>` para compra simples nao
parcelada, sempre com preview, revalidacao e confirmacao explicita no WhatsApp.
