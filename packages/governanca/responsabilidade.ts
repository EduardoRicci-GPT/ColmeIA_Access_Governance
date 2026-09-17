// ---------------------------------------------------------------------------
// RESPONSABILIDADE TEMPORÁRIA — o supervisor concede responsabilidade, não portas
//
// A escala do RH é o planejamento. A operação é outra coisa. A auxiliar da
// Clínica Médica que atravessa a porta da UTI às 14h32 pode estar cobrindo um
// déficit real, atendendo uma intercorrência ou acompanhando uma transferência
// — e nenhuma dessas hipóteses aparece na escala, porque nenhuma delas foi
// planejada.
//
// Um sistema que só conhece a escala tem duas saídas, e as duas são ruins:
// barrar quem precisa entrar, ou aceitar em silêncio o que não sabe explicar.
// A primeira faz a equipe contornar o sistema; a segunda faz o sistema mentir.
//
// A TERCEIRA SAÍDA, E POR QUE ELA MUDA A NATUREZA DO OBJETO
//
// O supervisor da unidade não diz "abra a porta 7 para a Maria". Ele diz:
// "a Maria está apoiando a minha unidade, por este motivo, até este horário."
// O motor deriva os acessos daí, e os revoga sozinho quando o prazo vence.
//
// A diferença não é de vocabulário. Conceder porta é ato que não expira, não
// explica e não se reconcilia: alguém precisa lembrar de desfazer. Conceder
// RESPONSABILIDADE cria um fato com prazo, motivo e autor — e o resto do
// produto já sabe o que fazer com um fato desses, porque o ciclo reconcilia
// direitos a cada volta desde o primeiro dia.
//
// O LIMITE DA AUTORIDADE É O QUE IMPEDE ISSO DE VIRAR PORTA LATERAL
//
// Um mecanismo de exceção sem limite é o caminho mais curto para contornar
// toda a política. O supervisor da UTI pode designar apoio À UTI; não pode
// abrir o datacenter, não pode ultrapassar a criticidade que a instalação lhe
// confiou, e não pode conceder prazo maior do que o seu escopo permite.
// `EscopoDeDelegacao` existe para que o "não pode" seja verificado, e não
// apenas combinado.
//
// COMPETÊNCIA: DE AFIRMAÇÃO DO HOST A FATO CONFERIDO
//
// Exceção operacional não cria habilitação: quem não pode executar o
// procedimento continua não podendo, por mais legítima que seja a necessidade.
//
// A primeira versão deste módulo aceitava a palavra do host sobre isso, porque
// competência ainda não existia como objeto. Agora existe (`competencia.ts`), e
// o registro CONFERE quando tem como — mas com uma assimetria deliberada: a
// leitura conferida prevalece, exceto sobre um `INSUFICIENTE` afirmado pelo
// host. Quem opera pode saber de uma suspensão que ainda não chegou ao nosso
// registro, e relaxar a afirmação de quem está mais perto do fato seria
// confiar no cadastro contra a pessoa que o alimenta.
//
// Suspensão recusa a designação. Vencida e não declarada NÃO recusam: elas
// deixam a porta pedindo revisão humana, por onde essa decisão já passa desde
// o ADR-0017. Designar apoio e abrir a porta são dois atos, e é bom que sejam.
// ---------------------------------------------------------------------------

import { Criticidade } from '../dominio/topologia';
import { Relogio } from '../dominio/tempo';
import { ConsultaDeCompetencia } from './competencia';

/** O que a responsabilidade temporária é, no vocabulário da operação. */
export type TipoDeResponsabilidade =
  | 'APOIO_ASSISTENCIAL'
  | 'COBERTURA_TEMPORARIA'
  | 'APOIO_EMERGENCIAL'
  | 'APOIO_TECNICO'
  | 'APOIO_EM_TRANSFERENCIA'
  | 'DESIGNACAO_DE_SUPERVISAO';

/**
 * Por que a exceção existe.
 *
 * Taxonomia fechada de propósito: motivo em texto livre vira "apoio" em 90%
 * dos registros, e um campo que sempre diz a mesma coisa não informa nada. O
 * `OUTRO` existe para o caso que a lista não previu, e exige texto.
 */
export type MotivoDaExcecao =
  | 'DEFICIT_DE_EQUIPE'
  | 'COBERTURA_DE_INTERVALO'
  | 'INTERCORRENCIA_CLINICA'
  | 'TRANSFERENCIA_DE_PACIENTE'
  | 'APOIO_EM_PROCEDIMENTO'
  | 'APOIO_EMERGENCIAL'
  | 'REMANEJAMENTO_DA_SUPERVISAO'
  | 'APOIO_TECNICO'
  | 'COBERTURA_DE_AUSENCIA'
  | 'OUTRO';

