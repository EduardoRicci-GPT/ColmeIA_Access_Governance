// ---------------------------------------------------------------------------
// AUTORIDADE DO HOST — o ponto de encaixe no aplicativo de gestão
//
// O kernel MPE-H é explícito: "o kernel não sabe o que é um supervisor de
// plantão nem como se valida um token — e não deve saber. MPE-H consome o RBAC
// do host."
//
// Essa frase é o contrato de embarque deste produto. Quando a governança de
// acesso rodar dentro de um aplicativo de gestão hospitalar, é o aplicativo que
// já sabe quem é chefe de enfermagem, quem está de plantão hoje, e se a sessão
// daquela pessoa é legítima. Reimplementar isso aqui produziria uma segunda
// verdade sobre quem manda no hospital — e duas verdades sobre autoridade é
// exatamente o defeito que um sistema de acesso não pode ter.
//
// Por isso `AutoridadeDoHost` entra por construtor. `AutoridadeEmMemoria` abaixo
// existe para a bancada e para piloto; em produção, quem a implementa é o host.
// ---------------------------------------------------------------------------

import { AutoridadeDoHost, Criticidade, DecisaoDeGate } from '../mpeh-kernel/human-gate/tipos';
import { TipoDeEscalonamento } from '../dominio/escalonamento';
import { NivelDeRisco } from '../dominio/risco';

export type { AutoridadeDoHost };

export interface AlcadaDePapel {
  papel: string;
  /** Até que criticidade este papel pode decidir. */
  ate: Criticidade;
}

const ORDEM: Record<Criticidade, number> = { BAIXA: 0, MEDIA: 1, ALTA: 2, CRITICA: 3 };

/**
 * Implementação de referência, para bancada e piloto.
 *
 * Duas recusas que ela NÃO relaxa, porque relaxá-las esvaziaria o gate:
 *  · token que não corresponde ao aprovador declarado;
 *  · papel sem alçada para a criticidade em questão.
 *
 * O token aqui é uma string combinada; num host real é sessão assinada. O que
 * importa é que a porta exista e que o kernel não a interprete.
 */
export class AutoridadeEmMemoria implements AutoridadeDoHost {
  private readonly alcadas = new Map<string, Criticidade>();
  private readonly tokens = new Map<string, string>();

  constructor(alcadas: readonly AlcadaDePapel[] = []) {
    for (const alcada of alcadas) this.alcadas.set(alcada.papel, alcada.ate);
  }

  /** Registra a credencial de um aprovador. Em produção, isto é a sessão dele. */
  credenciar(aprovador: string, token: string): void {
    this.tokens.set(aprovador, token);
  }

  assinaturaConfere(decisao: DecisaoDeGate): boolean {
    const esperado = this.tokens.get(decisao.aprovador);
    return esperado !== undefined && esperado === decisao.assinatura;
  }

  podeDecidir(papel: string, criticidade: Criticidade): boolean {
    const ate = this.alcadas.get(papel);
    if (ate === undefined) return false;
    return ORDEM[ate] >= ORDEM[criticidade];
  }
}

/** Alçadas de referência para uma unidade de saúde. Configurável por instalação. */
export const ALCADAS_HOSPITALARES: readonly AlcadaDePapel[] = Object.freeze([
  { papel: 'coordenacao-de-enfermagem', ate: 'MEDIA' },
  { papel: 'supervisao-de-seguranca', ate: 'ALTA' },
  { papel: 'gerencia-de-facilities', ate: 'ALTA' },
  { papel: 'diretoria-tecnica', ate: 'CRITICA' },
  { papel: 'diretoria-administrativa', ate: 'CRITICA' }
]);

