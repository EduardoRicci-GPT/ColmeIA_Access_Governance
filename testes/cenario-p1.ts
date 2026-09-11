// ---------------------------------------------------------------------------
// CENÁRIO P1 — divergência obrigatória (item 20)
//
// É o teste que justifica a existência do produto. A sequência é a de um
// desligamento comum, e o que ela expõe é o intervalo que quase nenhum sistema
// de controle de acesso mostra:
//
//   direito ativo → credencial sincronizada → endpoint cai → vínculo encerra
//   → revogação emitida → nuvem aceita → EQUIPAMENTO NÃO RECEBE
//   → painel mostra REVOCATION_PENDING_DEVICE_SYNC → score cai
//   → endpoint volta → reconciliação física → revogação confirmada
//   → risco encerrado → auditoria preserva tudo
//
// Entre "nuvem aceita" e "equipamento confirma" existe um período em que a
// organização considera o acesso encerrado e a porta continua abrindo. Se o
// software não representar esse período, ele está afirmando algo falso.
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, verificar } from './runner';
import { montarBancada, tick } from './bancada';
import { construirLinhaDoTempo } from '../packages/assurance-ui/timeline';
import { aplicarGuardaDeHonestidade } from '../packages/narrativa/honestidade';
import { montarPainel, verificarExplicabilidade } from '../packages/assurance-ui/painel';

const bancada = montarBancada();
const CREDENCIAL = 'CRED-vin-marina-ep-farm-2';

