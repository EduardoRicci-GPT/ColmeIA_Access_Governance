// ---------------------------------------------------------------------------
// VÍNCULO SEMÂNTICO FÍSICO — D-052: sinal não é significado
//
// A reconciliação física deste produto é construída sobre uma pressuposição que
// nunca foi escrita: que o endpoint `ep-uti-3` corresponde à porta da UTI 3.
//
// Essa correspondência não é um fato do sistema. É uma linha de configuração
// que alguém digitou numa instalação, provavelmente às pressas, provavelmente
// a partir de uma planilha do integrador, e que ninguém conferiu caminhando até
// a porta. Entre o identificador que o produto comanda e a folha de madeira que
// se abre existe uma cadeia inteira: o controlador, o número do relé, a fiação,
// a fechadura. Cada degrau dessa cadeia é um lugar onde "relé 2" pode significar
// outra coisa.
//
// A consequência não é que o comando falha. É pior: o comando FUNCIONA. A
// nuvem aceita, o controlador atua, o evento de confirmação volta, a trilha
// registra "revogação confirmada no equipamento" — e a porta que trancou foi a
// do depósito ao lado. O produto inteiro, com suas quatro camadas de estado e
// sua cadeia encadeada por hash, passa a produzir evidência honesta sobre o
// objeto errado.
//
// É o modo de falha mais perigoso de um sistema de controle de acesso
// multimarcas, porque ele não aparece em nenhum painel: tudo está verde, e
// tudo está verde sobre outra porta.
//
// O QUE ESTE MÓDULO FAZ, E É SÓ ISSO
//
// Ele exige que a correspondência seja DECLARADA, VERSIONADA e, quando
// verificada, que se saiba QUEM esteve na porta e QUANDO. E então deixa que a
// reconciliação física use essa informação da única maneira honesta: um vínculo
// não verificado não pode produzir confiança CONFIRMED, por mais que o
// fabricante confirme. O fabricante está confirmando o canal; só o levantamento
// em campo confirma a porta.
//
// A versão é o detalhe que faz isto funcionar na prática. Painéis de controle
// de acesso são remexidos: troca de fechadura, obra na ala, manutenção que
// reaproveita um relé livre. A verificação de junho não vale para a fiação de
// outubro, e um vínculo cuja versão avançou sem nova verificação volta sozinho
// para DIVERGENTE — ninguém precisa lembrar de invalidá-lo.
// ---------------------------------------------------------------------------

import { CapacidadeDeEndpoint } from './topologia';

/** O que exatamente se comanda, do outro lado do adaptador. */
export type EspecieDeCanal =
  | 'RELE'
  | 'PORTA_LOGICA_DO_CONTROLADOR'
  | 'LEITOR'
  | 'ZONA_DO_CONTROLADOR'
  | 'SAIDA_AUXILIAR'
  | 'FECHADURA_AUTONOMA';

export interface CanalFisico {
  /** Identificador do controlador ou da fechadura no mundo do fabricante. */
  controladorId: string;
  especie: EspecieDeCanal;
  /** Índice, número ou nome do canal dentro do controlador. */
  indice: string;
}

export function nomeDoCanal(canal: CanalFisico): string {
  return `${canal.controladorId} · ${canal.especie} ${canal.indice}`;
}

/**
 * Quatro estados, e `DECLARADO` é o estado em que toda instalação nasce.
 *
 * `DECLARADO` — alguém digitou a correspondência. É o que existe no primeiro
 *               dia, e é honesto dizer que é isso.
 * `VERIFICADO` — alguém esteve na porta, acionou e viu abrir. Com data, nome e
 *               evidência.
 * `DIVERGENTE` — a verificação apontou outra porta, ou a versão avançou depois
 *               da última verificação. É o estado que o produto mais precisa
 *               saber nomear.
 * `NAO_VERIFICADO` — nem declaração houve: o canal está sendo comandado sem
 *               que ninguém tenha dito a que ele corresponde.
 */
export type EstadoDoVinculo = 'VERIFICADO' | 'DECLARADO' | 'DIVERGENTE' | 'NAO_VERIFICADO';

