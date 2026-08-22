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
10. [concluído] segundo recovery, suíte ampla, hash imutável e GO independente;
11. [concluído] definir e implementar localmente a fachada semântica read-only do ARQ-02;
12. [concluído] publicar, auditar, corrigir e reauditar o ARQ-02 por hash;
13. [concluído] desenhar e implementar localmente o ARQ-03 apenas em shadow;
14. [em andamento] publicar e auditar independentemente o ARQ-03 por hash;
15. [pendente] implementar o ARQ-04 somente após GO independente do ARQ-03.

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
