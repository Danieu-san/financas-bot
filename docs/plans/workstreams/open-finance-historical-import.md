# Gate 41 - importacao historica idempotente para a planilha

Atualizado em: 2026-08-11

## Estado

`PLANEJADOR LOCAL IMPLEMENTADO; PLANO PRIVADO PARCIAL E NAO GRAVAVEL`.

## Objetivo

Transformar o RX historico saneado em um plano de importacao revisavel,
confrontando primeiro a planilha familiar, sem duplicar linhas existentes e sem
misturar conta, cartao, transferencia, estorno ou reserva patrimonial.

## Commit de partida

`a8172a25d07968be1f391a26145f3a772ca4ca33`.

## Escopo

- consumir snapshots privados de Pluggy, RX e planilha somente por argumentos;
- usar data, valor, direcao, conta/cartao, identidade do provedor e descricao
  para detectar correspondencia ou duplicata;
- inferir categoria apenas de regra explicita, padrao univoco observado na
  planilha ou regra deterministica ja estabelecida no importador do produto;
- receber regras privadas explicitas, confirmadas pelo titular e coerentes com
  padroes ja observados na planilha, sem versionar descricoes financeiras;
- preservar parcelas distintas e seu mes de cobranca;
- excluir principal de Caixinha de receita/despesa e manter aplicacao/resgate
  como transferencia patrimonial;
- separar candidatos de saida, entrada, cartao, transferencia e estorno;
- produzir relatorio privado com contagens e itens pendentes de revisao;
- preparar posteriormente um writer idempotente com recibo e rollback.

## Nao escopo desta fatia

- escrever no Google Sheets;
- chamar Pluggy live, WhatsApp ou producao;
- importar automaticamente item ambiguo;
- tratar ausencia de categoria, conta, identidade ou evidencia como zero;
- reconstruir a serie historica das Caixinhas;
- incluir dados financeiros, IDs privados ou segredos no Git.

## Invariantes

1. Conta e cartao permanecem fontes distintas mesmo com o mesmo banco/titular.
2. Uma linha existente ou possivel duplicata nunca entra no lote gravavel.
3. Categoria pronta exige decisao explicita, evidencia univoca da planilha ou
   regra deterministica estabelecida; semelhanca isolada nao e suficiente.
4. Parcela futura nao vira compra corrente nem e deduplicada apenas por texto.
5. Aplicacao/resgate de reserva tem impacto neutro em receita e despesa.
6. Estorno exige vinculo forte ou revisao; pagamento de fatura nao vira gasto.
7. O planejador puro sempre retorna `financial_writes=0`.
8. O writer futuro exigira hash do plano, backup, idempotencia, recibo,
   rollback e auditoria independente antes da primeira escrita real.

## Riscos

- duplicar os 95 lancamentos existentes;
- classificar transferencia ou pagamento de fatura como despesa;
- misturar conta corrente e cartao do mesmo titular;
- importar projecao futura de parcela como fato financeiro realizado;
- propagar categoria por semelhanca fraca;
- gravar lote parcialmente e perder a identidade para retomada.

## Etapas

1. [concluida] Obter snapshots privados read-only e remover credenciais
   efemeras.
2. [concluida] Criar RED causal para correspondencia, regras privadas,
   parcelas, reserva, pagamento, estorno e separacao conta/cartao.
3. [concluida] Implementar planejador puro e CLI privada sem rede.
4. [concluida] Executar focal e bateria causal pos-correcao: 127 testes verdes.
5. [em andamento] Rodar o planejador sobre os snapshots privados e revisar
   todas as classes residuais com Daniel.
6. Implementar writer idempotente somente depois de o plano ficar fechado.
7. [em andamento] Publicar o candidato pos-correcao e obter nova auditoria
   independente; o candidato anterior recebeu `NO-GO` e nao foi promovido.
8. Somente com GO, fazer backup da planilha, ensaiar, apresentar contagens e
   aplicar o lote real com recibo e rollback.

## Criterios de GO do planejador

- toda transacao recebe exatamente um estado terminal do plano;
- existentes e duplicatas ficam fora do conjunto gravavel;
- nenhuma inferencia categorial fraca entra como pronta;
- aliases confirmados produzem as categorias esperadas;
- parcelas, reservas, transferencias, estornos e pagamentos possuem provas
  causais proprias;
- relatorio privado nao contem segredo e o Git nao contem dado financeiro real;
- `financial_writes=0` em execucao local e testes.

## Condicoes de parada

- snapshot ou inventario divergente;
- dados reais aparecerem em diff, logs ou stdout;
- categoria conflitante na planilha;
- item sem conta/cartao ou identidade suficiente ser marcado como gravavel;
- qualquer chamada externa ou escrita durante a fase do planejador.

## Proxima acao

Completar a cobertura ate o corte, fechar os tres vinculos estruturais ausentes
e aplicar decisoes aos grupos privados residuais, ainda sem writers.
