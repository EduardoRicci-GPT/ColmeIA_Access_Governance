// ---------------------------------------------------------------------------
// APROVAÇÃO HUMANA — o human-gate do MPE-H aplicado ao acesso
//
// A pergunta que esta suíte responde não é "o sistema pede aprovação?". É:
// APROVOU O QUÊ, QUEM, E O CONTEÚDO CONTINUOU O MESMO?
//
// Um booleano — e o `Set<string>` que este produto usava antes — responde à
// primeira e é mudo nas outras duas. A diferença aparece no teste da
// criticidade alterada: a aprovação some sozinha quando o que foi revisado
// deixa de ser o que será executado, e ninguém precisou lembrar de revogá-la.
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, verificar } from './runner';
import { RelogioFixo } from '../packages/dominio/tempo';
import {
  ALCADAS_HOSPITALARES,
  AutoridadeEmMemoria,
  CONSTANTES_DE_VIGENCIA,
  GateDeAcesso,
  JANELAS_PADRAO,
  MaterialDeRevisao,
  SEM_APROVACOES,
  lerJanelas,
  serializarMaterial
} from '../packages/governanca';
import { DiarioNaTrilha, TrilhaDeAcesso } from '../packages/auditoria';
import { PendenciaDeAprovacao } from '../packages/governanca';
import { montarPainel } from '../packages/assurance-ui/painel';
import { renderizarPainel } from '../packages/assurance-ui/render';
import { aprovarCofre as aprovarCofreNaBancada, materialDoCofre, montarBancada, tick } from './bancada';
import {
  CANAL_AUSENTE,
  CanalEmMemoria,
  CONSTANTES_DE_AVISO,
  PlantaoDeAprovacao,
  lerJanelasDeAviso
} from '../packages/governanca';
import { AutoridadeDoHost, Criticidade as CriticidadeDoGate, DecisaoDeGate } from '../packages/mpeh-kernel/human-gate/tipos';

function bancadaDoGate() {
  const relogio = new RelogioFixo('2026-09-11T08:00:00');
  const autoridade = new AutoridadeEmMemoria(ALCADAS_HOSPITALARES);
  autoridade.credenciar('rita.diretoria', 'token-rita');
  autoridade.credenciar('paulo.diretoria', 'token-paulo');
  autoridade.credenciar('sofia.seguranca', 'token-sofia');
  autoridade.credenciar('caio.enfermagem', 'token-caio');
  return { relogio, autoridade, gate: new GateDeAcesso(autoridade, relogio) };
}

const COFRE: MaterialDeRevisao = {
  personId: 'p-rui',
  relationshipId: 'vin-rui',
  endpointId: 'ep-seg-1',
  nomeDoEndpoint: 'Cofre de psicotrópicos',
  zonaId: 'z-seguranca',
  criticidade: 'CRITICAL',
  papeis: ['role-seguranca'],
  tipoDeVinculo: 'EMPLOYEE',
  razaoDaPolitica: 'Endpoint classificado como CRITICAL: aprovação humana obrigatória.'
};

const FARMACIA: MaterialDeRevisao = { ...COFRE, endpointId: 'ep-farm-1', nomeDoEndpoint: 'Farmácia', criticidade: 'HIGH' };

grupo('Fecha por omissão');
verificar('sem consulta registrada, nada é autorizado', !SEM_APROVACOES.autorizado(COFRE));
{
  const { gate } = bancadaDoGate();
  verificar('sem pedido aberto, não autoriza', !gate.autorizado(COFRE));
  verificar(
    'e explica que não há aprovação',
    gate.explicar(COFRE).includes('Nenhuma aprovação'),
    gate.explicar(COFRE)
  );
}

grupo('Criticidade CRITICA exige duas pessoas distintas');
{
  const { gate } = bancadaDoGate();
  await gate.abrir(COFRE, 'ciclo');
  const uma = await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'Plantão noturno.',
    assinatura: 'token-rita'
  });
  verificar('uma assinatura não basta', !uma.autorizado);
  igual('motivo nomeado', uma.motivo, 'APROVACOES_INSUFICIENTES');

  const repetida = await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'De novo.',
    assinatura: 'token-rita'
  });
  verificar('a mesma pessoa assinando duas vezes não vale por duas', !repetida.autorizado);
  igual('e o motivo é a repetição', repetida.motivo, 'APROVADOR_REPETIDO');
}
{
  const { gate } = bancadaDoGate();
  await gate.abrir(COFRE, 'ciclo');
  await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'Plantão noturno.',
    assinatura: 'token-rita'
  });
  const duas = await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'paulo.diretoria',
    papel: 'diretoria-administrativa',
    justificativa: 'Segunda aprovação.',
    assinatura: 'token-paulo'
  });
  verificar('duas pessoas distintas autorizam', duas.autorizado, duas.explicacao);
  igual('e as duas ficam registradas', duas.registro.aprovadores.length, 2);
  verificar('a leitura síncrona do motor concorda', gate.autorizado(COFRE));
}