// ---------------------------------------------------------------------------
// QUEM RESPONDE POR UM CASO — a segunda porta do host, e por que não é a
// primeira
//
// `podeDecidir(papel, faixa)` responde "esta pessoa pode AUTORIZAR um acesso
// desta criticidade?". Um caso de escalonamento não pede autorização nenhuma:
// pede alguém que vá até o gateway, abra chamado com o fabricante ou remaneje
// a escala. Aprovar o cofre de psicotrópicos e consertar um gateway caído são
// competências diferentes, e reaproveitar a alçada para as duas chamaria a
// diretoria técnica às 3h por causa de uma catraca sem comunicação.
//
// O encaminhamento é por TIPO de caso, porque é assim que um hospital de fato
// se organiza: gateway offline é TI, revogação não confirmada é segurança,
// zona de cuidado sem cobertura é coordenação assistencial. A tabela é do
// host — aqui vai a de referência, como em `ALCADAS_HOSPITALARES`.
//
// NÃO há limiar de severidade nesta porta, e a ausência é deliberada. Um tipo
// que não deve acordar ninguém é um tipo roteado para NENHUM papel, e aí o
// chamado sai declarando que não havia a quem recorrer — que é fato registrado,
// e não silêncio. Um limiar escondido aqui produziria o defeito oposto: casos
// que somem sem deixar rastro de terem sumido.
// ---------------------------------------------------------------------------

export interface RotaDeCaso {
  tipo: TipoDeEscalonamento;
  /** Papéis desta instalação que respondem por este tipo. Pode ser vazio. */
  papeis: readonly string[];
}

export interface EncaminhamentoDeCasos {
  papeisPara(tipo: TipoDeEscalonamento, severidade: NivelDeRisco): Promise<readonly string[]>;
}

/** Implementação de referência: tabela por tipo, indiferente à severidade. */
export class EncaminhamentoPorTipo implements EncaminhamentoDeCasos {
  private readonly rotas = new Map<TipoDeEscalonamento, readonly string[]>();

  constructor(rotas: readonly RotaDeCaso[] = []) {
    for (const rota of rotas) this.rotas.set(rota.tipo, rota.papeis);
  }

  async papeisPara(tipo: TipoDeEscalonamento): Promise<readonly string[]> {
    return this.rotas.get(tipo) ?? [];
  }
}

/**
 * Encaminhamento de referência para uma unidade de saúde.
 *
 * Duas escolhas que merecem ser ditas. `COVERAGE_GAP` vai para a coordenação de
 * enfermagem, e não para a segurança: é o único tipo que denuncia FALTA de
 * direito, e quem resolve falta de gente numa zona de cuidado é quem monta a
 * escala. `POLICY_CONFLICT` vai para duas áreas porque o conflito costuma ser
 * de desenho — uma pessoa acumulou papéis que a política considera
 * incompatíveis —, e desfazer isso é decisão conjunta de quem opera e de quem
 * responde pela política.
 */
export const ENCAMINHAMENTO_HOSPITALAR: readonly RotaDeCaso[] = Object.freeze([
  { tipo: 'REVOCATION_NOT_CONFIRMED', papeis: ['supervisao-de-seguranca'] },
  { tipo: 'UNKNOWN_PHYSICAL_STATE', papeis: ['supervisao-de-seguranca'] },
  { tipo: 'SYNC_EXHAUSTED_RETRIES', papeis: ['gerencia-de-facilities'] },
  { tipo: 'ENDPOINT_CRITICAL_OFFLINE', papeis: ['gerencia-de-facilities', 'supervisao-de-seguranca'] },
  { tipo: 'GATEWAY_OFFLINE', papeis: ['gerencia-de-facilities'] },
  { tipo: 'PROVIDER_UNAVAILABLE', papeis: ['gerencia-de-facilities'] },
  { tipo: 'POLICY_CONFLICT', papeis: ['coordenacao-de-enfermagem', 'diretoria-tecnica'] },
  { tipo: 'COVERAGE_GAP', papeis: ['coordenacao-de-enfermagem'] },
  // Latência anômala não acorda ninguém nesta instalação de referência: ela
  // aparece na tela e no score. A rota existe, vazia, para que a decisão esteja
  // ESCRITA — e para que o chamado registre que não havia a quem recorrer, em
  // vez de o caso sumir sem rastro.
  { tipo: 'LATENCY_ANOMALY', papeis: [] }
]);
