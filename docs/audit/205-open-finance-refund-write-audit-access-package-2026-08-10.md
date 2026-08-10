# Gate 38.3 - pacote focal de acesso para reauditoria

Data: 2026-08-10

## Finalidade

Este documento resolve apenas a lacuna de acesso da reauditoria do commit
`61feb2a706517c7f1e080edd20133d5d498ad815`. O Chat conseguiu ler o manifesto
204 e os hunks relevantes, mas recusou um veredito porque o prompt exigia a
leitura integral de dois arquivos monoliticos. Nenhum codigo mudou depois da
suite ampla verde.

## Cadeia imutavel

- baseline reaudited: `65198a53ebb693abc802c72b7012a93834cda6c0`;
- recovery tecnico: `61feb2a706517c7f1e080edd20133d5d498ad815`;
- pai direto do recovery tecnico:
  `65198a53ebb693abc802c72b7012a93834cda6c0`;
- patch publico focal:
  `https://github.com/Danieu-san/financas-bot/commit/61feb2a706517c7f1e080edd20133d5d498ad815.patch`;
- manifesto tecnico completo:
  `docs/audit/204-open-finance-refund-write-malformed-state-recovery-candidate-2026-08-10.md`.

O commit tecnico altera somente o manifesto 204, o checkpoint do gate, o
handler e a prova publica. Para o veredito causal, o patch imutavel e o
manifesto 204 contem integralmente todas as linhas novas de codigo e teste.

## Questao causal fechada pelo patch

O pai permitia que um estado de revisao ou confirmacao final sem
`proposalRef` chamasse o finalizador com identidade nula. O recovery adiciona
um guard antes dos blocos de finalizacao e revisao. O guard:

1. reconhece exatamente os dois estados vinculados a identidade;
2. exige `proposalRef` textual nao vazio;
3. retorna antes de finalizador e revisor quando a identidade falta;
4. em `cancelar`, remove apenas o estado conversacional;
5. fora de `cancelar`, preserva o bloqueio fail-closed.

As linhas preexistentes imediatamente posteriores no mesmo patch mostram que
somente estados validos passam o `proposalRef` exato ao finalizador e ao
revisor. A descoberta global nao foi ampliada nem alterada.

## Prova nova integralmente contida no patch

No caminho publico 38.3, o patch:

- cria uma finalizacao antiga ativa antes do primeiro aceite;
- injeta um estado de revisao sem `proposalRef`, envia `sim` e exige zero
  escrita, identidade ainda ausente e finalizacao antiga intacta;
- restaura o estado correto e avanca a nova proposta;
- injeta confirmacao final sem `proposalRef`, envia `sim` e exige zero tentativa
  de append;
- restaura a referencia exata, grava uma unica vez a proposta correta e exige
  uma unica tentativa apos replay e reabertura.

O teste publico 38.1 permanece no mesmo arquivo e foi executado junto no focal
`2/2`; a bateria causal foi `61/61`; a unica suite ampla deste recovery foi
`1608/1598/0/10`, zero falhas. Estas contagens sao evidencia local relatada,
nao execucao do auditor.

## Escopo da nova reauditoria

A nova reauditoria deve validar o patch tecnico imutavel, nao reler arquivos
monoliticos que nao mudaram integralmente. O hash deste pacote prova apenas que
a evidencia de acesso foi acrescentada depois do recovery tecnico; ele nao
substitui nem modifica o codigo auditado.

Estado maximo: `GO TECNICO LOCAL; SEM DEPLOY`.
