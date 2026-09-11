// ---------------------------------------------------------------------------
// ENTITLEMENT RECONCILIATION ENGINE — o segundo motor
//
// Recebe o mundo lógico (pessoas, vínculos, papéis, topologia) e o conjunto de
// direitos hoje vigentes, e responde: quais direitos DEVERIAM existir?
//
// O verbo é "deveriam", no condicional, e a distância entre ele e "existem" é
// o produto deste motor. Essa distância tem nome — divergência lógica — e é
// diferente da divergência física, que é problema do terceiro motor.
//
// Um cuidado que não é óbvio: este motor NUNCA apaga um direito. Ele produz
// uma AÇÃO de revogação, com motivo. Direito revogado permanece no registro
// com `revogadoEm` e `motivoDeRevogacao`, porque a pergunta que a auditoria faz
// seis meses depois não é "quem tem acesso" — é "quem TINHA, até quando, e por
// que deixou de ter".
// ---------------------------------------------------------------------------

import {
  Entitlement,
  JanelaRecorrente,
  MotivoDeRevogacao,
  Person,
  Relationship,
  Role,
  turnoVigente,
  vinculoVigente
} from '../dominio/entitlement';
import { Endpoint, Topologia } from '../dominio/topologia';
import { Relogio } from '../dominio/tempo';
import { AtributosDeContexto, DecisaoDePolitica, PedidoDeDecisao } from '../policy-engine/tipos';
import { PolicyEngine } from '../policy-engine/motor';
import { ConsultaDeAprovacao, MaterialDeRevisao, SEM_APROVACOES } from '../governanca/aprovacao';
import { AfetadosPelaDecisao } from '../contratos-estruturais/filtro-zero';

export interface MundoLogico {
  organizationId: string;
  pessoas: readonly Person[];
  vinculos: readonly Relationship[];
  papeis: readonly Role[];
  topologia: Topologia;
  entitlementsVigentes: readonly Entitlement[];
  /**
   * Restrições sanitárias por zona, já PROJETADAS — nunca o dado clínico que
   * as originou. Ver `context-projection`.
   */
  restricoesPorZona?: Readonly<Record<string, string>>;
  /**
   * A consulta de aprovação humana.
   *
   * A primeira versão disto era um `Set<string>` de chaves
   * `${relationshipId}::${endpointId}`, e o defeito dela só ficou visível
   * depois: uma chave aprova A PORTA, para sempre, independentemente do que
   * motivou a aprovação. Sobe a criticidade do endpoint, muda o papel da
   * pessoa, o vínculo vira prestador — a chave continua lá, e continua
   * abrindo. O supervisor aprovou uma coisa e o sistema executa outra, sem que
   * ninguém tenha mentido.
   *
   * Agora a consulta recebe o MATERIAL, e o human-gate do MPE-H liga a
   * aprovação ao hash dele. Mudou o material, a aprovação deixa de valer
   * sozinha — ninguém precisa lembrar de revogá-la.
   *
   * Ausente significa NENHUMA aprovação. Fecha por omissão, como tudo aqui.
   */
  aprovacoes?: ConsultaDeAprovacao;
  /**
   * A resposta do Filtro Zero: quem é afetado por estas decisões, e o que
   * genuinamente precisam. Ausente, o ciclo roda e a lacuna fica registrada —
   * pré-condição não respondida nunca é preenchida por suposição.
   */
  afetados?: Partial<AfetadosPelaDecisao>;
}

export type TipoDeAcao = 'GRANT' | 'REVOKE' | 'UPDATE_WINDOW' | 'KEEP';

