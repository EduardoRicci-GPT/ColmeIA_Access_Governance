// ---------------------------------------------------------------------------
// CENÁRIOS H7 – H10 (item 22)
//
// Os quatro têm em comum o que distingue um hospital de um escritório: o
// direito de acesso não acompanha a pessoa, acompanha o VÍNCULO — e vínculo
// hospitalar muda de hora em hora. Escala vira, plantão troca, ordem de
// serviço encerra antes do previsto, prestador vai embora no meio da tarde.
//
// Um sistema que só recalcula direitos à meia-noite, ou quando alguém clica em
// "sincronizar", vai estar errado durante a maior parte do dia. E o erro não é
// simétrico: sobrar direito é risco; faltar direito, numa UTI, é uma porta que
// não abre para quem precisa entrar correndo.
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, verificar } from './runner';
import { montarBancada, tick } from './bancada';
import { resumirDivergencias } from '../packages/narrativa/resumo';

async function h7(): Promise<void> {
  grupo('H7 · desligamento de funcionário');
  const b = montarBancada();
  await tick(b);
  await tick(b, 3_000);

  const credencial = 'CRED-vin-eduardo-ep-uti-1';
  igual(
    'o enfermeiro tinha acesso confirmado na UTI',
    b.registros.obter(credencial)?.estado.lastConfirmedState,
    'DEVICE_GRANT_CONFIRMED'
  );

  // O RH sinaliza employment_status = terminated.
  b.mundo = {
    ...b.mundo,
    vinculos: b.mundo.vinculos.map((v) =>
      v.id === 'vin-eduardo' ? { ...v, situacao: 'TERMINATED' as const } : v
    )
  };
  const relatorio = await tick(b, 60_000);

  const revogacoes = relatorio.acoesLogicas.filter(
    (a) => a.tipo === 'REVOKE' && a.relationshipId === 'vin-eduardo'
  );
  verificar('todos os direitos do vínculo foram revogados', revogacoes.length >= 2, `${revogacoes.length} direito(s)`);
  igual('com o motivo correto', revogacoes[0]?.motivo, 'RELATIONSHIP_TERMINATED');

  const direito = b.entitlements.obter('ENT-vin-eduardo-ep-uti-1');
  verificar('o direito não foi apagado: foi marcado como revogado', direito?.revogadoEm !== undefined);

  const fisicas = relatorio.reconciliacoesFisicas.filter((r) => r.personId === 'p-eduardo');
  verificar('a reconciliação física foi gerada para cada endpoint', fisicas.length >= 2, `${fisicas.length}`);

  // Com a cadeia de pé, o equipamento confirma no ciclo seguinte.
  await tick(b, 3_000);
  igual(
    'a revogação foi confirmada no equipamento',
    b.registros.obter(credencial)?.estado.lastConfirmedState,
    'DEVICE_REVOCATION_CONFIRMED'
  );
}

async function h8(): Promise<void> {
  grupo('H8 · mudança de escala: 07h–19h passa a 19h–07h');
  const b = montarBancada();
  await tick(b);
  await tick(b, 3_000);

  const direitoAntes = b.entitlements.obter('ENT-vin-eduardo-ep-uti-1');
  igual('a janela vigente é a diurna', direitoAntes?.escala?.minutoInicial, 420);

  b.mundo = {
    ...b.mundo,
    vinculos: b.mundo.vinculos.map((v) =>
      v.id === 'vin-eduardo'
        ? {
            ...v,
            escala: {
              diasDaSemana: [1, 2, 3, 4, 5],
              minutoInicial: 1140,
              minutoFinal: 420,
              atravessaMeiaNoite: true
            }
          }
        : v
    )
  };
  const relatorio = await tick(b, 60_000);

  const recalculo = relatorio.acoesLogicas.filter(
    (a) => a.tipo === 'UPDATE_WINDOW' && a.relationshipId === 'vin-eduardo'
  );
  verificar('a troca de escala recalculou a janela do direito', recalculo.length >= 1, `${recalculo.length}`);
  verificar(
    'o direito NÃO foi revogado por causa da troca de turno',
    relatorio.acoesLogicas.every((a) => !(a.tipo === 'REVOKE' && a.relationshipId === 'vin-eduardo'))
  );
  igual(
    'a nova janela foi persistida',
    b.entitlements.obter('ENT-vin-eduardo-ep-uti-1')?.escala?.minutoInicial,
    1140
  );
  verificar(
    'o turno noturno é reconhecido como contínuo, não como duas faixas',
    b.entitlements.obter('ENT-vin-eduardo-ep-uti-1')?.escala?.atravessaMeiaNoite === true
  );

  // Reentrância: nada mudou, nada deve ser reemitido.
  const segundo = await tick(b, 60_000);
  const reemissao = segundo.acoesLogicas.filter(
    (a) => a.tipo === 'UPDATE_WINDOW' && a.relationshipId === 'vin-eduardo'
  );
  igual('o ciclo seguinte não reemite a mesma ordem', reemissao.length, 0);
}

