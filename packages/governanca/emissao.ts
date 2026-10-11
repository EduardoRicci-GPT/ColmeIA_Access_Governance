// ---------------------------------------------------------------------------
// GOVERNANÇA DE EMISSÃO — onde D-051 e D-055 passam a decidir algo
//
// Os dois deltas desta semana que mudam o produto apontam para o MESMO
// instante, e é um instante que o ciclo atravessava sem olhar: a emissão da
// credencial.
//
//   D-051 — a força do caminho, e não da credencial, descreve a porta.
//   D-055 — emitir é assumir uma janela residual que a revogação não encurta.
//
// Antes deste módulo, o ciclo decidia o DIREITO com todo o rigor do mundo —
// vínculo, papel, turno, competência, segregação, aprovação humana ligada ao
// hash do material — e depois materializava o direito sem perguntar nada sobre
// o que estava materializando. O Policy Engine aprovava a entrada de uma
// auxiliar no cofre de psicotrópicos, e a credencial escolhida era um PIN
// offline de noventa dias numa fechadura sem gateway. A decisão de acesso
// estava correta; a chave entregue era outra coisa.
//
// É a sexta variante do D-022 neste repositório, com um detalhe que a torna
// diferente das cinco anteriores: aqui não havia capacidade sem chamador — não
// havia capacidade nenhuma. O produto decidia o direito e era indiferente ao
// que o direito virava.
//
// O QUE ESTE PORTÃO NÃO FAZ
//
// Ele não recusa por limiar em sombra. Os tetos de janela residual nunca foram
// medidos contra a operação de um hospital, e um número sem estatuto não
// derruba uma emissão: ele CONVOCA uma pessoa. A recusa — a única — é
// estrutural e independe de calibragem: credencial sem término previsto num
// recurso que a instituição declarou crítico, sem caminho de revogação. Ali o
// produto não está escolhendo um limite: está se recusando a dar uma chave que
// não tem como pedir de volta.
// ---------------------------------------------------------------------------

import {
  CapacidadeDeRevogacao,
  JanelaResidual,
  ModoDeRevogacao,
  PerfilDeRevogabilidade,
  TETO_RESIDUAL_POR_CRITICIDADE,
  dentroDoTetoResidual,
  derivarPerfilDeRevogabilidade
} from '../dominio/revogabilidade';
import {
  CaminhoDeAcesso,
  LeituraDeExposicao,
  SEM_CAMINHOS_LEVANTADOS,
  avaliarExposicao
} from '../dominio/caminho';
import { CredentialMethod, Criticidade } from '../dominio/topologia';
import { ProviderCapabilities } from '../adapters/contrato/tipos';
import { RegistroDeCalibracao } from '../mpeh-kernel/calibration/registro';
import { ConstanteCalibrada } from '../mpeh-kernel/calibration/tipos';

/**
 * Traduz a capacidade declarada pelo fabricante na capacidade de revogação que
 * o domínio entende.
 *
 * A tradução vive aqui, e não no domínio, por decisão de fronteira: `dominio/`
 * não pode conhecer `ProviderCapabilities`, sob pena de o fabricante alcançar a
 * camada que o item 43 protege. Quem conhece os dois lados é a governança.
 *
 * `temCaminhoDeSincronizacao` não sai do fabricante: sai da topologia da
 * instalação. Um modelo que suporta gateway instalado sem gateway não tem
 * caminho de sincronização, e perguntar isso ao fabricante devolveria `true`.
 */
export function capacidadeDeRevogacaoDe(
  capacidades: ProviderCapabilities,
  opcoes: {
    temGateway: boolean;
    minutosTipicosDeSincronizacao?: number;
  }
): CapacidadeDeRevogacao {
  return {
    revogacaoRemota: capacidades.remoteRevocation,
    confirmaEstadoFisico: capacidades.physicalStateReconciliation,
    credenciaisOffline: capacidades.offlineCredentials,
    // Gateway instalado OU equipamento que consulta a ColmeIA no instante do
    // acesso: os dois são caminhos por onde a revogação alcança a porta. A
    // existência de API na nuvem do fabricante não é um deles — ela alcança a
    // nuvem, e a nuvem não é a fechadura.
    temCaminhoDeSincronizacao: opcoes.temGateway || capacidades.onlineDecision,
    minutosTipicosDeSincronizacao: opcoes.minutosTipicosDeSincronizacao
  };
}

export type VereditoDeEmissao = 'PERMITE' | 'EXIGE_APROVACAO' | 'RECUSA';

/**
 * O material que uma pessoa revisaria para liberar ESTA emissão.
 *
 * Separado de `MaterialDeRevisao` de propósito, e a razão é a mesma que criou
 * aquele: o que se revisa define o que foi aprovado. Quem aprova uma emissão
 * está aprovando uma janela residual sobre um recurso, e não o direito de
 * entrada — que já foi aprovado por outro caminho, com outro hash.
 */
