// ---------------------------------------------------------------------------
// REVOGABILIDADE — D-055: emitir não é poder revogar
//
// Todo o produto, até aqui, soube responder "esta revogação chegou à porta?".
// É a pergunta que justifica a existência das quatro camadas de estado, e ela é
// feita DEPOIS da emissão. O delta desta semana aponta para a pergunta anterior,
// que ninguém estava fazendo:
//
//   no instante em que esta credencial for emitida, o que exatamente será
//   necessário para fazê-la parar de funcionar — e quanto tempo isso leva?
//
// A diferença é inteira. Uma eKey online numa fechadura com gateway revoga em
// segundos e confirma. Um PIN offline de 90 dias gravado numa fechadura sem
// comunicação não revoga: ele EXPIRA. Entre a ordem de revogação e o fim do
// risco há noventa dias, e nenhuma tela, nenhum escalonamento e nenhum
// fabricante encurta esse intervalo. O produto pode escolher não emitir; não
// pode escolher revogar depois.
//
// É por isso que a revogabilidade é critério de EMISSÃO e não de operação. No
// momento da emissão a decisão ainda é reversível a custo zero. Um minuto
// depois, a janela residual já existe, e existir é tudo o que ela precisa fazer.
//
// O nome do erro que este módulo impede: apresentar expiração administrativa
// como invalidação física. "Credencial revogada" na tela, noventa dias de porta
// aberta no mundo.
// ---------------------------------------------------------------------------

import { CredentialMethod, Criticidade } from './topologia';

/**
 * Como esta credencial para de funcionar — cinco modos, em ordem de piora.
 *
 * A distinção entre `REMOTA_CONFIRMADA` e `REMOTA_SEM_CONFIRMACAO` é a mesma
 * que separa `ACCEPTED` de `CONFIRMED` no contrato de adaptadores, e aqui ela
 * tem consequência de emissão: um fabricante que aceita a ordem e nunca
 * confirma produz uma revogação que a ColmeIA não consegue provar — e provar é
 * o que uma investigação pede.
 */
export type ModoDeRevogacao =
  | 'REMOTA_CONFIRMADA'
  | 'REMOTA_SEM_CONFIRMACAO'
  | 'EXIGE_SINCRONIZACAO'
  | 'EXIGE_VISITA_TECNICA'
  | 'IRREVOGAVEL_ATE_EXPIRAR';

export const ORDEM_DE_REVOGABILIDADE: Readonly<Record<ModoDeRevogacao, number>> = Object.freeze({
  REMOTA_CONFIRMADA: 0,
  REMOTA_SEM_CONFIRMACAO: 1,
  EXIGE_SINCRONIZACAO: 2,
  EXIGE_VISITA_TECNICA: 3,
  IRREVOGAVEL_ATE_EXPIRAR: 4
});

export const ROTULO_DE_REVOGACAO: Readonly<Record<ModoDeRevogacao, string>> = Object.freeze({
  REMOTA_CONFIRMADA: 'Revogação remota, com confirmação do equipamento',
  REMOTA_SEM_CONFIRMACAO: 'Revogação remota aceita pela nuvem, sem confirmação do equipamento',
  EXIGE_SINCRONIZACAO: 'Revogação depende de sincronização do equipamento',
  EXIGE_VISITA_TECNICA: 'Revogação exige alguém no local',
  IRREVOGAVEL_ATE_EXPIRAR: 'Não há revogação: a credencial só para de funcionar ao expirar'
});

/**
 * A janela residual — o intervalo entre a ordem de revogação e o fim do risco,
 * no PIOR caso.
 *
 * `minutos: null` significa SEM TÉRMINO PREVISTO, e é o valor que carrega a
 * descoberta deste delta: uma credencial sem expiração num equipamento sem
 * revogação remota não tem janela longa — não tem janela. A diferença entre
 * "90 dias" e "indefinido" é o que separa um risco datado de uma chave dada.
 */
export interface JanelaResidual {
  minutos: number | null;
  /** De onde saiu o número, em uma frase. Vai para a tela junto com ele. */
  origem: string;
}

export type ProcedenciaDeRevogabilidade =
  | 'CAPACIDADE_DECLARADA_PELO_FABRICANTE'
  | 'MEDIDA_EM_BANCADA'
  | 'DECLARADA_PELA_INSTALACAO'
  | 'PRESUMIDA';

export interface PerfilDeRevogabilidade {
  endpointId: string;
  metodo: CredentialMethod;
  credentialId?: string;
  modo: ModoDeRevogacao;
  janelaResidual: JanelaResidual;
  procedencia: ProcedenciaDeRevogabilidade;
  /** O que precisa acontecer, em português, para a credencial parar. */
  oQuePrecisaAcontecer: string;
}

