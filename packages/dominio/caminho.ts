// ---------------------------------------------------------------------------
// CAMINHO DE ACESSO — D-051: credencial forte não é caminho forte
//
// O produto, até aqui, media a força do que a pessoa APRESENTA: biometria,
// cartão, PIN, carteira no telefone. É a medida que todo fabricante publica, e
// ela responde a uma pergunta que ninguém faz do lado de fora da porta.
//
// A pergunta que se faz do lado de fora é outra: QUAL É O MEIO MAIS FÁCIL DE
// ATRAVESSAR ESTA PORTA? E a resposta raramente é a credencial que o projeto
// escolheu. É a chave mecânica no chaveiro da portaria, a botoeira de saída
// alcançável pelo vão da porta, a senha de serviço de quatro dígitos que o
// instalador deixou e que três turnos conhecem, o modo livre programado para o
// horário de visita e nunca revisto.
//
// Um leitor biométrico numa porta com chave mecânica de cópia livre é uma porta
// com chave mecânica de cópia livre. A biometria não some — mas ela deixa de
// ser o caminho, e passa a ser o caminho que as pessoas honestas usam.
//
// Daí a regra deste módulo, e ela é uma só: A FORÇA DO CAMINHO É A DO SEU ELO
// MAIS FRACO. O cálculo é um mínimo, não uma média e não um máximo. Uma média
// deixaria quatro meios fortes compensarem um fraco, que é precisamente o
// raciocínio que produz a vulnerabilidade; um máximo seria o folheto do
// fabricante.
//
// E um cuidado que o resto do produto já ensinou: NÃO AVALIADO não é FRACO.
// Um endpoint cujo caminho ninguém levantou não é uma porta arrombada — é uma
// porta sobre a qual não se sabe, e o lugar certo dessa ignorância é a tela,
// não o arredondamento para o lado conveniente. É a mesma disciplina de
// `DEVICE_SYNC_UNKNOWN`: quando não se sabe, diz-se que não se sabe.
// ---------------------------------------------------------------------------

import { CredentialMethod, Criticidade, ORDEM_DE_CRITICIDADE } from './topologia';

/**
 * Como se atravessa esta porta, na prática.
 *
 * Duas espécies, e a separação é o ponto do delta. `CREDENCIAL` é o caminho
 * projetado — o que o sistema emite, sincroniza e revoga. `BYPASS` é tudo o
 * que atravessa a porta SEM passar pelo sistema: o produto não emite, não
 * sincroniza, não revoga e, até este módulo existir, não sabia nomear.
 */
export type MeioDeAcesso =
  | { especie: 'CREDENCIAL'; metodo: CredentialMethod }
  | { especie: 'BYPASS'; forma: FormaDeBypass };

/**
 * As formas de bypass que uma unidade de saúde tem de fato.
 *
 * A lista não é especulativa: cada item aqui existe por exigência de segurança
 * de vida, de manutenção ou de norma de incêndio. É por isso que o produto não
 * pode propor eliminá-las — pode apenas exigir que elas sejam DECLARADAS, para
 * que a conta da exposição seja feita com elas dentro.
 */
export type FormaDeBypass =
  | 'CHAVE_MECANICA'
  | 'BOTOEIRA_INTERNA'
  | 'BARRA_ANTIPANICO'
  | 'SENHA_DE_SERVICO_DO_INSTALADOR'
  | 'MODO_LIVRE_PROGRAMADO'
  | 'DESTRAVA_MANUAL_NO_CONTROLADOR'
  | 'INTERTRAVAMENTO_DE_INCENDIO';

/**
 * Força de um meio, em quatro graus.
 *
 * `NAO_AVALIADA` é grau, e não ausência de grau: ela participa do cálculo
 * como incerteza declarada, e um caminho que a contém não pode ser lido como
 * forte nem como fraco.
 */
export type ForcaDeMeio = 'FORTE' | 'MODERADA' | 'FRACA' | 'NAO_AVALIADA';

export const ORDEM_DE_FORCA: Readonly<Record<ForcaDeMeio, number>> = Object.freeze({
  NAO_AVALIADA: -1,
  FRACA: 0,
  MODERADA: 1,
  FORTE: 2
});

