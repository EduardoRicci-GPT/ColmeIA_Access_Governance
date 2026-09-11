// ---------------------------------------------------------------------------
// CONFORMIDADE DO ADAPTER CONTRACT v2
//
// A mesma suíte roda contra TODOS os adaptadores — o simulado e os três que
// ainda não têm integração. É deliberado: a garantia deixa de ser propriedade
// de uma implementação e vira condição que qualquer fabricante precisa
// satisfazer para entrar no sistema.
//
// A invariante central é a número 3 abaixo, e ela é curta:
//
//     status CONFIRMED exige physicalConfirmation CONFIRMED.
//
// Um adaptador que responda "CONFIRMED / NOT_CONFIRMED" está afirmando que a
// porta obedeceu e, na mesma frase, que ninguém viu. É a alucinação
// operacional do item 33 nascendo na camada mais funda — onde a interface não
// tem como desmenti-la. A suíte recusa.
// ---------------------------------------------------------------------------

import { AccessProviderAdapter } from './adaptador';
import {
  GrantRequest,
  IntegracaoNaoDisponivel,
  ProviderOperationResult,
  RevokeRequest,
  SyncRequest
} from './tipos';

export interface AchadoDeConformidade {
  nome: string;
  passou: boolean;
  detalhe: string;
}

export interface ContextoDeConformidade {
  endpointId: string;
  referenciaExterna: string;
  personId: string;
  credentialId: string;
  momento: Date;
}

function pedidoDeConcessao(ctx: ContextoDeConformidade, chave: string): GrantRequest {
  return {
    idempotencyKey: chave,
    correlationId: `CONF-${chave}`,
    endpointId: ctx.endpointId,
    referenciaExterna: ctx.referenciaExterna,
    solicitadoEm: ctx.momento,
    personId: ctx.personId,
    credentialId: ctx.credentialId,
    metodo: 'CARD',
    inicio: ctx.momento
  };
}

function pedidoDeRevogacao(ctx: ContextoDeConformidade, chave: string): RevokeRequest {
  return {
    idempotencyKey: chave,
    correlationId: `CONF-${chave}`,
    endpointId: ctx.endpointId,
    referenciaExterna: ctx.referenciaExterna,
    solicitadoEm: ctx.momento,
    personId: ctx.personId,
    credentialId: ctx.credentialId,
    motivo: 'conformidade'
  };
}

function pedidoDeSincronizacao(ctx: ContextoDeConformidade, chave: string): SyncRequest {
  return {
    idempotencyKey: chave,
    correlationId: `CONF-${chave}`,
    endpointId: ctx.endpointId,
    referenciaExterna: ctx.referenciaExterna,
    solicitadoEm: ctx.momento,
    credentialIds: [ctx.credentialId],
    modo: 'INCREMENTAL'
  };
}

function coerenteComHonestidade(resultado: ProviderOperationResult): string | null {
  if (resultado.status === 'CONFIRMED' && resultado.physicalConfirmation !== 'CONFIRMED') {
    return `status CONFIRMED com physicalConfirmation ${resultado.physicalConfirmation}`;
  }
  if (resultado.physicalConfirmation === 'CONFIRMED' && resultado.status === 'PENDING') {
    return 'physicalConfirmation CONFIRMED com status PENDING';
  }
  if (resultado.completedAt && resultado.completedAt.getTime() < resultado.requestedAt.getTime()) {
    return 'completedAt anterior a requestedAt';
  }
  if (resultado.operationId.trim() === '') return 'operationId vazio';
  return null;
}

