# OF-ALERT-BIND-01 — recovery de proposta legada inelegivel

Data: 2026-08-03

## Veredito local

`CANDIDATO; AUDITORIA INDEPENDENTE PENDENTE; CONFIRM BLOQUEADO`.

O release `c781365d1b6b5524b3ae5ac0ce821d9461821a28` recebeu GO tecnico
local independente para o lockfile e foi promovido na OCI por artefato
imutavel. O processo, o WhatsApp e os health checks ficaram verdes, mas o
primeiro ciclo Open Finance do release terminou em `NO_GO`, com zero escrita.
Por isso o fechamento de producao nao foi declarado.

## Causa observada

Uma leitura direta e somente leitura do Pluggy permaneceu verde. Um ensaio do
ciclo completo sobre copias consistentes dos cinco bancos Open Finance e da
ancora independente do journal reproduziu `save_proposal_replay_conflict`, sem
chamar o WhatsApp e sem escrever dados financeiros.

O estado persistido contem propostas criadas antes do refinamento do
classificador. Quando a mesma observacao deixa de ser elegivel — por exemplo,
uma classificacao antiga de compra que agora e `bill_balance` — a protecao de
imutabilidade identifica a mudanca. O produto falhava fechado, mas nao possuia
uma transicao duravel para encerrar a proposta obsoleta; por isso todo o ciclo
era abortado.

## Correcao

`OpenFinanceShadowPreviewStore.ingestSaveProposals` agora diferencia:

- alteracao de identidade ou conteudo financeiro: continua gerando
  `save_proposal_replay_conflict`;
- perda de elegibilidade com identidade, valor, descricao, conta, principal e
  operacao preservados: cancela a proposta de forma fail-closed;
- cancelamento sistemico: e registrado no terminal journal autenticado, remove
  confirmacao preparada e nao reabre apos restart ou replay;
- proposta terminalizada anteriormente: permanece terminal e nao e recriada.

Os unicos campos tolerados na transicao de elegibilidade sao classificacao,
estado do provedor, status de reconciliacao e regra de reconciliacao. Qualquer
mudanca simultanea no payload financeiro continua bloqueando atomicamente.

## Evidencia causal

- teste novo cobre perda de elegibilidade por lifecycle e por reconciliacao;
- em ambos os casos, uma confirmacao preparada e encerrada como `declined`, a
  proposta vira `cancelled`, o terminal journal recebe o resolver sistemico e
  o replay do evento originalmente elegivel nao reabre a proposta;
- adulteracao simultanea do valor ainda produz
  `save_proposal_replay_conflict` e preserva a proposta pendente;
- baterias relacionadas: save proposal shadow `10/10`, confirmation `9/9`,
  family alerts `6/6` e state machine `124/124`;
- suite hermetica: `1.433` testes, `1.428` aprovados, zero falha, cinco skips
  funcionais esperados;
- cobertura: linhas `90,58%`, branches `72,90%`, funcoes `90,13%`;
- `financial_writes=0` em todas as provas do recovery.

## Ensaio com estado de producao copiado

O codigo candidato foi executado em uma arvore temporaria, contra backups
SQLite consistentes do estado vigente. Google e Pluggy foram somente leitura;
WhatsApp e estado conversacional foram substituidos por simuladores em memoria.
Resultado: `GO`, duas propostas inelegiveis invalidadas, quatro entregas apenas
simuladas, zero chamada real ao WhatsApp e zero escrita financeira.

O primeiro ensaio isolado, sem a copia da ancora independente, foi rejeitado
por `open_finance_terminal_journal_anchor_required`. Essa rejeicao foi esperada
e confirma o controle anti-rollback; a ancora nao foi recriada nem enfraquecida.

## Invariantes e alcance

- `OPEN_FINANCE_SAVE_PROPOSAL_MODE=prompt`;
- `OPEN_FINANCE_WRITE_MODE=off`;
- `OPEN_FINANCE_WRITE_APPROVED=false`;
- nenhuma escrita automatica ou confirmada e autorizada;
- eventos ausentes no Pluggy nao sao sintetizados;
- alertas nao-compra continuam sem proposta de salvamento;
- o candidato nao autoriza `confirm` nem o fechamento funcional de 9P.4.

## Proximo gate

Publicar o commit sanitizado, obter auditoria independente pelo hash imutavel e,
somente com GO, construir um novo artefato OCI. A promocao deve manter as flags
acima, validar a invalidacao das duas propostas no ciclo real, exigir
`cycle=GO`, health completo e zero escrita.
