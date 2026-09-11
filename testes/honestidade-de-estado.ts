// ---------------------------------------------------------------------------
// HONESTIDADE DE ESTADO (itens 2, 4, 33)
//
// "A IA não pode responder 'a porta está bloqueada' se o último estado for
//  UNKNOWN."
//
// A regra vale para o modelo de linguagem, para o rótulo da tela e para a
// notificação — os três caminhos pelos quais uma afirmação chega ao operador.
// Por isso ela é testada como função, e não conferida na revisão de prompt.
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, verificar } from './runner';
import {
  AFIRMACOES_CATEGORICAS,
  aplicarGuardaDeHonestidade,
  descreverReconciliacao
} from '../packages/narrativa/honestidade';
import { lerAcessoFisico } from '../packages/dominio/estado';

grupo('Item 33 · a frase proibida é recusada e substituída');
for (const afirmacao of AFIRMACOES_CATEGORICAS) {
  const exemplos: Record<string, string> = {
    PORTA_BLOQUEADA: 'A porta está bloqueada desde as 13h40.',
    ACESSO_REVOGADO: 'O acesso foi revogado.',
    CREDENCIAL_REMOVIDA: 'A credencial foi removida do equipamento.',
    ACESSO_LIBERADO: 'O acesso foi liberado no equipamento.',
    NINGUEM_ENTRA: 'Ninguém consegue entrar na farmácia.',
    TUDO_SINCRONIZADO: 'Todos os endpoints estão sincronizados.'
  };
  const texto = exemplos[afirmacao.id] ?? '';
  const comIncerteza = aplicarGuardaDeHonestidade(texto, 'UNKNOWN');
  verificar(`${afirmacao.id}: recusada sob UNKNOWN`, !comIncerteza.aceita, comIncerteza.textoSeguro);
  verificar(
    `${afirmacao.id}: o texto devolvido não afirma mais o fato físico`,
    comIncerteza.textoSeguro !== texto
  );

  const comEvidencia = aplicarGuardaDeHonestidade(texto, 'CONFIRMED');
  verificar(`${afirmacao.id}: aceita quando há confirmação`, comEvidencia.aceita, comEvidencia.textoSeguro);
}

grupo('PROBABLE também não autoriza afirmação categórica');
const provavel = aplicarGuardaDeHonestidade('A porta está trancada.', 'PROBABLE');
verificar('evidência provável não basta', !provavel.aceita, provavel.textoSeguro);

grupo('A frase honesta permanece intacta');
const honesta = aplicarGuardaDeHonestidade(
  'A revogação foi solicitada e aguarda confirmação do equipamento.',
  'UNKNOWN'
);
verificar('nada foi alterado', honesta.aceita, honesta.textoSeguro);

grupo('Item 4 · a descrição que a tela deve mostrar');
const linhas = descreverReconciliacao({
  endpointId: 'ep-farm-2',
  credentialId: 'CRED-1',
  desiredState: 'ENTITLEMENT_REVOKED',
  observedState: 'DEVICE_GRANT_CONFIRMED',
  estadoSemantico: 'DEVICE_REVOCATION_PENDING',
  confidence: 'UNKNOWN',
  action: 'RETRY',
  riskLevel: 'HIGH',
  natureza: 'REVOGACAO_NAO_CONFIRMADA',
  reason: 'Equipamento offline.',
  fatoresDeRisco: ['natureza REVOGACAO_NAO_CONFIRMADA → piso HIGH'],
  minutosEmAberto: 32,
  minutosDesdeConfirmacao: 340,
  exigeEscalonamento: false
});
verificar('diz "Revogação solicitada"', linhas.some((l) => l.includes('Revogação solicitada')), linhas.join(' / '));
verificar(
  'diz "Sincronização pendente no dispositivo"',
  linhas.some((l) => l.includes('Sincronização pendente no dispositivo'))
);
verificar('informa a última confirmação com a idade', linhas.some((l) => l.includes('340 min')));
verificar(
  'e declara a confiança da leitura como desconhecida',
  linhas.some((l) => l.includes('o sistema não recebeu evidência'))
);
verificar(
  'a descrição NUNCA diz "acesso revogado"',
  !linhas.some((l) => /acesso revogado/i.test(l)),
  linhas.join(' / ')
);

grupo('Item 2 · a leitura de acesso físico tem três valores, não dois');
igual(
  'sem evidência, a resposta é INDETERMINADO',
  lerAcessoFisico({
    desiredState: 'ENTITLEMENT_REVOKED',
    cloudState: 'CLOUD_GRANT_REVOKED',
    providerState: 'PROVIDER_REVOCATION_ACCEPTED',
    deviceState: 'DEVICE_REVOCATION_PENDING',
    lastConfirmedState: null,
    lastSyncAt: null
  }),
  'INDETERMINADO'
);
igual(
  'evidência de concessão com revogação pendente também é INDETERMINADO',
  lerAcessoFisico({
    desiredState: 'ENTITLEMENT_REVOKED',
    cloudState: 'CLOUD_GRANT_REVOKED',
    providerState: 'PROVIDER_REVOCATION_ACCEPTED',
    deviceState: 'DEVICE_REVOCATION_PENDING',
    lastConfirmedState: 'DEVICE_GRANT_CONFIRMED',
    lastSyncAt: new Date('2026-09-11T08:42:00')
  }),
  'INDETERMINADO'
);
igual(
  'só com confirmação de revogação a resposta é negativa',
  lerAcessoFisico({
    desiredState: 'ENTITLEMENT_REVOKED',
    cloudState: 'CLOUD_GRANT_REVOKED',
    providerState: 'PROVIDER_REVOCATION_ACCEPTED',
    deviceState: 'DEVICE_REVOCATION_CONFIRMED',
    lastConfirmedState: 'DEVICE_REVOCATION_CONFIRMED',
    lastSyncAt: new Date('2026-09-11T14:12:00')
  }),
  'NAO_PERMITE_ENTRADA'
);

fechar('Honestidade de estado');
