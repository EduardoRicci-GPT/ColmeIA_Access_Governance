// ---------------------------------------------------------------------------
// POLICY ENGINE — tipos
//
// Primeiro dos quatro motores. Responde a uma pergunta estreita e só a ela:
// dado um pedido, um contexto e um conjunto de regras, o direito DEVERIA
// existir? Não emite credencial, não fala com fabricante, não sabe se há porta.
//
// Essa estreiteza é o que permite auditar a decisão isoladamente meses depois:
// a decisão é uma função pura de (regras, entrada) — mesma entrada, mesma
// saída, para sempre.
// ---------------------------------------------------------------------------

import { CredentialMethod, Criticidade } from '../dominio/topologia';
import { LeituraDeCompetencia } from '../governanca/competencia';
import { DecisionOrigin } from '../dominio/eventos';

/**
 * Atributos de contexto — a superfície MÍNIMA que o motor aceita.
 *
 * Item 24/25: o que entra aqui é política de acesso, não prontuário. A camada
 * de projeção (`context-projection`) é a única autorizada a produzir este
 * objeto, e ela o produz a partir de sistemas clínicos SEM carregar diagnóstico,
 * evolução ou resultado de exame. O tipo é fechado de propósito: um campo novo
 * exige decisão explícita e revisão, e não passa despercebido num `any`.
 */
export interface AtributosDeContexto {
  organizationId: string;
  facilityId: string;
  zonaId: string;
  criticidadeDoEndpoint: Criticidade;
  /** Política de restrição da zona no momento (ex.: RESPIRATORY_ISOLATION). */
  restricaoDaZona?: string;
  /** Nível de restrição institucional, escala interna de 0 a 3. */
  nivelDeRestricao?: number;
  /** Papéis efetivos do vínculo no momento do pedido. */
  papeis: readonly string[];
  /** Unidades às quais o vínculo está lotado. */
  unidadesLotadas: readonly string[];
  /** Zonas autorizadas pela soma dos papéis. */
  zonasAutorizadas: readonly string[];
  vinculoVigente: boolean;
  turnoVigente: boolean;
  ordemDeServicoAberta?: boolean;
  /** Situação de emergência declarada por operador, com registro. */
  contingenciaDeclarada?: boolean;
  /**
   * A habilitação da pessoa nesta zona, já PROJETADA.
   *
   * Chega como leitura mínima — atende, está suspensa, o que falta — e nunca
   * como o registro no conselho. O motor decide acesso; número de carteira
   * profissional é dado pessoal que ele não precisa, pela mesma razão que
   * diagnóstico não entra (ADR-0007).
   *
   * Ausente significa que a instalação não declarou exigência para esta zona.
   * Isso NÃO é falha de competência: exigência ausente e evidência ausente são
   * coisas diferentes, e tratá-las igual fecharia toda porta no dia em que a
   * integração com o conselho ficasse muda.
   */
  competencia?: LeituraDeCompetencia;
}

/**
 * Dois modos, porque são duas perguntas diferentes.
 *
 * ENTITLEMENT: "este direito deveria existir?" — a escala de turno NÃO decide,
 * porque ela é materializada como janela recorrente DENTRO do direito. Revogar
 * a credencial do plantonista às 19h01 e reemiti-la às 7h00 produziria churn
 * diário em milhares de equipamentos, e nenhuma segurança adicional.
 *
 * ACCESS: "esta pessoa pode entrar AGORA?" — aqui a escala decide, porque é a
 * pergunta que o equipamento em modo online faz à ColmeIA no instante em que
 * alguém encosta o crachá (item 16).
 */
export type ModoDeDecisao = 'ENTITLEMENT' | 'ACCESS';

export interface PedidoDeDecisao {
  id: string;
  modo: ModoDeDecisao;
  personId: string;
  relationshipId?: string;
  endpointId: string;
  momento: Date;
  metodo?: CredentialMethod;
  origem: DecisionOrigin;
  contexto: AtributosDeContexto;
}

export type EfeitoDePolitica = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';

export interface RegraDePolitica {
  id: string;
  descricao: string;
  /** Maior prioridade vence. Empate com efeitos opostos é conflito, não sorteio. */
  prioridade: number;
  efeito: EfeitoDePolitica;
  aplicavel(pedido: PedidoDeDecisao): boolean;
  /** Frase determinística usada na auditoria quando a regra é aplicada. */
  justificativa(pedido: PedidoDeDecisao): string;
}

export interface ConflitoDePolitica {
  regraA: string;
  regraB: string;
  prioridade: number;
  descricao: string;
}

export interface DecisaoDePolitica {
  id: string;
  pedidoId: string;
  efeito: EfeitoDePolitica;
  decididoEm: Date;
  decisionOrigin: DecisionOrigin;
  regrasAvaliadas: number;
  regrasAplicadas: readonly string[];
  conflitos: readonly ConflitoDePolitica[];
  /** Explicação legível, composta das justificativas das regras vencedoras. */
  razao: string;
  /** Verdadeiro quando o efeito veio do fechamento padrão, e não de uma regra. */
  porOmissao: boolean;
}