async function h9(): Promise<void> {
  grupo('H9 · ordem de serviço encerrada às 14h27, e não às 16h');
  const b = montarBancada();
  await tick(b);
  await tick(b, 3_000);

  const credencial = 'CRED-vin-jonas-ep-dc-1';
  igual(
    'o prestador tinha acesso ao datacenter',
    b.registros.obter(credencial)?.estado.desiredState,
    'ENTITLEMENT_ACTIVE'
  );

  // A OS é encerrada antes do previsto. O vínculo passa a ter fim às 14h27.
  b.mundo = {
    ...b.mundo,
    vinculos: b.mundo.vinculos.map((v) =>
      v.id === 'vin-jonas'
        ? { ...v, vigencia: { ...v.vigencia, fim: new Date('2026-09-11T14:27:00') } }
        : v
    )
  };

  // Avança para 14h30: três minutos após o encerramento real.
  const relatorio = await tick(b, 6 * 3_600_000 + 27 * 60_000);
  const revogacao = relatorio.acoesLogicas.find(
    (a) => a.relationshipId === 'vin-jonas' && a.tipo === 'REVOKE'
  );
  verificar('o direito foi revogado imediatamente', revogacao !== undefined);
  igual('com o motivo de ordem de serviço encerrada', revogacao?.motivo, 'WORK_ORDER_CLOSED');
  verificar(
    'e a decisão registra a regra que fechou',
    revogacao?.decisao.regrasAplicadas.includes('R-ORDEM-DE-SERVICO') === true,
    revogacao?.decisao.regrasAplicadas.join(', ')
  );

  await tick(b, 3_000);
  igual(
    'o equipamento confirmou a revogação antes do fim previsto da OS',
    b.registros.obter(credencial)?.estado.lastConfirmedState,
    'DEVICE_REVOCATION_CONFIRMED'
  );
}

async function h10(): Promise<void> {
  grupo('H10 · endpoint de área crítica fica offline');
  const b = montarBancada();
  await tick(b);
  await tick(b, 3_000);

  const credencial = 'CRED-vin-rui-ep-seg-1';
  igual(
    'o cofre de psicotrópicos exigiu aprovação humana, que existe',
    b.registros.obter(credencial)?.estado.lastConfirmedState,
    'DEVICE_GRANT_CONFIRMED'
  );

  // A porta da área de segurança excepcional perde comunicação, e o supervisor
  // é desligado no mesmo dia.
  b.simulador.colocarEndpointOffline('ep-seg-1');
  b.mundo = {
    ...b.mundo,
    vinculos: b.mundo.vinculos.map((v) =>
      v.id === 'vin-rui' ? { ...v, situacao: 'TERMINATED' as const } : v
    )
  };
  await tick(b, 60_000);

  // Noventa minutos depois, a divergência continua aberta.
  const relatorio = await tick(b, 90 * 60_000);
  const recon = relatorio.reconciliacoesFisicas.find((r) => r.credentialId === credencial);

  verificar('o sistema DETECTOU a divergência', recon !== undefined);
  igual('classificou o risco como CRITICAL', recon?.riskLevel, 'CRITICAL');
  verificar(
    'e a criticidade do endpoint consta entre os fatores',
    recon?.fatoresDeRisco.some((f) => f.includes('CRITICAL')) === true,
    recon?.fatoresDeRisco.join(' | ')
  );
  igual('NÃO inventou estado: a leitura é desconhecida', recon?.confidence, 'UNKNOWN');
  verificar('a ação escalou para decisão humana', recon?.action === 'ESCALATE', recon?.action);
  verificar('e a contingência foi registrada como caso', b.assurance.casosAbertos().length >= 1);

  const caso = b.assurance.casosAbertos()[0];
  igual('o caso tem severidade CRITICAL', caso?.severity, 'CRITICAL');
  igual('e tipo de revogação não confirmada', caso?.type, 'REVOCATION_NOT_CONFIRMED');
  verificar('com evidência associada', (caso?.evidencias.length ?? 0) > 0);

  grupo('H10 · o alerta legível nomeia lugar, contagem e causa');
  const resumo = resumirDivergencias(b.mundo.topologia, relatorio.reconciliacoesFisicas);
  const linha = resumo.find((l) => l.escopoId === 'z-seguranca');
  verificar(
    'o resumo aponta a zona de segurança',
    linha?.texto.includes('Área de Segurança Excepcional') === true,
    resumo.map((l) => l.texto).join(' / ')
  );
  igual('e classifica a linha como risco CRITICAL', linha?.risco, 'CRITICAL');

  grupo('H10 · o endpoint volta e o risco é encerrado com hora');
  b.simulador.restaurarEndpoint('ep-seg-1');
  await tick(b, 60_000);
  const final = await tick(b, 5_000);
  const reconFinal = final.reconciliacoesFisicas.find((r) => r.credentialId === credencial);
  igual('a revogação foi confirmada', reconFinal?.confidence, 'CONFIRMED');
  igual('e não há mais ação pendente', reconFinal?.action, 'NONE');
  const resolvidos = b.assurance.todosOsCasos().filter((c) => c.status === 'RESOLVED');
  verificar('o caso foi encerrado com registro', resolvidos.length >= 1, `${resolvidos.length} resolvido(s)`);
  verificar('e com hora de resolução', resolvidos[0]?.resolvedAt !== undefined);
}

await h7();
await h8();
await h9();
await h10();
fechar('Cenários hospitalares H7–H10');