export const ROTULO_DO_VINCULO: Readonly<Record<EstadoDoVinculo, string>> = Object.freeze({
  VERIFICADO: 'Correspondência verificada em campo',
  DECLARADO: 'Correspondência declarada na configuração, nunca conferida em campo',
  DIVERGENTE: 'Correspondência divergente: o canal comandado não é o recurso nomeado',
  NAO_VERIFICADO: 'Canal comandado sem correspondência declarada'
});

export interface VinculoSemanticoFisico {
  id: string;
  /** O recurso que o produto nomeia, decide e exibe. */
  endpointId: string;
  /** O que se pretende fazer por este canal. */
  capacidade: CapacidadeDeEndpoint;
  /** O que de fato se comanda. */
  canal: CanalFisico;
  /**
   * Versão da configuração física deste endpoint.
   *
   * Avança quando o painel é remexido — troca de fechadura, remanejamento de
   * relé, obra. É a instalação que a avança; o produto apenas compara com a
   * versão em que a verificação aconteceu.
   */
  versao: number;
  estado: EstadoDoVinculo;
  /** A versão vigente quando alguém esteve na porta. */
  versaoVerificada?: number;
  verificadoEm?: Date;
  /** Quem esteve na porta. Não é o operador que digitou a configuração. */
  verificadoPor?: string;
  /** Ordem de serviço, ata, foto do acionamento — o que sustenta a verificação. */
  evidencia?: string;
  observacao?: string;
}

export interface LeituraDoVinculo {
  estado: EstadoDoVinculo;
  /** Verdadeiro quando a versão avançou depois da última verificação. */
  verificacaoEnvelhecida: boolean;
  fatores: readonly string[];
  explicacao: string;
}

/**
 * Reavalia o vínculo contra a versão corrente da configuração.
 *
 * A função existe porque o estado gravado não basta: um vínculo marcado
 * `VERIFICADO` na versão 3 continuaria dizendo `VERIFICADO` depois de a
 * instalação avançar para a versão 4. Reavaliar na leitura — e não na escrita —
 * é o que garante que ninguém precise lembrar de invalidar nada.
 */
export function reavaliarVinculo(
  vinculo: VinculoSemanticoFisico,
  versaoCorrente?: number
): LeituraDoVinculo {
  const versao = versaoCorrente ?? vinculo.versao;
  const fatores: string[] = [
    `canal ${nomeDoCanal(vinculo.canal)} → recurso ${vinculo.endpointId}`,
    `estado gravado ${vinculo.estado}`
  ];

  if (vinculo.estado === 'DIVERGENTE' || vinculo.estado === 'NAO_VERIFICADO') {
    return {
      estado: vinculo.estado,
      verificacaoEnvelhecida: false,
      fatores,
      explicacao: ROTULO_DO_VINCULO[vinculo.estado]
    };
  }

  const envelheceu =
    vinculo.estado === 'VERIFICADO' &&
    vinculo.versaoVerificada !== undefined &&
    vinculo.versaoVerificada < versao;

  if (envelheceu) {
    fatores.push(
      `verificado na versão ${vinculo.versaoVerificada}, configuração hoje na versão ${versao} → divergente`
    );
    return {
      estado: 'DIVERGENTE',
      verificacaoEnvelhecida: true,
      fatores,
      explicacao:
        `A correspondência foi conferida em campo na versão ${vinculo.versaoVerificada} da ` +
        `configuração deste endpoint, e a configuração está hoje na versão ${versao}. ` +
        'O painel foi remexido depois da conferência: o que se comanda hoje pode não ser ' +
        'mais a porta conferida.'
    };
  }

  if (vinculo.estado === 'VERIFICADO' && vinculo.versaoVerificada === undefined) {
    // Verificado sem registrar em que versão: a verificação existe e não é
    // ancorável. Não é fraude e não é prova — é DECLARADO com uma anotação.
    fatores.push('verificação sem versão registrada → não é ancorável, cai para declarado');
    return {
      estado: 'DECLARADO',
      verificacaoEnvelhecida: false,
      fatores,
      explicacao:
        'O vínculo está marcado como verificado, mas não registra em que versão da ' +
        'configuração a verificação aconteceu. Uma verificação que não se ancora numa versão ' +
        'não distingue a porta de hoje da porta de junho.'
    };
  }

  return {
    estado: vinculo.estado,
    verificacaoEnvelhecida: false,
    fatores,
    explicacao: ROTULO_DO_VINCULO[vinculo.estado]
  };
}