export interface MaterialDeEmissao {
  endpointId: string;
  nomeDoEndpoint: string;
  criticidade: Criticidade;
  metodo: CredentialMethod;
  modoDeRevogacao: ModoDeRevogacao;
  /** `null` quando a credencial não tem término previsto. */
  janelaResidualMinutos: number | null;
  tetoDoRecursoMinutos: number | null;
  nivelDeExposicao: string;
  forcaDoCaminho: string;
}

/**
 * Serialização estável para o hash do human-gate. Ordem fixa e separador que
 * não aparece nos valores — mudar um campo aqui invalida as aprovações
 * vigentes, o que é a propriedade e não o custo.
 */
export function serializarMaterialDeEmissao(material: MaterialDeEmissao): string {
  return [
    material.endpointId,
    material.nomeDoEndpoint,
    material.criticidade,
    material.metodo,
    material.modoDeRevogacao,
    material.janelaResidualMinutos === null ? 'SEM_TERMINO' : String(material.janelaResidualMinutos),
    material.tetoDoRecursoMinutos === null ? 'SEM_TETO' : String(material.tetoDoRecursoMinutos),
    material.nivelDeExposicao,
    material.forcaDoCaminho
  ].join('§');
}

export interface AvaliacaoDeEmissao {
  veredito: VereditoDeEmissao;
  perfil: PerfilDeRevogabilidade;
  exposicao: LeituraDeExposicao;
  janelaResidual: JanelaResidual;
  tetoDoRecurso: number | null;
  /** Verdadeiro quando a janela residual estourou o teto do recurso. */
  excedeuTeto: boolean;
  fatores: readonly string[];
  /** Os avisos de calibragem dos limiares usados. Viajam com o veredito. */
  ressalvas: readonly string[];
  material: MaterialDeEmissao;
  explicacao: string;
}

export interface PedidoDeEmissao {
  endpointId: string;
  nomeDoEndpoint: string;
  criticidade: Criticidade;
  metodo: CredentialMethod;
  credentialId?: string;
  emitidaEm: Date;
  expiraEm?: Date;
  capacidade: CapacidadeDeRevogacao;
  /** O caminho levantado deste endpoint. Ausente = não levantado. */
  caminho?: CaminhoDeAcesso;
}

// ---------------------------------------------------------------------------
// OS LIMIARES, COM ESTATUTO
//
// Mesma disciplina dos pesos do Health Score (ADR-0013): um número que decide
// algo neste produto não entra como literal. Ele entra como constante
// calibrada, em SOMBRA enquanto não houver medição, e quem o lê recebe a
// ressalva junto do valor — de modo que esconder a ressalva passe a ser ato.
// ---------------------------------------------------------------------------

const CURADOR = 'Nível E — governança de acesso ColmeIA';
const VERIFICADO_EM = '2026-10-11';

const RESSALVA_DO_TETO =
  'Teto derivado da ordem de grandeza da reação operacional esperada, não de operação medida. ' +
  'Sobe de estatuto quando for calibrado contra o tempo real de reação de uma instalação. ' +
  'Enquanto estiver em sombra, ele CONVOCA uma pessoa e nunca recusa sozinho.';

function tetoCalibrado(criticidade: Criticidade): ConstanteCalibrada<number> {
  const valor = TETO_RESIDUAL_POR_CRITICIDADE[criticidade];
  return {
    id: `emissao.tetoResidual.${criticidade}`,
    rotulo: `Janela residual tolerada em recurso ${criticidade}, em minutos`,
    // `null` significa sem teto, e a constante precisa de número: o valor
    // sentinela é -1, e quem lê converte. Guardar `null` aqui faria o registro
    // de calibragem aceitar ausência de decisão como decisão.
    valor: valor ?? -1,
    estatuto: 'SOMBRA',
    procedencia:
      'D-055 (consolidado de 10/10/2026) — "avaliar a revogabilidade e a janela residual de ' +
      'credenciais antes da emissão"; faixas derivadas da ordem de grandeza da reação ' +
      'operacional por criticidade',
    curador: CURADOR,
    verificadoEm: VERIFICADO_EM,
    ressalva: RESSALVA_DO_TETO
  };
}

export const CONSTANTES_DA_EMISSAO: readonly ConstanteCalibrada<number>[] = Object.freeze([
  tetoCalibrado('LOW'),
  tetoCalibrado('MEDIUM'),
  tetoCalibrado('HIGH'),
  tetoCalibrado('CRITICAL')
]);

export function registroDaEmissao(): RegistroDeCalibracao {
  return new RegistroDeCalibracao(CONSTANTES_DA_EMISSAO);
}