/**
 * As capacidades do caminho de revogação que a emissão precisa conhecer.
 *
 * É um recorte do `ProviderCapabilities` do contrato de adaptadores, e não o
 * objeto inteiro: este módulo é de domínio e não pode depender da camada de
 * adaptadores, sob pena de o fabricante alcançar o domínio — que é exatamente
 * o acoplamento que o item 43 proíbe. Quem traduz um no outro é a governança
 * de emissão.
 */
export interface CapacidadeDeRevogacao {
  revogacaoRemota: boolean;
  confirmaEstadoFisico: boolean;
  credenciaisOffline: boolean;
  /** Há gateway ou outro caminho de sincronização para este endpoint? */
  temCaminhoDeSincronizacao: boolean;
  /** Minutos típicos até o equipamento sincronizar, quando depende de sync. */
  minutosTipicosDeSincronizacao?: number;
}

export interface EntradaDePerfil {
  endpointId: string;
  metodo: CredentialMethod;
  credentialId?: string;
  capacidade: CapacidadeDeRevogacao;
  /** Expiração prevista da credencial. Ausente = sem término previsto. */
  expiraEm?: Date;
  emitidaEm: Date;
  procedencia?: ProcedenciaDeRevogabilidade;
}

function minutosEntre(de: Date, ate: Date): number {
  return Math.max(0, Math.round((ate.getTime() - de.getTime()) / 60_000));
}

/**
 * Deriva o perfil de revogabilidade a partir do que se sabe do caminho.
 *
 * A ordem dos testes é a ordem da piora, e cada degrau só é alcançado quando o
 * anterior falha. Note o degrau mais importante: a credencial offline NÃO é
 * automaticamente irrevogável — ela é irrevogável quando não há caminho de
 * sincronização. Com gateway, a revogação chega; ela só não chega AGORA.
 * Colapsar os dois casos faria o produto recusar emissões legítimas em metade
 * da frota, e um produto que recusa demais é desligado tão rápido quanto um
 * que permite demais.
 */
export function derivarPerfilDeRevogabilidade(entrada: EntradaDePerfil): PerfilDeRevogabilidade {
  const procedencia = entrada.procedencia ?? 'CAPACIDADE_DECLARADA_PELO_FABRICANTE';
  const base = {
    endpointId: entrada.endpointId,
    metodo: entrada.metodo,
    credentialId: entrada.credentialId,
    procedencia
  };
  const ateExpirar: JanelaResidual = entrada.expiraEm
    ? {
        minutos: minutosEntre(entrada.emitidaEm, entrada.expiraEm),
        origem: `expiração declarada da credencial (${entrada.expiraEm.toISOString()})`
      }
    : { minutos: null, origem: 'credencial sem expiração declarada' };

  if (!entrada.capacidade.revogacaoRemota) {
    if (entrada.capacidade.temCaminhoDeSincronizacao) {
      const minutos = entrada.capacidade.minutosTipicosDeSincronizacao ?? 24 * 60;
      return {
        ...base,
        modo: 'EXIGE_SINCRONIZACAO',
        janelaResidual: {
          minutos: Math.min(minutos, ateExpirar.minutos ?? minutos),
          origem: 'janela típica de sincronização do equipamento'
        },
        oQuePrecisaAcontecer:
          'O fabricante não oferece revogação remota; a lista do equipamento precisa ser ' +
          'reescrita na próxima sincronização, e só então a credencial para.'
      };
    }
    return {
      ...base,
      modo: ateExpirar.minutos === null ? 'IRREVOGAVEL_ATE_EXPIRAR' : 'EXIGE_VISITA_TECNICA',
      janelaResidual: ateExpirar,
      oQuePrecisaAcontecer:
        ateExpirar.minutos === null
          ? 'Não há revogação remota, não há sincronização e a credencial não expira. Nada ' +
            'na ColmeIA faz esta credencial parar de funcionar.'
          : 'Não há revogação remota nem sincronização: alguém precisa ir ao equipamento, ou ' +
            'esperar a expiração.'
    };
  }

  if (entrada.capacidade.credenciaisOffline && !entrada.capacidade.temCaminhoDeSincronizacao) {
    return {
      ...base,
      modo: 'EXIGE_VISITA_TECNICA',
      janelaResidual: ateExpirar,
      oQuePrecisaAcontecer:
        'A nuvem aceita a ordem, mas a credencial está gravada num equipamento sem caminho ' +
        'de comunicação: ela continua valendo até alguém chegar lá.'
    };
  }

  if (!entrada.capacidade.confirmaEstadoFisico) {
    return {
      ...base,
      modo: 'REMOTA_SEM_CONFIRMACAO',
      janelaResidual: {
        minutos: entrada.capacidade.minutosTipicosDeSincronizacao ?? 60,
        origem: 'estimativa de propagação sem confirmação do equipamento'
      },
      oQuePrecisaAcontecer:
        'A nuvem do fabricante aceita a ordem e não confirma o equipamento. A revogação ' +
        'provavelmente chega; a ColmeIA não consegue provar que chegou.'
    };
  }

  return {
    ...base,
    modo: 'REMOTA_CONFIRMADA',
    janelaResidual: {
      minutos: entrada.capacidade.minutosTipicosDeSincronizacao ?? 5,
      origem: 'propagação observada com confirmação do equipamento'
    },
    oQuePrecisaAcontecer:
      'A ordem segue para a nuvem, o equipamento confirma, e a confirmação entra na trilha.'
  };
}

