# Dossiê de desenvolvimento — ColmeIA Access Governance

**Atualização:** 23/09/2026  
**Versão declarada do produto:** 0.1.0  
**Estado deste documento:** consolidação técnica e histórica; distingue código existente de arquitetura aprovada ainda não implementada.

## 1. Síntese executiva

O ColmeIA Access Governance já não é apenas uma prova conceitual de controle de acesso. O repositório possui núcleo TypeScript estrito, quatro motores determinísticos, reconciliação entre estado lógico e físico, auditoria encadeada por hash, HumanGate, assurance, Health Score explicável, simulação hospitalar, adaptadores de fabricantes em estado de interface e uma camada cognitiva governada baseada na Sinergentia³.

O princípio central permanece: **saber quem deveria entrar não é saber quem entra**. A arquitetura separa intenção institucional, entitlement, estado do provedor, estado do dispositivo e evidência física; por isso recusa reduzir acesso a um booleano.

O estágio atual é de **MVP lógico avançado / pré-piloto**. A governança em software está madura, mas a implantação real ainda depende de persistência transacional, integração com RH/RBAC/escala, hardware de bancada e canais operacionais reais.

## 2. Estado objetivo do repositório

- 166 arquivos versionados na árvore analisada;
- 118 arquivos TypeScript;
- 38 arquivos Markdown antes deste dossiê;
- 27 ADRs;
- 756 verificações automatizadas declaradas como aprovadas;
- 17 pacotes funcionais principais sob packages/;
- nenhum hardware real validado;
- persistência de execução ainda em memória;
- TTLock, Control iD e Seam em estado de interface/preparação, não de integração concluída.

## 3. Arquitetura existente

Os quatro motores determinísticos são:

1. **Policy Engine** — interpreta vínculo, função, contexto, turno, criticidade e regras.
2. **Entitlement Reconciliation** — calcula quais direitos deveriam existir.
3. **Physical State Reconciliation** — verifica a divergência entre direito desejado e materialização física.
4. **Observability & Assurance** — mede atraso, risco, indisponibilidade, Health Score e escalonamentos.

A IA opera sobre esses instrumentos, nunca no lugar deles.

O kernel MPE-H foi incorporado por cópia selada, com Ledger, HumanGate, Calibration, Filtro Zero, O Freio, guardrail estrutural e porta de leitura 360°. A integridade do espelho é verificada em bateria.

## 4. Governança humana já implementada

O produto já possui aprovação ligada ao conteúdo, alçada congelada no instante da decisão, vigência por criticidade, duas assinaturas em situações críticas, fila de aprovação, chamado de quem possui alçada, segregação de funções, responsabilidade temporária, competência/habilitação e break-glass assistencial.

A auditoria separa atos DIRETIVOS, CONSULTIVOS, EXECUTIVOS e HUMANOS, permitindo reconstruir decisão, recomendação, execução e evidência.

## 5. Assurance, honestidade e Health Score

O sistema não declara estado físico que não confirmou. A guarda de honestidade substitui frases categóricas por formulações compatíveis com a evidência disponível.

O Health Score é explicável e hierárquico. Os pesos atuais permanecem em SOMBRA até calibração com instalação real.

## 6. Sinergentia³

A Sinergentia entra como cascata de **faculdades**, não como provedor obrigatório. O degrau determinístico é sempre consultado primeiro. A camada cognitiva não decide acesso, não age externamente e não produz números de autoridade.

Há ancoragem para identificadores e números: se uma faculdade introduzir âncora inexistente no material, a prosa é descartada e o material determinístico é entregue.

A inserção de faculdade externa ainda precisa fechar quatro amarras antes de uso real: recorte prévio, custo estimado, HumanGate quando houver saída de informação sensível e registro do que saiu da instituição.

## 7. Arquitetura aprovada após o último ciclo de código

As decisões abaixo foram consolidadas entre 20 e 23/09/2026 e **ainda não devem ser tratadas como IMPLEMENTED**.

### 7.1 Operational Presence Session

O registro de ponto deve iniciar uma sessão operacional de presença. O direito do trabalhador passa a ser contextualizado por cadastro, vínculo, escala, unidade, setor, horário, responsabilidade e credencial durante aquele plantão.

O objetivo é reduzir direitos permanentes e aproximar autorização do contexto real de trabalho.

### 7.2 Dupla checagem invisível e fluxo de pacientes/temporários

A arquitetura prevê credencial física ou digital combinada com verificação 1:1 quando aplicável. Baixa confiança não equivale automaticamente a fraude; deve produzir revisão humana.

Pacientes, acompanhantes, visitantes e terceiros devem operar com credenciais temporárias, prazo e finalidade explícitos. Biometria continua tratada como método de credencial, sem transformar template biométrico em dado de domínio do produto.

### 7.3 AccessSubject

O sujeito de acesso deve evoluir de uma pessoa para um conceito genérico AccessSubject, capaz de representar pessoas, equipamentos, robôs, AMRs, agentes digitais e identidades de serviço.

Capacidade técnica não cria autoridade. Para entidades não humanas, grants devem derivar de missão, rota, tempo, responsabilidade, política, confiança e contexto — e expirar ao terminar a missão.

### 7.4 Device Trust

Surge uma camada separada entre capacidade técnica e confiança operacional. Suportar um protocolo não implica ser dispositivo confiável.

A evolução prevista inclui DeviceTrustAssessment, estado de postura, vulnerabilidade, patch, exposição, integridade e eventos como DeviceTrustDegraded, DeviceTrustRestored e SecurityReviewRequired.

### 7.5 Security Sentinel

O Security Sentinel deve ser uma faculdade/especialista residente de segurança, responsável por observar eventos físicos e digitais, correlacionar padrões, produzir relatórios e acionar TI quando houver risco relevante.

Ele não deve aprender um ataque e alterar defesa automaticamente. O ciclo aprovado é:

**observação → incidente → análise → hipótese → teste → validação → aprovação humana → alteração controlada**.

A finalidade é preservar governança e impedir que uma entrada maliciosa consiga induzir mudança autônoma da própria defesa.

## 8. Fronteiras para o próximo estágio

A sequência recomendada para aproximar o produto do mundo real é:

**PostgreSQL → identidade/RBAC/escala → bancada de hardware → canais reais de aviso → Operational Presence Session → Device Trust/Sentinel → piloto hospitalar controlado.**

Em paralelo, a Sinergentia externa deve receber governança de egresso antes de qualquer chamada remota em ambiente institucional.

## 9. Dívida documental encontrada e corrigida neste ciclo

O README ainda indicava 522 verificações e dezenove ADRs. O estado corrente é de **756 verificações** e **27 ADRs**. Esta atualização corrige essas referências e incorpora a evolução conceitual recente sem falsear maturidade de implementação.

## 10. Definição atual do produto

A descrição mais precisa já não é simplesmente “controle de acesso”.

O ColmeIA Access Governance está evoluindo para uma **camada de governança, assurance e reconciliação de direitos físicos e digitais para ambientes institucionais críticos**.

Seu diferencial não está na fechadura, mas no intervalo entre a decisão institucional e aquilo que o mundo físico efetivamente executou — intervalo no qual surgem permissões residuais, falhas de sincronização, exceções assistenciais, conflitos de responsabilidade, degradação de confiança e riscos de segurança.