grupo('A DEFESA CENTRAL: aprovação ligada ao conteúdo revisado');
{
  const { gate } = bancadaDoGate();
  await gate.abrir(FARMACIA, 'ciclo');
  const verdicto = await gate.decidir(FARMACIA, {
    decisao: 'APROVADO',
    aprovador: 'sofia.seguranca',
    papel: 'supervisao-de-seguranca',
    justificativa: 'Acesso à farmácia autorizado para o turno.',
    assinatura: 'token-sofia'
  });
  verificar('a farmácia (ALTA) autoriza com uma assinatura', verdicto.autorizado, verdicto.explicacao);

  // Agora o mundo muda: o mesmo endpoint é reclassificado como CRITICAL.
  const reclassificado: MaterialDeRevisao = { ...FARMACIA, criticidade: 'CRITICAL' };
  verificar(
    'a aprovação NÃO acompanha a reclassificação do endpoint',
    !gate.autorizado(reclassificado)
  );
  verificar(
    'e a explicação diz que o material mudou',
    gate.explicar(reclassificado).includes('mudou depois da revisão'),
    gate.explicar(reclassificado)
  );
  const reavaliado = await gate.reavaliar(reclassificado);
  igual('o gate bloqueia por conteúdo alterado', reavaliado.motivo, 'CONTEUDO_MUDOU_APOS_REVISAO');

  // Mudar o papel da pessoa tem o mesmo efeito.
  const outroPapel: MaterialDeRevisao = { ...FARMACIA, papeis: ['role-manutencao'] };
  verificar('trocar o papel também invalida', !gate.autorizado(outroPapel));

  // E o material original continua valendo — a invalidação é do que mudou.
  verificar('o acesso originalmente aprovado continua válido', gate.autorizado(FARMACIA));
}

grupo('Alçada e assinatura vêm do host, e são conferidas');
{
  const { gate } = bancadaDoGate();
  await gate.abrir(COFRE, 'ciclo');
  const semAlcada = await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'caio.enfermagem',
    papel: 'coordenacao-de-enfermagem',
    justificativa: 'Tentando aprovar acima da alçada.',
    assinatura: 'token-caio'
  });
  verificar('coordenação de enfermagem não decide sobre CRITICA', !semAlcada.autorizado);
  igual('motivo nomeado', semAlcada.motivo, 'APROVADOR_SEM_AUTORIDADE');
}
{
  const { gate } = bancadaDoGate();
  await gate.abrir(COFRE, 'ciclo');
  const tokenErrado = await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'Token de outra pessoa.',
    assinatura: 'token-paulo'
  });
  verificar('token que não é do aprovador não vale', !tokenErrado.autorizado);
  igual('motivo nomeado', tokenErrado.motivo, 'ASSINATURA_INVALIDA');
}

grupo('Recusa é decisão, e exige motivo');
{
  const { gate } = bancadaDoGate();
  await gate.abrir(FARMACIA, 'ciclo');
  const recusa = await gate.decidir(FARMACIA, {
    decisao: 'RECUSADO',
    aprovador: 'sofia.seguranca',
    papel: 'supervisao-de-seguranca',
    justificativa: 'Vínculo em apuração pelo RH.',
    assinatura: 'token-sofia'
  });
  verificar('a recusa bloqueia', !recusa.autorizado);
  igual('e é registrada como recusa humana', recusa.motivo, 'RECUSADO_PELO_HUMANO');
}
{
  const { gate } = bancadaDoGate();
  await gate.abrir(FARMACIA, 'ciclo');
  const semMotivo = await gate.decidir(FARMACIA, {
    decisao: 'APROVADO',
    aprovador: 'sofia.seguranca',
    papel: 'supervisao-de-seguranca',
    justificativa: '   ',
    assinatura: 'token-sofia'
  });
  verificar('aprovação sem justificativa não vale', !semMotivo.autorizado);
  igual('motivo nomeado', semMotivo.motivo, 'JUSTIFICATIVA_AUSENTE');
}

grupo('A serialização do material é canônica');
{
  const a = serializarMaterial({ ...COFRE, papeis: ['b', 'a', 'c'] });
  const b = serializarMaterial({ ...COFRE, papeis: ['c', 'a', 'b'] });
  igual('a ordem dos papéis não muda o material', a, b);
  verificar(
    'e o material contém os fatos que mudariam a decisão de quem aprova',
    ['pessoa:', 'vinculo:', 'papeis:', 'endpoint:', 'zona:', 'criticidade:', 'razao:'].every((campo) =>
      a.includes(campo)
    ),
    a
  );
}

grupo('Decisão não cria pedido');
{
  const { gate } = bancadaDoGate();
  let lancou = false;
  try {
    await gate.decidir(COFRE, {
      decisao: 'APROVADO',
      aprovador: 'rita.diretoria',
      papel: 'diretoria-tecnica',
      justificativa: 'Aprovando algo que ninguém pediu.',
      assinatura: 'token-rita'
    });
  } catch {
    lancou = true;
  }
  verificar('aprovar sem pedido aberto é recusado', lancou);
}

// ---------------------------------------------------------------------------
// A ALÇADA, CONGELADA
// ---------------------------------------------------------------------------

/** Autoridade cujo teto MUDA — é a única forma de provar que o congelamento vale. */
class AutoridadeMutavel implements AutoridadeDoHost {
  constructor(
    private tetos: Record<string, CriticidadeDoGate>,
    private readonly tokens: Record<string, string>
  ) {}

  rebaixar(papel: string, ate: CriticidadeDoGate): void {
    this.tetos = { ...this.tetos, [papel]: ate };
  }