/**
 * Teto de janela residual tolerado por criticidade do recurso.
 *
 * `null` = sem teto. O valor para `LOW` é deliberadamente ausente: uma sala
 * administrativa com crachá de validade anual é prática corrente e não precisa
 * de aprovação de ninguém. É nos degraus de cima que a conta muda — e o degrau
 * `CRITICAL` está em sessenta minutos porque é a ordem de grandeza de um
 * plantão reagindo a um crachá perdido, não de um chamado com fabricante.
 *
 * Estes números são a parte CALIBRÁVEL deste módulo, e estão em sombra: nenhum
 * foi medido contra a operação de um hospital real. Quem os lê pela porta de
 * calibragem (`governanca/emissao.ts`) recebe o aviso junto do número.
 */
export const TETO_RESIDUAL_POR_CRITICIDADE: Readonly<Record<Criticidade, number | null>> =
  Object.freeze({
    LOW: null,
    MEDIUM: 7 * 24 * 60,
    HIGH: 24 * 60,
    CRITICAL: 60
  });

/** A janela residual cabe no teto deste recurso? */
export function dentroDoTetoResidual(
  janela: JanelaResidual,
  teto: number | null
): boolean {
  if (teto === null) return true;
  if (janela.minutos === null) return false;
  return janela.minutos <= teto;
}

/**
 * A frase honesta sobre uma revogação pedida — e é esta função que impede a
 * mentira que o delta nomeia.
 *
 * Nenhum chamador deste produto deve escrever "credencial revogada" sem passar
 * por aqui. O que a ColmeIA pode afirmar depois de registrar a revogação
 * depende inteiramente do modo: em dois dos cinco casos a frase correta
 * contém a palavra "ainda".
 */
export function frasePosRevogacao(perfil: PerfilDeRevogabilidade): string {
  switch (perfil.modo) {
    case 'REMOTA_CONFIRMADA':
      return 'Revogação registrada. O equipamento confirma, e a confirmação fica na trilha.';
    case 'REMOTA_SEM_CONFIRMACAO':
      return (
        'Revogação aceita pela nuvem do fabricante. O equipamento não confirma estado: ' +
        'a ColmeIA não tem evidência de que a porta já deixou de abrir.'
      );
    case 'EXIGE_SINCRONIZACAO':
      return (
        'Revogação registrada e enfileirada. Ela passa a valer na próxima sincronização do ' +
        `equipamento — até lá, a credencial ainda abre${
          perfil.janelaResidual.minutos === null ? '' : ` (até ${perfil.janelaResidual.minutos} min)`
        }.`
      );
    case 'EXIGE_VISITA_TECNICA':
      return (
        'Revogação registrada no cadastro. O equipamento não a recebe por comunicação: a ' +
        'credencial continua abrindo até alguém ir ao local.'
      );
    default:
      return (
        'Revogação registrada no cadastro, e ela não alcança o equipamento. Esta credencial ' +
        'não para de funcionar por ordem nossa — apenas por expiração, se houver.'
      );
  }
}

/**
 * A projeção que a observabilidade consome.
 *
 * Campo mínimo, como `QuebraDeVidroProjetada`: o score precisa saber que
 * existe uma credencial vigente cuja janela residual estourou o teto do
 * recurso, e não precisa saber de quem ela é. Projetar em vez de passar o
 * objeto inteiro é o que impede o indicador de virar porta de entrada para
 * dado pessoal no painel.
 */
export interface JanelaResidualProjetada {
  credentialId: string;
  endpointId: string;
  modo: ModoDeRevogacao;
  /** `null` = sem término previsto. */
  minutos: number | null;
  /** A janela estourou o teto declarado para a criticidade do recurso? */
  excedeuTeto: boolean;
}
