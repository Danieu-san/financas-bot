# 9P.1 — terceira recuperação com âncora independente do journal terminal

Atualizado em: 2026-07-24

Terceiro candidato auditado:
`3beef9309c5d8f857bc96a3de08965118fdb989b`.

## Estado

`RECUPERAÇÃO LOCAL VERDE; NOVO COMMIT IMUTÁVEL E REAUDITORIA PENDENTES`.

O Chat confirmou o hash, o parent direto
`5fbeb378ea666ae854b3ae7bad0069bdb9f53a15` e a leitura integral dos oito
arquivos solicitados. O veredito foi `NO-GO` por um achado `MEDIUM`: o journal
terminal impedia rollback do preview enquanto permanecia íntegro, mas sua
exclusão, truncamento lógico ou reversão para uma cópia válida anterior podia
ser combinada com reingestão ou restore para reabrir uma proposta terminal.

## Correção

- journal persistente recebe uma identidade aleatória autenticada no banco
  principal;
- uma âncora SQLite separada, fora do pacote de backup v3, persiste identidade,
  quantidade, última sequência e cabeça HMAC encadeada dos terminais;
- toda abertura e toda operação pública confrontam journal, metadados e âncora;
- exclusão ou truncamento do journal, rollback do journal, rollback da âncora e
  perda da própria âncora falham fechados;
- a âncora não pode compartilhar o arquivo do journal;
- divergência após falha entre os dois commits locais não é reparada
  automaticamente: a disponibilidade é sacrificada para não reabrir estado;
- journal legado sem terminais pode receber metadados e âncora iniciais;
  journal legado que já contenha terminais exige migração explícita;
- caminhos em memória mantêm uma âncora em memória apenas para testes e não são
  apresentados como proteção persistente.

## Provas causais

- arquivo inteiro do journal removido, com âncora preservada;
- tabela terminal truncada para vazio, com âncora preservada;
- arquivo do journal revertido à cópia anterior ao terminal;
- arquivo da âncora revertido à cópia anterior ao terminal;
- âncora apagada depois de existir;
- tentativa de usar o mesmo arquivo para journal e âncora;
- reingestão e nova preparação depois do truncamento são bloqueadas antes de
  reabrir a proposta aceita.

## Evidência local

- journal focal: `6/6`;
- journal, confirmação e backup: `22/22`;
- todos os testes Open Finance: `234/234` dentro do runner hermético;
- runner hermético final: `1.288` testes, `1.283` aprovados, zero falhas,
  cinco skips funcionais previstos e zero TODO;
- cobertura: linhas `90,04%`, branches `72,28%`, funções `89,88%`;
- `financial_writes=0` nos resultados e nenhum caminho de Sheets, ledger,
  transporte ou handler foi introduzido;
- sintaxe e `git diff --check`: verdes.

## Limite explícito

A âncora fecha perda ou rollback unilateral do journal e também perda ou
rollback unilateral da própria âncora. Rollback coordenado e consistente de
todos os armazenamentos locais independentes para o mesmo ponto anterior não é
detectável por software puramente local sem uma raiz monotônica externa. Esse
ataque mais amplo não deve ser confundido com rollback do próprio journal e
precisa ser avaliado explicitamente na reauditoria.

## Limites preservados

- bot familiar privado, uma única instância ativa;
- nenhuma pergunta WhatsApp ou parser de resposta;
- nenhuma escrita em Sheets, ledger ou Google;
- `OPEN_FINANCE_WRITE_MODE` permanece desligado;
- nenhuma produção, Oracle, AWS ou integração Pluggy real;
- esta recuperação não autoriza deploy.

## Perguntas para a reauditoria

1. A âncora independente e autenticada fecha exclusão, truncamento e rollback
   unilateral do journal sem conhecimento da chave?
2. A verificação em abertura e antes de toda operação impede reingestão,
   restore ou nova confirmação depois da divergência?
3. A perda ou reversão unilateral da própria âncora também falha fechada?
4. O limite de rollback coordenado de todos os armazenamentos locais é uma
   impossibilidade residual corretamente delimitada ou ainda bloqueia 9P.1?
5. Resta achado `CRITICAL`, `HIGH` ou `MEDIUM` dentro do contrato local 9P.1?