/**
 * Força por método de credencial. Ponto de partida configurável por
 * instalação, como `CRITICIDADE_SUGERIDA` — não doutrina.
 *
 * `PIN` é FRACA e não MODERADA pela razão hospitalar: num posto de enfermagem
 * o PIN é compartilhado em três dias, porque a alternativa é a auxiliar ficar
 * esperando alguém com crachá enquanto o paciente espera a medicação. Chamar
 * de moderado um segredo que a operação obriga a compartilhar seria medir a
 * intenção do projeto, não o caminho.
 */
export const FORCA_POR_METODO: Readonly<Record<CredentialMethod, ForcaDeMeio>> = Object.freeze({
  CARD: 'MODERADA',
  PIN: 'FRACA',
  QR: 'FRACA',
  NFC: 'MODERADA',
  BLE: 'MODERADA',
  BIOMETRIC: 'FORTE',
  MOBILE_WALLET: 'FORTE'
});

/**
 * Força por forma de bypass.
 *
 * `BARRA_ANTIPANICO` e `INTERTRAVAMENTO_DE_INCENDIO` são FRACAS do ponto de
 * vista do controle de acesso e INEGOCIÁVEIS do ponto de vista de segurança de
 * vida. Registrar os dois fatos ao mesmo tempo é o que permite a leitura
 * correta: a exposição que elas criam não se resolve removendo-as, e sim
 * compensando-a — vigilância, detecção de porta aberta, auditoria de passagem.
 * Um sistema que as tratasse como defeito a corrigir estaria propondo trancar
 * a saída de emergência de um hospital.
 */
export const FORCA_POR_BYPASS: Readonly<Record<FormaDeBypass, ForcaDeMeio>> = Object.freeze({
  CHAVE_MECANICA: 'FRACA',
  BOTOEIRA_INTERNA: 'MODERADA',
  BARRA_ANTIPANICO: 'FRACA',
  SENHA_DE_SERVICO_DO_INSTALADOR: 'FRACA',
  MODO_LIVRE_PROGRAMADO: 'FRACA',
  DESTRAVA_MANUAL_NO_CONTROLADOR: 'FRACA',
  INTERTRAVAMENTO_DE_INCENDIO: 'FRACA'
});

/** Bypass exigido por segurança de vida: a exposição se compensa, não se remove. */
export const BYPASS_DE_SEGURANCA_DE_VIDA: ReadonlySet<FormaDeBypass> = new Set<FormaDeBypass>([
  'BARRA_ANTIPANICO',
  'INTERTRAVAMENTO_DE_INCENDIO'
]);

/**
 * De onde vem o que se sabe sobre o caminho.
 *
 * `PRESUMIDA` existe para ser desconfortável. Um caminho presumido não sustenta
 * leitura de exposição em recurso crítico, e a avaliação diz isso em vez de
 * silenciar — porque presumir o caminho de um cofre de psicotrópicos é
 * exatamente o erro que este delta encontrou.
 */
export type ProcedenciaDoCaminho =
  | 'LEVANTAMENTO_EM_CAMPO'
  | 'DECLARADA_PELO_FABRICANTE'
  | 'DECLARADA_PELA_INSTALACAO'
  | 'PRESUMIDA';

export interface CaminhoDeAcesso {
  endpointId: string;
  /** Todos os meios que atravessam este endpoint. Vazio = nada levantado. */
  meios: readonly MeioDeAcesso[];
  procedencia: ProcedenciaDoCaminho;
  levantadoEm?: Date;
  levantadoPor?: string;
  observacao?: string;
}

export interface LeituraDeForcaDoCaminho {
  forca: ForcaDeMeio;
  /** O meio que determinou a leitura. `null` quando nada foi levantado. */
  eloMaisFraco: MeioDeAcesso | null;
  /** Meios de bypass exigidos por segurança de vida, se houver. */
  bypassDeVida: readonly FormaDeBypass[];
  fatores: readonly string[];
}

function forcaDoMeio(meio: MeioDeAcesso): ForcaDeMeio {
  return meio.especie === 'CREDENCIAL'
    ? FORCA_POR_METODO[meio.metodo] ?? 'NAO_AVALIADA'
    : FORCA_POR_BYPASS[meio.forma] ?? 'NAO_AVALIADA';
}

export function nomeDoMeio(meio: MeioDeAcesso): string {
  return meio.especie === 'CREDENCIAL' ? `credencial ${meio.metodo}` : `bypass ${meio.forma}`;
}

