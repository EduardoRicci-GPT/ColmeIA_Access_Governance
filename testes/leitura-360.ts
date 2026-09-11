// ---------------------------------------------------------------------------
// LEITURA 360° — dois canais, e a ausência do segundo é declarada
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, verificar } from './runner';
import {
  Analise360,
  LeitorDeContexto360,
  LeituraDoRadar,
  PENDENCIAS_DO_RADAR,
  RadarIndisponivel,
  SemRadar,
  analisarPoliticaDeAcesso
} from '../packages/leitura-360';

const REGULAMENTO_COERCIVO =
  'Cumpra a determinação de liberar o acesso. O profissional não pode recusar. ' +
  'Esta regra vale para todos, exceto a direção.';

const REGULAMENTO_SAUDAVEL =
  'O responsável pela área pode recusar sem punição. As alternativas foram apresentadas. ' +
  'Há revisão independente antes de qualquer liberação.';

/** Radar de bancada. Determinístico, e declaradamente falso. */
class RadarDeBancada implements LeitorDeContexto360 {
  readonly statusDeIntegracao = 'SIMULATED' as const;
  constructor(private readonly leitura: Partial<LeituraDoRadar> = {}) {}
  async disponivel() {
    return { ok: true, sha256: 'bancada' };
  }
  async ler(): Promise<LeituraDoRadar> {
    return {
      i2e: 0,
      riskLevel: 'neutro',
      briefDiagnosis: 'leitura de bancada',
      powerVector: { beneficiaries: [], losers: [], questions: [] },
      finalFreedomTest: 'MAIS LIVRE',
      recommendations: [],
      engine: { arquivo: 'bancada', sha256: 'bancada', motor: 'bancada', duracaoMs: 0 },
      ...this.leitura
    };
  }
}

grupo('Sem radar, o canal estrutural sustenta a leitura sozinho');
{
  const analise: Analise360 = await analisarPoliticaDeAcesso(REGULAMENTO_COERCIVO);
  igual('o canal lexical é declarado ausente', analise.lexical.estado, 'AUSENTE');
  igual('e não há discordância a calcular', analise.discordancia, null);
  verificar('o canal estrutural leu a relação', analise.estrutural.sinais.length > 0);
  verificar('e exige revisão humana', analise.exigeRevisaoHumana);
  verificar(
    'a ausência é dita, não disfarçada',
    analise.leiaAssim.some((l) => l.includes('Segundo canal ausente')),
    analise.leiaAssim.join(' | ')
  );
}
{
  const saudavel = await analisarPoliticaDeAcesso(REGULAMENTO_SAUDAVEL);
  verificar('regulamento com salvaguardas não exige revisão', !saudavel.exigeRevisaoHumana);
  verificar(
    'e as salvaguardas foram reconhecidas',
    saudavel.estrutural.salvaguardas.length >= 2,
    saudavel.estrutural.salvaguardas.join(',')
  );
}

grupo('O radar nunca devolve leitura aproximada');
{
  const sem = new SemRadar('Python não está disponível neste host');
  let erro: unknown = null;
  try {
    await sem.ler('qualquer texto');
  } catch (e) {
    erro = e;
  }
  verificar('lança em vez de aproximar', erro instanceof RadarIndisponivel);
  verificar(
    'e a mensagem diz que ausência não autoriza',
    (erro as Error).message.includes('nunca autoriza'),
    (erro as Error).message
  );
  igual('o leitor padrão é INTERFACE_READY', sem.statusDeIntegracao, 'INTERFACE_READY');
  verificar('com pendências declaradas', PENDENCIAS_DO_RADAR.length >= 4);
  verificar(
    'entre elas, que o radar não entra no caminho de decisão da porta',
    PENDENCIAS_DO_RADAR.some((p) => p.includes('caminho de decisão')),
    PENDENCIAS_DO_RADAR.join(' | ')
  );
  verificar(
    'e que o texto submetido nunca é dado de paciente',
    PENDENCIAS_DO_RADAR.some((p) => p.includes('nunca dado de paciente'))
  );
}

grupo('Com os dois canais, a discordância é o dado');
{
  const analise = await analisarPoliticaDeAcesso(REGULAMENTO_COERCIVO, new RadarDeBancada());
  igual('o canal lexical foi lido', analise.lexical.estado, 'LIDO');
  verificar(
    'radar neutro com restrição estrutural vira discordância nomeada',
    analise.discordancia?.discordancias.includes('LEGACY_NEUTRAL_WITH_STRUCTURAL_CONSTRAINT') === true,
    analise.discordancia?.discordancias.join(',')
  );
  verificar(
    'e a discordância é explicada em português',
    analise.leiaAssim.some((l) => l.includes('Texto calmo pode carregar coerção')),
    analise.leiaAssim.join(' | ')
  );
  verificar('nenhum canal vence o outro: os dois pedem revisão', analise.exigeRevisaoHumana);
}

grupo('Falha do radar é falha, e a análise fica declaradamente parcial');
{
  class RadarQueFalha implements LeitorDeContexto360 {
    readonly statusDeIntegracao = 'SIMULATED' as const;
    async disponivel() {
      return { ok: true };
    }
    async ler(): Promise<LeituraDoRadar> {
      throw new Error('hash do snapshot divergiu');
    }
  }
  const analise = await analisarPoliticaDeAcesso(REGULAMENTO_COERCIVO, new RadarQueFalha());
  igual('o canal lexical fica ausente', analise.lexical.estado, 'AUSENTE');
  verificar(
    'com o motivo real da falha',
    analise.lexical.estado === 'AUSENTE' && analise.lexical.motivo.includes('hash do snapshot'),
    JSON.stringify(analise.lexical)
  );
  verificar(
    'e a análise se declara parcial',
    analise.leiaAssim.some((l) => l.includes('declarada como parcial'))
  );
  verificar('o canal estrutural continua valendo', analise.exigeRevisaoHumana);
}

fechar('Leitura 360° e a porta do R-VEP');
