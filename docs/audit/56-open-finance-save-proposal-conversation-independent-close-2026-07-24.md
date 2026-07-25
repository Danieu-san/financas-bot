# 9P.2 — fechamento independente da entrega e captura da proposta

Atualizado em: 2026-07-24

Commit de recuperação auditado:
`b52b7879fd5a795a436b4f6332294052732ebe7a`.

Parent direto:
`8e7a4716391e4fdcf32fe8ea30c341ec4d1b2f1c`.

Conversa independente da reauditoria:
`https://chatgpt.com/c/6a63fcd9-301c-83e9-bc84-9c466d6e5707`.

Conversa independente do primeiro candidato:
`https://chatgpt.com/c/6a63fa36-b25c-83e9-adc4-782d546f9077`.

## Estado

`GO TÉCNICO LOCAL`.

## Sequência probatória

O primeiro candidato, no commit
`8e7a4716391e4fdcf32fe8ea30c341ec4d1b2f1c`, recebeu `NO-GO` independente
com `CRITICAL 0`, `HIGH 0`, `MEDIUM 1` e `LOW 0`. O achado era causal:
`accepted_unconfirmed` impedia retry do transporte, mas ainda podia habilitar
uma resposta financeira sem prova positiva de que a pergunta havia chegado ao
WhatsApp.

O commit de recuperação separou as duas garantias:

- `accepted_unconfirmed` continua terminal para retry automático e preserva a
  confirmação pronta;
- somente `delivered_confirmed` cria o índice conversacional auxiliar e torna a
  proposta elegível para `sim`, `não` ou `cancelar`;
- uma resposta genérica durante transporte ambíguo retorna `handled=false`,
  não consome a proposta e mantém `financial_writes=0`;
- a recuperação após restart continua baseada no estado durável e volta a
  funcionar quando existir confirmação positiva de entrega.

## Veredito independente

Na reauditoria, o Chat confirmou o hash completo, o parent direto, o diff de
sete arquivos e a leitura integral do manifesto de recuperação e dos cinco
arquivos causais pedidos. A revisão concluiu:

- fechamento do `MEDIUM`: suficiente;
- `delivered_confirmed` é o único estado que cria estado auxiliar ou
  elegibilidade de resposta;
- `accepted_unconfirmed` permanece at-most-once, sem retry e sem autorização
  de resposta;
- `CRITICAL 0`, `HIGH 0`, `MEDIUM 0`, `LOW 0`;
- nenhuma lacuna causal indispensável dentro do contrato local;
- `9P.2: GO TÉCNICO LOCAL`.

O auditor fez revisão estática do commit publicado e não executou os testes
locais.

## Evidência executada pelo Codex

Antes do primeiro candidato:

- bateria causal focada: `44/44`;
- máquina de estados completa: `122/122`;
- todos os testes Open Finance: `244/244`;
- runner hermético: `1.293/1.298`, zero falhas e cinco skips previstos;
- cobertura: linhas `90,10%`, branches `72,21%`, funções `89,92%`;
- workflow portátil e `git diff --check`: verdes.

Depois da recuperação:

- correção causal e runtime: `16/16`;
- todos os testes Open Finance: `244/244`;
- workflow portátil e `git diff --check`: verdes.

O runner hermético global e a máquina de estados não foram repetidos depois da
microcorreção de elegibilidade. A regressão Open Finance completa cobriu os
dois estados alterados; as contagens anteriores permanecem identificadas como
evidência do candidato imediatamente anterior.

## Alcance

O fechamento autoriza apenas encerrar tecnicamente o gate local e avançar para
a próxima fatia já registrada. Não houve nem está autorizado:

- deploy ou produção Oracle/AWS;
- Pluggy, Google ou WhatsApp reais;
- promoção do modo proativo, que continua desligado por padrão;
- alteração de `OPEN_FINANCE_WRITE_MODE=off`;
- escrita em planilha, ledger ou qualquer writer financeiro.

## Próximo estado

9P.2 está encerrado. O próximo gate já delimitado pelo roadmap é `9P.3`:
revisão e correção guiada da proposta aceita — pessoa, categoria, forma de
pagamento, conta e cartão — ainda sem escrita financeira. Revalidação final,
operation key, recibo e writer pertencem a gate posterior.