export interface AcaoDeEntitlement {
  tipo: TipoDeAcao;
  personId: string;
  relationshipId: string;
  endpointId: string;
  /** Presente quando a ação incide sobre um direito já existente. */
  entitlementId?: string;
  motivo?: MotivoDeRevogacao;
  /** Janela recorrente desejada, quando a ação é GRANT ou UPDATE_WINDOW. */
  escalaDesejada?: JanelaRecorrente;
  decisao: DecisaoDePolitica;
  /**
   * O material que uma pessoa revisaria para autorizar esta ação.
   *
   * Viaja junto da ação porque a fila de pendências da tela precisa mostrar
   * exatamente o que será aprovado — e porque o hash desse material é o que
   * liga a aprovação ao conteúdo. Uma fila que mostrasse só "Fulano quer entrar
   * no cofre" pediria ao supervisor que assinasse um resumo.
   */
  material: MaterialDeRevisao;
  explicacao: string;
}

export interface ResultadoDeReconciliacaoLogica {
  momento: Date;
  organizationId: string;
  acoes: readonly AcaoDeEntitlement[];
  /** Conflitos de política encontrados durante a varredura (item 26). */
  conflitos: number;
  /** Direitos que exigem aprovação humana antes de virar credencial. */
  pendentesDeAprovacao: readonly AcaoDeEntitlement[];
  avaliacoes: number;
}

function mesmaEscala(a?: JanelaRecorrente, b?: JanelaRecorrente): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.minutoInicial === b.minutoInicial &&
    a.minutoFinal === b.minutoFinal &&
    a.atravessaMeiaNoite === b.atravessaMeiaNoite &&
    a.diasDaSemana.length === b.diasDaSemana.length &&
    a.diasDaSemana.every((dia, indice) => dia === b.diasDaSemana[indice])
  );
}

function zonasDosPapeis(papeis: readonly Role[], roleIds: readonly string[]): readonly string[] {
  const indice = new Map(papeis.map((papel) => [papel.id, papel]));
  const zonas = new Set<string>();
  for (const roleId of roleIds) {
    for (const zona of indice.get(roleId)?.zonasAutorizadas ?? []) zonas.add(zona);
  }
  return [...zonas];
}

/**
 * Monta os atributos mínimos de contexto para uma dupla (vínculo, endpoint).
 * É aqui que o mundo lógico vira a superfície estreita que o Policy Engine
 * aceita — e nada além dela atravessa.
 */
export function montarContexto(
  mundo: MundoLogico,
  vinculo: Relationship,
  endpoint: Endpoint,
  agora: Date
): AtributosDeContexto {
  const contexto: AtributosDeContexto = {
    organizationId: mundo.organizationId,
    facilityId: endpoint.facilityId,
    zonaId: endpoint.zonaId,
    criticidadeDoEndpoint: endpoint.criticidade,
    restricaoDaZona: mundo.restricoesPorZona?.[endpoint.zonaId],
    papeis: vinculo.roleIds,
    unidadesLotadas: vinculo.unidadesLotadas,
    zonasAutorizadas: zonasDosPapeis(mundo.papeis, vinculo.roleIds),
    vinculoVigente: vinculoVigente(vinculo, agora),
    turnoVigente: vinculo.escala ? turnoVigente(vinculo.escala, agora) : true,
    ordemDeServicoAberta:
      vinculo.ordemDeServicoId === undefined ? undefined : vinculoVigente(vinculo, agora)
  };
  return contexto;
}

/**
 * O material que uma pessoa vai revisar antes de liberar um acesso crítico.
 *
 * Contém exatamente os fatos que mudariam a decisão de quem aprova — e nada
 * além. Acrescentar um campo aqui invalida todas as aprovações vigentes, o que
 * parece um custo e é uma propriedade: quem muda o que se revisa está mudando o
 * que foi aprovado.
 */
export function montarMaterialDeRevisao(
  vinculo: Relationship,
  endpoint: Endpoint,
  razaoDaPolitica: string
): MaterialDeRevisao {
  return {
    personId: vinculo.personId,
    relationshipId: vinculo.id,
    endpointId: endpoint.id,
    nomeDoEndpoint: endpoint.nome,
    zonaId: endpoint.zonaId,
    criticidade: endpoint.criticidade,
    papeis: vinculo.roleIds,
    tipoDeVinculo: vinculo.tipo,
    razaoDaPolitica
  };
}

