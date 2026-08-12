# Gate 41 - importacao historica idempotente para a planilha

Atualizado em: 2026-08-12

## Estado

`PLANEJADOR LOCAL EM CORRECAO; COBERTURA COMPLETA; PLANO PRIVADO EM REVISAO;
SEM WRITER HISTORICO`.

## Objetivo

Transformar o RX historico saneado em um plano de importacao revisavel,
confrontando primeiro a planilha pessoal comprovada, sem duplicar linhas
existentes e sem misturar conta, cartao, transferencia, estorno ou reserva.

## Escopo

- consumir snapshots privados de Pluggy, RX e planilha somente por argumentos;
- exigir leitura da planilha pessoal consolidada e escopada por usuario;
- usar data, valor, direcao, conta/cartao, identidade e descricao para detectar
  correspondencia ou duplicata;
- vincular cartoes por `card_id` e contas por Conta Financeira;
- evidenciar mes de cobranca por conta, `bill_id` e vencimento da fatura;
- inferir categoria apenas de regra explicita, padrao univoco da planilha ou
  regra deterministica estabelecida;
- preservar parcelas distintas e seu mes de cobranca;
- excluir principal de Caixinha de receita/despesa;
- produzir relatorio privado com pendencias de revisao;
- preparar posteriormente writer idempotente com recibo e rollback.

## Nao escopo desta fatia

- escrever transacoes historicas no Google Sheets;
- importar automaticamente item ambiguo;
- tratar ausencia de categoria, conta, identidade ou evidencia como zero;
- reconstruir a serie historica das Caixinhas;
- ativar writer, WhatsApp, Pluggy ou deploy de producao.

## Invariantes

1. Conta e cartao permanecem fontes distintas mesmo com o mesmo banco/titular.
2. Linha existente ou possivel duplicata nunca entra no lote gravavel.
3. Cartoes e catalogo pessoal A:H; Lancamentos Cartao e fonte consolidada A:J.
4. Mes derivado de `bill_id` exige mesma conta e fatura Pluggy real.
5. Categoria pronta exige decisao explicita ou evidencia deterministica.
6. Aplicacao/resgate de reserva e neutro em receita e despesa.
7. Estorno exige vinculo forte; pagamento de fatura nao vira gasto.
8. O planejador puro sempre retorna `financial_writes=0`.
9. Writer futuro exige hash, backup, idempotencia, recibo, rollback e auditoria.

## Etapas

1. [concluida] Provar por escrita e limpeza sinteticas qual planilha o bot usa.
2. [concluida] Invalidar o snapshot central e capturar a planilha pessoal.
3. [concluida] Atualizar Pluggy read-only e fechar cobertura temporal.
4. [concluida] Adaptar configurador e planejador ao schema consolidado.
5. [concluida] Vincular meses de fatura por conta e `bill_id` com prova causal.
6. [concluida] Reusar `card-itau` e criar/reler somente a conta Cristina/Nubank.
7. [em andamento] Recalcular o plano real e resolver revisoes privadas; regras
   semanticas e 32 pares familiares bilaterais reduziram as revisoes de 1.248
   para 770; rendimentos confirmados de Caixinha e quatro pares de estorno
   pre-salvamento reduziram o residual a 727, sem escrita.
8. [concluida] Executar a bateria hermetica ampla do candidato privado inicial:
   106/106 verdes; candidato familiar posterior: 111/111 verdes.
9. [concluida] Publicar `fe374a3ee3a67457c02e74268984c7428fbcb2ac` e
   obter `GO TECNICO LOCAL` independente no escopo read-only.
9.1. [concluida] O hash `e9a73b8a6d982d94941dfc73d9b1f393f561e0fd`
   recebeu `NO-GO` por aceitar decisoes privadas em caminho absoluto dentro do
   repositorio; a fronteira foi fechada, a bateria ampla permaneceu 106/106 e
   `87f5e9ad767301cb3ec34197ca13cd470ade55af` recebeu `GO TECNICO LOCAL` em
   reauditoria independente, sem achados ou lacuna indispensavel.
9.2. [concluida] O pareamento familiar bilateral no hash
   `c5d325927721436432d2d38caa7366c77ab1d732` recebeu `GO TECNICO LOCAL`
   independente, sem achados ou lacuna indispensavel.
9.3. [NO-GO independente] O hash
   `2577ebc49efbfa18c845fe77e6c9e9954b00f109` recebeu um achado ALTO porque a
   prova de ausencia do credito consultava Saidas, mas nao Entradas.
9.4. [GO tecnico local independente] Neutralizacao de estorno pre-salvamento exige par
   mutuamente unico, mesma conta bancaria, valor oposto, semantica explicita,
   identidades estaveis, ate 30 dias e ausencia dos dois lados na aba coerente
   com sua direcao; o teste novo prova estorno ja salvo em Entradas. Focal
   31/31, bateria ampla 115/115 e `financial_writes=0`; o hash
   `6dc4e7e36e36f011fa3252412aae36071d654e1e` recebeu `GO TECNICO LOCAL`,
   zero achados e nenhuma lacuna indispensavel no escopo read-only.
10. [bloqueada ate GO] Implementar e ensaiar writer historico idempotente.
11. [bloqueada ate GO e backup] Aplicar lote real com recibo e rollback.

## Criterios de GO do planejador

- toda transacao recebe exatamente um estado terminal;
- cobertura temporal completa;
- quatro contas e quatro cartoes relevantes vinculados sem mistura;
- existentes e duplicatas fora do conjunto gravavel;
- nenhum mes de fatura ou categoria fraca inventado;
- reservas, transferencias, estornos e pagamentos possuem provas proprias;
- relatorio privado fora do Git;
- `financial_writes=0` em execucao local e testes;
- auditoria independente sem lacuna indispensavel.

## Condicoes de parada

- snapshot ou inventario divergente;
- dados reais aparecerem em diff, logs publicos ou stdout;
- item sem conta/cartao, identidade ou evidencia ser marcado como pronto;
- qualquer escrita historica antes do GO independente.

## Proxima acao

Tratar duplicatas e categorias residuais somente com
evidencia privada confirmada, sem habilitar writer historico, importacao real
ou deploy.
