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
