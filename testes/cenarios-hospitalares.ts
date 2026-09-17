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
import { ESCOPOS_DE_DELEGACAO, aprovarCofre, materialDoCofre, montarBancada, tick } from './bancada';
import { PedidoDeExcecao, RegistroDeResponsabilidades } from '../packages/governanca';
import { explicarAcesso } from '../packages/narrativa/explicacao';
import { PolicyEngine, REGRAS_HOSPITALARES_BASE } from '../packages/policy-engine';
import { resumirDivergencias } from '../packages/narrativa/resumo';
import { montarPainel } from '../packages/assurance-ui/painel';
import { renderizarPainel } from '../packages/assurance-ui/render';
import {
  DOMINIOS_DE_SEGREGACAO_BASE,
  SEGREGACAO_MEDICAMENTOS,
  conflitosDe,
  conflitosDoVinculo
} from '../packages/policy-engine';

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
  grupo('H10 · o cofre CRITICAL não abre sem duas assinaturas');
  const b = montarBancada();
  const credencial = 'CRED-vin-rui-ep-seg-1';

  const primeiro = await tick(b);
  const material = materialDoCofre(primeiro);
  verificar('o acesso ao cofre entrou na fila de aprovação', material.endpointId === 'ep-seg-1');
  igual('e NÃO foi materializado', b.registros.obter(credencial), undefined);

  // Uma assinatura só não basta: criticidade CRITICA exige duas pessoas
  // distintas, que é a defesa do kernel contra a fadiga de plantão.
  await b.gate.abrir(material, 'ciclo-de-governanca');
  const comUma = await b.gate.decidir(material, {
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'Primeira aprovação.',
    assinatura: 'token-rita'
  });
  verificar('uma assinatura não autoriza', !comUma.autorizado, comUma.motivo);
  igual('e o motivo é nomeado', comUma.motivo, 'APROVACOES_INSUFICIENTES');

  // Só falta a SEGUNDA pessoa. Este teste assinava de novo pela primeira e
  // funcionava porque `abrir` recriava o registro do zero, apagando a
  // assinatura anterior — hoje `abrir` é idempotente (o ciclo o chama a cada
  // volta, e apagar assinatura colhida seria o defeito), então o que resta
  // aqui é o que resta na vida real: alguém diferente assinar.
  const comDuas = await b.gate.decidir(material, {
    decisao: 'APROVADO',
    aprovador: 'paulo.diretoria',
    papel: 'diretoria-administrativa',
    justificativa: 'Segunda aprovação, por pessoa distinta.',
    assinatura: 'token-paulo'
  });
  verificar('duas assinaturas autorizam', comDuas.autorizado, comDuas.explicacao);
  igual('e a segunda é de outra pessoa', comDuas.registro.aprovadores.length, 2);

  await tick(b, 60_000);
  await tick(b, 3_000);
  igual(
    'agora o acesso ao cofre foi materializado e confirmado',
    b.registros.obter(credencial)?.estado.lastConfirmedState,
    'DEVICE_GRANT_CONFIRMED'
  );

  grupo('H10 · endpoint de área crítica fica offline');

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

  const caso = b.assurance.casosAbertos().find((c) => c.type === 'REVOCATION_NOT_CONFIRMED');
  igual('o caso tem severidade CRITICAL', caso?.severity, 'CRITICAL');
  verificar('com evidência associada', (caso?.evidencias.length ?? 0) > 0);

  grupo('H10 · o outro lado do risco: a zona fica sem ninguém');
  // Desligar o supervisor de segurança deixa a Área de Segurança Excepcional
  // sem NINGUÉM capaz de entrar. O freio da parceria vê o que a tabela de
  // regras não vê: aqui, faltar direito também é risco físico.
  const lacuna = b.assurance.casosAbertos().find((c) => c.type === 'COVERAGE_GAP');
  verificar('o freio abriu caso de lacuna de cobertura', lacuna !== undefined);
  igual('com severidade CRITICAL, pela criticidade da zona', lacuna?.severity, 'CRITICAL');
  verificar(
    'e o motivo diz que a revogação segue, e que a escala é decisão humana',
    lacuna?.reason.includes('A revogação segue') === true,
    lacuna?.reason
  );

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

