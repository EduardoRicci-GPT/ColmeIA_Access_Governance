# ADR-0007 — O motor de acesso não recebe dado clínico

- **Estado:** aceito
- **Data:** 2026-09-11

## Contexto

A pergunta operacional do produto é sempre a mesma: "esta porta deve abrir para
esta pessoa agora?". Responder a ela não exige saber que o paciente do leito 12
tem tuberculose. Exige saber que o leito 12 está sob precaução respiratória e
que a política dessa restrição admite determinados perfis.

A distinção não é de elegância. Um sistema de controle de acesso que recebe dado
clínico passa a ser, para efeito de LGPD e de política hospitalar, um sistema
que trata dado de saúde: muda o regime jurídico, muda o inventário de dados,
muda quem pode operá-lo e muda o que acontece quando ele é comprometido.

## Decisão

Uma camada de projeção (`packages/context-projection`) é a **única** autorizada
a produzir `AtributosDeContexto`, e ela o faz a partir de sistemas externos
(RH, prontuário, ordem de serviço, escala) transformando registro em atributo
mínimo:

```
precaução = AEROSOL  →  access_restriction_policy = RESPIRATORY_ISOLATION
                        restriction_level = 3
```

Três propriedades sustentam a camada:

**Lista de recusa explícita e testada.** `CAMPOS_CLINICOS_PROIBIDOS` cobre
diagnóstico, CID, notas clínicas, evolução, exames, laudo, prescrição,
medicação, alergia, procedimento, comorbidade e prognóstico, em português e em
inglês, por igualdade e por inclusão — `lab_result_final` e
`medicacao_em_uso` são recusados.

**O padrão é descartar.** Campo desconhecido do sistema de origem NÃO entra "por
via das dúvidas". O inventário de dados do produto é a lista fechada de
atributos, e precisa continuar sendo.

**Guarda de saída redundante.** `auditarProjecao()` roda sobre o objeto já
projetado e falha se qualquer chave proibida atravessou. É redundante em relação
ao filtro de entrada, e é para ser: uma camada que protege dado de saúde não
deve depender de um único ponto de verificação.

## Consequência que vale registrar

A projeção é **irreversível**. Do atributo `RESPIRATORY_ISOLATION` não se
reconstrói o diagnóstico. Isso é recurso, não limitação: permite que o motor de
acesso rode em infraestrutura de facilities, seja operado por segurança
patrimonial e seja auditado por TI, sem arrastar o prontuário junto.