  assinaturaConfere(decisao: DecisaoDeGate): boolean {
    return this.tokens[decisao.aprovador] === decisao.assinatura;
  }

  podeDecidir(papel: string, criticidade: CriticidadeDoGate): boolean {
    const ordem: Record<CriticidadeDoGate, number> = { BAIXA: 0, MEDIA: 1, ALTA: 2, CRITICA: 3 };
    const teto = this.tetos[papel];
    return teto !== undefined && ordem[teto] >= ordem[criticidade];
  }
}

grupo('A alçada é congelada no instante da decisão');
{
  const { gate } = bancadaDoGate();
  await gate.abrir(FARMACIA, 'motor');
  await gate.decidir(FARMACIA, {
    decisao: 'APROVADO',
    aprovador: 'sofia.seguranca',
    papel: 'supervisao-de-seguranca',
    justificativa: 'Plantão noturno, troca de escala prevista.',
    assinatura: 'token-sofia'
  });
  const [alcada] = gate.alcadasDe(FARMACIA.relationshipId, FARMACIA.endpointId);
  igual('o teto do papel fica registrado', alcada?.ate ?? null, 'ALTA');
  igual('e a faixa que a decisão exigia também', alcada?.exigida ?? null, 'ALTA');
  igual('com o nome de quem decidiu', alcada?.aprovador ?? '', 'sofia.seguranca');
}
{
  // Recusa de quem não tinha autoridade é fato de auditoria: precisa ficar.
  const { gate } = bancadaDoGate();
  await gate.abrir(COFRE, 'motor');
  await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'caio.enfermagem',
    papel: 'coordenacao-de-enfermagem',
    justificativa: 'Urgência no plantão.',
    assinatura: 'token-caio'
  });
  const [alcada] = gate.alcadasDe(COFRE.relationshipId, COFRE.endpointId);
  verificar('a tentativa sem alçada fica registrada', alcada !== undefined);
  igual('com o teto real do papel', alcada?.ate ?? null, 'MEDIA');
  igual('e a faixa que faltava alcançar', alcada?.exigida ?? null, 'CRITICA');
  verificar('e o gate segue não autorizando', !gate.autorizado(COFRE));
}
{
  // O congelamento só se prova quando o presente muda.
  const relogio = new RelogioFixo('2026-09-14T02:40:00');
  const autoridade = new AutoridadeMutavel(
    { 'supervisao-de-seguranca': 'ALTA' },
    { 'sofia.seguranca': 'token-sofia' }
  );
  const gate = new GateDeAcesso(autoridade, relogio);
  await gate.abrir(FARMACIA, 'motor');
  await gate.decidir(FARMACIA, {
    decisao: 'APROVADO',
    aprovador: 'sofia.seguranca',
    papel: 'supervisao-de-seguranca',
    justificativa: 'Reposição de insumos na madrugada.',
    assinatura: 'token-sofia'
  });
  autoridade.rebaixar('supervisao-de-seguranca', 'BAIXA');
  const [alcada] = gate.alcadasDe(FARMACIA.relationshipId, FARMACIA.endpointId);
  igual(
    'rebaixar o papel depois não reescreve a autoridade de então',
    alcada?.ate ?? null,
    'ALTA'
  );
}

// ---------------------------------------------------------------------------
// A VIGÊNCIA
// ---------------------------------------------------------------------------

async function aprovarCofre(gate: GateDeAcesso): Promise<void> {
  await gate.abrir(COFRE, 'motor');
  await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'Reposição de psicotrópicos conferida com a farmácia.',
    assinatura: 'token-rita'
  });
  await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'paulo.diretoria',
    papel: 'diretoria-administrativa',
    justificativa: 'Segunda pessoa exigida pela faixa crítica.',
    assinatura: 'token-paulo'
  });
}

grupo('As janelas de vigência têm estatuto, e é SOMBRA');
{
  const lidas = lerJanelas();
  igual('quatro janelas declaradas', CONSTANTES_DE_VIGENCIA.length, 4);
  verificar('todas em sombra', lidas.emSombra);
  igual('um aviso por janela', lidas.avisos.length, 4);
  verificar(
    'e o aviso diz que a janela só pode exigir revisão, nunca conceder',
    lidas.avisos.every((a) => a.includes('nunca conceder acesso')),
    lidas.avisos[0]
  );
  igual('a faixa crítica dura um plantão', JANELAS_PADRAO.CRITICA, 12 * 60);
}

