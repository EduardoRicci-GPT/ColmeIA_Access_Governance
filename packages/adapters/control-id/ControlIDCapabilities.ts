// ---------------------------------------------------------------------------
// Control iD — capacidades declaradas (PROVISÓRIAS)
//
// O interesse arquitetural deste fabricante não é a fechadura: é a CATARACA e
// o leitor de sala, equipamentos que operam em dois modos distintos e que, por
// isso, obrigam o sistema a representar algo que a TTLock não obriga.
//
// Em modo standalone, o equipamento decide sozinho com a base local. Em modo
// online, ele consulta um servidor no instante em que a pessoa se apresenta.
// Os dois modos produzem o mesmo evento físico — porta aberta — e responsáveis
// completamente diferentes pela decisão.
//
// Um sistema de governança que não registre essa diferença consegue dizer que
// a porta abriu, e não consegue dizer quem autorizou. Numa auditoria
// hospitalar, é a segunda pergunta que importa.
// ---------------------------------------------------------------------------

import { ProviderCapabilities } from '../contrato/tipos';

export const CAPACIDADES_CONTROL_ID: Readonly<ProviderCapabilities> = Object.freeze({
  cloudApi: false,
  mobileSdk: false,
  localBle: false,
  gatewaySupport: false,
  webhookEvents: true,
  pollingEvents: true,
  offlineCredentials: true,
  remoteRevocation: true,
  remoteUnlock: true,
  bulkSync: true,
  userManagement: true,
  credentialManagement: true,
  physicalStateReconciliation: true,
  onlineDecision: true
});

export type ModoDeOperacao = 'STANDALONE' | 'ONLINE';

export interface PerfilDoEquipamento {
  modo: ModoDeOperacao;
  /** Em modo online, quanto tempo o equipamento espera pela resposta. */
  timeoutDeDecisaoMs?: number;
  /** O que o equipamento faz quando a resposta não chega a tempo. */
  comportamentoNoTimeout: 'DENY' | 'FALLBACK_LOCAL';
}

/**
 * A decisão de projeto mais consequente deste adaptador está nesta constante.
 *
 * `FALLBACK_LOCAL` num timeout significa que, quando a rede oscila, o
 * equipamento volta a decidir sozinho com a base que tem — que pode conter a
 * credencial que a ColmeIA acabou de revogar. É uma escolha legítima (uma
 * catraca que trava em pane paralisa um pronto-socorro), mas ela precisa ser
 * DECLARADA, porque muda o que o Health Score deve considerar risco.
 */
export const PERFIL_PADRAO: Readonly<PerfilDoEquipamento> = Object.freeze({
  modo: 'ONLINE',
  timeoutDeDecisaoMs: 1_000,
  comportamentoNoTimeout: 'FALLBACK_LOCAL'
});

export const PENDENCIAS_DE_PESQUISA: readonly string[] = Object.freeze([
  'Confirmar protocolo e formato do modo online (requisição do equipamento ao servidor).',
  'Confirmar se a base local pode ser lida integralmente para reconciliação física.',
  'Confirmar se o equipamento informa quando decidiu localmente por timeout.',
  'Confirmar limites de quantidade de usuários e regras de acesso por equipamento.',
  'Confirmar formato de credencial biométrica e se o template sai do equipamento.'
]);
