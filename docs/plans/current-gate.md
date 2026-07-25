# Gate ativo — 9P.3 revisão e correção guiada da proposta Open Finance

Atualizado em: 2026-07-24

Base:
`b52b7879fd5a795a436b4f6332294052732ebe7a`.

## Estado

`CANDIDATO LOCAL VERDE; COMMIT IMUTÁVEL E AUDITORIA INDEPENDENTE PENDENTES`.

9P.0 encerrou a proposta reconciliada em shadow; 9P.1, a confirmação local
durável; e 9P.2, a entrega confirmada e a captura pública de
`sim/não/cancelar`. O commit imutável de recuperação de 9P.2
`b52b7879fd5a795a436b4f6332294052732ebe7a` recebeu `GO TÉCNICO LOCAL`
independente, sem achados `CRITICAL`, `HIGH`, `MEDIUM` ou `LOW`.

O próximo elo já registrado é permitir que a proposta aceita seja conferida e
corrigida antes de qualquer autorização de escrita.

## Objetivo

Depois de uma proposta entregue e aceita pelo familiar autorizado, apresentar
os campos financeiros inferidos e permitir revisão/correção guiada de pessoa,
categoria, forma de pagamento, conta e cartão. A conversa deve terminar em um
estado local pronto para revalidação posterior, sem gravar planilha ou ledger.

## Escopo

- entrada somente a partir de proposta 9P.2 aceita e vinculada ao ator;
- resumo explícito dos campos presentes, ausentes e incertos;
- correção guiada de pessoa, categoria, forma de pagamento, conta e cartão;
- opções derivadas dos catálogos financeiros autorizados, sem inventar fonte
  ausente;
- uma decisão conversacional por vez, serializada pelo handler público;
- cancelamento e expiração fail-closed;
- estado local durável e recuperável após restart;
- mensagem explícita de que a revisão ainda não salvou o lançamento;
- `financial_writes=0` em todos os caminhos.

## Não escopo

- revalidação final contra Sheets/ledger;
- operation key e recibo de escrita;
- autorização final de persistência;
- qualquer escrita em Sheets, ledger ou Google;
- alteração de `OPEN_FINANCE_WRITE_MODE=off`;
- deploy, produção, Oracle/AWS, Pluggy ou WhatsApp reais.

## Contrato

1. somente proposta aceita e entregue com prova positiva pode abrir revisão;
2. o ator da revisão deve ser o familiar vinculado à confirmação;
3. valores atuais permanecem preservados até uma correção válida e explícita;
4. opções de pessoa, categoria, pagamento, conta e cartão vêm de fontes
   autorizadas e respeitam dependências entre os campos;
5. resposta inválida, ambígua, de terceiro, expirada ou fora de ordem não avança
   estado;
6. restart recupera a etapa e os valores já confirmados sem duplicar decisão;
7. cancelamento é terminal e replay não reabre a revisão;
8. nenhum caminho desta fatia chama writer financeiro.

## Critérios de GO

- RED causal antes da integração;
- abertura somente após aceitação válida de 9P.2;
- pessoa, categoria, pagamento, conta e cartão exercitados individualmente e
  em combinações causais;
- opções reais do catálogo e ausência de fonte tratada como ausência, nunca
  como zero ou valor inventado;
- ator correto, bloqueio de terceiro e de respostas fora de ordem;
- cancelamento, expiração, replay e recuperação após restart;
- entrada pública real do handler exercitada;
- testes afetados e gate Open Finance verdes;
- commit sanitizado e auditoria independente por hash imutável sem achado
  bloqueante.

## Condições de parada

- qualquer escrita financeira;
- abertura de revisão sem proposta aceita e entrega confirmada;
- alteração silenciosa de campo não escolhido;
- opção proveniente de outro usuário ou catálogo não autorizado;
- perda ou reabertura de decisão após restart;
- necessidade de produção ou integração real.

## Evidência local

9P.2 recebeu `GO TÉCNICO LOCAL` independente no commit
`b52b7879fd5a795a436b4f6332294052732ebe7a`. O fechamento está em
`docs/audit/56-open-finance-save-proposal-conversation-independent-close-2026-07-24.md`.

O candidato 9P.3 possui:

- conversa/store: `15/15`;
- catálogo: `2/2`;
- runtime prompt/shadow: `8/8`;
- máquina de estados e entrada pública: `122/122`;
- runner hermético: `1.302/1.307`, zero falhas e cinco skips previstos;
- cobertura: linhas `90,12%`, branches `72,23%`, funções `90,01%`;
- sintaxe, workflow portátil e `git diff --check`: verdes.

Manifesto:
`docs/audit/57-open-finance-save-proposal-guided-review-candidate-2026-07-24.md`.

## Próxima ação exata

Criar e publicar o commit sanitizado do candidato e submetê-lo à auditoria
independente por hash imutável.

## Capacidade

`Codex → Sol → Alto → publicar e auditar o candidato imutável do 9P.3.`