export async function verificarConformidadeDoAdaptador(
  adaptador: AccessProviderAdapter,
  ctx: ContextoDeConformidade
): Promise<readonly AchadoDeConformidade[]> {
  const achados: AchadoDeConformidade[] = [];
  const registrar = (nome: string, passou: boolean, detalhe: string) =>
    achados.push({ nome, passou, detalhe });

  // 1. Capacidades sempre respondem, inclusive em adaptador não integrado.
  //    Declarar o que o fabricante faz não depende de credencial de produção.
  let capacidades;
  try {
    capacidades = await adaptador.getProviderCapabilities();
    registrar('capacidades-do-provedor', true, 'Capacidades declaradas sem exigir integração ativa.');
  } catch (erro) {
    registrar(
      'capacidades-do-provedor',
      false,
      `getProviderCapabilities lançou ${(erro as Error).name}: capacidade é declaração, não chamada remota.`
    );
    return achados;
  }

  // 2. Estado de integração coerente com a pendência declarada.
  const exigePendencia = adaptador.statusDeIntegracao !== 'IMPLEMENTED';
  registrar(
    'pendencia-declarada',
    exigePendencia ? adaptador.pendenciaDeIntegracao.trim().length > 0 : true,
    exigePendencia
      ? `Estado ${adaptador.statusDeIntegracao} exige pendência escrita.`
      : 'Adaptador IMPLEMENTED não precisa declarar pendência.'
  );

  const naoIntegrado =
    adaptador.statusDeIntegracao === 'INTERFACE_READY' ||
    adaptador.statusDeIntegracao === 'REQUIRES_VENDOR_INTEGRATION' ||
    adaptador.statusDeIntegracao === 'RESEARCH_REQUIRED';

  const operacoes: readonly [string, () => Promise<ProviderOperationResult>][] = [
    ['grantAccess', () => adaptador.grantAccess(pedidoDeConcessao(ctx, 'CONF-G1'))],
    ['revokeAccess', () => adaptador.revokeAccess(pedidoDeRevogacao(ctx, 'CONF-R1'))],
    ['syncCredential', () => adaptador.syncCredential(pedidoDeSincronizacao(ctx, 'CONF-S1'))]
  ];

  for (const [nome, executar] of operacoes) {
    try {
      const resultado = await executar();
      if (naoIntegrado) {
        registrar(
          `nao-integrado-recusa-${nome}`,
          false,
          `Adaptador ${adaptador.statusDeIntegracao} devolveu resultado em ${nome} em vez de lançar IntegracaoNaoDisponivel. ` +
            'Resultado fabricado em adaptador sem integração é alucinação operacional.'
        );
        continue;
      }
      const problema = coerenteComHonestidade(resultado);
      registrar(
        `honestidade-${nome}`,
        problema === null,
        problema === null ? `${nome} devolveu resultado coerente.` : `${nome}: ${problema}.`
      );
      registrar(
        `provider-declarado-${nome}`,
        resultado.provider === adaptador.providerId,
        `${nome} declarou provider ${resultado.provider}.`
      );
    } catch (erro) {
      const esperado = erro instanceof IntegracaoNaoDisponivel;
      registrar(
        naoIntegrado ? `nao-integrado-recusa-${nome}` : `honestidade-${nome}`,
        naoIntegrado && esperado,
        esperado
          ? `${nome} recusou com IntegracaoNaoDisponivel, como deve.`
          : `${nome} lançou ${(erro as Error).name}: ${(erro as Error).message}`
      );
    }
  }

  // 3. Capacidade negada não pode ser exercida com sucesso.
  if (!naoIntegrado && !capacidades.remoteRevocation) {
    try {
      const resultado = await adaptador.revokeAccess(pedidoDeRevogacao(ctx, 'CONF-R2'));
      registrar(
        'capacidade-negada-revogacao',
        resultado.physicalConfirmation === 'NOT_SUPPORTED' || resultado.status === 'FAILED',
        `Provedor sem remoteRevocation respondeu ${resultado.status}/${resultado.physicalConfirmation}.`
      );
    } catch {
      registrar('capacidade-negada-revogacao', true, 'Provedor sem remoteRevocation recusou a operação.');
    }
  }

  // 4. Idempotência: a mesma chave não produz duas operações (item 37).
  if (!naoIntegrado) {
    const primeira = await adaptador.grantAccess(pedidoDeConcessao(ctx, 'CONF-IDEM'));
    const segunda = await adaptador.grantAccess(pedidoDeConcessao(ctx, 'CONF-IDEM'));
    registrar(
      'idempotencia',
      primeira.operationId === segunda.operationId,
      `Mesma idempotencyKey → operationId ${primeira.operationId} e ${segunda.operationId}.`
    );
  }

  // 5. Reconciliação física declarada tem de existir de fato.
  registrar(
    'reconciliacao-fisica-coerente',
    capacidades.physicalStateReconciliation === (typeof adaptador.reconcilePhysicalState === 'function'),
    `physicalStateReconciliation=${capacidades.physicalStateReconciliation}, método ${
      typeof adaptador.reconcilePhysicalState === 'function' ? 'presente' : 'ausente'
    }.`
  );

  // 6. Suporte a gateway declarado exige o método correspondente.
  registrar(
    'gateway-coerente',
    !capacidades.gatewaySupport || typeof adaptador.getGatewayStatus === 'function',
    `gatewaySupport=${capacidades.gatewaySupport}, getGatewayStatus ${
      typeof adaptador.getGatewayStatus === 'function' ? 'presente' : 'ausente'
    }.`
  );

  // 7. Canal de eventos declarado tem de responder (mesmo que vazio).
  if (capacidades.webhookEvents || capacidades.pollingEvents) {
    try {
      const pagina = await adaptador.getAccessEvents();
      registrar(
        'canal-de-eventos',
        Array.isArray(pagina.eventos),
        `getAccessEvents devolveu ${pagina.eventos.length} evento(s).`
      );
    } catch (erro) {
      registrar(
        'canal-de-eventos',
        naoIntegrado && erro instanceof IntegracaoNaoDisponivel,
        `getAccessEvents: ${(erro as Error).message}`
      );
    }
  }

  return achados;
}