grupo('A aprovação vence, e o material não mudou');
{
  const { gate, relogio } = bancadaDoGate();
  await aprovarCofre(gate);
  verificar('recém-aprovada, autoriza', gate.autorizado(COFRE));
  const vigencia = gate.vigenciaDe(COFRE.relationshipId, COFRE.endpointId);
  verificar('há data de expiração', vigencia.expiraEm !== null);
  igual(
    'doze horas depois da aprovação',
    (vigencia.expiraEm?.getTime() ?? 0) - (vigencia.aprovadoEm?.getTime() ?? 0),
    12 * 3_600_000
  );
  verificar('e o prazo sai com o aviso de sombra colado', vigencia.avisos.length === 4);

  relogio.avancarHoras(11);
  verificar('onze horas depois ainda autoriza', gate.autorizado(COFRE));
  verificar('e não está vencida', !gate.vigenciaDe(COFRE.relationshipId, COFRE.endpointId).vencida);

  relogio.avancarHoras(1);
  verificar('no fim do plantão, não autoriza mais', !gate.autorizado(COFRE));
  verificar('a vigência se declara vencida', gate.vigenciaDe(COFRE.relationshipId, COFRE.endpointId).vencida);
  verificar(
    'e a explicação diz que foi o tempo, não o material',
    gate.explicar(COFRE).includes('mudou o tempo'),
    gate.explicar(COFRE)
  );
  verificar(
    'e nomeia quem havia aprovado',
    gate.explicar(COFRE).includes('rita.diretoria'),
    gate.explicar(COFRE)
  );
  verificar(
    'a aprovação vencida volta para a fila de pendências',
    gate.pedidosAbertos().length === 1
  );
  verificar(
    'e o verdicto humano continua registrado como foi tomado',
    gate.verdictoDe(COFRE.relationshipId, COFRE.endpointId)?.autorizado === true
  );
}
{
  // Numa faixa que exige duas pessoas, a janela é a que a SEGUNDA concedeu.
  const { gate, relogio } = bancadaDoGate();
  await gate.abrir(COFRE, 'motor');
  await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'Primeira assinatura.',
    assinatura: 'token-rita'
  });
  relogio.avancarHoras(5);
  await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'paulo.diretoria',
    papel: 'diretoria-administrativa',
    justificativa: 'Segunda assinatura, cinco horas depois.',
    assinatura: 'token-paulo'
  });
  const vigencia = gate.vigenciaDe(COFRE.relationshipId, COFRE.endpointId);
  igual(
    'o relógio começa quando o gate passou a autorizar',
    vigencia.aprovadoEm?.toISOString() ?? '',
    '2026-09-11T13:00:00.000Z'
  );
  relogio.avancarHoras(11);
  verificar('onze horas depois da segunda, ainda vale', gate.autorizado(COFRE));
}
{
  // A janela em sombra só fecha: nenhum valor dela abre o que ninguém aprovou.
  const { gate, relogio } = bancadaDoGate();
  await gate.abrir(COFRE, 'motor');
  verificar('sem decisão, não autoriza agora', !gate.autorizado(COFRE));
  relogio.avancarHoras(240);
  verificar('nem dez dias depois', !gate.autorizado(COFRE));
  igual(
    'e não há vigência nenhuma a exibir',
    gate.vigenciaDe(COFRE.relationshipId, COFRE.endpointId).expiraEm,
    null
  );
}
{
  // Criticidade menor, janela maior — e é a do endpoint, não a do produto.
  const { gate, relogio } = bancadaDoGate();
  await gate.abrir(FARMACIA, 'motor');
  await gate.decidir(FARMACIA, {
    decisao: 'APROVADO',
    aprovador: 'sofia.seguranca',
    papel: 'supervisao-de-seguranca',
    justificativa: 'Escala da semana.',
    assinatura: 'token-sofia'
  });
  relogio.avancarHoras(24 * 6);
  verificar('seis dias depois, a farmácia ainda vale', gate.autorizado(FARMACIA));
  relogio.avancarHoras(24);
  verificar('no sétimo, não', !gate.autorizado(FARMACIA));
}

// ---------------------------------------------------------------------------
// A TRILHA
// ---------------------------------------------------------------------------

grupo('O ato humano entra na cadeia');
{
  const relogio = new RelogioFixo('2026-09-11T08:00:00');
  const autoridade = new AutoridadeEmMemoria(ALCADAS_HOSPITALARES);
  autoridade.credenciar('rita.diretoria', 'token-rita');
  autoridade.credenciar('paulo.diretoria', 'token-paulo');
  const trilha = new TrilhaDeAcesso({ relogio });
  const diario = new DiarioNaTrilha(trilha, { organizationId: 'org-santa-casa' });
  const gate = new GateDeAcesso(autoridade, relogio, JANELAS_PADRAO, diario);

  await aprovarCofre(gate);
  igual('um pedido e duas decisões aguardam gravação', diario.pendencias, 3);
  igual('e todas entram na cadeia', await diario.drenar(), 3);

  relogio.avancarHoras(13);
  verificar('depois do prazo, não autoriza', !gate.autorizado(COFRE));
  igual('o vencimento também vira ato', diario.pendencias, 1);
  verificar('mesmo sem ator que o anuncie', (await diario.drenar()) === 1);
  verificar('e não é anunciado duas vezes', !gate.autorizado(COFRE) && diario.pendencias === 0);

  const elos = await trilha.elos();
  igual('quatro elos ao todo', elos.length, 4);
  const integridade = await trilha.verificarIntegridade();
  verificar('a cadeia continua íntegra', integridade.integra, integridade.motivo);

  const pedido = elos[0]!;
  const decisao = elos[1]!;
  const vencimento = elos[3]!;
  igual('pedir revisão é ato consultivo', pedido.corpo, 'CONSULTIVO');
  igual('decidir é ato humano', decisao.corpo, 'HUMANO');
  igual('constatar vencimento é consultivo', vencimento.corpo, 'CONSULTIVO');
  verificar(
    'o resumo da decisão nomeia a pessoa e a alçada',
    decisao.evento.resumo.includes('rita.diretoria') && decisao.evento.resumo.includes('alçada até CRITICA'),
    decisao.evento.resumo
  );
  verificar(
    'e liga o elo ao hash do que foi revisado',
    decisao.evento.dados?.bundleHash === gate.verdictoDe(COFRE.relationshipId, COFRE.endpointId)?.registro.bundleHash
  );
  verificar(
    'o vencimento distingue quando ocorreu de quando soubemos',
    vencimento.evento.ocorridoEm.getTime() < vencimento.evento.registradoEm.getTime(),
    `${vencimento.evento.ocorridoEm.toISOString()} vs ${vencimento.evento.registradoEm.toISOString()}`
  );
  verificar(
    'e a pergunta "quem liberou o cofre?" tem resposta na cadeia',
    (await trilha.porPessoa('p-rui')).some((e) => e.corpo === 'HUMANO')
  );
}