/**
 * O estado da competência, conforme o HOST afirma.
 *
 * Três valores, e o terceiro é o mais importante: `NAO_VERIFICADA` diz que
 * ninguém conferiu, e isso vai para a tela e para a cadeia. A alternativa —
 * assumir válida — transformaria a ausência de checagem em aprovação tácita.
 */
export type EstadoDaCompetencia =
  | 'VALIDA'
  | 'INSUFICIENTE'
  /** Conferida, e há falha que exige revisão humana — vencida, não declarada. */
  | 'PENDENTE'
  | 'NAO_VERIFICADA';

/**
 * Até onde uma autoridade pode designar.
 *
 * Sem isto, o mecanismo de exceção seria a porta lateral que dispensa toda a
 * política: bastaria um supervisor complacente para que qualquer pessoa
 * alcançasse qualquer lugar. O escopo é configuração de instalação e é
 * conferido a cada pedido.
 */
export interface EscopoDeDelegacao {
  id: string;
  /** Quem detém esta autoridade. Identificador do host, não papel genérico. */
  autoridade: string;
  organizationId: string;
  facilityId?: string;
  /** Zonas em que esta autoridade pode designar apoio. Vazio = nenhuma. */
  zonas: readonly string[];
  tiposPermitidos: readonly TipoDeResponsabilidade[];
  /** Teto de duração. Exceção sem teto deixa de ser exceção. */
  duracaoMaximaMinutos: number;
  /**
   * Teto de criticidade que esta autoridade alcança.
   *
   * Note que ele NÃO substitui o gate: um endpoint CRITICAL dentro da zona
   * designada continua exigindo aprovação humana pelo caminho normal. O teto
   * decide o que o supervisor pode DESIGNAR; o gate decide o que abre.
   */
  criticidadeMaxima: Criticidade;
  /** Recursos que esta autoridade nunca alcança, mesmo dentro das zonas. */
  recursosProibidos?: readonly string[];
}

export interface PedidoDeExcecao {
  id: string;
  personId: string;
  relationshipId: string;
  /** Onde a pessoa foi observada, ou onde pede para atuar. */
  facilityId: string;
  zonaId: string;
  tipo: TipoDeResponsabilidade;
  motivo: MotivoDaExcecao;
  motivoTexto?: string;
  /** Quanto tempo se pede. O teto do escopo pode reduzir. */
  duracaoMinutos: number;
  competencia: EstadoDaCompetencia;
  /** O que disparou: passagem observada, tentativa de acesso, pedido humano. */
  origem: 'ACESSO_NEGADO' | 'PEDIDO_DA_SUPERVISAO' | 'PEDIDO_DA_PESSOA';
  abertoEm: Date;
}

export interface ResponsabilidadeTemporaria {
  id: string;
  personId: string;
  relationshipId: string;
  facilityId: string;
  zonaId: string;
  tipo: TipoDeResponsabilidade;
  /** Quem designou, e sob qual escopo. As duas coisas, sempre. */
  concedidaPor: string;
  escopoId: string;
  pedidoId: string;
  motivo: MotivoDaExcecao;
  motivoTexto?: string;
  competenciaNaConcessao: EstadoDaCompetencia;
  validaDe: Date;
  validaAte: Date;
  estado: 'ATIVA' | 'VENCIDA' | 'REVOGADA';
  criadaEm: Date;
  /** Quando foi encerrada antes do prazo, e por quem. */
  encerradaEm?: Date;
  encerradaPor?: string;
}

/** Por que um pedido não virou responsabilidade. */
export type RecusaDeExcecao =
  | 'FORA_DAS_ZONAS_DO_ESCOPO'
  | 'TIPO_NAO_PERMITIDO'
  | 'RECURSO_PROIBIDO'
  | 'COMPETENCIA_INSUFICIENTE'
  | 'MOTIVO_SEM_TEXTO'
  | 'DURACAO_INVALIDA'
  | 'ESCOPO_INEXISTENTE'
  | 'INSTALACAO_DIVERGENTE';

export type ResultadoDaConcessao =
  | {
      concedida: true;
      responsabilidade: ResponsabilidadeTemporaria;
      /** Quando o teto do escopo cortou o prazo pedido. */
      duracaoReduzida: boolean;
      explicacao: string;
    }
  | {
      concedida: false;
      recusa: RecusaDeExcecao;
      /** `true` quando outra autoridade poderia conceder o mesmo pedido. */
      autoridadeSuperiorResolveria: boolean;
      explicacao: string;
    };

