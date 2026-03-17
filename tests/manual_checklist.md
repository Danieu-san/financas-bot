# Checklist de Testes Manuais - FinancasBot

Este documento descreve os fluxos de conversa que devem ser validados manualmente via WhatsApp para garantir a integridade da máquina de estados e das integrações.

## 1. Fluxos Básicos de Transação (Texto)

### 1.1 Gasto Único (Fluxo Completo)
- [ ] **Mensagem:** "Gastei 50 reais com pizza hoje"
- [ ] **Resposta esperada:** Pergunta sobre a forma de pagamento (Crédito, Débito, PIX ou Dinheiro).
- [ ] **Ação:** Responder "PIX".
- [ ] **Resultado:** Confirmação de salvamento na aba 'Saídas' com valor 50, categoria Alimentação (via IA), subcategoria Restaurante/Delivery e data de hoje.

### 1.2 Entrada Única (Fluxo Completo)
- [ ] **Mensagem:** "Recebi 2000 de salário"
- [ ] **Resposta esperada:** Pergunta onde recebeu (Conta Corrente, Poupança, PIX ou Dinheiro).
- [ ] **Ação:** Responder "Conta Corrente".
- [ ] **Resultado:** Confirmação de salvamento na aba 'Entradas' com valor 2000 e categoria Salário.

### 1.3 Registro em Lote (Batch)
- [ ] **Mensagem:** "Paguei 100 de luz, 50 de internet e 30 de água"
- [ ] **Resposta esperada:** Lista dos 3 itens e pergunta se confirma (Sim/Não).
- [ ] **Ação:** Responder "Sim".
- [ ] **Resposta esperada:** Pergunta a forma de pagamento para os itens.
- [ ] **Ação:** Responder "Débito".
- [ ] **Resultado:** Confirmação de que os 3 itens foram salvos na aba 'Saídas'.

## 2. Fluxos de Cartão de Crédito (Parcelamento)

### 2.1 Gasto Único no Crédito (À Vista)
- [ ] **Mensagem:** "Comprei uma blusa de 80 reais" -> Responder "Crédito".
- [ ] **Resposta esperada:** Lista de cartões configurados (Nubank Daniel, Nubank Thais, etc).
- [ ] **Ação:** Escolher um número (ex: "1").
- [ ] **Resposta esperada:** Pergunta o número de parcelas.
- [ ] **Ação:** Responder "1".
- [ ] **Resultado:** Registro na aba do cartão escolhido com a fatura correta (baseada no dia de fechamento).

### 2.2 Gasto Único no Crédito (Parcelado)
- [ ] **Mensagem:** "Comprei uma TV de 2000" -> Responder "Crédito" -> Escolher cartão.
- [ ] **Ação:** Responder "10" (parcelas).
- [ ] **Resultado:** Registro de 10 linhas na aba do cartão, com valores de R$ 200,00 e meses de cobrança sequenciais (ex: 1/10 em Março, 2/10 em Abril...).

### 2.3 Registro em Lote no Crédito (Mesmo parcelamento)
- [ ] **Mensagem:** "Gastei 100 no mercado e 50 na farmácia" -> Confirmar "Sim" -> Responder "Crédito" -> Escolher cartão.
- [ ] **Resposta esperada:** Opções de parcelamento (1. À vista, 2. Mesmo nº de parcelas, 3. Parcelas diferentes).
- [ ] **Ação:** Responder "1" (Tudo à vista).
- [ ] **Resultado:** Registro de ambos os gastos na aba do cartão para a fatura atual.

### 2.4 Registro em Lote no Crédito (Parcelas Diferentes via IA)
- [ ] **Mensagem:** "Comprei um celular de 1200 e uma capa de 50" -> Confirmar "Sim" -> Responder "Crédito" -> Escolher cartão.
- [ ] **Ação:** Responder "Celular em 12x e a capa à vista".
- [ ] **Resultado:** O bot deve usar a IA para mapear 12 parcelas para o celular e 1 para a capa, registrando todas as linhas corretamente na planilha do cartão.

## 3. Fluxo de Áudio
- [ ] **Ação:** Enviar áudio: "Oi bot, registra pra mim um gasto de 30 reais com Uber que eu paguei no PIX agora".
- [ ] **Resultado:** O bot deve transcrever o áudio e, como o método de pagamento já foi dito, salvar direto ou pedir confirmação (depende da clareza da transcrição).
- [ ] **Validação:** Verificar se o texto transcrito aparece no log e se a transação foi salva.

## 4. Gestão de Dívidas

### 4.1 Criar Nova Dívida (Fluxo Multi-etapa)
- [ ] **Mensagem:** "Criar dívida"
- [ ] **Fluxo:** Responder Nome -> Credor -> Tipo -> Valor -> Saldo -> Parcela -> Juros -> Vencimento -> Data Início -> Total Parcelas -> Observação.
- [ ] **Resultado:** Nova linha na aba 'Dívidas' com cálculos de vencimento e atraso automáticos.

### 4.2 Registrar Pagamento de Dívida
- [ ] **Mensagem:** "Paguei o financiamento do carro" (Assumindo que existe essa dívida).
- [ ] **Resposta esperada:** Confirmação da dívida encontrada e pergunta o valor pago.
- [ ] **Ação:** Informar o valor (ex: "500").
- [ ] **Resultado:** O saldo devedor na aba 'Dívidas' deve ser subtraído e o % quitado atualizado.

## 5. Gestão de Metas
- [ ] **Mensagem:** "Criar meta"
- [ ] **Fluxo:** Responder Nome -> Valor Alvo -> Valor Atual -> Data Final -> Prioridade.
- [ ] **Resultado:** Nova linha na aba 'Metas' com a fórmula de progresso e cálculo de quanto economizar por mês.

## 6. Perguntas Analíticas (Inteligência Artificial)
- [ ] **Pergunta:** "Quanto eu gastei com alimentação em Março?"
- [ ] **Pergunta:** "Qual foi meu maior gasto esse mês?"
- [ ] **Pergunta:** "Quanto ainda tenho de saldo nas entradas?"
- [ ] **Pergunta:** "Liste meus gastos com Uber na última semana"
- [ ] **Resultado:** Respostas em linguagem natural baseadas nos dados reais das planilhas.

## 7. Exclusão de Itens
- [ ] **Mensagem:** "Apagar último gasto"
- [ ] **Resposta esperada:** Mostra os detalhes do último item e pergunta "Você tem certeza?".
- [ ] **Ação:** Responder "Sim".
- [ ] **Resultado:** Linha removida da aba 'Saídas'.

- [ ] **Mensagem:** "Apagar gasto com pizza"
- [ ] **Resultado:** Deve listar itens que combinam e pedir para escolher qual apagar.

## 8. Lembretes (Google Calendar)
- [ ] **Mensagem:** "Me lembre de pagar o IPVA amanhã às 9h"
- [ ] **Resultado:** Evento criado no Google Calendar e resposta de confirmação do bot.

## 9. Casos de Borda e Erros
- [ ] **Valor ausente:** "Gastei com mercado" -> Deve informar que não encontrou o valor.
- [ ] **Cancelar fluxo:** No meio de um fluxo de criação, digitar "cancelar" -> Deve limpar o estado do usuário.
- [ ] **Comando desconhecido:** Enviar algo aleatório ("Abacaxi azul") -> Deve ignorar ou dar resposta amigável de não entendido.
- [ ] **Rate Limit:** Tentar enviar 10 mensagens em menos de 5 segundos -> O bot deve parar de responder temporariamente para aquele usuário.
