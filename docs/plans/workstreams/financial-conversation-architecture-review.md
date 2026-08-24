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
22. [concluído] publicar e reauditar o recovery bifásico do ARQ-06;
23. [concluído] artefato OCI promovido com canário desligado; PM2, health local/público, WhatsApp, SQLite e rollback validados;
24. [concluído com rollback seguro] consentimento específico obtido; o smoke
    real confirmou escopo familiar e fonte pessoal, mas revelou ausência de
    ranking mensal completo por estabelecimento; canário revertido para `off`
    sem perda de saúde ou escrita financeira.
25. [concluído] recovery do ranking pessoal/familiar recebeu GO independente e
    foi promovido por artefato imutável com o canário desligado.
26. [concluído com rollback seguro] smoke real produziu candidato, mas a
    adequação rejeitou três leituras; baseline preservado e canário revertido
    para `off` sem restart, escrita ou perda de saúde.
27. [concluído] recovery do verificador recebeu GO independente, foi promovido
    com canário `off` e preservou saúde e ausência de escrita.
28. [concluído com rollback seguro] o smoke real preservou família e fonte, mas
    pediu esclarecimento redundante apesar do plano resolvido; baseline
    preservado e canário revertido imediatamente para `off`.
29. [NO-GO fechado por novo recovery] a auditoria confirmou que a regra ainda
    estava apenas no prompt: `clarify` e plano divergente continuavam aceitos.
30. [concluído] a primeira leitura determinística recebeu GO independente e o
    artefato `132d56a3...` foi promovido com o canário desligado.
31. [concluído com rollback seguro] o smoke real executou a leitura familiar e
    gerou candidato, mas o contrato exaustivo de ranking rejeitou a resposta;
    baseline preservado e canário revertido imediatamente para `off`.
32. [NO-GO fechado por novo recovery] o ranking foi aprovado, mas a telemetria
    aceitava identidade já em `snake_case` e o log ainda consumia motivo bruto.
33. [concluído] allowlist fechada recebeu GO independente e o artefato
    `0fb7bd7...` foi promovido com o canário desligado.
34. [concluído com rollback seguro] a ativação estrita preservou o escopo
    familiar, executou uma leitura e caiu no baseline com `reasoner_failed`;
    canário revertido imediatamente para `off`.
35. [concluído] janela finita e códigos fechados receberam GO independente; o
    artefato foi promovido e o timeout privado foi fixado em 30 segundos.
36. [concluído com rollback seguro] o smoke não expirou, mas produziu
    `reasoner_invalid_decision` após uma leitura; canário revertido para `off`.
37. [concluído] Structured Outputs recebeu GO independente e o artefato
    `742974cc...` foi promovido com o canário desligado.
38. [concluído com rollback seguro] a única pergunta base caiu no baseline com
    `reasoner_http_failure`; canário voltou imediatamente para `off`, zero
    efeitos e health verde.
39. [concluído] o recovery do slug público recebeu GO independente, com zero
    achados e nenhuma lacuna indispensável residual.
40. [concluído com recovery necessário] o novo artefato promoveu a pergunta
    base, mas o follow-up foi descartado pelo roteador público antes do agente;
    canário restaurado para `off`, health verde e zero efeitos.
41. [em execução] publicar e auditar o recovery fechado do roteamento público;
    com GO, promover novo artefato com `off` e executar uma única sequência
    base + follow-up antes do fechamento do gate.

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