/** Os atos que este módulo produz, para quem quiser levá-los à cadeia. */
export type AtoDeResponsabilidade =
  | { tipo: 'PEDIDA'; pedido: PedidoDeExcecao; em: Date }
  | {
      tipo: 'RECUSADA';
      pedido: PedidoDeExcecao;
      recusa: RecusaDeExcecao;
      decididoPor: string;
      explicacao: string;
      em: Date;
    }
  | {
      tipo: 'CONCEDIDA';
      responsabilidade: ResponsabilidadeTemporaria;
      duracaoReduzida: boolean;
      em: Date;
    }
  | {
      tipo: 'ENCERRADA';
      responsabilidade: ResponsabilidadeTemporaria;
      /** `VENCIMENTO` não tem ator: o tempo passou. */
      causa: 'VENCIMENTO' | 'REVOGACAO';
      em: Date;
      observadoEm: Date;
    };

export interface DiarioDeResponsabilidade {
  registrarResponsabilidade(ato: AtoDeResponsabilidade): void;
}

/**
 * A porta que o motor de entitlement consulta.
 *
 * Devolve ZONAS, e não portas nem direitos. É a forma do objeto que sustenta a
 * doutrina: o registro de responsabilidades não sabe o que é um endpoint, e
 * portanto não pode conceder um.
 */
export interface ConsultaDeResponsabilidades {
  /** Zonas em que este vínculo tem responsabilidade temporária vigente. */
  zonasDe(relationshipId: string, agora: Date): readonly string[];
  /** Criticidade máxima designável em cada zona, para o motor não extrapolar. */
  tetoDeCriticidade(relationshipId: string, zonaId: string, agora: Date): Criticidade | null;
}

/** Nenhuma responsabilidade temporária. É o padrão, e fecha. */
export const SEM_RESPONSABILIDADES: ConsultaDeResponsabilidades = {
  zonasDe: () => [],
  tetoDeCriticidade: () => null
};

const ORDEM_DE_CRITICIDADE: Record<Criticidade, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3
};

function dentroDoTeto(criticidade: Criticidade, teto: Criticidade): boolean {
  return ORDEM_DE_CRITICIDADE[criticidade] <= ORDEM_DE_CRITICIDADE[teto];
}

/**
 * O registro de responsabilidades temporárias.
 *
 * Concede, expira, revoga e responde ao motor. Não abre porta nenhuma — é o
 * ciclo que, na volta seguinte, descobre que os direitos mudaram.
 */
export class RegistroDeResponsabilidades implements ConsultaDeResponsabilidades {
  private readonly escopos = new Map<string, EscopoDeDelegacao>();
  private readonly responsabilidades = new Map<string, ResponsabilidadeTemporaria>();
  private readonly vencimentosAnunciados = new Set<string>();
  private sequencia = 0;

  constructor(
    private readonly relogio: Relogio,
    escopos: readonly EscopoDeDelegacao[] = [],
    private readonly diario?: DiarioDeResponsabilidade,
    /** Quando presente, a habilitação é conferida em vez de aceita. */
    private readonly competencias?: ConsultaDeCompetencia
  ) {
    for (const escopo of escopos) this.escopos.set(escopo.id, escopo);
  }

  declararEscopo(escopo: EscopoDeDelegacao): void {
    this.escopos.set(escopo.id, escopo);
  }

  escopoDe(id: string): EscopoDeDelegacao | undefined {
    return this.escopos.get(id);
  }

  /** Registra o pedido, antes de qualquer decisão. Pedido recusado é fato. */
  abrir(pedido: PedidoDeExcecao): PedidoDeExcecao {
    this.diario?.registrarResponsabilidade({ tipo: 'PEDIDA', pedido, em: pedido.abertoEm });
    return pedido;
  }