export class EntitlementReconciliationEngine {
  constructor(
    private readonly policyEngine: PolicyEngine,
    private readonly relogio: Relogio
  ) {}

  reconciliar(mundo: MundoLogico): ResultadoDeReconciliacaoLogica {
    const agora = this.relogio.agora();
    const acoes: AcaoDeEntitlement[] = [];
    let conflitos = 0;
    let avaliacoes = 0;

    const endpointsPorId = new Map(mundo.topologia.endpoints.map((e) => [e.id, e]));
    const vigentesPorChave = new Map<string, Entitlement>();
    for (const direito of mundo.entitlementsVigentes) {
      if (direito.revogadoEm) continue;
      vigentesPorChave.set(`${direito.relationshipId}::${direito.endpointId}`, direito);
    }

    for (const vinculo of mundo.vinculos) {
      const candidatos = this.candidatos(mundo, vinculo, endpointsPorId);
      for (const endpoint of candidatos) {
        avaliacoes += 1;
        const chave = `${vinculo.id}::${endpoint.id}`;
        const existente = vigentesPorChave.get(chave);
        const pedido: PedidoDeDecisao = {
          id: `PED-${vinculo.id}-${endpoint.id}`,
          modo: 'ENTITLEMENT',
          personId: vinculo.personId,
          relationshipId: vinculo.id,
          endpointId: endpoint.id,
          momento: agora,
          origem: 'COLMEIA_POLICY_ENGINE',
          contexto: montarContexto(mundo, vinculo, endpoint, agora)
        };
        const decisao = this.policyEngine.decidir(pedido);
        conflitos += decisao.conflitos.length;
        const material = montarMaterialDeRevisao(vinculo, endpoint, decisao.razao);
        const consulta = mundo.aprovacoes ?? SEM_APROVACOES;
        acoes.push(
          this.acaoPara(decisao, vinculo, endpoint, existente, consulta.autorizado(material), material, consulta)
        );
        vigentesPorChave.delete(chave);
      }
    }

    // O que sobrou no mapa é direito vigente cujo vínculo não foi sequer
    // avaliado — vínculo removido da base, endpoint desativado. Também é
    // divergência, e das mais perigosas, porque é invisível a quem só olha a
    // lista de pessoas ativas.
    for (const [chave, orfao] of vigentesPorChave) {
      const [relationshipId = '', endpointId = ''] = chave.split('::');
      acoes.push({
        tipo: 'REVOKE',
        personId: orfao.personId,
        relationshipId,
        endpointId,
        entitlementId: orfao.id,
        motivo: 'RELATIONSHIP_TERMINATED',
        material: {
          personId: orfao.personId,
          relationshipId,
          endpointId,
          nomeDoEndpoint: endpointId,
          zonaId: '—',
          criticidade: 'HIGH',
          papeis: [],
          tipoDeVinculo: 'DESCONHECIDO',
          razaoDaPolitica: 'Direito órfão'
        },
        decisao: {
          id: `DEC-ORFAO-${orfao.id}`,
          pedidoId: `PED-ORFAO-${orfao.id}`,
          efeito: 'DENY',
          decididoEm: agora,
          decisionOrigin: 'COLMEIA_POLICY_ENGINE',
          regrasAvaliadas: 0,
          regrasAplicadas: [],
          conflitos: [],
          razao: 'Direito órfão: vínculo ou endpoint não consta mais no mundo lógico.',
          porOmissao: true
        },
        explicacao: 'Direito vigente sem vínculo correspondente. Revogação por orfandade.'
      });
    }

    return {
      momento: agora,
      organizationId: mundo.organizationId,
      acoes,
      conflitos,
      pendentesDeAprovacao: acoes.filter(
        (acao) => acao.decisao.efeito === 'REQUIRE_APPROVAL' && acao.explicacao.includes('pendente')
      ),
      avaliacoes
    };
  }