// ---------------------------------------------------------------------------
// A FILA NA TELA
// ---------------------------------------------------------------------------

const ALMOXARIFADO: MaterialDeRevisao = {
  ...COFRE,
  endpointId: 'ep-alm-1',
  nomeDoEndpoint: 'Almoxarifado',
  criticidade: 'LOW',
  razaoDaPolitica: 'Endpoint de baixa criticidade com aprovação exigida por exceção.'
};

function estados(fila: readonly PendenciaDeAprovacao[]): string[] {
  return fila.map((p) => `${p.nomeDoEndpoint}:${p.estado}`);
}

grupo('A fila mostra o prazo antes de ele virar problema');
{
  const { gate, relogio } = bancadaDoGate();

  // Vigente: aprovada agora, prazo correndo.
  await gate.abrir(FARMACIA, 'motor');
  await gate.decidir(FARMACIA, {
    decisao: 'APROVADO',
    aprovador: 'sofia.seguranca',
    papel: 'supervisao-de-seguranca',
    justificativa: 'Escala da semana.',
    assinatura: 'token-sofia'
  });
  // Meia assinatura numa faixa crítica.
  await gate.abrir(COFRE, 'motor');
  await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'Primeira assinatura.',
    assinatura: 'token-rita'
  });
  // Nunca decidida.
  await gate.abrir(ALMOXARIFADO, 'motor');

  const fila = gate.pendencias();
  igual('três pedidos na fila', fila.length, 3);
  verificar(
    'a que falta assinar vem antes da que ninguém tocou',
    estados(fila)[0] === 'Cofre de psicotrópicos:AGUARDANDO_SEGUNDA_ASSINATURA',
    estados(fila).join(' | ')
  );
  igual('a vigente fecha a lista', fila[fila.length - 1]?.estado ?? '', 'VIGENTE');
  verificar(
    'e a vigente traz o prazo, não só o carimbo de aprovada',
    (fila[fila.length - 1]?.minutosRestantes ?? 0) > 0,
    String(fila[fila.length - 1]?.minutosRestantes)
  );
  verificar(
    'a meia assinatura mostra quem já assinou e com que alçada',
    fila[0]?.assinaturas[0]?.aprovador === 'rita.diretoria' && fila[0]?.assinaturas[0]?.ate === 'CRITICA',
    JSON.stringify(fila[0]?.assinaturas)
  );

  // Oito dias depois a farmácia venceu, e a vencida sobe ao topo.
  relogio.avancarHoras(24 * 8);
  const depois = gate.pendencias();
  igual('a vencida assume o topo', depois[0]?.estado ?? '', 'VENCIDA');
  igual('e é a farmácia', depois[0]?.nomeDoEndpoint ?? '', 'Farmácia');
  verificar(
    'com os minutos já negativos',
    (depois[0]?.minutosRestantes ?? 0) < 0,
    String(depois[0]?.minutosRestantes)
  );
  verificar(
    'e a explicação diz que foi o tempo',
    (depois[0]?.explicacao ?? '').includes('mudou o tempo'),
    depois[0]?.explicacao
  );
}
{
  // Recusa não some da tela: fica registrada, embaixo do que ainda pode andar.
  const { gate } = bancadaDoGate();
  await gate.abrir(FARMACIA, 'motor');
  await gate.decidir(FARMACIA, {
    decisao: 'RECUSADO',
    aprovador: 'sofia.seguranca',
    papel: 'supervisao-de-seguranca',
    justificativa: 'Vínculo em encerramento; acesso não se justifica.',
    assinatura: 'token-sofia'
  });
  const [pendencia] = gate.pendencias();
  igual('a recusa aparece como recusa', pendencia?.estado ?? '', 'RECUSADA');
  verificar(
    'e preserva o nome de quem recusou',
    pendencia?.assinaturas[0]?.decisao === 'RECUSADO' &&
      pendencia?.assinaturas[0]?.aprovador === 'sofia.seguranca'
  );
}
{
  // Assinatura inválida deixa decisão no registro e NÃO é meio caminho andado.
  const { gate } = bancadaDoGate();
  await gate.abrir(COFRE, 'motor');
  await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'Token trocado por engano.',
    assinatura: 'token-errado'
  });
  const [pendencia] = gate.pendencias();
  igual(
    'token inválido não vira "falta a segunda"',
    pendencia?.estado ?? '',
    'AGUARDANDO_DECISAO'
  );
}