async function h11(): Promise<void> {
  grupo('H11 · a farmacêutica que também confere o inventário');
  // O caso não é fraude: é domingo numa unidade pequena, e a mesma pessoa
  // guarda o estoque e assina a conferência dele. A tentação do software é
  // negar. Negar fecha a farmácia para quem está lá, e deixa o acúmulo de pé.
  const b = montarBancada();
  await tick(b);
  // Segundo tick: a ordem foi enviada na volta anterior e o equipamento
  // confirma nesta. Sem ele, a leitura apanharia o estado no meio do caminho.
  await tick(b, 3_000);

  const credencial = 'CRED-vin-marina-ep-farm-1';
  igual(
    'antes do acúmulo, a farmacêutica tem acesso confirmado',
    b.registros.obter(credencial)?.estado.lastConfirmedState,
    'DEVICE_GRANT_CONFIRMED'
  );

  // A auditoria interna é acrescentada ao MESMO vínculo. Nenhuma pessoa nova
  // entrou na casa: mudou o que uma pessoa acumula.
  b.mundo = {
    ...b.mundo,
    papeis: [
      ...b.mundo.papeis,
      { id: 'role-auditoria-interna', nome: 'Auditoria interna', zonasAutorizadas: ['z-farmacia'] }
    ],
    vinculos: b.mundo.vinculos.map((vinculo) =>
      vinculo.id === 'vin-marina'
        ? { ...vinculo, roleIds: [...vinculo.roleIds, 'role-auditoria-interna'] }
        : vinculo
    )
  };

  const relatorio = await tick(b, 60_000);
  const pendente = relatorio.pendentesDeAprovacao.find(
    (acao) => acao.material.relationshipId === 'vin-marina'
  );
  verificar('o acúmulo vira pendência de revisão humana', pendente !== undefined);
  verificar(
    'e a razão nomeia a segregação, a origem e a procedência',
    (pendente?.material.razaoDaPolitica ?? '').includes('Segregação de funções') &&
      (pendente?.material.razaoDaPolitica ?? '').includes('acúmulo dos papéis') &&
      (pendente?.material.razaoDaPolitica ?? '').includes('344/1998'),
    pendente?.material.razaoDaPolitica ?? '(sem pendência)'
  );

  // A verificação que carrega a decisão de produto inteira.
  igual(
    'e a porta NÃO foi fechada: o direito é mantido enquanto gente decide',
    b.registros.obter(credencial)?.estado.lastConfirmedState,
    'DEVICE_GRANT_CONFIRMED'
  );
  verificar(
    'nenhuma revogação foi disparada por causa do conflito',
    !relatorio.acoesLogicas.some(
      (acao) => acao.material.relationshipId === 'vin-marina' && acao.tipo === 'REVOKE'
    )
  );

  // E o que o ADR-0017 e o ADR-0018 acrescentaram entra em cena sozinho: o
  // pedido é aberto de fato, e quem tem alçada é chamado.
  const naFila = b.gate.pendencias().find((p) => p.relationshipId === 'vin-marina');
  verificar('o pedido foi aberto e está na fila da tela', naFila !== undefined);
  const chamado = relatorio.plantao.avisos.find(
    (ato) => ato.aviso.pendencia.relationshipId === 'vin-marina'
  );
  verificar('e quem tem alçada foi chamado', chamado !== undefined);
  verificar(
    'com o chamado dirigido a papéis que decidem a faixa ALTA',
    (chamado?.aviso.papeisComAlcada.length ?? 0) > 0,
    chamado?.aviso.papeisComAlcada.join(',') ?? '(sem chamado)'
  );

  grupo('H11 · a distinção que decide quem conserta');
  const porAcumulo = conflitosDe(
    ['role-farmacia', 'role-auditoria-interna'],
    SEGREGACAO_MEDICAMENTOS
  );
  igual('duas funções em pessoas diferentes viram um conflito', porAcumulo.length, 1);
  igual('classificado como acúmulo de papéis', porAcumulo[0]!.origem, 'ACUMULO_DE_PAPEIS');

  const papelMalDesenhado = conflitosDe(['role-tudo-em-um'], {
    ...SEGREGACAO_MEDICAMENTOS,
    atividadesPorPapel: { 'role-tudo-em-um': ['CUSTODIAR', 'CONFERIR'] }
  });
  igual('um papel que já nasce acumulando também é conflito', papelMalDesenhado.length, 1);
  igual(
    'mas de outra natureza: o cadastro do papel',
    papelMalDesenhado[0]!.origem,
    'PAPEL_MAL_DESENHADO'
  );
  verificar(
    'e a explicação diz que redistribuir escala não resolve',
    papelMalDesenhado[0]!.explicacao.includes('redistribuir a escala não resolve'),
    papelMalDesenhado[0]!.explicacao
  );

  grupo('H11 · a matriz responde por si');
  igual(
    'papel único e compatível não produz conflito',
    conflitosDoVinculo(['role-farmacia'], DOMINIOS_DE_SEGREGACAO_BASE).length,
    0
  );
  igual(
    'e o conflito de um domínio não vaza para o outro',
    conflitosDe(['role-farmacia', 'role-auditoria-interna'], SEGREGACAO_MEDICAMENTOS)[0]!.dominioId,
    'medicamentos-controlados'
  );
  verificar(
    'toda matriz declara curador',
    DOMINIOS_DE_SEGREGACAO_BASE.every((dominio) => dominio.curador.length > 0)
  );
  verificar(
    'e a que deriva da norma sem estar nela diz isso na ressalva',
    (SEGREGACAO_MEDICAMENTOS.ressalva ?? '').includes('não enumera esta matriz'),
    SEGREGACAO_MEDICAMENTOS.ressalva ?? '(sem ressalva)'
  );

  grupo('H11 · o acúmulo aparece na tela, com procedência');
  const ultimo = await tick(b, 60_000);
  verificar('o ciclo apurou a segregação', ultimo.segregacaoAvaliada);
  const achado = ultimo.conflitosDeSegregacao.find((c) => c.relationshipId === 'vin-marina');
  verificar('e encontrou o acúmulo da farmacêutica', achado !== undefined);

  const painel = montarPainel(b.mundo.topologia, ultimo.assurance, [], undefined, {
    linhas: ultimo.conflitosDeSegregacao.map((c) => ({
      relationshipId: c.relationshipId,
      personId: c.personId,
      rotulo: c.conflito.rotulo,
      origem: c.conflito.origem,
      atividades: c.conflito.atividades.join(' × '),
      papeis: c.conflito.papeisEnvolvidos,
      explicacao: c.conflito.explicacao,
      procedencia: c.conflito.procedencia
    })),
    avaliada: ultimo.segregacaoAvaliada
  });
  igual('a seção da tela recebe a linha', painel.segregacao.length, 1);
  igual('sem aviso de leitura desligada', painel.avisoDeSegregacaoDesligada, null);
  verificar(
    'e o HTML traz a procedência junto do conflito',
    renderizarPainel(painel).includes('Procedência:')
  );

  // Desligada e vazia se parecem na tela, e só uma delas é notícia boa.
  const semLeitura = montarPainel(b.mundo.topologia, ultimo.assurance);
  igual('sem domínios, a seção não finge estar limpa', semLeitura.segregacao.length, 0);
  verificar(
    'ela declara que a leitura não foi feita',
    (semLeitura.avisoDeSegregacaoDesligada ?? '').includes('não saber não é o mesmo que não haver'),
    semLeitura.avisoDeSegregacaoDesligada ?? '(nulo)'
  );
}