/**
 * A força do caminho é a do elo mais fraco.
 *
 * Caminho vazio devolve `NAO_AVALIADA`, e não `FORTE`. A tentação de devolver
 * `FORTE` — "não há meio declarado, logo não há como entrar" — produziria o
 * pior resultado possível do produto: toda porta ainda não levantada apareceria
 * verde no painel, e o levantamento perderia o único incentivo que tem.
 */
export function forcaDoCaminho(caminho: CaminhoDeAcesso): LeituraDeForcaDoCaminho {
  const fatores: string[] = [`procedência ${caminho.procedencia}`];
  const bypassDeVida = caminho.meios
    .filter((meio) => meio.especie === 'BYPASS' && BYPASS_DE_SEGURANCA_DE_VIDA.has(meio.forma))
    .map((meio) => (meio.especie === 'BYPASS' ? meio.forma : 'CHAVE_MECANICA'));

  if (caminho.meios.length === 0) {
    fatores.push('nenhum meio levantado → não avaliado, e não forte');
    return { forca: 'NAO_AVALIADA', eloMaisFraco: null, bypassDeVida, fatores };
  }

  let eloMaisFraco = caminho.meios[0] ?? null;
  let forca: ForcaDeMeio = eloMaisFraco ? forcaDoMeio(eloMaisFraco) : 'NAO_AVALIADA';
  for (const meio of caminho.meios) {
    const candidata = forcaDoMeio(meio);
    if (ORDEM_DE_FORCA[candidata] < ORDEM_DE_FORCA[forca]) {
      forca = candidata;
      eloMaisFraco = meio;
    }
  }
  if (eloMaisFraco) {
    fatores.push(`${caminho.meios.length} meio(s); elo mais fraco: ${nomeDoMeio(eloMaisFraco)} → ${forca}`);
  }
  if (bypassDeVida.length > 0) {
    fatores.push(
      `${bypassDeVida.length} meio(s) exigido(s) por segurança de vida: a exposição se compensa, não se remove`
    );
  }
  return { forca, eloMaisFraco, bypassDeVida, fatores };
}

/**
 * Exposição do recurso — a leitura que cruza o caminho com o que há atrás da
 * porta.
 *
 * Quatro valores, e nenhum deles é um booleano de aprovação. `EXIGE_COMPENSACAO`
 * é o valor mais importante do conjunto, porque é o único que descreve a
 * situação real da maioria das portas de um hospital: o caminho é mais fraco do
 * que o recurso pede, remover o meio fraco não é opção, e o que resta é
 * compensar com vigilância, detecção e auditoria. Um produto que só soubesse
 * dizer ACEITÁVEL ou INACEITÁVEL obrigaria a instalação a mentir numa das duas
 * direções.
 */
export type NivelDeExposicao = 'ACEITAVEL' | 'EXIGE_COMPENSACAO' | 'INACEITAVEL' | 'NAO_AVALIADA';

export interface LeituraDeExposicao {
  nivel: NivelDeExposicao;
  criticidade: Criticidade;
  forcaDoCaminho: ForcaDeMeio;
  eloMaisFraco: MeioDeAcesso | null;
  fatores: readonly string[];
  explicacao: string;
}

/**
 * A tabela da exposição, declarada e não emergente.
 *
 * A leitura em uma frase: quanto mais crítico o recurso, menos tolerância a
 * caminho fraco — e caminho NÃO AVALIADO em recurso crítico não é aceitável
 * nem inaceitável: é levantamento em falta, que é um trabalho a fazer e não
 * uma nota a dar.
 */
