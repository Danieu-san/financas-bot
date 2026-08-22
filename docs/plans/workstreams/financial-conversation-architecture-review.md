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
14. [concluído] publicar e auditar independentemente o ARQ-03 por hash;
15. [concluído] definir e implementar o ARQ-04, verificador de adequação;
16. [concluído] publicar, corrigir o NO-GO e reauditar o ARQ-04 por novo hash;
17. [concluído] implementar localmente o contrato do ARQ-05 sem ativar canário ou produção;
18. [concluído] publicar e auditar independentemente o ARQ-05 por hash imutável;
19. [concluído] ensaiar promoção e rollback do ARQ-05 em ambiente local isolado, sem rede nem escrita;
20. [concluído] integrar o HEAD vigente e implementar observabilidade fail-closed para o canário ARQ-06;
21. [concluído] publicar o candidato ARQ-06 e registrar o NO-GO causal da entrega;
22. [em andamento] publicar e reauditar o recovery bifásico do ARQ-06;
23. [pendente] com GO, preparar artefato OCI com canário desligado, validar saúde e rollback;
24. [pendente] ativar um domínio read-only somente com segredo válido e monitorar a janela finita.

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
