// ---------------------------------------------------------------------------
// PHYSICAL STATE RECONCILIATION — o motor
//
// A tabela de decisão está escrita como uma sequência de guardas explícitas, e
// não como matriz de `switch` aninhado, por um motivo: cada guarda carrega a
// FRASE que a auditoria vai ler. Quem mudar uma regra é obrigado a mudar a
// explicação junto — e é isso que impede a divergência entre o que o sistema
// faz e o que o sistema diz que faz.
//
// A ordem das guardas é a ordem da precedência operacional:
//
//   1. Relógio do equipamento fora de sincronia invalida qualquer leitura
//      temporal — inclusive as janelas de turno que ele deveria estar aplicando.
//   2. Divergência de REVOGAÇÃO domina tudo: é a única em que a omissão do
//      sistema deixa uma porta aberta.
//   3. Divergência de CONCESSÃO é incômodo, não risco de segurança.
//   4. Coerência obsoleta ainda pede verificação: silêncio de 24h não é prova.
//   5. Coerência fresca é o único caso em que a ação é NONE.
// ---------------------------------------------------------------------------

import { AccessState, estadoFisicoDesejado, desejaConcessao } from '../dominio/estado';
import { idadeEmMinutos, Relogio } from '../dominio/tempo';
import { classificarRisco, NaturezaDeDivergencia, NivelDeRisco, ORDEM_DE_RISCO } from '../dominio/risco';
import {
  AcaoFisica,
  ConfiancaFisica,
  EntradaDeReconciliacaoFisica,
  LIMIARES_FISICOS_PADRAO,
  LimiaresFisicos,
  PhysicalReconciliationResult,
  ResumoDaReconciliacaoFisica
} from './tipos';

interface CadeiaDeEntrega {
  alcancavel: boolean;
  impedimento: string | null;
  natureza: NaturezaDeDivergencia | null;
}

/**
 * A cadeia tem três elos que falham independentemente: nuvem do fabricante,
 * gateway e equipamento. Reportar "offline" sem dizer QUAL elo caiu é a forma
 * mais comum de um painel de acesso ser inútil às 3h da manhã.
 */
function avaliarCadeia(entrada: EntradaDeReconciliacaoFisica): CadeiaDeEntrega {
  if (entrada.statusDoProvedor === 'OFFLINE' || entrada.statusDoProvedor === 'UNKNOWN') {
    return {
      alcancavel: false,
      impedimento: 'nuvem do provedor indisponível',
      natureza: 'PROVEDOR_INDISPONIVEL'
    };
  }
  if (entrada.statusDoGateway === 'OFFLINE') {
    return { alcancavel: false, impedimento: 'gateway offline', natureza: 'GATEWAY_DEGRADADO' };
  }
  if (entrada.conectividadeDoEndpoint === 'OFFLINE' || entrada.conectividadeDoEndpoint === 'UNKNOWN') {
    return { alcancavel: false, impedimento: 'equipamento offline', natureza: null };
  }
  if (entrada.statusDoGateway === 'DEGRADED' || entrada.statusDoProvedor === 'DEGRADED') {
    return { alcancavel: true, impedimento: 'cadeia degradada', natureza: 'GATEWAY_DEGRADADO' };
  }
  return { alcancavel: true, impedimento: null, natureza: null };
}

function confiancaDaLeitura(
  estado: AccessState,
  entrada: EntradaDeReconciliacaoFisica,
  minutosDesdeConfirmacao: number | null,
  limiares: LimiaresFisicos
): ConfiancaFisica {
  if (estado.lastConfirmedState === null) return 'UNKNOWN';
  if (entrada.conectividadeDoEndpoint === 'UNKNOWN') return 'UNKNOWN';
  if (entrada.conectividadeDoEndpoint === 'DEGRADED') return 'PROBABLE';
  if (minutosDesdeConfirmacao === null) return 'UNKNOWN';
  if (minutosDesdeConfirmacao > limiares.minutosParaObsolescencia) return 'PROBABLE';
  return 'CONFIRMED';
}

export class PhysicalStateReconciliationEngine {
  constructor(
    private readonly relogio: Relogio,
    private readonly limiares: LimiaresFisicos = LIMIARES_FISICOS_PADRAO
  ) {}