function pedido(parcial: Partial<PedidoDeExcecao> = {}): PedidoDeExcecao {
  return {
    id: 'EXC-0001',
    personId: 'p-clara',
    relationshipId: 'vin-clara',
    facilityId: 'hosp-aurora',
    zonaId: 'z-datacenter',
    tipo: 'COBERTURA_TEMPORARIA',
    motivo: 'DEFICIT_DE_EQUIPE',
    duracaoMinutos: 120,
    competencia: 'VALIDA',
    origem: 'PEDIDO_DA_SUPERVISAO',
    abertoEm: new Date('2026-09-11T08:00:00'),
    ...parcial
  };
}

async function e1(): Promise<void> {
  grupo('E1 · o supervisor designa responsabilidade, e o motor deriva o acesso');
  // A escala do RH é o planejamento; a operação é outra coisa. Aqui alguém de
  // outra unidade passa a apoiar a UTI, e o ponto do cenário é o que o
  // supervisor faz: ele NÃO abre uma porta — designa responsabilidade, com
  // motivo e prazo, e quem deriva o acesso é o motor.
  const b = montarBancada();
  await tick(b);
  await tick(b, 3_000);

  const credencial = 'CRED-vin-clara-ep-dc-1';
  igual('antes, nenhum direito no datacenter', b.registros.obter(credencial), undefined);

  const resultado = b.responsabilidades.conceder(
    b.responsabilidades.abrir(pedido()),
    'escopo-facilities'
  );
  verificar('a designação é concedida', resultado.concedida, JSON.stringify(resultado));
  if (!resultado.concedida) return;
  verificar(
    'e a explicação nomeia quem designou, por quê e até quando',
    resultado.explicacao.includes('paulo.diretoria') &&
      resultado.explicacao.includes('DEFICIT_DE_EQUIPE'),
    resultado.explicacao
  );

  const comApoio = await tick(b, 60_000);
  verificar(
    'o ciclo seguinte já concede o direito derivado',
    comApoio.acoesLogicas.some(
      (acao) => acao.material.relationshipId === 'vin-clara' && acao.material.zonaId === 'z-datacenter'
    )
  );
  await tick(b, 3_000);
  igual(
    'e o equipamento confirma',
    b.registros.obter(credencial)?.estado.lastConfirmedState,
    'DEVICE_GRANT_CONFIRMED'
  );

  // O RH não foi reescrito para conseguir isso. A pessoa continua lotada onde
  // sempre esteve — mentir sobre o cadastro para obter efeito de política é
  // exatamente o que este desenho recusa.
  const vinculo = b.mundo.vinculos.find((v) => v.id === 'vin-clara');
  igual('a lotação de origem permanece intacta', vinculo?.unidadesLotadas.join(','), 'z-admin');

  grupo('E1 · o prazo vence sozinho, e o direito cai com ele');
  const depois = await tick(b, 121 * 60_000);
  verificar(
    'a reconciliação manda revogar o que a designação sustentava',
    depois.acoesLogicas.some(
      (acao) => acao.material.relationshipId === 'vin-clara' && acao.tipo === 'REVOKE'
    )
  );
  await tick(b, 3_000);
  igual(
    'e a revogação é confirmada no equipamento',
    b.registros.obter(credencial)?.estado.lastConfirmedState,
    'DEVICE_REVOCATION_CONFIRMED'
  );
  verificar(
    'ninguém precisou lembrar de desfazer: o vencimento virou elo na cadeia',
    (await b.trilha.todos()).some((e) => e.tipo === 'TemporaryResponsibilityEnded')
  );
}