  /**
   * Endpoints a avaliar para um vínculo: os que os papéis e a lotação alcançam,
   * MAIS aqueles onde já existe direito. O segundo conjunto é o que garante que
   * um direito nunca escape da varredura por ter deixado de ser candidato.
   */
  private candidatos(
    mundo: MundoLogico,
    vinculo: Relationship,
    endpointsPorId: ReadonlyMap<string, Endpoint>
  ): readonly Endpoint[] {
    const zonas = new Set<string>([
      ...zonasDosPapeis(mundo.papeis, vinculo.roleIds),
      ...vinculo.unidadesLotadas
    ]);
    const selecionados = new Map<string, Endpoint>();
    for (const endpoint of mundo.topologia.endpoints) {
      if (zonas.has(endpoint.zonaId)) selecionados.set(endpoint.id, endpoint);
    }
    for (const direito of mundo.entitlementsVigentes) {
      if (direito.relationshipId !== vinculo.id || direito.revogadoEm) continue;
      const endpoint = endpointsPorId.get(direito.endpointId);
      if (endpoint) selecionados.set(endpoint.id, endpoint);
    }
    return [...selecionados.values()];
  }

  private acaoPara(
    decisao: DecisaoDePolitica,
    vinculo: Relationship,
    endpoint: Endpoint,
    existente: Entitlement | undefined,
    aprovado: boolean,
    material: MaterialDeRevisao,
    consulta: ConsultaDeAprovacao
  ): AcaoDeEntitlement {
    const base = {
      personId: vinculo.personId,
      relationshipId: vinculo.id,
      endpointId: endpoint.id,
      entitlementId: existente?.id,
      decisao,
      material
    };

    if (decisao.efeito === 'DENY') {
      if (!existente) {
        return { ...base, tipo: 'KEEP', explicacao: `Sem direito, e a política não concede. ${decisao.razao}` };
      }
      return {
        ...base,
        tipo: 'REVOKE',
        motivo: motivoDeRevogacaoPara(decisao, vinculo),
        explicacao: `Direito vigente que a política não sustenta mais. ${decisao.razao}`
      };
    }

    if (decisao.efeito === 'REQUIRE_APPROVAL') {
      if (aprovado) {
        return {
          ...base,
          tipo: existente ? 'KEEP' : 'GRANT',
          escalaDesejada: vinculo.escala,
          explicacao: `Aprovação humana registrada. ${decisao.razao}`
        };
      }
      return {
        ...base,
        tipo: 'KEEP',
        escalaDesejada: vinculo.escala,
        explicacao:
          `Aprovação humana pendente: o direito NÃO foi materializado. ` +
          `${consulta.explicar(material)} ${decisao.razao}`
      };
    }

    if (!existente) {
      return {
        ...base,
        tipo: 'GRANT',
        escalaDesejada: vinculo.escala,
        explicacao: `Política concede e não há direito registrado. ${decisao.razao}`
      };
    }

    if (!mesmaEscala(existente.escala, vinculo.escala)) {
      return {
        ...base,
        tipo: 'UPDATE_WINDOW',
        escalaDesejada: vinculo.escala,
        explicacao:
          'Escala do vínculo mudou. A janela do direito precisa ser recalculada e ressincronizada.'
      };
    }

    return { ...base, tipo: 'KEEP', explicacao: 'Direito coerente com a política vigente.' };
  }
}

function motivoDeRevogacaoPara(decisao: DecisaoDePolitica, vinculo: Relationship): MotivoDeRevogacao {
  if (decisao.regrasAplicadas.includes('R-ORDEM-DE-SERVICO')) return 'WORK_ORDER_CLOSED';
  if (decisao.regrasAplicadas.includes('R-VINCULO-VIGENTE')) {
    return vinculo.situacao === 'SUSPENDED' ? 'RELATIONSHIP_SUSPENDED' : 'RELATIONSHIP_TERMINATED';
  }
  if (decisao.conflitos.length > 0) return 'POLICY_DENIED';
  return 'POLICY_DENIED';
}
