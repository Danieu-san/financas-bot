# Estado — migração AWS para Oracle

Atualizado em: 2026-07-22

## Responsabilidade

Este workstream está reservado para a outra conversa Codex mencionada por
Daniel. Ela deve preenchê-lo quando a migração for iniciada.

## Objetivo conhecido

Migrar a operação do FinancasBot do servidor AWS para infraestrutura Oracle.

## Estado conhecido neste checkpoint

- Daniel confirmou que a migração ainda não foi iniciada;
- branch, HEAD, arquivos alterados e etapa exata ainda não foram importados;
- provedor atualmente ativo, host, usuário, chave, diretório e processo não
  foram confirmados por esta conversa;
- nenhum comando remoto deve reutilizar caminhos EC2/AWS do histórico.

## Próxima ação obrigatória ao iniciar

1. confirmar raiz, branch, HEAD e `git status`;
2. registrar o que já foi concluído e o que está parcial;
3. identificar, sem expor segredos, AWS atual, Oracle alvo e qual deles está
   ativo para cada serviço;
4. registrar referências da chave, diretório, processo e runbook vigentes;
5. atualizar o plano próprio antes de qualquer SSH, deploy ou cópia.

## Capacidade

Recomendar conforme a etapa. Arquitetura de migração, segurança, cutover e
rollback normalmente exigem esforço alto ou extra alto; inventário documental
pode usar esforço menor após Daniel ser avisado.
