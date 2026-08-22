# Plano — revisão da arquitetura conversacional financeira

## Objetivo material

Produzir uma decisão arquitetural informada por evidência local, Chat e Claude,
sem novo ciclo de correção por frase.

## Etapas

1. [concluído] isolar worktree no HEAD publicado mais recente;
2. [concluído] reconstruir erros, causas, arquitetura e proposta;
3. [concluído] validar e publicar commit sanitizado imutável;
4. [concluído] obter parecer independente integral do Chat;
5. [concluído] obter parecer independente parcial do Claude pela API;
6. [concluído] consolidar opções e recomendar caminho finito;
7. [concluído] obter decisão de Daniel antes de iniciar ARQ-01;
8. [concluído] implementar contrato de trajetória e checkpoint executado;
9. [concluído] gerar baseline sanitizado `265/265`, críticos `15/15`;
10. [em andamento] recovery do NO-GO e suíte ampla verdes; faltam novo commit e reauditoria;
11. [pendente] iniciar ARQ-02 somente depois do GO de ARQ-01.

## Critério de conclusão

- ambos os revisores confirmam hash e arquivos lidos ou declaram acesso parcial;
- achados são confrontados com a evidência local;
- divergências permanecem explícitas;
- recomendação contém escopo finito, invariantes, condição de parada e rollback;
- nenhuma implementação é iniciada automaticamente.

## Resultado

O critério documental foi satisfeito. A direção recomendada é um agente
iterativo read-only com duas ou três tools semânticas, mantendo kernel e escrita
determinísticos. Ver documento 296 para gates, critérios de parada e rollback.
