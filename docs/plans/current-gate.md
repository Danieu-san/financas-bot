# Gate ativo - comparacao e verdade financeira do dashboard

Atualizado em: 2026-08-15

## Estado

`GATE 43 GO DE PRODUCAO; DASHBOARD V2 GO TECNICO LOCAL, AGUARDANDO PROMOCAO OCI`.

## Objetivo

Comparar v1 e v2, escolher a superficie mais correta e verificar seus valores
contra as fontes financeiras vigentes antes de substituir ou retirar qualquer
dashboard.

## Escopo

- rotas, contratos e fontes de dados dos dashboards v1 e v2;
- semantica de saldos de conta, faturas, limites e movimentacoes;
- comparacao read-only no mesmo usuario e instante;
- verificacao contra read-model, Sheets e snapshot Open Finance vigente.

## Não escopo

- alterar ou retirar qualquer dashboard antes do veredito;
- gravar na planilha ou nos stores financeiros;
- mudar o check diario ou o limite mensal nesta etapa;
- reabrir o Gate 43 sem regressao observada.

## Invariantes

1. Toda comparacao usa o mesmo recorte temporal e usuario.
2. Saldo de conta, fatura, limite e fluxo nao sao misturados.
3. Ausencia de fonte nao vira zero.
4. Diagnostico permanece somente leitura e sem dados privados em commits.
5. A excecao admin temporaria respeita o ADR-002 e nao e ampliada.

## Evidencia

- Gate 43 encerrado em producao no hash
  `72e526fac3dde1d00907d4e03725472ea8c67c60`;
- health local/publico e WhatsApp verdes;
- diagnostico de dashboard ainda nao iniciado neste checkpoint.

## Critérios de GO

1. Fontes e semantica de v1/v2 estao mapeadas no codigo.
2. Valores comparaveis foram confrontados no mesmo recorte.
3. Divergencias tem causa factual, sem inferir zero por ausencia.
4. Existe veredito sobre a superficie a manter e um plano fechado de correcao.

## Condições de parada

- fonte privada ou recorte nao puder ser confirmado;
- comparacao exigir escrita ou mutacao externa;
- descoberta de exposicao admin contraria ao ADR-002;
- qualquer risco de misturar saldo, fatura, limite ou fluxo.

## Proxima acao

Preparar artefato imutavel do hash auditado, promover na OCI e validar saude,
comando padrao v2, v1 explicito e ausencia de escrita financeira.
