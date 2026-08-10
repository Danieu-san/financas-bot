# Gate 37 - transferencias e reservas patrimoniais read-only

Atualizado em: 2026-08-10

Estado: `GO TECNICO LOCAL INDEPENDENTE; SEM DEPLOY`.

## Objetivo

Transformar as transferencias e os movimentos de reserva adiados pelo Gate 36
em revisoes proativas, familiares, duraveis e explicitamente acionaveis, sem
criar receita, despesa ou qualquer escrita financeira.

## Contrato causal

- somente observacao `POSTED/new` participa;
- par interno exige contas bancarias distintas, sinais opostos, valor absoluto
  exato, janela de dois dias e referencia forte compartilhada do provedor;
- valor, data ou descricao, isolados ou combinados sem referencia forte, nunca
  formam um par;
- uma ponta com mais de uma contraparte forte permanece nao pareada e revisavel;
- transferencia nao pareada permanece alertavel e recebe revisao explicita;
- `operation_type` reconhecido pode sugerir aplicacao, resgate ou rendimento;
- descricao com Caixinha/reserva apenas abre revisao sem sugerir semantica;
- aplicacao e resgate confirmados permanecem transferencia patrimonial;
- rendimento confirmado permanece ganho, sem ser confundido com principal;
- uma unica revisao representa um par forte e a outra ponta nao cria decisao
  concorrente;
- store cifrado, escopo familiar, restart, expiracao e conflito terminal do Gate
  36 continuam obrigatorios;
- todos os caminhos retornam `financial_writes=0`.

## Fora de escopo

- salvar em Sheets ou ledger;
- habilitar escrita, segunda confirmacao ou recibo, pertencentes ao Gate 38;
- reconstruir o historico de Caixinhas bloqueado no Gate 35;
- promover ou executar smoke na OCI;
- inferir identidade por descricao, data ou valor.

## Evidencia minima

1. RED focal para par forte, falso par por valor/data, multiplicidade, ponta nao
   pareada, aplicacao, resgate, rendimento e descricao sem semantica;
2. store e conversa reais para decisoes de transferencia e reserva;
3. outbox e formatador reais com apenas um prompt por par;
4. runtime real read-only com zero propostas e zero escrita;
5. bateria causal e uma unica suite hermetica ampla final;
6. commit sanitizado, GitHub e auditoria independente por hash imutavel.
