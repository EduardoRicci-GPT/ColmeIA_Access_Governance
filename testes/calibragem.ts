// ---------------------------------------------------------------------------
// CALIBRAGEM — o número viaja com o que se sabe sobre a autoridade dele
//
// O teste mais importante daqui é o primeiro, e ele afirma algo que parece
// autodepreciativo: NENHUM peso do Health Score deste produto tem autoridade
// para embasar decisão sozinho.
//
// É verdade, e é a informação mais útil que o painel pode dar hoje. A
// alternativa — declarar os pesos como constantes congeladas, sem estatuto —
// produziria exatamente o mesmo score, com a diferença de que ninguém saberia
// que ele ainda não foi calibrado contra hospital nenhum.
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, verificar } from './runner';
import {
  CONSTANTES_DO_HEALTH,
  avisoDeSombra,
  lerPesos,
  registroDoHealth
} from '../packages/observability-assurance/calibragem';
import { ConstanteSemAutoridade } from '../packages/mpeh-kernel/calibration/tipos';
import { montarBancada, tick } from './bancada';
import { montarPainel } from '../packages/assurance-ui/painel';

grupo('Todo peso tem dono, origem e ressalva');
const registro = registroDoHealth();
igual('os doze pesos estão registrados', CONSTANTES_DO_HEALTH.length, 12);
verificar(
  'nenhum entrou sem curador',
  CONSTANTES_DO_HEALTH.every((c) => c.curador.trim().length > 0)
);
verificar(
  'nenhum entrou sem procedência textual',
  CONSTANTES_DO_HEALTH.every((c) => c.procedencia.includes('item') || c.procedencia.includes('Derivado'))
);
verificar(
  'nenhum entrou sem ressalva, porque nenhum está instrumentado',
  CONSTANTES_DO_HEALTH.every((c) => (c.ressalva ?? '').trim().length > 0)
);

grupo('Nenhum peso tem autoridade para decidir sozinho');
const retrato = registro.retrato();
igual('todos em SOMBRA', retrato.SOMBRA, 12);
igual('nenhum INSTRUMENTADA', retrato.INSTRUMENTADA, 0);
igual('nenhum SEM_PROCEDENCIA', retrato.SEM_PROCEDENCIA, 0);

let lancou: unknown = null;
try {
  registro.obterParaDecisao<number>('health.peso.revogacaoPendente');
} catch (erro) {
  lancou = erro;
}
verificar(
  'obterParaDecisao LANÇA para peso em sombra',
  lancou instanceof ConstanteSemAutoridade,
  String(lancou)
);
verificar(
  'e a mensagem manda usar a leitura em sombra',
  (lancou as Error).message.includes('obterEmSombra'),
  (lancou as Error).message
);

grupo('A leitura em sombra entrega valor e aviso juntos');
const lidos = lerPesos(registroDoHealth());
igual('o peso da revogação pendente continua 3', lidos.pesos.revogacaoPendente, 3);
igual('o peso da disponibilidade continua 25', lidos.pesos.disponibilidadeEndpoints, 25);
verificar('a leitura se declara em sombra', lidos.emSombra);
igual('com um aviso por peso', lidos.avisos.length, 12);
verificar(
  'e cada aviso traz estatuto, ressalva e procedência',
  lidos.avisos.every((a) => a.includes('SOMBRA') && a.includes('Procedência:') && a.includes('Conferida em'))
);

grupo('O peso mais sensível declara por que é o mais sensível');
const daRevogacao = CONSTANTES_DO_HEALTH.find((c) => c.id === 'health.peso.revogacaoPendente');
verificar(
  'a ressalva da revogação pendente cita o item 41',
  (daRevogacao?.ressalva ?? '').includes('item 41'),
  daRevogacao?.ressalva
);
verificar(
  'e adverte sobre esverdear o painel',
  (daRevogacao?.ressalva ?? '').includes('esverdear'),
  daRevogacao?.ressalva
);

grupo('A ressalva chega à tela, e não fica num rodapé escrito à mão');
const b = montarBancada();
await tick(b);
const relatorio = await tick(b, 3_000);
const painel = montarPainel(b.mundo.topologia, relatorio.assurance);

verificar('o painel carrega a ressalva de calibragem', painel.avisoDeCalibragem !== null);
verificar(
  'que diz quantos pesos estão em sombra',
  painel.avisoDeCalibragem?.includes('12 dos 12') === true,
  painel.avisoDeCalibragem ?? ''
);
verificar(
  'e que o número orienta prioridade sem sustentar decisão sozinho',
  painel.avisoDeCalibragem?.includes('não sustenta decisão sozinho') === true
);
igual('com os doze avisos detalhados por trás', painel.avisosDeCalibragem.length, 12);

grupo('O score continua sendo calculado — em sombra não é sem valor');
verificar('a árvore tem escopos', painel.escopos.length > 0);
verificar('e o score da raiz é um número válido', painel.raiz.score >= 0 && painel.raiz.score <= 100);
igual(
  'os pesos usados no cálculo são os lidos pela porta de sombra',
  relatorio.assurance.arvore.calibragem.emSombra,
  true
);
igual('e o aviso curto é o mesmo do painel', avisoDeSombra(lidos), painel.avisoDeCalibragem);

fechar('Calibragem dos pesos do Health Score');