async function e2(): Promise<void> {
  grupo('E2 · a autoridade tem limite, e o limite é conferido');
  const b = montarBancada();
  await tick(b);

  const foraDaZona = b.responsabilidades.conceder(
    pedido({ id: 'EXC-0002', tipo: 'APOIO_TECNICO' }),
    'escopo-supervisao-uti'
  );
  verificar('a supervisão da UTI não designa no datacenter', !foraDaZona.concedida);
  if (!foraDaZona.concedida) {
    igual('pelo motivo certo', foraDaZona.recusa, 'FORA_DAS_ZONAS_DO_ESCOPO');
    verificar(
      'e o sistema diz que outra autoridade poderia',
      foraDaZona.autoridadeSuperiorResolveria
    );
  }

  const proibido = b.responsabilidades.conceder(
    pedido({ id: 'EXC-0003', zonaId: 'z-seguranca', tipo: 'APOIO_TECNICO' }),
    'escopo-facilities'
  );
  verificar('o cofre é vedado mesmo a quem alcança a zona', !proibido.concedida);
  if (!proibido.concedida) {
    verificar(
      'a proibição vence a permissão',
      proibido.recusa === 'RECURSO_PROIBIDO' || proibido.recusa === 'FORA_DAS_ZONAS_DO_ESCOPO',
      proibido.recusa
    );
  }

  const tipoErrado = b.responsabilidades.conceder(
    pedido({ id: 'EXC-0004', zonaId: 'z-uti', tipo: 'DESIGNACAO_DE_SUPERVISAO' }),
    'escopo-supervisao-uti'
  );
  verificar('nem todo tipo de responsabilidade é designável por qualquer um', !tipoErrado.concedida);

  const semEscopo = b.responsabilidades.conceder(
    pedido({ id: 'EXC-0005', zonaId: 'z-uti' }),
    'escopo-inexistente'
  );
  verificar('sem escopo declarado, não há o que conferir', !semEscopo.concedida);
  if (!semEscopo.concedida) igual('e é recusa', semEscopo.recusa, 'ESCOPO_INEXISTENTE');
}