grupo('Reabrir o pedido não apaga quem já assinou');
{
  // O defeito que esta guarda impede: o ciclo roda a cada minuto e reabre o
  // pedido enquanto ninguém decide. Sem idempotência, cada volta criaria um
  // registro novo por cima do anterior, e numa faixa crítica — que exige duas
  // pessoas — a segunda nunca alcançaria a primeira.
  const { gate } = bancadaDoGate();
  const primeiro = await gate.abrir(COFRE, 'ciclo-de-governanca');
  await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'Primeira assinatura, 02h40.',
    assinatura: 'token-rita'
  });

  const reaberto = await gate.abrir(COFRE, 'ciclo-de-governanca');
  igual('reabrir devolve o MESMO pedido', reaberto.id, primeiro.id);
  igual('e o mesmo hash do material', reaberto.bundleHash, primeiro.bundleHash);
  igual('a assinatura colhida continua lá', gate.alcadasDe(COFRE.relationshipId, COFRE.endpointId).length, 1);

  // E a segunda pessoa chega, como chegaria na vida real.
  const verdicto = await gate.decidir(COFRE, {
    decisao: 'APROVADO',
    aprovador: 'paulo.diretoria',
    papel: 'diretoria-administrativa',
    justificativa: 'Segunda assinatura, depois de o ciclo ter rodado várias vezes.',
    assinatura: 'token-paulo'
  });
  verificar('e o gate autoriza', verdicto.autorizado, verdicto.explicacao);
}
{
  // Material DIFERENTE é outro pedido: substituir é o certo, porque o que será
  // executado deixou de ser o que foi revisado.
  const { gate } = bancadaDoGate();
  const primeiro = await gate.abrir(FARMACIA, 'ciclo');
  const reclassificado: MaterialDeRevisao = { ...FARMACIA, criticidade: 'CRITICAL' };
  const segundo = await gate.abrir(reclassificado, 'ciclo');
  verificar('criticidade nova abre pedido novo', segundo.id !== primeiro.id);
  verificar('com hash diferente', segundo.bundleHash !== primeiro.bundleHash);
}

grupo('O prazo chega à tela com o aviso de sombra colado');
{
  // Bancada real: o ciclo de governança abre o pedido do cofre sozinho, que é
  // o caminho pelo qual a fila vai existir em produção.
  const b = montarBancada();
  const relatorio = await tick(b);

  const painel = montarPainel(b.mundo.topologia, relatorio.assurance, [], {
    fila: b.gate.pendencias(),
    avisos: b.gate.avisosDaVigencia()
  });
  verificar('o ciclo abriu pedido e ele chega ao modelo de visão', painel.filaDeAprovacao.length > 0);
  verificar(
    'o aviso de vigência vem junto do prazo',
    (painel.avisoDeVigencia ?? '').includes('SOMBRA'),
    painel.avisoDeVigencia ?? '(nulo)'
  );
  verificar(
    'dizendo que a janela só exige revisão, nunca concede',
    (painel.avisoDeVigencia ?? '').includes('nunca conceder')
  );
  verificar(
    'e a tela renderiza a seção sem quebrar',
    renderizarPainel(painel).includes('Aprovação humana')
  );
  verificar(
    'com o prazo em português, e não um número solto',
    /vence em|vencida há|sem prazo/.test(renderizarPainel(painel))
  );
}
{
  const b = montarBancada();
  const relatorio = await tick(b);
  const painel = montarPainel(b.mundo.topologia, relatorio.assurance);
  igual('sem gate passado, a fila é vazia', painel.filaDeAprovacao.length, 0);
  igual('e não há ressalva a exibir', painel.avisoDeVigencia, null);
  verificar(
    'a seção existe mesmo vazia, dizendo que não há pedido',
    renderizarPainel(painel).includes('Nenhum pedido de aprovação humana')
  );
}

grupo('O ato humano chega à cadeia porque alguém drena o diário');
{
  // O diário existia desde o ADR-0016 e nada o montava fora de um teste: o
  // gate era construído sem ele e ninguém drenava. Os três atos da aprovação
  // humana eram capacidade, não registro. Esta verificação é sobre o SISTEMA
  // MONTADO — se a bancada não liga, produção não liga.
  const b = montarBancada();
  const relatorio = await tick(b);

  verificar('o ciclo drenou atos para a cadeia', relatorio.atosDeAprovacaoRegistrados > 0);
  igual('e nada ficou represado no diário', b.diario.pendencias, 0);

  const eventos = await b.trilha.todos();
  verificar(
    'o pedido de aprovação virou elo',
    eventos.some((evento) => evento.tipo === 'AccessApprovalRequested')
  );
  verificar('e a cadeia continua íntegra depois disso', relatorio.integridadeDaTrilha.integra);
}
{
  const b = montarBancada();
  await tick(b);
  const segundo = await tick(b, 60_000);
  // Reentrância: o pedido é idempotente, então a segunda volta não deve
  // reabrir nada. Se voltasse a drenar pedido, o ciclo estaria criando
  // registro novo por cima da assinatura já colhida.
  igual('rodar de novo não cria pedido novo na cadeia', segundo.atosDeAprovacaoRegistrados, 0);
}