  reconciliar(entrada: EntradaDeReconciliacaoFisica): PhysicalReconciliationResult {
    const agora = this.relogio.agora();
    const estado = entrada.estado;
    const exigido = estadoFisicoDesejado(estado.desiredState);
    const observado = estado.lastConfirmedState;
    const coerente = observado === exigido;
    const querConcessao = desejaConcessao(estado.desiredState);

    const minutosDesdeConfirmacao = idadeEmMinutos(estado.lastSyncAt, agora);
    const minutosEmAberto = idadeEmMinutos(entrada.divergenciaDetectadaEm, agora);
    const cadeia = avaliarCadeia(entrada);
    const confianca = confiancaDaLeitura(estado, entrada, minutosDesdeConfirmacao, this.limiares);
    const tentativasEsgotadas = entrada.tentativas.status === 'ESCALATED';

    const base = {
      endpointId: entrada.endpointId,
      credentialId: entrada.credentialId,
      entitlementId: entrada.entitlementId,
      personId: entrada.personId,
      desiredState: estado.desiredState,
      observedState: observado,
      minutosEmAberto,
      minutosDesdeConfirmacao
    };

    // ---- Guarda 1: relógio do equipamento fora de sincronia --------------
    const desvio = Math.abs(entrada.saudeDoEquipamento?.desvioDeRelogioMs ?? 0);
    if (desvio > this.limiares.desvioDeRelogioToleradoMs) {
      const risco = classificarRisco({
        natureza: 'DESVIO_DE_RELOGIO',
        criticidadeDoEndpoint: entrada.criticidade,
        minutosEmAberto: minutosEmAberto ?? undefined
      });
      return {
        ...base,
        estadoSemantico: 'DEVICE_DEGRADED',
        confidence: 'UNKNOWN',
        action: 'VERIFY',
        riskLevel: risco.nivel,
        natureza: 'DESVIO_DE_RELOGIO',
        fatoresDeRisco: risco.fatores,
        exigeEscalonamento: false,
        reason:
          `Relógio do equipamento desviado em ${Math.round(desvio / 1000)} s. ` +
          `Nenhuma janela temporal aplicada por ele é confiável até a correção.`
      };
    }

    // ---- Guarda 2: revogação não materializada ----------------------------
    if (!coerente && !querConcessao) {
      const jaEsteveConcedido = observado === 'DEVICE_GRANT_CONFIRMED';
      const natureza: NaturezaDeDivergencia =
        observado === null ? 'ESTADO_DESCONHECIDO' : 'REVOGACAO_NAO_CONFIRMADA';
      const risco = classificarRisco({
        natureza,
        criticidadeDoEndpoint: entrada.criticidade,
        minutosEmAberto: minutosEmAberto ?? undefined,
        houveConfirmacaoAnterior: jaEsteveConcedido
      });
      const estouroDePrazo =
        (minutosEmAberto ?? 0) >= this.limiares.minutosParaEscalonarRevogacao &&
        ORDEM_DE_RISCO[risco.nivel] >= ORDEM_DE_RISCO.HIGH;
      const escalona = tentativasEsgotadas || estouroDePrazo;
      const acao: AcaoFisica = escalona ? 'ESCALATE' : cadeia.alcancavel ? 'REVOKE' : 'RETRY';

      return {
        ...base,
        // O estado semântico pertence à CREDENCIAL, não ao equipamento. Um
        // endpoint offline com revogação pendente não está em
        // "DEVICE_OFFLINE": está em DEVICE_REVOCATION_PENDING, e o offline é a
        // causa, nomeada na frase. Trocar um pelo outro faria a fila do painel
        // exibir um problema de conectividade onde há um risco de acesso.
        estadoSemantico: 'DEVICE_REVOCATION_PENDING',
        confidence: confiancaNaDivergencia(observado, cadeia.alcancavel),
        action: acao,
        riskLevel: risco.nivel,
        natureza,
        fatoresDeRisco: risco.fatores,
        exigeEscalonamento: escalona,
        reason: frasePendencia({
          verbo: 'Revogação',
          cadeia: cadeia.impedimento,
          observado,
          minutosEmAberto,
          tentativas: entrada.tentativas.attempt,
          escalona
        })
      };
    }

    // ---- Guarda 3: concessão não materializada ---------------------------
    if (!coerente && querConcessao) {
      const natureza: NaturezaDeDivergencia =
        observado === null && !cadeia.alcancavel ? 'ESTADO_DESCONHECIDO' : 'CONCESSAO_NAO_CONFIRMADA';
      const risco = classificarRisco({
        natureza,
        criticidadeDoEndpoint: entrada.criticidade,
        minutosEmAberto: minutosEmAberto ?? undefined
      });
      const escalona =
        tentativasEsgotadas || (minutosEmAberto ?? 0) >= this.limiares.minutosParaEscalonarConcessao;
      const acao: AcaoFisica = escalona ? 'ESCALATE' : cadeia.alcancavel ? 'SYNC' : 'RETRY';

      return {
        ...base,
        estadoSemantico: 'DEVICE_GRANT_PENDING',
        confidence: confiancaNaDivergencia(observado, cadeia.alcancavel),
        action: acao,
        riskLevel: risco.nivel,
        natureza,
        fatoresDeRisco: risco.fatores,
        exigeEscalonamento: escalona,
        reason: frasePendencia({
          verbo: 'Concessão',
          cadeia: cadeia.impedimento,
          observado,
          minutosEmAberto,
          tentativas: entrada.tentativas.attempt,
          escalona
        })
      };
    }

    // ---- Guarda 4: coerente, porém sem evidência recente ------------------
    if (confianca !== 'CONFIRMED') {
      const natureza: NaturezaDeDivergencia =
        observado === null ? 'ESTADO_DESCONHECIDO' : 'CREDENCIAL_OBSOLETA';
      const risco = classificarRisco({
        natureza,
        criticidadeDoEndpoint: entrada.criticidade,
        minutosEmAberto: minutosDesdeConfirmacao ?? undefined
      });
      return {
        ...base,
        estadoSemantico: observado === null ? 'DEVICE_SYNC_UNKNOWN' : exigido,
        confidence: confianca,
        action: 'VERIFY',
        riskLevel: risco.nivel,
        natureza,
        fatoresDeRisco: risco.fatores,
        exigeEscalonamento: false,
        reason:
          observado === null
            ? 'O equipamento nunca confirmou este estado. A leitura é inferência, não evidência.'
            : `Estado coerente, mas a última confirmação tem ${Math.round(minutosDesdeConfirmacao ?? 0)} min. ` +
              'Silêncio prolongado não é prova de conformidade.'
      };
    }

    // ---- Guarda 5: coerente e confirmado ---------------------------------
    const risco = classificarRisco({
      natureza: 'ENDPOINT_OFFLINE_SEM_DIVERGENCIA',
      criticidadeDoEndpoint: entrada.criticidade
    });
    return {
      ...base,
      estadoSemantico: exigido,
      confidence: 'CONFIRMED',
      action: 'NONE',
      riskLevel: entrada.conectividadeDoEndpoint === 'ONLINE' ? 'LOW' : risco.nivel,
      natureza: 'ENDPOINT_OFFLINE_SEM_DIVERGENCIA',
      fatoresDeRisco: entrada.conectividadeDoEndpoint === 'ONLINE' ? ['sem divergência'] : risco.fatores,
      exigeEscalonamento: false,
      reason:
        entrada.conectividadeDoEndpoint === 'ONLINE'
          ? 'Estado físico confirmado e coerente com o direito vigente.'
          : 'Estado físico coerente na última confirmação; o equipamento está sem comunicação agora.'
    };
  }