  /**
   * A decisão humana.
   *
   * Confere o escopo ANTES de olhar qualquer outra coisa, porque autoridade
   * ausente torna o resto da conversa irrelevante: não importa se o motivo é
   * bom quando quem decide não podia decidir.
   */
  conceder(pedido: PedidoDeExcecao, escopoId: string): ResultadoDaConcessao {
    const escopo = this.escopos.get(escopoId);
    const agora = this.relogio.agora();

    const recusar = (
      recusa: RecusaDeExcecao,
      explicacao: string,
      autoridadeSuperiorResolveria: boolean
    ): ResultadoDaConcessao => {
      this.diario?.registrarResponsabilidade({
        tipo: 'RECUSADA',
        pedido,
        recusa,
        decididoPor: escopo?.autoridade ?? '—',
        explicacao,
        em: agora
      });
      return { concedida: false, recusa, autoridadeSuperiorResolveria, explicacao };
    };

    if (!escopo) {
      return recusar(
        'ESCOPO_INEXISTENTE',
        'Não há escopo de delegação declarado para esta autoridade. Sem escopo, ' +
          'não há o que conferir — e conceder assim seria confiar na boa intenção.',
        false
      );
    }
    if (escopo.facilityId !== undefined && escopo.facilityId !== pedido.facilityId) {
      return recusar(
        'INSTALACAO_DIVERGENTE',
        `A autoridade ${escopo.autoridade} responde por outra instalação. Designar ` +
          'apoio fora dela é decisão de quem responde por aquela casa.',
        true
      );
    }
    if (!escopo.zonas.includes(pedido.zonaId)) {
      return recusar(
        'FORA_DAS_ZONAS_DO_ESCOPO',
        `A zona ${pedido.zonaId} está fora do escopo de ${escopo.autoridade}. ` +
          'Autoridade superior pode designar; esta não.',
        true
      );
    }
    if (escopo.recursosProibidos?.includes(pedido.zonaId)) {
      return recusar(
        'RECURSO_PROIBIDO',
        `A zona ${pedido.zonaId} é expressamente vedada a esta autoridade, mesmo ` +
          'estando na lista de zonas. A proibição vence a permissão.',
        true
      );
    }
    if (!escopo.tiposPermitidos.includes(pedido.tipo)) {
      return recusar(
        'TIPO_NAO_PERMITIDO',
        `Esta autoridade não designa responsabilidade do tipo ${pedido.tipo}.`,
        true
      );
    }
    // Competência vem ANTES do prazo de propósito: nenhum prazo conserta
    // habilitação ausente, e exceção operacional não cria competência.
    const competencia = this.conferirCompetencia(pedido, agora);
    if (competencia === 'INSUFICIENTE') {
      return recusar(
        'COMPETENCIA_INSUFICIENTE',
        'A competência exigida não está válida. Necessidade operacional não cria ' +
          'habilitação, e nenhuma autoridade desta instalação pode suprimir esse ' +
          'requisito — o que falta aqui não é permissão, é qualificação.',
        false
      );
    }
    if (pedido.motivo === 'OUTRO' && (pedido.motivoTexto ?? '').trim().length === 0) {
      return recusar(
        'MOTIVO_SEM_TEXTO',
        'Motivo OUTRO exige descrição. Um registro que diz apenas "outro" não ' +
          'responde à pergunta que a auditoria vai fazer.',
        false
      );
    }
    if (!Number.isFinite(pedido.duracaoMinutos) || pedido.duracaoMinutos <= 0) {
      return recusar(
        'DURACAO_INVALIDA',
        'Responsabilidade temporária sem prazo positivo não é temporária. ' +
          'Permanência se resolve por lotação, não por exceção.',
        false
      );
    }

    const minutos = Math.min(pedido.duracaoMinutos, escopo.duracaoMaximaMinutos);
    const duracaoReduzida = minutos < pedido.duracaoMinutos;
    this.sequencia += 1;
    const responsabilidade: ResponsabilidadeTemporaria = {
      id: `RESP-${String(this.sequencia).padStart(5, '0')}`,
      personId: pedido.personId,
      relationshipId: pedido.relationshipId,
      facilityId: pedido.facilityId,
      zonaId: pedido.zonaId,
      tipo: pedido.tipo,
      concedidaPor: escopo.autoridade,
      escopoId: escopo.id,
      pedidoId: pedido.id,
      motivo: pedido.motivo,
      motivoTexto: pedido.motivoTexto,
      competenciaNaConcessao: competencia,
      validaDe: agora,
      validaAte: new Date(agora.getTime() + minutos * 60_000),
      estado: 'ATIVA',
      criadaEm: agora
    };
    this.responsabilidades.set(responsabilidade.id, responsabilidade);

    const ressalva =
      competencia === 'NAO_VERIFICADA'
        ? ' A competência NÃO foi verificada por este sistema; o registro diz isso ' +
          'em vez de presumir que está válida.'
        : competencia === 'PENDENTE'
          ? ' A habilitação exigida na zona está pendente: a designação vale, e a porta ' +
            'ainda vai pedir revisão humana. Designar apoio e abrir a porta são dois atos.'
          : '';
    const corte = duracaoReduzida
      ? ` O prazo pedido foi reduzido de ${pedido.duracaoMinutos} para ${minutos} min pelo teto do escopo.`
      : '';
    const explicacao =
      `${escopo.autoridade} designou ${responsabilidade.tipo} para ${pedido.personId} em ` +
      `${pedido.zonaId}, por ${responsabilidade.motivo}, até ` +
      `${responsabilidade.validaAte.toISOString()}.${corte}${ressalva}`;

    this.diario?.registrarResponsabilidade({
      tipo: 'CONCEDIDA',
      responsabilidade,
      duracaoReduzida,
      em: agora
    });
    return { concedida: true, responsabilidade, duracaoReduzida, explicacao };
  }