async function e3(): Promise<void> {
  grupo('E3 · necessidade operacional não cria competência');
  const b = montarBancada();
  await tick(b);

  const semCompetencia = b.responsabilidades.conceder(
    pedido({ id: 'EXC-0006', zonaId: 'z-uti', competencia: 'INSUFICIENTE' }),
    'escopo-supervisao-uti'
  );
  verificar('competência insuficiente recusa', !semCompetencia.concedida);
  if (!semCompetencia.concedida) {
    igual('pelo motivo certo', semCompetencia.recusa, 'COMPETENCIA_INSUFICIENTE');
    verificar(
      'e NENHUMA autoridade resolve isso — falta qualificação, não permissão',
      !semCompetencia.autoridadeSuperiorResolveria
    );
  }

  // Quando o sistema CONSEGUE conferir, a afirmação de quem pede não prevalece.
  // Aqui o pedido diz "não verificada" e a conferência encontra a exigência da
  // zona pendente — o registro guarda o que foi apurado, não o que foi dito.
  const afirmadaSemChecagem = b.responsabilidades.conceder(
    pedido({ id: 'EXC-0007', zonaId: 'z-uti', competencia: 'NAO_VERIFICADA' }),
    'escopo-supervisao-uti'
  );
  verificar('a designação segue: pendência não é suspensão', afirmadaSemChecagem.concedida);
  if (afirmadaSemChecagem.concedida) {
    igual(
      'e o registro guarda o que foi CONFERIDO, não o que foi afirmado',
      afirmadaSemChecagem.responsabilidade.competenciaNaConcessao,
      'PENDENTE'
    );
    verificar(
      'dizendo que designar apoio e abrir a porta são dois atos',
      afirmadaSemChecagem.explicacao.includes('dois atos'),
      afirmadaSemChecagem.explicacao
    );
  }

  // E quando NÃO há como conferir, a afirmação atravessa registrada como tal —
  // em vez de virar aprovação tácita por distração.
  const semConferencia = new RegistroDeResponsabilidades(b.relogio, ESCOPOS_DE_DELEGACAO);
  const semFonte = semConferencia.conceder(
    pedido({ id: 'EXC-0012', zonaId: 'z-uti', competencia: 'NAO_VERIFICADA' }),
    'escopo-supervisao-uti'
  );
  verificar('sem fonte de competência, a designação também segue', semFonte.concedida);
  if (semFonte.concedida) {
    igual(
      'mas a ausência da checagem fica dita',
      semFonte.responsabilidade.competenciaNaConcessao,
      'NAO_VERIFICADA'
    );
    verificar(
      'e não presumida como válida',
      semFonte.explicacao.includes('NÃO foi verificada'),
      semFonte.explicacao
    );
  }

  const semTexto = b.responsabilidades.conceder(
    pedido({ id: 'EXC-0008', zonaId: 'z-uti', motivo: 'OUTRO' }),
    'escopo-supervisao-uti'
  );
  verificar('motivo OUTRO sem descrição não passa', !semTexto.concedida);

  const semPrazo = b.responsabilidades.conceder(
    pedido({ id: 'EXC-0009', zonaId: 'z-uti', duracaoMinutos: 0 }),
    'escopo-supervisao-uti'
  );
  verificar('responsabilidade sem prazo não é temporária', !semPrazo.concedida);
}

async function e4(): Promise<void> {
  grupo('E4 · o teto do escopo corta o prazo pedido, e diz que cortou');
  const b = montarBancada();
  await tick(b);
  const longo = b.responsabilidades.conceder(
    pedido({ id: 'EXC-0010', duracaoMinutos: 24 * 60 }),
    'escopo-facilities'
  );
  verificar('concede', longo.concedida);
  if (longo.concedida) {
    verificar('reduzindo o prazo', longo.duracaoReduzida);
    const minutos =
      (longo.responsabilidade.validaAte.getTime() - longo.responsabilidade.validaDe.getTime()) /
      60_000;
    igual('para o teto da autoridade', minutos, 240);
    verificar('e dizendo isso por extenso', longo.explicacao.includes('reduzido'), longo.explicacao);
  }

  grupo('E4 · encerrar antes do prazo é direito de quem designou');
  const b2 = montarBancada();
  await tick(b2);
  await tick(b2, 3_000);
  const ativo = b2.responsabilidades.conceder(
    b2.responsabilidades.abrir(pedido({ id: 'EXC-0011' })),
    'escopo-facilities'
  );
  if (!ativo.concedida) {
    verificar('a designação deveria ter sido concedida', false);
    return;
  }
  await tick(b2, 60_000);
  await tick(b2, 3_000);
  const credencial = 'CRED-vin-clara-ep-dc-1';
  igual(
    'o apoio está com acesso confirmado',
    b2.registros.obter(credencial)?.estado.lastConfirmedState,
    'DEVICE_GRANT_CONFIRMED'
  );

  b2.responsabilidades.revogar(ativo.responsabilidade.id, 'sofia.seguranca');
  const apos = await tick(b2, 60_000);
  verificar(
    'encerrado o apoio, o direito é revogado na volta seguinte',
    apos.acoesLogicas.some(
      (acao) => acao.material.relationshipId === 'vin-clara' && acao.tipo === 'REVOKE'
    )
  );
  verificar(
    'e a recusa e o encerramento estão na cadeia com autor',
    (await b2.trilha.todos()).some(
      (e) => e.tipo === 'TemporaryResponsibilityGranted' && e.decisionOrigin === 'MANUAL_OPERATOR'
    )
  );
}


