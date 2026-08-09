# Gate 34 - checkpoint portatil antes de nova janela

Data: 2026-08-09

## Ponto exato da pausa

- producao permanece na Oracle/OCI com o release de produto
  `b6f8edc37bd46ba977a7a4a4e59f54ad092300d6`;
- a primeira janela de 15 minutos expirou sem lote numerado e o runtime voltou
  efetivamente ao intervalo natural de seis horas;
- a automacao de observacao dessa janela foi excluida por estar obsoleta;
- Daniel confirmou estar com os dois celulares, relatou novas compras e fez
  uma atualizacao manual no Pluggy;
- foi iniciada a preparacao de uma segunda janela, mas interrompida para o
  handoff antes de backup, alteracao de `.env`, restart ou leitura remota;
- a regra SSH `/32` criada para essa preparacao foi removida e a porta voltou a
  ficar fechada;
- nenhuma mensagem foi enviada pelo Codex, nenhum celular recebeu resposta e
  nenhuma escrita financeira foi habilitada.

## Invariantes conhecidas

- `OPEN_FINANCE_WRITE_MODE=off`;
- aprovacao de escrita falsa;
- `financial_writes=0`;
- nenhum acesso AWS historico;
- nenhuma regra SSH temporaria ativa;
- arvore local limpa antes deste checkpoint.

## Proxima acao exata

1. retomar pela raiz indicada em `Trabalho Codex no outro PC/OPEN-THIS.json`;
2. executar `scripts/agent/resumePortableWork.ps1` e confirmar branch/HEAD;
3. redescobrir a referencia operacional OCI vigente pelo checkpoint;
4. abrir regra SSH `/32` temporaria;
5. fazer backup privado do `.env`;
6. definir uma nova expiracao futura inferior a duas horas, mantendo intervalo
   de 15 minutos e as seis flags seguras;
7. reiniciar uma unica vez para aplicar a nova janela;
8. verificar processo, health, SQLite, WhatsApp, flags, stores, logs e o ciclo
   disparado pelo restart somente por agregados sanitizados;
9. remover a regra SSH e confirmar a porta fechada;
10. se surgir lote numerado nos dois celulares, executar o smoke familiar e
    parar antes de qualquer confirmacao ou escrita.

Capacidade recomendada: `Codex -> Sol -> Alto`.