  /**
   * A habilitação, conferida quando há como.
   *
   * A assimetria é deliberada: a leitura conferida prevalece, EXCETO sobre um
   * `INSUFICIENTE` afirmado por quem pediu. Quem está na operação pode saber de
   * uma suspensão que ainda não chegou ao nosso registro, e usar o cadastro
   * para desautorizar a pessoa mais próxima do fato seria confiar na cópia
   * contra a fonte.
   */
  private conferirCompetencia(pedido: PedidoDeExcecao, agora: Date): EstadoDaCompetencia {
    if (pedido.competencia === 'INSUFICIENTE') return 'INSUFICIENTE';
    const leitura = this.competencias?.avaliar(pedido.personId, pedido.zonaId, agora);
    if (!leitura) return pedido.competencia;
    if (leitura.suspensa) return 'INSUFICIENTE';
    if (!leitura.exigida || leitura.atende) return 'VALIDA';
    return 'PENDENTE';
  }

  /** Encerramento antes do prazo. O apoio acabou às 16h10, e não às 19h. */
  revogar(id: string, por: string): ResponsabilidadeTemporaria | undefined {
    const responsabilidade = this.responsabilidades.get(id);
    if (!responsabilidade || responsabilidade.estado !== 'ATIVA') return undefined;
    const agora = this.relogio.agora();
    const encerrada: ResponsabilidadeTemporaria = {
      ...responsabilidade,
      estado: 'REVOGADA',
      encerradaEm: agora,
      encerradaPor: por
    };
    this.responsabilidades.set(id, encerrada);
    this.diario?.registrarResponsabilidade({
      tipo: 'ENCERRADA',
      responsabilidade: encerrada,
      causa: 'REVOGACAO',
      em: agora,
      observadoEm: agora
    });
    return encerrada;
  }

  /**
   * As vigentes agora, expirando pelo caminho o que venceu.
   *
   * O vencimento é o único ato sem ator — ninguém o executa, ele acontece —, e
   * por isso o elo nasce na primeira leitura que o constata, com as duas datas
   * separadas. Mesma disciplina do vencimento de aprovação (ADR-0016).
   */
  vigentes(agora: Date = this.relogio.agora()): readonly ResponsabilidadeTemporaria[] {
    const ativas: ResponsabilidadeTemporaria[] = [];
    for (const [id, responsabilidade] of this.responsabilidades) {
      if (responsabilidade.estado !== 'ATIVA') continue;
      if (agora.getTime() < responsabilidade.validaAte.getTime()) {
        ativas.push(responsabilidade);
        continue;
      }
      const vencida: ResponsabilidadeTemporaria = { ...responsabilidade, estado: 'VENCIDA' };
      this.responsabilidades.set(id, vencida);
      if (!this.vencimentosAnunciados.has(id)) {
        this.vencimentosAnunciados.add(id);
        this.diario?.registrarResponsabilidade({
          tipo: 'ENCERRADA',
          responsabilidade: vencida,
          causa: 'VENCIMENTO',
          em: vencida.validaAte,
          observadoEm: agora
        });
      }
    }
    return ativas;
  }

  /** Tudo que já existiu, para a tela e para a auditoria. */
  todas(): readonly ResponsabilidadeTemporaria[] {
    return [...this.responsabilidades.values()];
  }

  zonasDe(relationshipId: string, agora: Date): readonly string[] {
    return [
      ...new Set(
        this.vigentes(agora)
          .filter((r) => r.relationshipId === relationshipId)
          .map((r) => r.zonaId)
      )
    ];
  }

  tetoDeCriticidade(relationshipId: string, zonaId: string, agora: Date): Criticidade | null {
    let teto: Criticidade | null = null;
    for (const responsabilidade of this.vigentes(agora)) {
      if (responsabilidade.relationshipId !== relationshipId) continue;
      if (responsabilidade.zonaId !== zonaId) continue;
      const escopo = this.escopos.get(responsabilidade.escopoId);
      if (!escopo) continue;
      if (teto === null || !dentroDoTeto(escopo.criticidadeMaxima, teto)) {
        teto = escopo.criticidadeMaxima;
      }
    }
    return teto;
  }
}

export { dentroDoTeto };