async function c1(): Promise<void> {
  grupo('C1 · o conselho suspende, e a porta fecha — sem alçada que reabra');
  const b = montarBancada();
  await tick(b);
  await tick(b, 3_000);
  const credencial = 'CRED-vin-eduardo-ep-uti-1';
  igual(
    'o enfermeiro com registro vigente tem acesso à UTI',
    b.registros.obter(credencial)?.estado.lastConfirmedState,
    'DEVICE_GRANT_CONFIRMED'
  );

  // Suspensão é ato do emissor. O hospital não a decide, e também não a desfaz.
  b.competencias.suspender('p-eduardo', 'registro-de-enfermagem');
  const apos = await tick(b, 60_000);
  const acao = apos.acoesLogicas.find(
    (a) => a.material.relationshipId === 'vin-eduardo' && a.material.zonaId === 'z-uti'
  );
  igual('o direito é revogado', acao?.tipo, 'REVOKE');
  verificar(
    'e a razão diz que o que falta é qualificação, não permissão',
    (acao?.decisao.razao ?? '').includes('não é permissão'),
    acao?.decisao.razao ?? '(sem ação)'
  );
  verificar(
    'NÃO vira pendência de aprovação: não há a quem recorrer',
    !apos.pendentesDeAprovacao.some((p) => p.material.relationshipId === 'vin-eduardo')
  );
  await tick(b, 3_000);
  igual(
    'e o equipamento confirma a revogação',
    b.registros.obter(credencial)?.estado.lastConfirmedState,
    'DEVICE_REVOCATION_CONFIRMED'
  );
}

async function c2(): Promise<void> {
  grupo('C2 · habilitação vencida exige revisão humana, e não fecha sozinha');
  // Fechar por anuidade atrasada faria o custo do rigor recair sobre quem
  // precisa de atendimento, e não sobre quem esqueceu de renovar. É o erro
  // simétrico do ADR-0014, e a direção do efeito aqui é deliberada.
  const b = montarBancada();
  b.competencias.declarar({
    personId: 'p-eduardo',
    competenciaId: 'registro-de-enfermagem',
    estado: 'VIGENTE',
    validaAte: new Date('2026-09-11T09:00:00'),
    verificadoEm: new Date('2026-09-01T00:00:00')
  });
  await tick(b);
  await tick(b, 3_000);

  const vencido = await tick(b, 2 * 60 * 60_000);
  const pendente = vencido.pendentesDeAprovacao.find(
    (p) => p.material.relationshipId === 'vin-eduardo' && p.material.zonaId === 'z-uti'
  );
  verificar('vira pendência de revisão humana', pendente !== undefined);
  verificar(
    'com a data do vencimento na razão',
    (pendente?.material.razaoDaPolitica ?? '').includes('venceu em'),
    pendente?.material.razaoDaPolitica ?? '(sem pendência)'
  );
  verificar(
    'e o direito é MANTIDO enquanto uma pessoa decide',
    !vencido.acoesLogicas.some(
      (a) => a.material.relationshipId === 'vin-eduardo' && a.tipo === 'REVOKE'
    )
  );
  verificar(
    'o ciclo abriu o pedido e chamou quem tem alçada',
    vencido.plantao.avisos.some((ato) => ato.aviso.pendencia.relationshipId === 'vin-eduardo')
  );
}

