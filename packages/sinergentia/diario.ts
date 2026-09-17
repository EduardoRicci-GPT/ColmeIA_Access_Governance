// ---------------------------------------------------------------------------
// A ROTA NA CADEIA — e por que a parceria que "não age" mesmo assim deixa elo
//
// A identidade da Sinergentia³ diz que ela não age para fora: não comanda
// equipamento, não altera direito, não grava na cadeia. Isso continua verdade
// aqui, e este arquivo não a contradiz — quem grava é o PRODUTO, registrando o
// que fez ao consultar uma faculdade. O ato é da casa, não da parceria.
//
// A distinção não é sutileza jurídica. Ela decide o autor do elo, e portanto o
// que uma investigação lê: "a Sinergentia³ escreveu X" seria falso, porque ela
// não tem autoria de nada neste produto; "a ColmeIA consultou a faculdade Y e
// descartou o que ela escreveu" é o fato.
//
// O SEGUNDO ELO É O QUE VALE
//
// `CognitiveProseDiscarded` registra a prosa que a ancoragem reprovou, com as
// âncoras que ela introduziu. É a evidência de que a guarda funciona — e, se um
// dia parar de aparecer em instalação nenhuma, é também a evidência de que
// alguém a desligou. Uma guarda que nunca deixa rastro é indistinguível de uma
// guarda ausente.
//
// Sem `decisionOrigin` e sem `personId`: ler não é decidir, e a prosa desta
// camada nunca fala de pessoa — a fronteira de dado do ADR-0007 vale aqui
// inteira, e mais ainda, porque aqui o texto sai da casa para a tela de gente
// que não opera o sistema.
// ---------------------------------------------------------------------------

import { EventoDeDominio } from '../dominio/eventos';
import { SINERGENTIA } from './identidade';
import { LeituraRoteada } from './roteador';

export interface AtoDeLeituraCognitiva {
  /** Para quem se leu. Rótulo do público, nunca uma pessoa. */
  publico: string;
  leitura: LeituraRoteada;
  em: Date;
}

export interface DiarioDeLeituraCognitiva {
  registrarLeitura(ato: AtoDeLeituraCognitiva): void;
}

function resumoDaRota(ato: AtoDeLeituraCognitiva): string {
  const origem = ato.leitura.determinista
    ? 'o núcleo determinístico desta casa'
    : `a faculdade ${ato.leitura.faculdadeId}`;
  return (
    `Leitura para ${ato.publico} entregue por ${origem}, após ` +
    `${ato.leitura.tentativas.length} tentativa(s) na cascata. ${ato.leitura.explicacao}`
  );
}

function resumoDoDescarte(ato: AtoDeLeituraCognitiva, faculdadeId: string, explicacao: string): string {
  return (
    `Prosa da faculdade ${faculdadeId} DESCARTADA na leitura para ${ato.publico}. ` +
    `${explicacao} ${SINERGENTIA.nomePublico} não produz número: a prosa não foi corrigida, ` +
    'foi substituída pelo material apurado.'
  );
}

/**
 * Produz os elos de um ato de leitura. Um da rota, e um por prosa descartada.
 *
 * Função pura em vez de método de classe porque não há estado a guardar: quem
 * acumula e drena é o diário da trilha, que já existe e já sabe quando é seguro
 * gravar. Acrescentar um segundo acumulador criaria uma segunda ordem de
 * gravação, e a cadeia vale pela ordem.
 */
export function elosDaLeitura(
  ato: AtoDeLeituraCognitiva,
  opcoes: { organizationId: string; facilityId?: string; prefixoDeId?: string; sequenciaInicial?: number }
): readonly EventoDeDominio[] {
  const prefixo = opcoes.prefixoDeId ?? 'COGN';
  let sequencia = opcoes.sequenciaInicial ?? 0;
  const proximo = () => {
    sequencia += 1;
    return `${prefixo}-${String(sequencia).padStart(5, '0')}`;
  };
  const base = {
    ocorridoEm: ato.em,
    registradoEm: ato.em,
    origemDeIngestao: 'LOCAL_EVENT' as const,
    organizationId: opcoes.organizationId,
    facilityId: opcoes.facilityId
  };

  const elos: EventoDeDominio[] = [
    {
      ...base,
      id: proximo(),
      tipo: 'CognitiveReadingRouted',
      idempotencyKey: `${ato.publico}::CognitiveReadingRouted::${ato.em.toISOString()}`,
      dados: {
        publico: ato.publico,
        faculdadeEntregue: ato.leitura.faculdadeId,
        determinista: ato.leitura.determinista,
        consultouFaculdadeExterna: ato.leitura.consultouFaculdadeExterna,
        // A rota inteira, e não só o vencedor: quem falhou, quem declinou e
        // quem ficou de fora por circuito aberto é o que explica o custo.
        rota: ato.leitura.tentativas.map((tentativa) => ({
          faculdadeId: tentativa.faculdadeId,
          degrau: tentativa.degrau,
          local: tentativa.local,
          desfecho: tentativa.desfecho,
          duracaoMs: tentativa.duracaoMs
        }))
      },
      resumo: resumoDaRota(ato)
    }
  ];

  for (const tentativa of ato.leitura.tentativas) {
    if (tentativa.desfecho !== 'ANCORAGEM_REPROVOU' || !tentativa.ancoragem) continue;
    elos.push({
      ...base,
      id: proximo(),
      tipo: 'CognitiveProseDiscarded',
      idempotencyKey: `${ato.publico}::CognitiveProseDiscarded::${tentativa.faculdadeId}::${ato.em.toISOString()}`,
      dados: {
        publico: ato.publico,
        faculdadeId: tentativa.faculdadeId,
        // O TEXTO das âncoras, nunca a prosa inteira: guardar o texto
        // inventado por extenso o traria para dentro da cadeia, que é o único
        // lugar deste produto onde tudo é verdade conferida.
        ancorasIntroduzidas: tentativa.ancoragem.introduzidas.map((ancora) => ({
          texto: ancora.texto,
          classe: ancora.classe
        })),
        ancoradas: tentativa.ancoragem.ancoradas
      },
      resumo: resumoDoDescarte(ato, tentativa.faculdadeId, tentativa.ancoragem.explicacao)
    });
  }

  return elos;
}
