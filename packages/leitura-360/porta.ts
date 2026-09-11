// ---------------------------------------------------------------------------
// LEITURA 360° — a porta do R-VEP, e por que ela é porta e não cópia
//
// A razão de este produto derivar da Aletheia é esta: a decisão de liberar uma
// área ou um locker não sai de uma tabela de regras. Ela sai do CRUZAMENTO de
// hierarquia, horário, agenda, local, vínculo e contexto — que é exatamente o
// que o MPE com R-VEP faz.
//
// O radar determinístico da Aletheia executa um snapshot Python selado
// (`engine/mpe_rvep_legacy.py`, sha256 registrado) num processo isolado, e
// custa ~350 ms por leitura. Isso impõe duas coisas ao desenho:
//
//   1. NÃO é copiável para cá. O snapshot é espelho bit-a-bit do corpus MPEH,
//      sob regra própria, e exige Python no host. Um aplicativo de gestão
//      hospitalar não é obrigado a ter Python.
//   2. NÃO cabe no caminho de decisão de uma porta. Ninguém espera 350 ms de
//      subprocesso com o crachá encostado no leitor.
//
// A Aletheia já resolveu esse mesmo dilema, e a solução dela é o padrão aqui:
// DOIS CANAIS. O guardrail estrutural é o porte TypeScript que roda em
// microssegundos e serve o caminho quente; o radar é o canal profundo, que roda
// fora do caminho crítico — na autoria da política, na auditoria do ciclo, na
// revisão de um regulamento de acesso.
//
// Quando o radar não está disponível, o sistema NÃO degrada em silêncio nem
// inventa leitura: ele declara que o segundo canal está ausente, e opera com o
// primeiro. É a mesma disciplina que mantém a Aletheia funcional com o I²E em
// sombra.
// ---------------------------------------------------------------------------

import { StatusDeIntegracao } from '../adapters/contrato/tipos';

/** O subconjunto do R-VEP que interessa a uma decisão de acesso. */
export interface LeituraDoRadar {
  /** Índice de Intencionalidade Ética Estimada. Em sombra até ratificação. */
  i2e: number;
  /** 'neutro' | 'reflexivo' | 'alerta'. */
  riskLevel: string;
  briefDiagnosis: string;
  /** Quem ganha e quem perde com a relação proposta pelo texto. */
  powerVector: { beneficiaries: string[]; losers: string[]; questions: string[] };
  /** 'MAIS LIVRE' | 'MAIS TUTELADO' | ... */
  finalFreedomTest: string;
  recommendations: string[];
  /** Proveniência: qual motor, qual hash, quanto tempo. Vai junto, sempre. */
  engine: { arquivo: string; sha256: string; motor: string; duracaoMs: number };
}

export class RadarIndisponivel extends Error {
  constructor(readonly motivo: string) {
    super(
      `Radar R-VEP indisponível: ${motivo}. ` +
        'O segundo canal não produz leitura aproximada, estimada ou de memória — ' +
        'ausência de avaliação nunca autoriza.'
    );
    this.name = 'RadarIndisponivel';
  }
}

/**
 * A porta. Quem a implementa decide COMO chega ao radar — subprocesso local,
 * serviço interno da instituição, fila assíncrona. O motor de acesso não sabe
 * e não deve saber.
 */
export interface LeitorDeContexto360 {
  readonly statusDeIntegracao: StatusDeIntegracao;
  /** O radar responde agora? Consultar antes de depender dele. */
  disponivel(): Promise<{ ok: boolean; motivo?: string; sha256?: string }>;
  /** Lê o texto. Lança `RadarIndisponivel` em vez de aproximar. */
  ler(texto: string): Promise<LeituraDoRadar>;
}

/**
 * Implementação padrão: declara ausência, e é isso.
 *
 * Existe para que o sistema tenha um comportamento correto e testável quando o
 * radar não está montado — que é o estado de qualquer instalação nova, e o
 * estado permanente de um host sem Python.
 */
export class SemRadar implements LeitorDeContexto360 {
  readonly statusDeIntegracao: StatusDeIntegracao = 'INTERFACE_READY';

  constructor(
    private readonly motivo = 'nenhum leitor R-VEP foi configurado nesta instalação'
  ) {}

  async disponivel() {
    return { ok: false, motivo: this.motivo };
  }

  async ler(_texto: string): Promise<LeituraDoRadar> {
    throw new RadarIndisponivel(this.motivo);
  }
}

/**
 * O que falta para ligar o radar de verdade. É a lista de compras, e cada item
 * é uma decisão de infraestrutura do host, não deste produto.
 */
export const PENDENCIAS_DO_RADAR: readonly string[] = Object.freeze([
  'Python disponível no host, com o snapshot selado do corpus MPEH e o sha256 conferido antes de cada execução.',
  'Decisão sobre onde o radar roda: no mesmo processo do servidor de acesso, num serviço interno, ou em fila assíncrona.',
  'Orçamento de latência declarado — o radar NÃO entra no caminho de decisão de uma porta.',
  'Política de egresso: o texto submetido ao radar é regulamento de acesso, nunca dado de paciente.'
]);
