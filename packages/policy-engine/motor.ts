// ---------------------------------------------------------------------------
// POLICY ENGINE — o motor
//
// Três decisões estruturais, e a razão de cada uma:
//
// 1. FECHA POR OMISSÃO. Nenhuma regra aplicável significa DENY, não ALLOW.
//    Num hospital, o custo de negar acesso indevidamente é um telefonema; o de
//    conceder indevidamente é uma investigação.
//
// 2. CONFLITO NÃO SE RESOLVE SOZINHO. Duas regras de mesma prioridade com
//    efeitos opostos não são desempatadas por ordem de declaração: isso faria
//    a decisão depender de como o arquivo foi editado. O conflito é REGISTRADO,
//    a decisão fecha, e um humano arbitra. É o mesmo princípio do item 33
//    aplicado à política: quando não se sabe, diz-se que não se sabe.
//
// 3. DENY VENCE ALLOW NA MESMA PRIORIDADE. Precedência declarada, não emergente.
// ---------------------------------------------------------------------------

import {
  ConflitoDePolitica,
  DecisaoDePolitica,
  EfeitoDePolitica,
  PedidoDeDecisao,
  RegraDePolitica
} from './tipos';

const PRECEDENCIA: Readonly<Record<EfeitoDePolitica, number>> = Object.freeze({
  DENY: 2,
  REQUIRE_APPROVAL: 1,
  ALLOW: 0
});

export interface OpcoesDoMotor {
  /** Prefixo do identificador das decisões. */
  prefixoDeId?: string;
}

export class PolicyEngine {
  private readonly regras: readonly RegraDePolitica[];
  private readonly prefixo: string;
  private sequencia = 0;

  constructor(regras: readonly RegraDePolitica[], opcoes: OpcoesDoMotor = {}) {
    // Ordenação estável e explícita: prioridade desc, depois id asc. Duas
    // instâncias com o mesmo conjunto de regras avaliam na mesma ordem,
    // independentemente de como a lista foi montada.
    this.regras = [...regras].sort((a, b) =>
      b.prioridade - a.prioridade || a.id.localeCompare(b.id)
    );
    this.prefixo = opcoes.prefixoDeId ?? 'DEC';
  }

  decidir(pedido: PedidoDeDecisao): DecisaoDePolitica {
    const aplicaveis = this.regras.filter((regra) => regra.aplicavel(pedido));
    const conflitos = detectarConflitos(aplicaveis, pedido);

    this.sequencia += 1;
    const id = `${this.prefixo}-${String(this.sequencia).padStart(6, '0')}`;

    if (aplicaveis.length === 0) {
      return {
        id,
        pedidoId: pedido.id,
        efeito: 'DENY',
        decididoEm: pedido.momento,
        decisionOrigin: pedido.origem,
        regrasAvaliadas: this.regras.length,
        regrasAplicadas: [],
        conflitos,
        razao: 'Nenhuma regra concede este acesso. Fechamento por omissão.',
        porOmissao: true
      };
    }

    if (conflitos.length > 0) {
      return {
        id,
        pedidoId: pedido.id,
        efeito: 'DENY',
        decididoEm: pedido.momento,
        decisionOrigin: pedido.origem,
        regrasAvaliadas: this.regras.length,
        regrasAplicadas: aplicaveis.map((regra) => regra.id),
        conflitos,
        razao:
          `Conflito de política não resolvido (${conflitos.length}). ` +
          `A decisão fecha e o caso segue para arbitragem humana.`,
        porOmissao: false
      };
    }

    const maiorPrioridade = aplicaveis[0]?.prioridade ?? 0;
    const noTopo = aplicaveis.filter((regra) => regra.prioridade === maiorPrioridade);
    let vencedora = noTopo[0];
    for (const regra of noTopo) {
      if (vencedora === undefined || PRECEDENCIA[regra.efeito] > PRECEDENCIA[vencedora.efeito]) {
        vencedora = regra;
      }
    }

    const aplicadas = vencedora
      ? noTopo.filter((regra) => regra.efeito === vencedora?.efeito)
      : [];

    return {
      id,
      pedidoId: pedido.id,
      efeito: vencedora?.efeito ?? 'DENY',
      decididoEm: pedido.momento,
      decisionOrigin: pedido.origem,
      regrasAvaliadas: this.regras.length,
      regrasAplicadas: aplicadas.map((regra) => regra.id),
      conflitos,
      razao: aplicadas.map((regra) => regra.justificativa(pedido)).join(' · '),
      porOmissao: false
    };
  }

  regrasDeclaradas(): readonly RegraDePolitica[] {
    return this.regras;
  }
}

/**
 * Conflito é mesma prioridade com efeitos DIFERENTES. `REQUIRE_APPROVAL` ao
 * lado de `DENY` não é conflito: são compatíveis, e a precedência já decide.
 * O que não se admite é `ALLOW` empatado com `DENY`.
 */
export function detectarConflitos(
  aplicaveis: readonly RegraDePolitica[],
  pedido: PedidoDeDecisao
): readonly ConflitoDePolitica[] {
  const conflitos: ConflitoDePolitica[] = [];
  for (let i = 0; i < aplicaveis.length; i += 1) {
    for (let j = i + 1; j < aplicaveis.length; j += 1) {
      const a = aplicaveis[i];
      const b = aplicaveis[j];
      if (!a || !b) continue;
      if (a.prioridade !== b.prioridade) continue;
      const opostas =
        (a.efeito === 'ALLOW' && b.efeito === 'DENY') || (a.efeito === 'DENY' && b.efeito === 'ALLOW');
      if (!opostas) continue;
      conflitos.push({
        regraA: a.id,
        regraB: b.id,
        prioridade: a.prioridade,
        descricao:
          `${a.id} (${a.efeito}) e ${b.id} (${b.efeito}) empatam em prioridade ${a.prioridade} ` +
          `para o pedido ${pedido.id}.`
      });
    }
  }
  return conflitos;
}
