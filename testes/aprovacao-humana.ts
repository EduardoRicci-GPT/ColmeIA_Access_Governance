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
  GateDeAcesso,
  MaterialDeRevisao,
  SEM_APROVACOES,
  serializarMaterial
} from '../packages/governanca';

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

fechar('Aprovação humana ligada ao conteúdo');