grupo('Quem tem alçada é chamado — e o chamado tem endereço');
{
  const b = montarBancada();
  const relatorio = await tick(b);

  igual('o ciclo despachou um chamado', relatorio.plantao.avisos.length, 1);
  const aviso = relatorio.plantao.avisos[0]!;
  igual('pelo motivo certo', aviso.aviso.motivo, 'DECISAO_PENDENTE');
  igual('no primeiro degrau', aviso.aviso.degrau, 1);
  igual('e foi entregue', relatorio.plantao.entregues, 1);
  verificar(
    'dirigido apenas a quem decide faixa CRITICA',
    [...aviso.aviso.papeisComAlcada].sort().join(',') ===
      'diretoria-administrativa,diretoria-tecnica',
    aviso.aviso.papeisComAlcada.join(',')
  );
  verificar(
    'o texto nomeia a porta e a pessoa, sem depender de modelo',
    aviso.aviso.texto.includes('Cofre') && aviso.aviso.texto.includes('p-rui'),
    aviso.aviso.texto
  );
  verificar(
    'e o chamado entrou na cadeia',
    (await b.trilha.todos()).some((evento) => evento.tipo === 'AccessApprovalNotified')
  );
}
{
  const b = montarBancada();
  await tick(b);
  const semEspera = await tick(b, 60_000);
  igual('um minuto depois ninguém é chamado de novo', semEspera.plantao.avisos.length, 0);

  // O intervalo de reforço da faixa CRITICA são quinze minutos. Sem ele, o
  // ciclo de um minuto viraria mil avisos por noite — e um canal ignorado
  // devolve o sistema ao estado que este módulo veio corrigir, com aparência
  // de estar funcionando.
  const depois = await tick(b, 15 * 60_000);
  igual('passado o intervalo, o toque se repete', depois.plantao.avisos.length, 1);
  igual('e é o segundo degrau, não o primeiro', depois.plantao.avisos[0]!.aviso.degrau, 2);
}

grupo('Sem canal, ninguém é avisado — e isso é fato registrado, não silêncio');
{
  const b = montarBancada();
  const relatorio = await tick(b);
  const semCanal = new PlantaoDeAprovacao({
    fila: b.gate,
    autoridade: b.autoridade,
    papeisConhecidos: ALCADAS_HOSPITALARES.map((alcada) => alcada.papel),
    relogio: b.relogio,
    diario: b.diario
  });
  verificar('o plantão sabe que não tem canal', !semCanal.temCanal);

  const resumo = await semCanal.despachar();
  igual('o chamado é computado assim mesmo', resumo.avisos.length, 1);
  igual('mas não é entregue', resumo.entregues, 0);
  verificar(
    'e o motivo da não entrega é dito por extenso',
    resumo.avisos[0]!.entrega.detalhe.includes('Nenhum canal de aviso'),
    resumo.avisos[0]!.entrega.detalhe
  );
  igual('o canal declarado é o ausente', resumo.avisos[0]!.canal, CANAL_AUSENTE.id);

  await b.diario.drenar();
  verificar(
    'a não entrega vira elo na cadeia',
    (await b.trilha.todos()).some(
      (evento) => evento.tipo === 'AccessApprovalNotificationUndelivered'
    )
  );

  const painel = montarPainel(b.mundo.topologia, relatorio.assurance, [], {
    fila: b.gate.pendencias(),
    avisos: b.gate.avisosDaVigencia(),
    chamados: semCanal.linhasParaTela(resumo),
    temCanal: semCanal.temCanal
  });
  verificar(
    'a tela diz, no alto da seção, que ninguém é chamado',
    (painel.avisoDeCanalAusente ?? '').includes('Nenhum canal de aviso'),
    painel.avisoDeCanalAusente ?? '(nulo)'
  );
  verificar(
    'e a linha do cartão começa por "Ninguém foi avisado"',
    painel.linhasDoPlantao[0]!.texto.startsWith('Ninguém foi avisado'),
    painel.linhasDoPlantao[0]!.texto
  );
  verificar(
    'o HTML marca a linha como não entregue',
    renderizarPainel(painel).includes('data-entregue="nao"')
  );
}
{
  const b = montarBancada();
  const relatorio = await tick(b);
  const painel = montarPainel(b.mundo.topologia, relatorio.assurance, [], {
    fila: b.gate.pendencias(),
    avisos: b.gate.avisosDaVigencia(),
    chamados: b.plantao.linhasParaTela(relatorio.plantao),
    temCanal: b.plantao.temCanal
  });
  igual('com canal ligado, não há aviso de canal ausente', painel.avisoDeCanalAusente, null);
  verificar(
    'e a linha diz quantos papéis foram chamados',
    painel.linhasDoPlantao[0]!.texto.includes('2 papéis com alçada'),
    painel.linhasDoPlantao[0]!.texto
  );
}

