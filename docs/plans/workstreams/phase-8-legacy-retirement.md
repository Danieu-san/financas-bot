# Plano - Fase 8, aposentadoria de legado

Status: `PHASE8-OBS-01` candidato local.

## Objetivo

Consertar a prova de observacao antes de decidir o primeiro soft-disable
reversivel da Fase 8.

## Base

`db517c56f1315546bc5498edfabae697537c8971`.

## Escopo

- ler arquivo ativo e backups limitados da telemetria;
- provar causalmente que uso real em rotacao nao vira falso zero;
- preservar contadores allowlisted e contabilizacao de linhas invalidas;
- auditar a correcao por commit imutavel.

## Nao escopo

- alterar producao, flags ou processo;
- soft-disable ou exclusao de codigo;
- migrar cartoes ou dashboard;
- deploy do conjunto funcional acumulado.

## Invariantes

1. Evidencia rotacionada tem o mesmo peso causal da evidencia no arquivo ativo.
2. Probe sintetica nao equivale a uso real.
3. Linha invalida impede prova limpa.
4. Zero observado nao autoriza mudanca operacional automaticamente.
5. Producao OCI permanece intocada.

## Etapas

1. [concluido] Inspecionar OCI em modo somente leitura.
2. [concluido] Reproduzir o falso zero com evento no backup `.1`.
3. [concluido] Corrigir o carregamento e passar a bateria focal.
4. [pendente] Publicar commit sanitizado e obter auditoria independente.
5. [pendente] Registrar GO/NO-GO sem alterar producao.

## Criterios de GO

- RED causal documentado;
- arquivo ativo e rotacoes limitadas agregados;
- evento real em backup obrigatoriamente contado;
- invalid JSON contabilizado;
- testes focais verdes;
- auditoria independente sem lacuna indispensavel.

## Condicoes de parada

- arquivo rotacionado omitido;
- duplicacao de eventos pelo carregador;
- evidencia sintetica classificada como real;
- necessidade de alteracao remota;
- NO-GO independente.

## Proxima acao

Criar o commit candidato sanitizado e publica-lo para auditoria independente.

