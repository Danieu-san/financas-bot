# ARQ-03 — fechamento independente do agente iterativo em shadow

Data: 2026-08-22

## Hash auditado

`5523b6a317ed3673a06eed02ae1942a01c2de21d`

## Veredito independente

`GO TÉCNICO LOCAL`.

O Chat confirmou a leitura integral dos sete arquivos exigidos no mesmo hash e
consultou adicionalmente o wrapper do agente e o callsite do handler apenas
para fechar a ausência de ativação normal.

## Achados

- crítico: zero;
- alto: zero;
- médio: zero;
- baixo: zero;
- lacuna causal indispensável residual: nenhuma dentro do ARQ-03 estático.

## Confirmações causais

- `maxReads` permanece limitado a três;
- consultas passam pela fachada semântica allowlisted e somente leitura;
- runner público remove adapters fornecidos pelo chamador;
- writer e ferramenta desconhecida falham fechados;
- trajetória é reconstruída por allowlist e evidência é sanitizada;
- resposta candidata nunca substitui a resposta vigente;
- falha do shadow permanece posterior e separada do resultado principal;
- comparação cobre capacidade, fonte, cobertura e fingerprint sanitizado sem
  copiar o payload;
- não existe flag ou injeção do reasoner no handler normal;
- testes focais e integração isolam as decisões alegadas e a integração usa o
  produto real via `invokeFinancialAgent`.

## Alcance

O parecer foi estático e independente. Não executou suíte, WhatsApp, rede,
produção, planilha ou writer e não tratou as contagens locais como execução
própria.

Fica autorizado somente encerrar tecnicamente o ARQ-03 e iniciar o ARQ-04,
verificador de adequação. Deploy, canário de resposta, writer financeiro e
retirada do caminho vigente continuam proibidos.