async function c3(): Promise<void> {
  grupo('C3 · exigência ausente não é evidência ausente');
  const b = montarBancada();
  await tick(b);
  await tick(b, 3_000);
  // Clara não tem habilitação nenhuma declarada, e o administrativo não exige
  // nenhuma. Tratar exigência ausente como falha fecharia toda porta no dia em
  // que a integração com o conselho ficasse muda.
  igual(
    'quem trabalha em zona sem exigência não é afetado',
    b.registros.obter('CRED-vin-clara-ep-adm-1')?.estado.lastConfirmedState,
    'DEVICE_GRANT_CONFIRMED'
  );
  const leitura = b.competencias.avaliar('p-clara', 'z-admin', b.relogio.agora());
  verificar('a leitura diz que não há exigência', !leitura.exigida);
  verificar('e por isso ela atende', leitura.atende);

  const naUti = b.competencias.avaliar('p-clara', 'z-uti', b.relogio.agora());
  verificar('a mesma pessoa, numa zona que exige, não atende', naUti.exigida && !naUti.atende);
  igual('por não ter a habilitação declarada', naUti.faltantes[0]?.falha, 'NAO_DECLARADA');
  verificar('e isso não é suspensão', !naUti.suspensa);
}

async function c4(): Promise<void> {
  grupo('C4 · designar responsabilidade não cria competência');
  // A composição das duas metades da formulação que a pesquisa alcançou:
  // "por competência e responsabilidade vigente". O supervisor pode designar
  // apoio; ele não pode designar habilitação.
  const b = montarBancada();
  await tick(b);
  await tick(b, 3_000);

  const designada = b.responsabilidades.conceder(
    b.responsabilidades.abrir(
      pedido({
        id: 'EXC-0020',
        personId: 'p-marina',
        relationshipId: 'vin-marina',
        zonaId: 'z-uti',
        tipo: 'APOIO_ASSISTENCIAL',
        motivo: 'INTERCORRENCIA_CLINICA'
      })
    ),
    'escopo-supervisao-uti'
  );
  verificar('a designação é legítima e é concedida', designada.concedida);

  const apos = await tick(b, 60_000);
  const pendente = apos.pendentesDeAprovacao.find(
    (p) => p.material.relationshipId === 'vin-marina' && p.material.zonaId === 'z-uti'
  );
  verificar('mas a porta da UTI não abre sozinha', pendente !== undefined);
  verificar(
    'porque a habilitação exigida não foi declarada para ela',
    (pendente?.material.razaoDaPolitica ?? '').includes('registro-de-enfermagem'),
    pendente?.material.razaoDaPolitica ?? '(sem pendência)'
  );
  verificar(
    'e ninguém foi barrado em silêncio: o chamado saiu',
    apos.plantao.avisos.some((ato) => ato.aviso.pendencia.relationshipId === 'vin-marina')
  );
  igual(
    'o acesso permanece inexistente até que gente decida',
    b.registros.obter('CRED-vin-marina-ep-uti-1'),
    undefined
  );
}


function fontesDe(b: Awaited<ReturnType<typeof montarBancada>>) {
  return {
    mundo: b.mundo,
    politica: new PolicyEngine(REGRAS_HOSPITALARES_BASE),
    registros: b.registros,
    relogio: b.relogio,
    gate: b.gate,
    responsabilidades: b.responsabilidades,
    trilha: b.trilha
  };
}

async function x1(): Promise<void> {
  grupo('X1 · a pergunta única responde as DUAS perguntas, separadas');
  const b = montarBancada();
  await tick(b);
  await tick(b, 3_000);

  const e = await explicarAcesso(
    { relationshipId: 'vin-eduardo', endpointId: 'ep-uti-1' },
    fontesDe(b)
  );
  igual('o veredito lógico é permitir', e.veredito, 'PERMITE');
  igual('e a resposta é recomputada, não reconstruída', e.natureza, 'RECOMPUTADA');
  verificar('o estado físico vem separado, e confirmado', e.estadoFisico.confirmado);
  verificar(
    'as camadas nomeiam vínculo, turno, papel e competência',
    ['Vínculo', 'Turno', 'Papel e lotação', 'Competência'].every((nome) =>
      e.camadas.some((c) => c.nome === nome)
    ),
    e.camadas.map((c) => c.nome).join(', ')
  );
  verificar(
    'a camada de competência diz que a exigência está vigente',
    e.camadas.find((c) => c.nome === 'Competência')?.leitura === 'SUSTENTA'
  );
  verificar(
    'e a regra vencedora é nomeada, não resumida',
    e.regrasAplicadas.length > 0,
    e.regrasAplicadas.join(',')
  );
}