export interface TetosLidos {
  /** Minutos tolerados por criticidade. `null` = sem teto declarado. */
  tetos: Readonly<Record<Criticidade, number | null>>;
  ressalvas: readonly string[];
  emSombra: boolean;
}

export function lerTetosResiduais(registro: RegistroDeCalibracao = registroDaEmissao()): TetosLidos {
  const tetos: Record<string, number | null> = {};
  const ressalvas: string[] = [];
  let emSombra = false;
  for (const constante of CONSTANTES_DA_EMISSAO) {
    const criticidade = constante.id.replace('emissao.tetoResidual.', '') as Criticidade;
    const leitura = registro.obterEmSombra<number>(constante.id);
    tetos[criticidade] = leitura.valor < 0 ? null : leitura.valor;
    if (leitura.estatuto !== 'INSTRUMENTADA') {
      emSombra = true;
      ressalvas.push(leitura.aviso);
    }
  }
  return {
    tetos: tetos as Readonly<Record<Criticidade, number | null>>,
    ressalvas,
    emSombra
  };
}

/**
 * O portão de emissão.
 *
 * Três vereditos, e a assimetria entre eles é a decisão de produto deste
 * módulo:
 *
 *   PERMITE         — a janela residual cabe no teto do recurso, e o caminho
 *                     não está em exposição inaceitável.
 *   EXIGE_APROVACAO — alguma das duas leituras pede gente. É o caso comum, e
 *                     deve ser: a maioria das portas de um hospital tem
 *                     caminho mais fraco do que o recurso pede.
 *   RECUSA          — credencial sem término previsto, sem caminho de
 *                     revogação, em recurso CRITICAL. Nada aqui é calibragem:
 *                     é a chave que não se pede de volta.
 */
export function avaliarEmissao(
  pedido: PedidoDeEmissao,
  tetosLidos: TetosLidos = lerTetosResiduais()
): AvaliacaoDeEmissao {
  const perfil = derivarPerfilDeRevogabilidade({
    endpointId: pedido.endpointId,
    metodo: pedido.metodo,
    credentialId: pedido.credentialId,
    capacidade: pedido.capacidade,
    expiraEm: pedido.expiraEm,
    emitidaEm: pedido.emitidaEm
  });
  const caminho = pedido.caminho ?? SEM_CAMINHOS_LEVANTADOS.caminhoDe(pedido.endpointId);
  const exposicao = avaliarExposicao(pedido.criticidade, caminho);
  const teto = tetosLidos.tetos[pedido.criticidade] ?? null;
  const excedeuTeto = !dentroDoTetoResidual(perfil.janelaResidual, teto);

  const fatores: string[] = [
    `modo de revogação ${perfil.modo}`,
    perfil.janelaResidual.minutos === null
      ? 'janela residual sem término previsto'
      : `janela residual de ${perfil.janelaResidual.minutos} min (${perfil.janelaResidual.origem})`,
    teto === null
      ? `recurso ${pedido.criticidade} sem teto residual declarado`
      : `teto do recurso ${pedido.criticidade}: ${teto} min`,
    `exposição do caminho ${exposicao.nivel} (elo mais fraco ${exposicao.forcaDoCaminho})`
  ];

  let veredito: VereditoDeEmissao = 'PERMITE';

  // A única recusa, e ela não depende de número calibrado. Note a conjunção:
  // sem término previsto E sem caminho de revogação E recurso crítico. Afrouxar
  // qualquer um dos três transformaria a recusa estrutural em limiar, e um
  // limiar em sombra não recusa nada neste produto.
  const semCaminhoDeVolta =
    perfil.modo === 'IRREVOGAVEL_ATE_EXPIRAR' && perfil.janelaResidual.minutos === null;
  if (semCaminhoDeVolta && pedido.criticidade === 'CRITICAL') {
    veredito = 'RECUSA';
    fatores.push(
      'credencial sem término previsto e sem caminho de revogação em recurso CRITICAL → recusa estrutural'
    );
  } else if (semCaminhoDeVolta || excedeuTeto || exposicao.nivel === 'INACEITAVEL') {
    veredito = 'EXIGE_APROVACAO';
    if (semCaminhoDeVolta) fatores.push('credencial que só para ao expirar, e não expira → convoca decisão humana');
    if (excedeuTeto) fatores.push('janela residual acima do teto do recurso → convoca decisão humana');
    if (exposicao.nivel === 'INACEITAVEL') fatores.push('exposição inaceitável do caminho → convoca decisão humana');
  } else if (exposicao.nivel === 'EXIGE_COMPENSACAO' && pedido.criticidade === 'CRITICAL') {
    veredito = 'EXIGE_APROVACAO';
    fatores.push('recurso CRITICAL com caminho que exige compensação → convoca decisão humana');
  }

  const material: MaterialDeEmissao = {
    endpointId: pedido.endpointId,
    nomeDoEndpoint: pedido.nomeDoEndpoint,
    criticidade: pedido.criticidade,
    metodo: pedido.metodo,
    modoDeRevogacao: perfil.modo,
    janelaResidualMinutos: perfil.janelaResidual.minutos,
    tetoDoRecursoMinutos: teto,
    nivelDeExposicao: exposicao.nivel,
    forcaDoCaminho: exposicao.forcaDoCaminho
  };

  return {
    veredito,
    perfil,
    exposicao,
    janelaResidual: perfil.janelaResidual,
    tetoDoRecurso: teto,
    excedeuTeto,
    fatores,
    ressalvas: tetosLidos.ressalvas,
    material,
    explicacao: explicarEmissao(veredito, pedido, perfil, exposicao, teto)
  };
}

