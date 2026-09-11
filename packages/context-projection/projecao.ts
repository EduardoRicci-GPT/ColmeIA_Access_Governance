// ---------------------------------------------------------------------------
// ATTRIBUTE PROJECTION LAYER — itens 24 e 25
//
// Esta camada resolve um problema que não é técnico, é de responsabilidade
// institucional: um sistema de controle de acesso que recebe dado clínico
// passa a ser, para efeito de LGPD e de política hospitalar, um sistema que
// trata dado de saúde. Muda o regime jurídico, muda o inventário de dados,
// muda quem pode operá-lo e muda o que acontece quando ele é comprometido.
//
// A pergunta operacional é sempre a mesma: "esta porta deve abrir para esta
// pessoa agora?". Para respondê-la não é preciso saber que o paciente do leito
// 12 tem tuberculose. Basta saber que o leito 12 está sob
// RESPIRATORY_ISOLATION e que a política dessa restrição admite determinados
// perfis.
//
// A projeção é irreversível de propósito: do atributo projetado não se
// reconstrói o diagnóstico. Isso é um recurso, não uma limitação — é o que
// permite que o motor de acesso rode em infraestrutura de facilities sem
// arrastar o prontuário junto.
// ---------------------------------------------------------------------------

export type SistemaDeOrigem = 'HR' | 'EHR' | 'WORK_ORDER' | 'CONTRACT' | 'SCHEDULING' | 'ERP';

export interface RegistroExterno {
  sistema: SistemaDeOrigem;
  referencia: string;
  campos: Readonly<Record<string, unknown>>;
}

/**
 * A lista do que não entra. Ela é explícita e testada — não uma recomendação de
 * revisão de código. Um campo novo no sistema de origem que case com estes
 * nomes é DESCARTADO com registro, nunca repassado.
 */
export const CAMPOS_CLINICOS_PROIBIDOS: readonly string[] = Object.freeze([
  'diagnosis',
  'diagnostico',
  'cid',
  'cid10',
  'icd',
  'icd10',
  'clinical_notes',
  'notas_clinicas',
  'anamnese',
  'evolucao',
  'evolution',
  'exam_results',
  'resultado_exame',
  'lab_result',
  'laudo',
  'prescription',
  'prescricao',
  'medication',
  'medicacao',
  'allergy',
  'alergia',
  'procedure',
  'procedimento',
  'comorbidity',
  'comorbidade',
  'prognosis',
  'prognostico'
]);

/** Atributos que a ColmeIA aceita. Fechado: o que não está aqui não atravessa. */
export interface AtributosProjetados {
  patient_id?: string;
  admission_status?: 'ADMITTED' | 'DISCHARGED' | 'TRANSFERRED' | 'UNKNOWN';
  assigned_unit?: string;
  access_policy?: string;
  access_restriction_policy?: string;
  restriction_level?: 0 | 1 | 2 | 3;
  employment_status?: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  relationship_type?: string;
  work_order_status?: 'OPEN' | 'CLOSED' | 'CANCELLED';
  work_order_id?: string;
  shift_code?: string;
  unit_assignment?: readonly string[];
}

export interface ResultadoDaProjecao {
  atributos: AtributosProjetados;
  /** Campos que a origem trouxe e a projeção recusou, por nome. */
  descartados: readonly string[];
  /** Campos proibidos que chegaram a ser oferecidos. Alimenta auditoria. */
  proibidosRecebidos: readonly string[];
  sistema: SistemaDeOrigem;
  referencia: string;
}

function normalizar(chave: string): string {
  return chave.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function ehProibido(chave: string): boolean {
  const normalizada = normalizar(chave);
  return CAMPOS_CLINICOS_PROIBIDOS.some(
    (proibido) => normalizada === proibido || normalizada.includes(proibido)
  );
}

function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : undefined;
}

/**
 * Tradução de isolamento. Repare no que ela NÃO faz: não olha o diagnóstico.
 * Ela recebe o TIPO de precaução já decidido pela equipe clínica — que é uma
 * informação de logística assistencial, não de prontuário — e o converte em
 * política de acesso.
 */
const POLITICA_POR_PRECAUCAO: Readonly<Record<string, string>> = Object.freeze({
  AEROSOL: 'RESPIRATORY_ISOLATION',
  RESPIRATORIA: 'RESPIRATORY_ISOLATION',
  AIRBORNE: 'RESPIRATORY_ISOLATION',
  CONTATO: 'CONTACT_ISOLATION',
  CONTACT: 'CONTACT_ISOLATION',
  GOTICULAS: 'DROPLET_ISOLATION',
  DROPLET: 'DROPLET_ISOLATION',
  PROTETOR: 'PROTECTIVE_ISOLATION',
  REVERSA: 'PROTECTIVE_ISOLATION'
});

const NIVEL_POR_POLITICA: Readonly<Record<string, 0 | 1 | 2 | 3>> = Object.freeze({
  CONTACT_ISOLATION: 1,
  DROPLET_ISOLATION: 2,
  RESPIRATORY_ISOLATION: 3,
  PROTECTIVE_ISOLATION: 3
});

