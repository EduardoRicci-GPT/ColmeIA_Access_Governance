// ---------------------------------------------------------------------------
// SEPARAÇÃO DE AUTORIDADE APLICADA AO ACESSO — ADR-0003 do MPE-H
//
// O kernel exige que todo evento do ledger declare o CORPO que o originou.
// Quando essa exigência encontra os quatro motores deste produto, a
// correspondência não precisa ser inventada — ela já estava lá:
//
//   DIRETIVO    Policy Engine e Entitlement Reconciliation. DECIDEM o direito.
//   CONSULTIVO  Observability & Assurance. PROPÕEM leitura, risco, prioridade.
//   EXECUTIVO   Adaptadores e equipamentos. EXECUTAM, e só.
//   HUMANO      Operador, aprovador, supervisor de plantão.
//
// A regra que essa separação carrega, e que um sistema de acesso viola com
// facilidade: o corpo que decide não é o que executa, e o que aconselha não
// decide. Um painel de assurance que revogasse acesso sozinho misturaria
// CONSULTIVO com DIRETIVO; um adaptador que decidisse localmente sem declarar
// isso misturaria EXECUTIVO com DIRETIVO — que é exatamente o caso do modo
// standalone da catraca, e por isso `decisionOrigin` existe.
//
// `perdaPorMistura` nomeia o que se perde em cada combinação. Não é enfeite
// filosófico: é o texto que a auditoria lê quando pergunta por que aquele
// evento não deveria ter existido.
// ---------------------------------------------------------------------------

import { CorpoDeOrigem } from '../mpeh-kernel/ledger/tipos';
import { DecisionOrigin, TipoDeEvento } from '../dominio/eventos';

export type { CorpoDeOrigem };

/** O que cada corpo responde. Vocabulário idêntico ao de `formacao.py`. */
export const CORPOS: Readonly<Record<CorpoDeOrigem, { responsabilidade: string; horizonte: string }>> =
  Object.freeze({
    DIRETIVO: {
      responsabilidade: 'decide o direito: quem deveria entrar, onde, quando e por quê',
      horizonte: 'a norma da instituição'
    },
    CONSULTIVO: {
      responsabilidade: 'lê, mede e propõe: divergência, risco, prioridade, explicação',
      horizonte: 'o estado observável'
    },
    EXECUTIVO: {
      responsabilidade: 'materializa a decisão no equipamento, e reporta o que aconteceu',
      horizonte: 'a operação imediata'
    },
    HUMANO: {
      responsabilidade: 'aprova, recusa, reconhece e encerra o que o automatismo não pode',
      horizonte: 'a responsabilidade institucional'
    }
  });

/**
 * O que se perde quando dois corpos se misturam.
 *
 * Devolve `null` quando a combinação é legítima (mesmo corpo, ou HUMANO com
 * qualquer um — o humano supervisiona todos).
 */
export function perdaPorMistura(a: CorpoDeOrigem, b: CorpoDeOrigem): string | null {
  if (a === b) return null;
  if (a === 'HUMANO' || b === 'HUMANO') return null;
  const par = [a, b].sort().join('+');
  switch (par) {
    case 'CONSULTIVO+DIRETIVO':
      return 'quem aconselha passa a decidir: o risco medido vira ordem, e ninguém confere a medida';
    case 'DIRETIVO+EXECUTIVO':
      return 'quem decide passa a executar: a decisão deixa de ser conferível antes de virar ato';
    case 'CONSULTIVO+EXECUTIVO':
      return 'quem observa passa a agir: o relatório vira comando sem passar por decisão';
    default:
      return `mistura não catalogada entre ${a} e ${b}`;
  }
}

/**
 * De onde veio a DECISÃO → qual corpo a tomou.
 *
 * NÃO é o que carimba o elo do ledger: lá, o corpo vem do TIPO do evento, que
 * diz que espécie de ato ele é. Esta função responde a outra pergunta — quem
 * decidiu o que está sendo executado — e serve a quem precisa contar decisões
 * por origem, não atos por natureza.
 *
 * O caso `DEVICE_LOCAL` é o que obriga esta função a existir. A catraca em
 * modo standalone DECIDE — ela é, naquele instante, corpo diretivo e executivo
 * ao mesmo tempo. Registrar isso como EXECUTIVO puro esconderia a mistura;
 * registrar como DIRETIVO esconderia que a ColmeIA não participou. O ledger
 * recebe EXECUTIVO e os `detalhes` carregam a marca da mistura, para que a
 * auditoria possa contá-la.
 */
export function corpoDaDecisao(origem: DecisionOrigin | undefined): CorpoDeOrigem {
  switch (origem) {
    case 'COLMEIA_POLICY_ENGINE':
      return 'DIRETIVO';
    case 'MANUAL_OPERATOR':
      return 'HUMANO';
    case 'DEVICE_LOCAL':
    case 'PROVIDER_CLOUD':
      return 'EXECUTIVO';
    default:
      return 'CONSULTIVO';
  }
}

/** Houve mistura de corpos neste evento? Alimenta indicador de assurance. */
export function decisaoMisturouCorpos(origem: DecisionOrigin | undefined): boolean {
  return origem === 'DEVICE_LOCAL';
}

/**
 * Corpo por tipo de evento, quando o evento não carrega origem de decisão.
 * Medir e escalonar é consultivo; conceder e revogar direito é diretivo;
 * mexer no equipamento é executivo.
 */
export function corpoDoTipo(tipo: TipoDeEvento): CorpoDeOrigem {
  switch (tipo) {
    case 'EntitlementGranted':
    case 'EntitlementRevoked':
    case 'AccessPolicyConflictDetected':
    case 'CoverageGapDetected':
      return 'DIRETIVO';
    case 'PhysicalGrantRequested':
    case 'PhysicalGrantConfirmed':
    case 'PhysicalRevocationRequested':
    case 'PhysicalRevocationConfirmed':
    case 'PhysicalSyncPending':
    case 'AccessAttempted':
      return 'EXECUTIVO';
    // Pedir revisão e constatar vencimento não decidem nada: um convoca gente,
    // o outro registra que o tempo passou. A DECISÃO é humana por definição do
    // tipo, e por isso é declarada aqui e não só quando o evento vem carimbado
    // com `MANUAL_OPERATOR` — um ato humano registrado sem origem continuaria
    // sendo ato humano, e cair no `default` o esconderia como consultivo.
    case 'AccessApprovalDecided':
    // Designar e recusar são atos de uma pessoa com alçada, como decidir uma
    // aprovação. Pedir é o sistema convocando gente, e encerrar por vencimento
    // não é decisão de ninguém — os dois caem no consultivo, corretamente.
    case 'TemporaryResponsibilityGranted':
    case 'TemporaryResponsibilityDenied':
      return 'HUMANO';
    default:
      return 'CONSULTIVO';
  }
}
