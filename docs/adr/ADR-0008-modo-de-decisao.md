# ADR-0008 — Dois modos de decisão: ENTITLEMENT e ACCESS

- **Estado:** aceito
- **Data:** 2026-09-11

## Contexto

A escala hospitalar é o dado mais volátil do domínio. Um plantonista 07h–19h tem
direito à UTI, e não tem — depende da hora.

A leitura ingênua trata isso como uma coisa só: às 19h01 o direito deixa de
existir, a credencial é revogada; às 07h00 do dia seguinte é reemitida. Numa
rede com 3.000 colaboradores e 200 portas, isso significa dezenas de milhares de
comandos diários para os equipamentos, sem nenhuma segurança adicional — e com
uma consequência perversa: o equipamento fica ocupado sincronizando ruído
justamente na troca de plantão, que é o momento de maior movimento.

## Decisão

O Policy Engine opera em dois modos, declarados no pedido:

**`ENTITLEMENT` — "este direito deveria existir?"**
A escala NÃO decide. Ela é materializada como janela recorrente DENTRO do
direito e da credencial, e é o equipamento (ou o provedor) que a aplica. A
regra `R-TURNO` não se aplica neste modo.

**`ACCESS` — "esta pessoa pode entrar AGORA?"**
A escala decide, porque é a pergunta que um equipamento em modo online faz à
ColmeIA no instante em que alguém apresenta a credencial (item 16).

## Consequências

- H8 (mudança de escala) produz a ação `UPDATE_WINDOW`, não um par
  revogação + concessão. O direito permanece; a janela é recalculada e
  ressincronizada. O teste verifica os dois lados: que a janela nova foi
  persistida e que o ciclo seguinte **não** reemite a mesma ordem.
- Equipamentos sem `SCHEDULE_ENFORCEMENT` nas capacidades não conseguem aplicar
  a janela localmente. Para eles, a janela precisa ser aplicada em modo online
  ou o direito precisa ser materializado apenas durante o turno — decisão que
  cabe ao Capability Mapping do adaptador, e não ao domínio.
- O turno noturno (19h–07h) é tratado como intervalo contínuo, com o dia da
  semana verificado contra o dia do INÍCIO do turno. Sábado 03h ainda é o
  plantão de sexta, e o teste diz isso.
