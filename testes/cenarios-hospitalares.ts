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
import { aprovarCofre, materialDoCofre, montarBancada, tick } from './bancada';
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

await h7();
await h8();
await h9();
await h10();
await h11();
fechar('Cenários hospitalares H7–H11');