grupo('Sem ninguém com alçada, o sistema não finge que chamou');
{
  // Uma instalação em que o teto de todo papel é MEDIA, diante de uma porta
  // CRITICAL. Não há a quem recorrer, e dizer "avisamos alguém" produziria
  // registro de um socorro que não existe.
  const b = montarBancada();
  await tick(b);
  const canal = new CanalEmMemoria();
  const plantao = new PlantaoDeAprovacao({
    fila: b.gate,
    autoridade: new AutoridadeEmMemoria([{ papel: 'coordenacao-de-enfermagem', ate: 'MEDIA' }]),
    papeisConhecidos: ['coordenacao-de-enfermagem'],
    relogio: b.relogio,
    canal,
    diario: b.diario
  });

  const resumo = await plantao.despachar();
  igual('o chamado existe', resumo.avisos.length, 1);
  igual('e é contado como sem alçada', resumo.semAlcada, 1);
  igual('não entregue', resumo.entregues, 0);
  igual('e o canal não chegou a ser acionado', canal.enviados.length, 0);
  verificar(
    'o registro diz que o problema é de alçada, não de insistência',
    resumo.avisos[0]!.entrega.detalhe.includes('não há a quem recorrer') ||
      resumo.avisos[0]!.entrega.detalhe.includes('Não há a quem recorrer'),
    resumo.avisos[0]!.entrega.detalhe
  );
}

grupo('O aviso chega ANTES de a porta fechar');
{
  const b = montarBancada();
  const primeiro = await tick(b);
  const material = materialDoCofre(primeiro);
  await aprovarCofreNaBancada(b, material);

  // Aprovada agora, vigente por doze horas (escala 12×36). Faltando mais de
  // uma hora, não há o que chamar: chamar cedo demais é ruído, e ruído ensina
  // a ignorar o canal.
  const cedo = await tick(b, 60 * 60_000);
  verificar(
    'com folga no prazo, nenhum chamado de vencimento',
    !cedo.plantao.avisos.some((ato) => ato.aviso.motivo === 'PRESTES_A_VENCER')
  );

  // Dez horas e meia depois da aprovação, faltam menos de sessenta minutos —
  // a janela de passagem de plantão, o único momento previsível em que quem
  // tem alçada ainda está no prédio.
  const perto = await tick(b, 10 * 60 * 60_000);
  const aviso = perto.plantao.avisos.find((ato) => ato.aviso.motivo === 'PRESTES_A_VENCER');
  verificar('dentro da antecedência, o chamado sai', aviso !== undefined);
  verificar(
    'e ele diz que renovar antes evita a porta fechada',
    (aviso?.aviso.texto ?? '').includes('Renovar antes'),
    aviso?.aviso.texto ?? '(sem aviso)'
  );
  verificar(
    'a pendência chamada ainda está VIGENTE — o chamado não espera vencer',
    aviso?.aviso.pendencia.estado === 'VIGENTE',
    aviso?.aviso.pendencia.estado ?? '(sem aviso)'
  );
}
{
  // A tela não pode esquecer o ciclo anterior. Uma vigente com folga no prazo
  // não gera chamado nesta volta, e mostrar só a volta atual escreveria
  // "nenhum chamado" embaixo de uma pendência chamada de madrugada.
  const b = montarBancada();
  const primeiro = await tick(b);
  igual('o chamado saiu na primeira volta', primeiro.plantao.avisos.length, 1);
  await aprovarCofreNaBancada(b, materialDoCofre(primeiro));
  const calmo = await tick(b, 60 * 60_000);
  igual('e a volta seguinte não chama ninguém', calmo.plantao.avisos.length, 0);

  igual('a linha do ciclo corrente fica vazia', b.plantao.linhasParaTela(calmo.plantao).length, 0);
  const acumuladas = b.plantao.linhasAcumuladas();
  igual('mas a linha acumulada lembra do chamado', acumuladas.length, 1);
  verificar(
    'com a hora em que ele saiu',
    /Chamado 1 às \d{2}:\d{2}/.test(acumuladas[0]!.texto),
    acumuladas[0]!.texto
  );
}

grupo('Recusa não vira pressão, e as janelas do aviso ficam em sombra');
{
  const { gate, relogio, autoridade } = bancadaDoGate();
  await gate.abrir(COFRE, 'ciclo');
  await gate.decidir(COFRE, {
    decisao: 'RECUSADO',
    aprovador: 'rita.diretoria',
    papel: 'diretoria-tecnica',
    justificativa: 'Sem necessidade assistencial comprovada neste plantão.',
    assinatura: 'token-rita'
  });
  const plantao = new PlantaoDeAprovacao({
    fila: gate,
    autoridade,
    papeisConhecidos: ALCADAS_HOSPITALARES.map((alcada) => alcada.papel),
    relogio,
    canal: new CanalEmMemoria()
  });
  const resumo = await plantao.despachar();
  igual('quem recusou não é cobrado de novo', resumo.avisos.length, 0);
}
{
  const lidas = lerJanelasDeAviso();
  verificar('as janelas do aviso são lidas em sombra', lidas.emSombra);
  igual('e cada uma sai com a sua ressalva', lidas.avisos.length, CONSTANTES_DE_AVISO.length);
  igual('antecedência CRÍTICA é o turno da passagem de plantão', lidas.antecedencia.CRITICA, 60);
  igual('reforço CRÍTICO é de quinze minutos', lidas.reforco.CRITICA, 15);
  verificar(
    'e a ressalva diz que o efeito é só chamar gente',
    lidas.avisos.every((aviso) => aviso.includes('nunca conceder acesso')),
    lidas.avisos[0] ?? '(vazio)'
  );
  verificar(
    'toda constante do aviso declara curador',
    CONSTANTES_DE_AVISO.every((constante) => constante.curador.length > 0)
  );
}

fechar('Aprovação humana ligada ao conteúdo');
