# Gate ativo — 9P.2 entrega e captura local da proposta Open Finance

Atualizado em: 2026-07-24

Base:
`ae9c7df91b0015d9812afdd0e06db6399254851a`.

## Estado

`CANDIDATO LOCAL VERDE; COMMIT IMUTÁVEL E AUDITORIA INDEPENDENTE PENDENTES`.

9P.0 encerrou a proposta reconciliada em shadow. 9P.1 encerrou a confirmação
local, durável e de uso único no commit imutável
`a2c15b6dd7e52ef7aff8dc3ac4a4050e9adbc445`, com `GO TÉCNICO LOCAL`
independente e sem achados `CRITICAL`, `HIGH` ou `MEDIUM`.

O próximo elo definido no roadmap é unir a proposta ao transporte WhatsApp e à
entrada pública de mensagens, sem conceder escrita financeira.

## Objetivo

Quando o polling produzir uma compra `POSTED`, realmente nova e já reconciliada,
preparar uma confirmação para o familiar explicitamente autorizado, enviar um
resumo com pergunta de salvamento e capturar `sim`, `não` ou `cancelar` pela
entrada pública do bot. A resposta somente resolve a proposta local; nunca
grava planilha ou ledger nesta fatia.

## Escopo

- novo modo explícito de proposta proativa, desligado por padrão;
- vínculo causal entre observação reconciliada, proposta, alerta e confirmação;
- preparação durável da confirmação antes do transporte;
- no máximo uma confirmação pronta por familiar;
- recuperação da confirmação pronta depois de restart ou perda do estado
  conversacional auxiliar;
- `sim` aceita para a próxima etapa; `não` recusa; `cancelar` cancela;
- resposta somente do destinatário familiar vinculado;
- mensagem clara de que nada foi salvo ainda;
- transporte ambíguo permanece at-most-once e não dispara retry automático;
- `financial_writes=0` em todos os caminhos.

## Não escopo

- correção guiada de pessoa, categoria, pagamento, conta ou cartão;
- revalidação final contra Sheets/ledger;
- operation key e recibo de escrita;
- qualquer escrita em Sheets, ledger ou Google;
- alteração de `OPEN_FINANCE_WRITE_MODE=off`;
- deploy, produção, Oracle/AWS, Pluggy ou WhatsApp reais.

## Contrato

1. somente proposta ligada a decisão `new`, compra `POSTED` e política familiar
   explícita pode gerar pergunta;
2. confirmação é preparada antes do transporte e o replay reutiliza a mesma
   referência;
3. um familiar não recebe segunda pergunta enquanto existir confirmação pronta;
4. o estado durável da proposta é a fonte de verdade; estado conversacional é
   somente índice auxiliar recuperável;
5. respostas de terceiro, expiradas, ambíguas ou sem proposta pronta falham
   fechadas;
6. `sim`, `não` e `cancelar` passam pelo handler público serializado por
   remetente;
7. falha definitiva antes do envio libera o alerta para retry; envio aceito sem
   confirmação do provedor permanece `accepted_unconfirmed`;
8. nenhum caminho desta fatia chama writer financeiro.

## Critérios de GO

- RED causal antes da integração;
- provas de vínculo observação→proposta→alerta→confirmação;
- destinatário correto e bloqueio de terceiro;
- uma proposta ativa por ator e recuperação após restart;
- sucesso, recusa, cancelamento, expiração, replay e transporte ambíguo;
- entrada pública real do handler exercitada;
- testes afetados e gate Open Finance verdes;
- commit sanitizado e auditoria independente por hash imutável sem achado
  bloqueante.

## Condições de parada

- qualquer escrita financeira;
- pergunta para observação matched, duplicada, incerta, incompleta, ambígua,
  `PENDING` ou não compra;
- token bruto em logs, mensagem ou estado conversacional;
- segunda confirmação pronta para o mesmo ator;
- necessidade de produção ou integração real.

## Evidência local atual

- bateria causal focada: `44/44`;
- máquina de estados completa: `122/122`;
- todos os testes Open Finance: `244/244`;
- runner hermético: `1.293/1.298`, zero falhas e cinco skips previstos;
- cobertura: linhas `90,10%`, branches `72,21%`, funções `89,92%`;
- sintaxe e `git diff --check`: verdes.

## Próxima ação exata

Criar e publicar o commit sanitizado do candidato, submetê-lo uma vez ao Chat
por hash imutável e confrontar o parecer com a evidência local antes de fechar
ou corrigir o gate.

## Capacidade

`Codex → Sol → Alto → publicar e auditar o candidato imutável do 9P.2.`