async function executar(): Promise<void> {
  // ---- 1 e 2. Direito ativo e credencial sincronizada ---------------------
  grupo('P1 · passos 1–2: direito ativo e credencial materializada');
  await tick(bancada);
  bancada.simulador.processar(bancada.relogio.avancarMs(2_000));
  await tick(bancada, 1_000);

  const apos = bancada.registros.obter(CREDENCIAL);
  verificar('a credencial da farmacêutica existe', apos !== undefined);
  igual('estado desejado é ativo', apos?.estado.desiredState, 'ENTITLEMENT_ACTIVE');
  igual(
    'o equipamento confirmou a concessão',
    apos?.estado.lastConfirmedState,
    'DEVICE_GRANT_CONFIRMED'
  );

  // ---- 3. O endpoint fica offline ----------------------------------------
  grupo('P1 · passo 3: endpoint da sala de quimioterápicos fica offline');
  bancada.simulador.colocarEndpointOffline('ep-farm-2');
  const relatorioOffline = await tick(bancada, 60_000);
  const reconOffline = relatorioOffline.reconciliacoesFisicas.find((r) => r.credentialId === CREDENCIAL);
  igual('sem divergência, offline não gera ação', reconOffline?.action, 'NONE');
  verificar(
    'mas o painel já não afirma confirmação atual',
    reconOffline?.reason.includes('sem comunicação') === true,
    reconOffline?.reason
  );

  // ---- 4 e 5. Vínculo encerrado, direito revogado ------------------------
  grupo('P1 · passos 4–6: vínculo encerrado, revogação aceita pela nuvem');
  bancada.mundo = {
    ...bancada.mundo,
    vinculos: bancada.mundo.vinculos.map((v) =>
      v.id === 'vin-marina' ? { ...v, situacao: 'TERMINATED' as const } : v
    )
  };
  const relatorioRevogacao = await tick(bancada, 60_000);

  const registro = bancada.registros.obter(CREDENCIAL);
  igual('estado desejado passou a revogado', registro?.estado.desiredState, 'ENTITLEMENT_REVOKED');
  igual('a nuvem registrou a revogação', registro?.estado.cloudState, 'CLOUD_GRANT_REVOKED');
  verificar(
    'o provedor aceitou ou enfileirou a ordem',
    registro?.estado.providerState === 'PROVIDER_REVOCATION_ACCEPTED' ||
      registro?.estado.providerState === 'PROVIDER_PENDING',
    registro?.estado.providerState
  );

  // ---- 7 e 8. O equipamento não recebe; o painel declara a pendência ------
  grupo('P1 · passos 7–8: o equipamento não recebeu, e o sistema diz isso');
  igual(
    'o último estado CONFIRMADO continua sendo a concessão antiga',
    registro?.estado.lastConfirmedState,
    'DEVICE_GRANT_CONFIRMED'
  );
  const recon = relatorioRevogacao.reconciliacoesFisicas.find((r) => r.credentialId === CREDENCIAL);
  igual('estado semântico é revogação pendente', recon?.estadoSemantico, 'DEVICE_REVOCATION_PENDING');
  igual('a ação é tentar de novo, não desistir', recon?.action, 'RETRY');
  igual('a natureza da divergência é nomeada', recon?.natureza, 'REVOGACAO_NAO_CONFIRMADA');
  verificar(
    'o risco é alto porque a credencial ESTEVE confirmada no equipamento',
    recon?.riskLevel === 'HIGH' || recon?.riskLevel === 'CRITICAL',
    `${recon?.riskLevel} · ${recon?.fatoresDeRisco.join(' | ')}`
  );

  // A regra do item 41, verificada diretamente.
  verificar(
    'CRITÉRIO DO ITEM 41: direito revogado na lógica, risco vivo no físico',
    registro?.estado.desiredState === 'ENTITLEMENT_REVOKED' &&
      registro?.estado.lastConfirmedState === 'DEVICE_GRANT_CONFIRMED'
  );

  // ---- 9. O Health Score cai, e explica por quê ---------------------------
  grupo('P1 · passo 9: o Health Score cai e abre a composição');
  const painelComRisco = montarPainel(bancada.mundo.topologia, relatorioRevogacao.assurance);
  const farmacia = painelComRisco.escopos.find((e) => e.escopoId === 'z-farmacia');
  verificar('a zona Farmácia perdeu pontos', (farmacia?.score ?? 100) < 100, `score ${farmacia?.score}`);
  verificar(
    'e a perda é explicada por componentes',
    (farmacia?.componentes.length ?? 0) > 0,
    farmacia?.componentes.map((c) => c.detalhe).join(' | ')
  );
  const falhas = verificarExplicabilidade(painelComRisco);
  verificar('nenhum score chegou à tela sem fechar com seus componentes', falhas.length === 0, falhas.join(' | '));

  // ---- Guarda de honestidade ---------------------------------------------
  grupo('P1 · a interface não pode afirmar o que não sabe');
  const veredicto = aplicarGuardaDeHonestidade(
    'O acesso foi revogado e a porta está trancada.',
    recon?.confidence ?? 'UNKNOWN'
  );
  verificar('a frase categórica foi recusada', !veredicto.aceita, veredicto.violacoes.join(', '));
  verificar(
    'e substituída por formulação honesta',
    veredicto.textoSeguro.includes('ainda não recebeu confirmação') ||
      veredicto.textoSeguro.includes('aguarda confirmação'),
    veredicto.textoSeguro
  );

  // ---- 10 a 13. O endpoint volta e a revogação se confirma ---------------
  grupo('P1 · passos 10–13: endpoint volta, reconciliação executa, risco encerra');
  bancada.simulador.restaurarEndpoint('ep-farm-2');
  await tick(bancada, 32 * 60_000);
  const relatorioFinal = await tick(bancada, 5_000);

  const registroFinal = bancada.registros.obter(CREDENCIAL);
  igual(
    'o equipamento confirmou a revogação',
    registroFinal?.estado.lastConfirmedState,
    'DEVICE_REVOCATION_CONFIRMED'
  );
  const reconFinal = relatorioFinal.reconciliacoesFisicas.find((r) => r.credentialId === CREDENCIAL);
  igual('não há mais ação pendente', reconFinal?.action, 'NONE');
  igual('a leitura voltou a ser confirmada', reconFinal?.confidence, 'CONFIRMED');
  igual('e o risco baixou', reconFinal?.riskLevel, 'LOW');

  // ---- 14. A auditoria preserva a sequência inteira -----------------------
  grupo('P1 · passo 14: a auditoria preserva toda a sequência');
  const trilha = bancada.auditoria.trilha(`COR::ep-farm-2::${CREDENCIAL}`);
  const linha = construirLinhaDoTempo(CREDENCIAL, trilha);
  const tipos = linha.entradas.map((e) => e.tipo);

  verificar('a concessão está registrada', tipos.includes('EntitlementGranted'));
  verificar('a revogação do direito está registrada', tipos.includes('EntitlementRevoked'));
  verificar('a ordem física de revogação está registrada', tipos.includes('PhysicalRevocationRequested'));
  verificar('a pendência de sincronização está registrada', tipos.includes('PhysicalSyncPending'));
  verificar('a confirmação física está registrada', tipos.includes('PhysicalRevocationConfirmed'));

  // A janela que interessa é a da REVOGAÇÃO. A concessão também abre e fecha
  // uma janela, de segundos, e ela não é risco de acesso indevido.
  const janela = linha.janelasDeRisco.find(
    (j) => j.fechamentoEm !== null && j.tipoDeAbertura === 'PhysicalRevocationRequested'
  );
  verificar(
    'a janela de risco físico da revogação foi medida e fechada',
    janela !== undefined && (janela.minutos ?? 0) >= 30,
    `${janela?.minutos} min`
  );
  verificar(
    'a auditoria não perdeu nenhum evento por deduplicação indevida',
    bancada.eventos.tamanho() >= tipos.length,
    `${bancada.eventos.tamanho()} eventos, ${bancada.eventos.duplicatasAbsorvidas()} duplicatas absorvidas`
  );

  fechar('Cenário P1 — divergência física');
}

await executar();