function explicarEmissao(
  veredito: VereditoDeEmissao,
  pedido: PedidoDeEmissao,
  perfil: PerfilDeRevogabilidade,
  exposicao: LeituraDeExposicao,
  teto: number | null
): string {
  const janela =
    perfil.janelaResidual.minutos === null
      ? 'sem término previsto'
      : `${perfil.janelaResidual.minutos} min`;
  switch (veredito) {
    case 'PERMITE':
      return (
        `Emissão de credencial ${pedido.metodo} em ${pedido.nomeDoEndpoint} (${pedido.criticidade}). ` +
        `Revogação: ${perfil.modo}, janela residual ${janela}` +
        `${teto === null ? '' : `, dentro do teto de ${teto} min`}. ${perfil.oQuePrecisaAcontecer}`
      );
    case 'EXIGE_APROVACAO':
      return (
        `Esta emissão cria uma janela de ${janela} em ${pedido.nomeDoEndpoint} ` +
        `(${pedido.criticidade})${teto === null ? '' : `, contra um teto de ${teto} min`}. ` +
        `${perfil.oQuePrecisaAcontecer} ${exposicao.explicacao} ` +
        'Quem assume essa janela é uma pessoa com alçada, não o ciclo.'
      );
    default:
      return (
        `Emissão recusada em ${pedido.nomeDoEndpoint} (${pedido.criticidade}): a credencial ` +
        `${pedido.metodo} pedida não expira e não tem caminho de revogação. ${perfil.oQuePrecisaAcontecer} ` +
        'O produto não entrega, para um recurso crítico, uma chave que não consegue pedir de volta. ' +
        'Caminhos possíveis: declarar expiração, instalar caminho de sincronização, ou escolher ' +
        'outro método para esta porta.'
      );
  }
}

/** Frase curta para o alto da tela, quando os tetos estão em sombra. */
export function avisoDeTetosEmSombra(lidos: TetosLidos): string | null {
  if (!lidos.emSombra) return null;
  return (
    `${lidos.ressalvas.length} dos ${CONSTANTES_DA_EMISSAO.length} tetos de janela residual estão ` +
    'em SOMBRA: derivam da ordem de grandeza esperada, não de operação medida. Eles convocam ' +
    'revisão humana; não recusam emissão sozinhos.'
  );
}

/**
 * A porta do host para as capacidades de revogação por endpoint.
 *
 * Como as demais consultas deste produto, ausência significa ausência de
 * conhecimento — e aqui o default é o PIOR caso declarado, não o melhor. Um
 * endpoint sobre o qual nada se sabe não é um endpoint com revogação remota
 * confirmada: é um endpoint que o produto não levantou, e tratá-lo como o
 * melhor caso faria a emissão passar livre exatamente onde falta informação.
 */
export interface ConsultaDeRevogabilidade {
  capacidadeDe(endpointId: string): CapacidadeDeRevogacao;
}

export const REVOGABILIDADE_DESCONHECIDA: ConsultaDeRevogabilidade = Object.freeze({
  capacidadeDe(): CapacidadeDeRevogacao {
    return {
      revogacaoRemota: false,
      confirmaEstadoFisico: false,
      credenciaisOffline: true,
      temCaminhoDeSincronizacao: false
    };
  }
});

export class RevogabilidadeEmMemoria implements ConsultaDeRevogabilidade {
  private readonly porEndpoint = new Map<string, CapacidadeDeRevogacao>();

  constructor(entradas: readonly (CapacidadeDeRevogacao & { endpointId: string })[] = []) {
    for (const entrada of entradas) {
      const { endpointId, ...capacidade } = entrada;
      this.porEndpoint.set(endpointId, capacidade);
    }
  }

  declarar(endpointId: string, capacidade: CapacidadeDeRevogacao): void {
    this.porEndpoint.set(endpointId, capacidade);
  }

  capacidadeDe(endpointId: string): CapacidadeDeRevogacao {
    return this.porEndpoint.get(endpointId) ?? REVOGABILIDADE_DESCONHECIDA.capacidadeDe(endpointId);
  }
}
