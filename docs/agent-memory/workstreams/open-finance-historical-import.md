# Estado - importacao historica Open Finance

Atualizado em: 2026-08-11

## Objetivo ativo

Preparar um lote historico idempotente a partir do RX saneado, confrontando cada
movimento com a planilha familiar e usando o historico categorial existente
antes de qualquer escrita.

## Estado vigente

- worktree isolada: `codex/open-finance-historical-import`;
- commit de partida: `a8172a25d07968be1f391a26145f3a772ca4ca33`;
- RX privado: quatro fontes, nove contas/cartoes e 2.207 transacoes;
- planilha central legada lida em 2026-08-11: 95 linhas de dados em `Saidas`;
  `Entradas`, `Transferencias` e as quatro abas de cartao possuem somente
  cabecalho;
- duas regras privadas confirmadas por Daniel e corroboradas por padroes
  existentes na planilha; as descricoes permanecem fora do Git;
- planejador puro, configurador privado, captura read-only e lote de revisao
  implementados sem dependencia de writer;
- seis dos nove segmentos possuem vinculo univoco; permanecem sem destino
  estrutural uma conta, um cartao e uma poupanca sem movimentos relevantes;
- o snapshot historico observado termina antes do corte operacional, portanto
  o plano atual e deliberadamente parcial e nao gravavel;
- o plano parcial reteve duplicatas provaveis, pendencias sem categoria,
  entradas/estornos sem vinculo e meses de fatura sem evidencia em revisao;
- pendencias de categoria foram agrupadas privadamente por comerciante, sem
  publicar descricoes ou referencias;
- o primeiro candidato publicado (`7f4a333ec8cff07fedeac3c484a173b2ba4e12df`)
  recebeu `NO-GO` independente por identidade ausente, cobertura declarativa e
  confinamento apenas lexical; os tres achados foram corrigidos no candidato
  seguinte;
- identidade sem `provider_id` e sem `id` agora permanece em revisao;
  cobertura e recalculada do snapshot exato planejado e caminhos privados
  resolvem ancestrais simbolicos antes da validacao;
- bateria causal ampla pos-correcao: 127 testes verdes, sem falhas, cobrindo planejador,
  RX, ambiguidades, runtime e importador estabelecido;
- snapshots privados permanecem fora do Git; nenhuma descricao, valor, data,
  ID ou segredo foi versionado;
- credenciais efemeras usadas na leitura foram removidas;
- `financial_writes=0`.

## Proxima acao

Completar a cobertura da fonte ate a vespera do corte, criar os destinos
estruturais ausentes em plano separado e revisar os grupos privados residuais.
Nenhuma escrita financeira e autorizada antes do plano completo, commit
imutavel e auditoria independente.

## Capacidade

`Codex -> Sol -> Alto -> fechar cobertura e vinculos estruturais do Gate 41.`
