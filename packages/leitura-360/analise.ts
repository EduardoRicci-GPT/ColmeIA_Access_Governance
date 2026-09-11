// ---------------------------------------------------------------------------
// ANÁLISE 360° DE UMA POLÍTICA DE ACESSO
//
// Cruza os dois canais determinísticos sobre o texto que descreve uma regra de
// acesso — o regulamento da área restrita, a justificativa de uma liberação, a
// norma que o RH mandou aplicar.
//
// O canal estrutural roda SEMPRE: é porte TypeScript, custa microssegundos, não
// depende de calibragem ratificada e lê a relação — quem manda, quem pode
// recusar, quem fica isento. O canal lexical (R-VEP) roda QUANDO DISPONÍVEL, e
// sua ausência é declarada, não disfarçada.
//
// Quando os dois discordam, a discordância é o dado. Um texto que o radar lê
// como neutro e o guardrail lê como restritivo é precisamente o caso que merece
// olho humano: texto calmo pode carregar coerção.
// ---------------------------------------------------------------------------

import { auditarEstrutura, combinarCanais } from '../contratos-estruturais/guardrail';
import type { AuditoriaEstrutural, DiscordanciaDeCanais } from '../contratos-estruturais/guardrail';
import { LeitorDeContexto360, LeituraDoRadar, SemRadar } from './porta';

export type CanalLexical =
  | { estado: 'LIDO'; leitura: LeituraDoRadar }
  | { estado: 'AUSENTE'; motivo: string };

export interface Analise360 {
  /** Sempre presente. Não depende de calibragem nem de subprocesso. */
  estrutural: AuditoriaEstrutural;
  /** Presente quando o radar responde; declarado ausente quando não. */
  lexical: CanalLexical;
  /** Discordância entre canais, quando os dois falaram. */
  discordancia: DiscordanciaDeCanais | null;
  exigeRevisaoHumana: boolean;
  /** Frases prontas, determinísticas, para quem lê a tela. */
  leiaAssim: readonly string[];
}

export async function analisarPoliticaDeAcesso(
  texto: string,
  radar: LeitorDeContexto360 = new SemRadar()
): Promise<Analise360> {
  const estrutural = auditarEstrutura(texto);

  const disponibilidade = await radar.disponivel();
  if (!disponibilidade.ok) {
    return {
      estrutural,
      lexical: { estado: 'AUSENTE', motivo: disponibilidade.motivo ?? 'radar não disponível' },
      discordancia: null,
      exigeRevisaoHumana: estrutural.exigeRevisaoHumana,
      leiaAssim: [
        ...estrutural.sinais.map((sinal) => `Estrutura: ${sinal}`),
        `Segundo canal ausente (${disponibilidade.motivo ?? 'não configurado'}): ` +
          'a leitura é estrutural apenas, e o sistema declara isso em vez de completá-la.'
      ]
    };
  }

  try {
    const leitura = await radar.ler(texto);
    const discordancia = combinarCanais({
      riskLevel: leitura.riskLevel,
      finalFreedomTest: leitura.finalFreedomTest,
      i2e: leitura.i2e,
      estrutural
    });
    return {
      estrutural,
      lexical: { estado: 'LIDO', leitura },
      discordancia,
      exigeRevisaoHumana: discordancia.exigeRevisaoHumana,
      leiaAssim: [
        ...estrutural.sinais.map((sinal) => `Estrutura: ${sinal}`),
        ...discordancia.leiaAssim
      ]
    };
  } catch (erro) {
    // Falha do radar é falha. Nunca vira leitura aproximada.
    return {
      estrutural,
      lexical: { estado: 'AUSENTE', motivo: (erro as Error).message },
      discordancia: null,
      exigeRevisaoHumana: estrutural.exigeRevisaoHumana,
      leiaAssim: [
        ...estrutural.sinais.map((sinal) => `Estrutura: ${sinal}`),
        'O segundo canal falhou nesta leitura. A análise segue com o canal estrutural, declarada como parcial.'
      ]
    };
  }
}