export function projetar(registro: RegistroExterno): ResultadoDaProjecao {
  const atributos: AtributosProjetados = {};
  const descartados: string[] = [];
  const proibidos: string[] = [];

  for (const [chave, valor] of Object.entries(registro.campos)) {
    if (ehProibido(chave)) {
      proibidos.push(chave);
      continue;
    }
    const normalizada = normalizar(chave);
    switch (normalizada) {
      case 'patient_id':
      case 'paciente_id':
        atributos.patient_id = texto(valor);
        break;
      case 'admission_status':
      case 'situacao_internacao':
        atributos.admission_status = mapearInternacao(texto(valor));
        break;
      case 'assigned_unit':
      case 'unidade':
      case 'setor':
        atributos.assigned_unit = texto(valor);
        break;
      case 'isolation_precaution':
      case 'precaucao':
      case 'precaucao_isolamento': {
        const bruto = texto(valor)?.toUpperCase();
        const politica = bruto ? POLITICA_POR_PRECAUCAO[bruto] : undefined;
        if (politica) {
          atributos.access_restriction_policy = politica;
          atributos.restriction_level = NIVEL_POR_POLITICA[politica] ?? 1;
        } else if (bruto) {
          descartados.push(chave);
        }
        break;
      }
      case 'employment_status':
      case 'situacao_vinculo':
        atributos.employment_status = mapearVinculo(texto(valor));
        break;
      case 'relationship_type':
      case 'tipo_vinculo':
        atributos.relationship_type = texto(valor);
        break;
      case 'work_order_status':
      case 'status_os':
        atributos.work_order_status = mapearOrdemDeServico(texto(valor));
        break;
      case 'work_order_id':
      case 'os':
      case 'ordem_servico':
        atributos.work_order_id = texto(valor);
        break;
      case 'shift_code':
      case 'escala':
      case 'turno':
        atributos.shift_code = texto(valor);
        break;
      case 'access_policy':
      case 'politica_acesso':
        atributos.access_policy = texto(valor);
        break;
      case 'unit_assignment':
      case 'lotacao':
        atributos.unit_assignment = Array.isArray(valor)
          ? valor.filter((item): item is string => typeof item === 'string')
          : texto(valor)
            ? [texto(valor) as string]
            : undefined;
        break;
      default:
        // O padrão é DESCARTAR. Um campo desconhecido do sistema de origem não
        // entra "por via das dúvidas": o inventário de dados do produto é
        // exatamente a lista acima, e ele precisa continuar sendo.
        descartados.push(chave);
    }
  }

  return {
    atributos,
    descartados,
    proibidosRecebidos: proibidos,
    sistema: registro.sistema,
    referencia: registro.referencia
  };
}

function mapearInternacao(valor: string | undefined): AtributosProjetados['admission_status'] {
  switch (valor?.toUpperCase()) {
    case 'ADMITTED':
    case 'INTERNADO':
      return 'ADMITTED';
    case 'DISCHARGED':
    case 'ALTA':
      return 'DISCHARGED';
    case 'TRANSFERRED':
    case 'TRANSFERIDO':
      return 'TRANSFERRED';
    default:
      return valor ? 'UNKNOWN' : undefined;
  }
}

function mapearVinculo(valor: string | undefined): AtributosProjetados['employment_status'] {
  switch (valor?.toUpperCase()) {
    case 'ACTIVE':
    case 'ATIVO':
      return 'ACTIVE';
    case 'SUSPENDED':
    case 'SUSPENSO':
      return 'SUSPENDED';
    case 'TERMINATED':
    case 'DESLIGADO':
    case 'ENCERRADO':
      return 'TERMINATED';
    default:
      return undefined;
  }
}

function mapearOrdemDeServico(valor: string | undefined): AtributosProjetados['work_order_status'] {
  switch (valor?.toUpperCase()) {
    case 'OPEN':
    case 'ABERTA':
      return 'OPEN';
    case 'CLOSED':
    case 'ENCERRADA':
    case 'FECHADA':
      return 'CLOSED';
    case 'CANCELLED':
    case 'CANCELADA':
      return 'CANCELLED';
    default:
      return undefined;
  }
}

/**
 * Guarda de saída. Roda sobre o objeto JÁ projetado e falha se qualquer chave
 * proibida atravessou. É redundante em relação ao filtro de entrada, e é para
 * ser: uma camada que protege dado de saúde não deve depender de um único
 * ponto de verificação.
 */
export function auditarProjecao(resultado: ResultadoDaProjecao): void {
  for (const chave of Object.keys(resultado.atributos)) {
    if (ehProibido(chave)) {
      throw new Error(
        `Projeção violada: o campo clínico "${chave}" atravessou para a camada de acesso ` +
          `(origem ${resultado.sistema}/${resultado.referencia}).`
      );
    }
  }
}
