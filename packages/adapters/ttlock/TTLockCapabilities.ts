// ---------------------------------------------------------------------------
// TTLock — capacidades DECLARADAS, não verificadas
//
// Este arquivo é uma hipótese de trabalho, e está marcado como tal no próprio
// tipo. Os valores abaixo descrevem a CATEGORIA de produto (fechadura
// eletrônica com nuvem, gateway Wi-Fi opcional, credencial offline por eKey e
// senha) e não uma leitura de documentação técnica confirmada.
//
// A diferença importa: uma capacidade declarada errada não produz erro de
// compilação nem falha de teste — produz uma promessa de interface que o
// hardware não cumpre, descoberta no dia em que alguém precisa revogar acesso
// de verdade. Por isso a confirmação de cada linha é item de backlog com dono,
// e o adaptador se recusa a operar até que ela exista.
// ---------------------------------------------------------------------------

import { ProviderCapabilities } from '../contrato/tipos';

export type EstadoDaDeclaracao = 'CONFIRMADO' | 'PROVISORIO';

export interface CapacidadeDeclarada {
  valor: boolean;
  estado: EstadoDaDeclaracao;
  base: string;
}

export const DECLARACAO_TTLOCK: Readonly<Record<keyof ProviderCapabilities, CapacidadeDeclarada>> =
  Object.freeze({
    cloudApi: { valor: true, estado: 'PROVISORIO', base: 'Plataforma opera com API de nuvem do fabricante.' },
    mobileSdk: { valor: true, estado: 'PROVISORIO', base: 'Operação primária do produto é por aplicativo móvel.' },
    localBle: { valor: true, estado: 'PROVISORIO', base: 'Fechadura comunica por Bluetooth com o telefone.' },
    gatewaySupport: { valor: true, estado: 'PROVISORIO', base: 'Gateway Wi-Fi é acessório de catálogo.' },
    webhookEvents: { valor: false, estado: 'PROVISORIO', base: 'Sem evidência de webhook; assume-se polling.' },
    pollingEvents: { valor: true, estado: 'PROVISORIO', base: 'Registros de acesso recuperáveis por consulta.' },
    offlineCredentials: { valor: true, estado: 'PROVISORIO', base: 'Senha e eKey funcionam sem rede.' },
    remoteRevocation: { valor: true, estado: 'PROVISORIO', base: 'Revogação remota exige gateway presente.' },
    remoteUnlock: { valor: true, estado: 'PROVISORIO', base: 'Abertura remota exige gateway presente.' },
    bulkSync: { valor: false, estado: 'PROVISORIO', base: 'Sem evidência de operação em lote.' },
    userManagement: { valor: true, estado: 'PROVISORIO', base: 'Contas e eKeys são gerenciadas na nuvem.' },
    credentialManagement: { valor: true, estado: 'PROVISORIO', base: 'eKey, senha e cartão são credenciais gerenciáveis.' },
    physicalStateReconciliation: {
      valor: false,
      estado: 'PROVISORIO',
      base: 'Sem evidência de leitura do conteúdo real da fechadura sob demanda.'
    },
    onlineDecision: {
      valor: false,
      estado: 'PROVISORIO',
      base: 'A fechadura decide localmente; não consulta terceiros no instante do acesso.'
    }
  });

export const CAPACIDADES_TTLOCK: Readonly<ProviderCapabilities> = Object.freeze(
  Object.fromEntries(
    Object.entries(DECLARACAO_TTLOCK).map(([chave, declarada]) => [chave, declarada.valor])
  ) as unknown as ProviderCapabilities
);

/** Capacidades ainda não confirmadas — alimenta o relatório de status. */
export function capacidadesProvisorias(): readonly string[] {
  return Object.entries(DECLARACAO_TTLOCK)
    .filter(([, declarada]) => declarada.estado === 'PROVISORIO')
    .map(([chave]) => chave);
}

/**
 * Consequência arquitetural de `remoteRevocation` depender de gateway:
 * sem gateway, a revogação de uma senha já distribuída NÃO é remota. O sistema
 * precisa representar isso como pendência física permanente até visita ou até
 * a expiração da credencial — e não como falha transitória de sincronização.
 */
export const REVOGACAO_EXIGE_GATEWAY = true;