  reconciliarLote(entradas: readonly EntradaDeReconciliacaoFisica[]): ResumoDaReconciliacaoFisica {
    const resultados = entradas.map((entrada) => this.reconciliar(entrada));
    let piorRisco: NivelDeRisco = 'LOW';
    for (const resultado of resultados) {
      if (ORDEM_DE_RISCO[resultado.riskLevel] > ORDEM_DE_RISCO[piorRisco]) piorRisco = resultado.riskLevel;
    }
    return {
      momento: this.relogio.agora(),
      resultados,
      revogacoesPendentes: resultados.filter((r) => r.estadoSemantico === 'DEVICE_REVOCATION_PENDING').length,
      concessoesPendentes: resultados.filter((r) => r.estadoSemantico === 'DEVICE_GRANT_PENDING').length,
      estadosDesconhecidos: resultados.filter((r) => r.confidence === 'UNKNOWN').length,
      escalonamentos: resultados.filter((r) => r.exigeEscalonamento).length,
      piorRisco
    };
  }
}

/**
 * Confiança durante uma divergência — e aqui houve uma correção de projeto que
 * vale registrar, porque ela quase passou despercebida.
 *
 * A primeira versão devolvia CONFIRMED quando a ÚLTIMA LEITURA era recente e
 * confiável. Está errado, e do jeito mais perigoso possível: a leitura recente
 * é do estado ANTIGO. Dizer "confiança CONFIRMED" sobre uma divergência
 * autorizaria a interface a afirmar categoricamente o estado físico atual —
 * exatamente a alucinação operacional que o item 33 proíbe — usando como aval
 * a evidência da concessão que estamos justamente tentando desfazer.
 *
 * Havendo divergência, o que o sistema tem certeza é de que o estado atual NÃO
 * é o desejado. Sobre a materialização da correção, o máximo que pode dizer é
 * PROBABLE (ordem aceita, cadeia de pé) ou UNKNOWN (cadeia rompida, ou nunca
 * houve evidência).
 */
function confiancaNaDivergencia(
  observado: string | null,
  cadeiaAlcancavel: boolean
): ConfiancaFisica {
  if (observado === null) return 'UNKNOWN';
  if (!cadeiaAlcancavel) return 'UNKNOWN';
  return 'PROBABLE';
}

function frasePendencia(dados: {
  verbo: string;
  cadeia: string | null;
  observado: string | null;
  minutosEmAberto: number | null;
  tentativas: number;
  escalona: boolean;
}): string {
  const partes: string[] = [
    `${dados.verbo} determinada pela organização e ainda sem confirmação física.`
  ];
  partes.push(
    dados.observado === null
      ? 'O equipamento nunca confirmou estado para esta credencial.'
      : `Último estado confirmado: ${dados.observado}.`
  );
  if (dados.cadeia) partes.push(`Impedimento atual: ${dados.cadeia}.`);
  if (dados.minutosEmAberto !== null) {
    partes.push(`Em aberto há ${Math.round(dados.minutosEmAberto)} min.`);
  }
  if (dados.tentativas > 0) partes.push(`${dados.tentativas} tentativa(s) de sincronização.`);
  if (dados.escalona) partes.push('Automatismo esgotado: o caso passa a exigir decisão humana.');
  return partes.join(' ');
}
