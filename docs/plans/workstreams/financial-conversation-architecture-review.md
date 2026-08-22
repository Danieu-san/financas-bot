# Plano — revisão da arquitetura conversacional financeira

## Objetivo material

Produzir uma decisão arquitetural informada por evidência local, Chat e Claude,
sem novo ciclo de correção por frase.

## Etapas

1. [concluído] isolar worktree no HEAD publicado mais recente;
2. [concluído] reconstruir erros, causas, arquitetura e proposta;
3. [em andamento] validar e publicar commit sanitizado imutável;
4. [pendente] obter parecer independente do Chat;
5. [pendente] obter parecer independente do Claude pela API;
6. [pendente] consolidar opções e pedir decisão de Daniel.

## Critério de conclusão

- ambos os revisores confirmam hash e arquivos lidos ou declaram acesso parcial;
- achados são confrontados com a evidência local;
- divergências permanecem explícitas;
- recomendação contém escopo finito, invariantes, condição de parada e rollback;
- nenhuma implementação é iniciada automaticamente.