export function avaliarExposicao(
  criticidade: Criticidade,
  caminho: CaminhoDeAcesso
): LeituraDeExposicao {
  const leitura = forcaDoCaminho(caminho);
  const fatores = [...leitura.fatores];
  const grau = ORDEM_DE_CRITICIDADE[criticidade];

  let nivel: NivelDeExposicao;
  if (leitura.forca === 'NAO_AVALIADA') {
    nivel = grau >= ORDEM_DE_CRITICIDADE.HIGH ? 'EXIGE_COMPENSACAO' : 'NAO_AVALIADA';
    fatores.push(
      grau >= ORDEM_DE_CRITICIDADE.HIGH
        ? `recurso ${criticidade} sem caminho levantado → o levantamento é a compensação devida`
        : `recurso ${criticidade} sem caminho levantado → permanece não avaliado`
    );
  } else if (leitura.forca === 'FRACA') {
    nivel = grau >= ORDEM_DE_CRITICIDADE.CRITICAL ? 'INACEITAVEL' : 'EXIGE_COMPENSACAO';
    fatores.push(`elo fraco em recurso ${criticidade} → ${nivel}`);
  } else if (leitura.forca === 'MODERADA') {
    nivel = grau >= ORDEM_DE_CRITICIDADE.CRITICAL ? 'EXIGE_COMPENSACAO' : 'ACEITAVEL';
    fatores.push(`elo moderado em recurso ${criticidade} → ${nivel}`);
  } else {
    nivel = 'ACEITAVEL';
    fatores.push(`elo mais fraco é FORTE em recurso ${criticidade} → ACEITAVEL`);
  }

  // Procedência presumida não muda o elo mais fraco; muda o que se pode
  // afirmar sobre ele. Num recurso de alta criticidade, afirmar ACEITAVEL
  // sobre caminho presumido seria dar à presunção o estatuto de levantamento.
  if (
    caminho.procedencia === 'PRESUMIDA' &&
    nivel === 'ACEITAVEL' &&
    grau >= ORDEM_DE_CRITICIDADE.HIGH
  ) {
    nivel = 'EXIGE_COMPENSACAO';
    fatores.push('caminho presumido em recurso de alta criticidade → exige levantamento em campo');
  }

  return {
    nivel,
    criticidade,
    forcaDoCaminho: leitura.forca,
    eloMaisFraco: leitura.eloMaisFraco,
    fatores,
    explicacao: explicarExposicao(nivel, criticidade, leitura)
  };
}

function explicarExposicao(
  nivel: NivelDeExposicao,
  criticidade: Criticidade,
  leitura: LeituraDeForcaDoCaminho
): string {
  const elo = leitura.eloMaisFraco ? nomeDoMeio(leitura.eloMaisFraco) : 'nenhum meio levantado';
  switch (nivel) {
    case 'ACEITAVEL':
      return `Caminho compatível com um recurso ${criticidade}. Elo mais fraco: ${elo}.`;
    case 'EXIGE_COMPENSACAO':
      return (
        `O caminho é mais fraco do que um recurso ${criticidade} pede. Elo mais fraco: ${elo}. ` +
        'Não há aqui ordem de remover o meio — há exposição a compensar com vigilância, ' +
        'detecção de porta aberta e auditoria de passagem.'
      );
    case 'INACEITAVEL':
      return (
        `Recurso ${criticidade} atravessável por ${elo}. A credencial escolhida para esta porta ` +
        'não descreve como se entra nela.'
      );
    default:
      return (
        `Ninguém levantou os meios de acesso deste recurso ${criticidade}. O produto não sabe ` +
        'como se entra aqui, e dizer que sabe seria pior do que não saber.'
      );
  }
}

/** Caminho vazio, com a procedência correta: nada foi levantado ainda. */
export function caminhoNaoLevantado(endpointId: string): CaminhoDeAcesso {
  return { endpointId, meios: [], procedencia: 'PRESUMIDA' };
}

/**
 * A porta do host para os caminhos levantados.
 *
 * Como toda consulta deste produto, ausência significa ausência: um endpoint
 * sem caminho declarado devolve caminho não levantado, nunca caminho forte.
 */
export interface ConsultaDeCaminhos {
  caminhoDe(endpointId: string): CaminhoDeAcesso;
}

export const SEM_CAMINHOS_LEVANTADOS: ConsultaDeCaminhos = Object.freeze({
  caminhoDe(endpointId: string): CaminhoDeAcesso {
    return caminhoNaoLevantado(endpointId);
  }
});

export class CaminhosEmMemoria implements ConsultaDeCaminhos {
  private readonly porEndpoint = new Map<string, CaminhoDeAcesso>();

  constructor(caminhos: readonly CaminhoDeAcesso[] = []) {
    for (const caminho of caminhos) this.porEndpoint.set(caminho.endpointId, caminho);
  }

  declarar(caminho: CaminhoDeAcesso): void {
    this.porEndpoint.set(caminho.endpointId, caminho);
  }

  caminhoDe(endpointId: string): CaminhoDeAcesso {
    return this.porEndpoint.get(endpointId) ?? caminhoNaoLevantado(endpointId);
  }

  declarados(): readonly CaminhoDeAcesso[] {
    return [...this.porEndpoint.values()];
  }
}