async function x2(): Promise<void> {
  grupo('X2 · quando bloqueia, a explicação diz qual camada bloqueou');
  const b = montarBancada();
  await tick(b);
  await tick(b, 3_000);
  b.competencias.suspender('p-eduardo', 'registro-de-enfermagem');

  const e = await explicarAcesso(
    { relationshipId: 'vin-eduardo', endpointId: 'ep-uti-1' },
    fontesDe(b)
  );
  igual('o veredito vira negar', e.veredito, 'NEGA');
  igual(
    'e a camada que bloqueia é a competência',
    e.camadas.find((c) => c.nome === 'Competência')?.leitura,
    'BLOQUEIA'
  );
  verificar(
    'o estado físico ainda diz o que o equipamento confirmou por último',
    e.estadoFisico.confirmado,
    e.estadoFisico.texto
  );
  // A distinção que o produto inteiro existe para sustentar: a negativa é
  // lógica, e o equipamento continua com a concessão antiga até sincronizar.
  verificar(
    'e as duas coisas não são apresentadas como uma só',
    e.veredito === 'NEGA' && e.estadoFisico.estado?.lastConfirmedState === 'DEVICE_GRANT_CONFIRMED'
  );
}

async function x3(): Promise<void> {
  grupo('X3 · a aprovação humana aparece como camada própria');
  const b = montarBancada();
  const primeiro = await tick(b);
  const material = materialDoCofre(primeiro);

  const antes = await explicarAcesso(
    { relationshipId: material.relationshipId, endpointId: material.endpointId },
    fontesDe(b)
  );
  igual('antes de assinar, exige revisão', antes.veredito, 'EXIGE_REVISAO');
  const camada = antes.camadas.find((c) => c.nome === 'Aprovação humana');
  verificar('a camada existe', camada !== undefined);
  igual('e diz que ainda não autoriza', camada?.leitura, 'EXIGE_REVISAO');

  await aprovarCofre(b, material);
  const depois = await explicarAcesso(
    { relationshipId: material.relationshipId, endpointId: material.endpointId },
    fontesDe(b)
  );
  igual('com as duas assinaturas, permite', depois.veredito, 'PERMITE');
  verificar(
    'e a camada nomeia quem assinou, com a alçada daquele instante',
    (depois.camadas.find((c) => c.nome === 'Aprovação humana')?.texto ?? '').includes('alçada até'),
    depois.camadas.find((c) => c.nome === 'Aprovação humana')?.texto ?? '(sem camada)'
  );
}

async function x4(): Promise<void> {
  grupo('X4 · sobre o passado, a explicação recusa o verdicto e entrega a cadeia');
  const b = montarBancada();
  await tick(b);
  await tick(b, 3_000);
  const instante = b.relogio.agora();
  await tick(b, 60 * 60_000);

  const e = await explicarAcesso(
    { relationshipId: 'vin-eduardo', endpointId: 'ep-uti-1', em: instante },
    fontesDe(b)
  );
  igual('a natureza da resposta muda', e.natureza, 'RECONSTRUIDA');
  igual('e o verdicto é recusado', e.veredito, 'NAO_RECONSTITUIVEL');
  verificar(
    'com o motivo dito: guardamos atos, não o estado do mundo',
    (e.camadas[0]?.texto ?? '').includes('não o ESTADO do mundo'),
    e.camadas[0]?.texto ?? ''
  );
  verificar(
    'mas a cadeia daquele endpoint é entregue',
    e.linhas.some((linha) => linha.includes('EntitlementGranted') || linha.includes('Physical')),
    e.linhas.slice(0, 3).join(' | ')
  );

  grupo('X4 · pergunta sem sujeito não inventa resposta');
  const semSujeito = await explicarAcesso(
    { relationshipId: 'vin-inexistente', endpointId: 'ep-uti-1' },
    fontesDe(b)
  );
  igual('devolve SEM_SUJEITO', semSujeito.veredito, 'SEM_SUJEITO');
}

await h7();
await h8();
await h9();
await h10();
await h11();
await e1();
await e2();
await e3();
await e4();
await c1();
await c2();
await c3();
await c4();
await x1();
await x2();
await x3();
await x4();
fechar('Cenários hospitalares, exceções, competência e Explicar acesso');
