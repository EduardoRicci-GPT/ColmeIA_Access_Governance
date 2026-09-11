// ---------------------------------------------------------------------------
// DIREITO DE ACESSO — a camada que nenhum fabricante pode contaminar
//
// Item 43 da especificação: integrar um fornecedor novo deve exigir Adapter e
// Capability Mapping, e NADA daqui. Se um dia um fabricante obrigar a mexer em
// `Person`, `Entitlement` ou `Relationship`, há acoplamento indevido — e é
// sinal de que a decisão migrou para o equipamento.
//
// O vocabulário é deliberadamente hospitalar: o acesso não deriva da pessoa, e
// sim do VÍNCULO que ela mantém com a instituição num intervalo. O enfermeiro
// não entra na UTI por ser enfermeiro; entra por estar escalado naquela UTI
// naquele turno. Quando a escala muda (H8) ou a OS encerra antes (H9), o que
// muda é o vínculo — e o direito é recalculado a partir dele.
// ---------------------------------------------------------------------------

import { CredentialMethod } from './topologia';

export type TipoDeVinculo =
  | 'EMPLOYEE'
  | 'CONTRACTOR'
  | 'TEMPORARY_STAFF'
  | 'RESIDENT'
  | 'VENDOR'
  | 'VISITOR'
  | 'PATIENT_COMPANION';

export type SituacaoDeVinculo = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

export interface Person {
  id: string;
  nomeDeExibicao: string;
  /** Matrícula, CPF mascarado ou identificador institucional. Nunca dado clínico. */
  identificadorInstitucional?: string;
}

/** Janela temporal fechada ou aberta. `fim` ausente = sem término previsto. */
export interface Janela {
  inicio: Date;
  fim?: Date;
}

/** Janela recorrente de turno, em minutos desde a meia-noite, no fuso da instalação. */
export interface JanelaRecorrente {
  diasDaSemana: readonly number[];
  minutoInicial: number;
  minutoFinal: number;
  /** Turno que cruza a meia-noite (19h–07h) tem `atravessaMeiaNoite = true`. */
  atravessaMeiaNoite: boolean;
}

export interface Relationship {
  id: string;
  personId: string;
  organizationId: string;
  tipo: TipoDeVinculo;
  situacao: SituacaoDeVinculo;
  vigencia: Janela;
  /** Papéis atribuídos pelo vínculo, não pela pessoa. */
  roleIds: readonly string[];
  /** Unidades às quais o vínculo está lotado (setor, UTI, centro cirúrgico). */
  unidadesLotadas: readonly string[];
  /** Escala de turno vigente. Ausente = sem restrição de turno. */
  escala?: JanelaRecorrente;
  /** Ordem de serviço, para prestadores. Encerrar a OS encerra o direito. */
  ordemDeServicoId?: string;
}

export interface Role {
  id: string;
  nome: string;
  /** Zonas que o papel autoriza, por id do nó de hierarquia. */
  zonasAutorizadas: readonly string[];
  /** Papéis incompatíveis entre si (segregação de funções). */
  incompativelCom?: readonly string[];
}

export type MotivoDeRevogacao =
  | 'RELATIONSHIP_TERMINATED'
  | 'RELATIONSHIP_SUSPENDED'
  | 'WORK_ORDER_CLOSED'
  | 'SCHEDULE_CHANGED'
  | 'POLICY_DENIED'
  | 'WINDOW_EXPIRED'
  | 'MANUAL_REVOCATION';

/**
 * O direito propriamente dito: uma pessoa, um endpoint, uma janela, uma razão.
 * Note o que NÃO existe aqui: método de credencial, fabricante, referência de
 * equipamento. O direito é indiferente a como será materializado (item 23).
 */
export interface Entitlement {
  id: string;
  personId: string;
  relationshipId: string;
  endpointId: string;
  janela: Janela;
  /** Restrição de turno herdada do vínculo, se houver. */
  escala?: JanelaRecorrente;
  concedidoPor: string;
  concedidoEm: Date;
  revogadoEm?: Date;
  motivoDeRevogacao?: MotivoDeRevogacao;
  /** Referência à decisão de política que originou o direito. */
  decisaoId?: string;
}

export type SituacaoDeCredencial = 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';

/**
 * A credencial materializa o direito. Duas credenciais de métodos diferentes
 * (cartão e biometria) materializam o MESMO entitlement — e é por isso que
 * revogar o direito precisa revogar as duas, enquanto perder o cartão não
 * revoga o direito.
 */
export interface Credential {
  id: string;
  personId: string;
  entitlementId: string;
  endpointId: string;
  metodo: CredentialMethod;
  situacao: SituacaoDeCredencial;
  /** Referência opaca no provedor (eKey id, passcode id, template id). */
  referenciaExterna?: string;
  emitidaEm: Date;
  expiraEm?: Date;
  /** Última vez que o equipamento confirmou possuir esta credencial. */
  confirmadaNoEquipamentoEm?: Date;
}

export function vinculoVigente(vinculo: Relationship, agora: Date): boolean {
  if (vinculo.situacao !== 'ACTIVE') return false;
  if (vinculo.vigencia.inicio.getTime() > agora.getTime()) return false;
  if (vinculo.vigencia.fim && vinculo.vigencia.fim.getTime() <= agora.getTime()) return false;
  return true;
}

export function janelaVigente(janela: Janela, agora: Date): boolean {
  if (janela.inicio.getTime() > agora.getTime()) return false;
  if (janela.fim && janela.fim.getTime() <= agora.getTime()) return false;
  return true;
}

/**
 * Turno vigente. Trata o turno noturno (19h–07h) sem gambiarra: quando
 * `atravessaMeiaNoite`, o intervalo válido é a UNIÃO de [inicio, 24h) no dia
 * escalado e [0, fim) no dia seguinte — e é por isso que o dia da semana é
 * verificado contra o dia do INÍCIO do turno, não contra o dia corrente.
 */
export function turnoVigente(escala: JanelaRecorrente, agora: Date): boolean {
  const minutoDoDia = agora.getHours() * 60 + agora.getMinutes();
  const diaHoje = agora.getDay();
  const diaOntem = (diaHoje + 6) % 7;

  if (!escala.atravessaMeiaNoite) {
    return (
      escala.diasDaSemana.includes(diaHoje) &&
      minutoDoDia >= escala.minutoInicial &&
      minutoDoDia < escala.minutoFinal
    );
  }
  const abriuHoje = escala.diasDaSemana.includes(diaHoje) && minutoDoDia >= escala.minutoInicial;
  const abriuOntem = escala.diasDaSemana.includes(diaOntem) && minutoDoDia < escala.minutoFinal;
  return abriuHoje || abriuOntem;
}