/** Vínculo ausente: o canal é comandado e ninguém disse a que corresponde. */
export function vinculoAusente(
  endpointId: string,
  capacidade: CapacidadeDeEndpoint
): VinculoSemanticoFisico {
  return {
    id: `VINC-AUSENTE-${endpointId}-${capacidade}`,
    endpointId,
    capacidade,
    canal: { controladorId: '—', especie: 'PORTA_LOGICA_DO_CONTROLADOR', indice: '—' },
    versao: 0,
    estado: 'NAO_VERIFICADO'
  };
}

/**
 * A porta do host para os vínculos.
 *
 * Ausência significa `NAO_VERIFICADO`, nunca `VERIFICADO`. É a mesma escolha de
 * `SEM_CAMINHOS_LEVANTADOS`: o default otimista deixaria toda instalação nova
 * verde, e um default verde apaga o incentivo de conferir.
 */
export interface ConsultaDeVinculos {
  vinculoDe(endpointId: string, capacidade: CapacidadeDeEndpoint): VinculoSemanticoFisico;
  /** Versão corrente da configuração física do endpoint. */
  versaoCorrente(endpointId: string): number;
}

export const SEM_VINCULOS_DECLARADOS: ConsultaDeVinculos = Object.freeze({
  vinculoDe(endpointId: string, capacidade: CapacidadeDeEndpoint): VinculoSemanticoFisico {
    return vinculoAusente(endpointId, capacidade);
  },
  versaoCorrente(): number {
    return 0;
  }
});

export class VinculosEmMemoria implements ConsultaDeVinculos {
  private readonly vinculos = new Map<string, VinculoSemanticoFisico>();
  private readonly versoes = new Map<string, number>();

  constructor(vinculos: readonly VinculoSemanticoFisico[] = []) {
    for (const vinculo of vinculos) this.declarar(vinculo);
  }

  private chave(endpointId: string, capacidade: CapacidadeDeEndpoint): string {
    return `${endpointId}::${capacidade}`;
  }

  declarar(vinculo: VinculoSemanticoFisico): void {
    this.vinculos.set(this.chave(vinculo.endpointId, vinculo.capacidade), vinculo);
    const atual = this.versoes.get(vinculo.endpointId) ?? 0;
    if (vinculo.versao > atual) this.versoes.set(vinculo.endpointId, vinculo.versao);
  }

  /** A instalação remexeu o painel: a versão avança e as verificações envelhecem. */
  avancarVersao(endpointId: string): number {
    const proxima = (this.versoes.get(endpointId) ?? 0) + 1;
    this.versoes.set(endpointId, proxima);
    return proxima;
  }

  vinculoDe(endpointId: string, capacidade: CapacidadeDeEndpoint): VinculoSemanticoFisico {
    return this.vinculos.get(this.chave(endpointId, capacidade)) ?? vinculoAusente(endpointId, capacidade);
  }

  versaoCorrente(endpointId: string): number {
    return this.versoes.get(endpointId) ?? 0;
  }

  /** Todos os vínculos declarados, já reavaliados contra a versão corrente. */
  reavaliados(): readonly { vinculo: VinculoSemanticoFisico; leitura: LeituraDoVinculo }[] {
    return [...this.vinculos.values()].map((vinculo) => ({
      vinculo,
      leitura: reavaliarVinculo(vinculo, this.versaoCorrente(vinculo.endpointId))
    }));
  }
}

/**
 * A projeção que a observabilidade consome: o estado já REAVALIADO contra a
 * versão corrente, e não o estado gravado. Passar o gravado faria o painel
 * mostrar como verificado um vínculo cuja verificação envelheceu.
 */
export interface VinculoProjetado {
  vinculoId: string;
  endpointId: string;
  capacidade: CapacidadeDeEndpoint;
  estado: EstadoDoVinculo;
}

/** Projeta um vínculo já reavaliado. É o único caminho até o indicador. */
export function projetarVinculo(
  vinculo: VinculoSemanticoFisico,
  versaoCorrente?: number
): VinculoProjetado {
  return {
    vinculoId: vinculo.id,
    endpointId: vinculo.endpointId,
    capacidade: vinculo.capacidade,
    estado: reavaliarVinculo(vinculo, versaoCorrente).estado
  };
}
