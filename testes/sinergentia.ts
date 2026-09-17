// ---------------------------------------------------------------------------
// SINERGENTIA³ — a cascata, a ancoragem e os três "não"
//
// A verificação central desta suíte não é sobre texto: é sobre DEPENDÊNCIA. O
// caminho feliz deste produto não toca em modelo nenhum, e há teste que falha
// se um dia tocar.
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, verificar } from './runner';
import {
  RoteadorDeFaculdades,
  SINERGENTIA,
  extrairAncoras,
  elosDaLeitura,
  parceriaPodeDecidir,
  verificarAncoragem
} from '../packages/sinergentia';
import {
  NucleoDeterministico,
  lerParaPublico,
  lerParaTodosOsPublicos,
  materialDaLeitura
} from '../packages/narrativa/leitura';
import { resumirDivergencias } from '../packages/narrativa/resumo';
import { corpoDoTipo } from '../packages/auditoria/corpos';
import { RelogioFixo } from '../packages/dominio/tempo';
import { FaculdadeDeBancada, montarBancada, roteadorDeterministico, tick } from './bancada';
import { montarPainel } from '../packages/assurance-ui/painel';
import { renderizarPainel } from '../packages/assurance-ui/render';
import type { LinhaDeResumo } from '../packages/narrativa/resumo';

const LINHAS: readonly LinhaDeResumo[] = Object.freeze([
  {
    texto: 'Há 2 revogações pendentes em Farmácia porque o gateway está offline desde 08:14.',
    risco: 'CRITICAL' as const,
    escopoId: 'z-farmacia',
    quantidade: 2,
    causa: 'gw-central offline'
  },
  {
    texto: 'Há 1 divergência em UTI Adulto porque o gateway está offline desde 08:14.',
    risco: 'HIGH' as const,
    escopoId: 'z-uti',
    quantidade: 1,
    causa: 'gw-central offline'
  }
]);

grupo('A identidade é feita de três negativas, e elas são verificáveis');
igual('a parceria assina como corpo consultivo', SINERGENTIA.corpo, 'CONSULTIVO');
verificar('não decide, não age para fora e não produz número', !parceriaPodeDecidir());
verificar(
  'e a procedência aponta para a origem, não para esta cópia',
  SINERGENTIA.procedencia.includes('Aletheia'),
  SINERGENTIA.procedencia
);
// O ADR-0003 já tinha o lugar certo reservado antes de haver o que pôr nele:
// os dois atos desta camada caem em CONSULTIVO pela regra que já existia.
igual('a rota entra na cadeia como leitura', corpoDoTipo('CognitiveReadingRouted'), 'CONSULTIVO');
igual('o descarte também', corpoDoTipo('CognitiveProseDiscarded'), 'CONSULTIVO');

grupo('Ancoragem: identificador e número ou estão na fonte, ou foram inventados');
{
  const material = materialDaLeitura(LINHAS, 'DIRECAO');
  const fiel =
    'O gateway central está fora do ar desde as 08:14 e por isso 2 revogações seguem ' +
    'pendentes em z-farmacia, além de 1 divergência em z-uti.';
  const conferida = verificarAncoragem(fiel, material);
  verificar('prosa que só reformula passa', conferida.aprovada, conferida.explicacao);

  // O caso que originou o instrumento na Aletheia, traduzido para este domínio:
  // o modelo recebe "3 de 10" e escreve "aproximadamente 40%".
  const inventada =
    'Aproximadamente 40% dos endpoints estão comprometidos, com destaque para ep-cc-9.';
  const reprovada = verificarAncoragem(inventada, material);
  verificar('prosa que inventa número reprova', !reprovada.aprovada);
  verificar(
    'e o identificador inventado é nomeado',
    reprovada.introduzidas.some((a) => a.texto === 'ep-cc-9'),
    reprovada.introduzidas.map((a) => a.texto).join(',')
  );
  verificar(
    'a explicação diz que não se corrige, se substitui',
    reprovada.explicacao.includes('não se corrige'),
    reprovada.explicacao
  );
  // Um e zero aparecem em prosa corrente. Reprovar por causa deles faria do
  // verificador uma peneira, que é o defeito que a origem nomeia.
  igual(
    'zero e um não são âncoras',
    extrairAncoras('nenhuma zona, uma porta').length,
    0
  );
}

grupo('A cascata: o caminho feliz não toca em modelo nenhum');
{
  const relogio = new RelogioFixo('2026-09-17T08:00:00');
  const externa = new FaculdadeDeBancada('faculdade-remota', 'Remota', false, () => ({
    atendeu: true,
    texto: 'texto que ninguém deveria ver'
  }));
  const roteador = new RoteadorDeFaculdades(
    [
      { faculdade: new NucleoDeterministico(), degrau: 0, taxaDeFabricacao: 0, prosasVerificadas: 0 },
      { faculdade: externa, degrau: 1, taxaDeFabricacao: null, prosasVerificadas: 0 }
    ],
    relogio
  );

  const seguranca = await lerParaPublico('SEGURANCA', LINHAS, roteador);
  verificar('Segurança é atendida pelo núcleo', seguranca.leitura.determinista);
  verificar('sem consultar faculdade externa', !seguranca.leitura.consultouFaculdadeExterna);
  igual('a faculdade remota não foi chamada', externa.recebidos.length, 0);
  verificar(
    'e a explicação diz isso por extenso',
    seguranca.leitura.explicacao.includes('Nenhuma faculdade de linguagem foi consultada'),
    seguranca.leitura.explicacao
  );

  const ti = await lerParaPublico('TI', LINHAS, roteador);
  verificar('TI também', ti.leitura.determinista && !ti.leitura.consultouFaculdadeExterna);

  // Só onde o determinístico DECLARA que não alcança é que se escala.
  const direcao = await lerParaPublico('DIRECAO', LINHAS, roteador);
  verificar('Direção escala', direcao.leitura.consultouFaculdadeExterna);
  igual('e aí sim a faculdade é consultada', externa.recebidos.length, 1);
  verificar(
    'a instrução pedida é de forma, não de conteúdo',
    externa.recebidos[0]!.instrucao.includes('Não acrescente'),
    externa.recebidos[0]!.instrucao
  );
}

grupo('Uma faculdade que inventa é descartada, e o descarte fica na cadeia');
{
  const relogio = new RelogioFixo('2026-09-17T08:00:00');
  const mentirosa = new FaculdadeDeBancada('faculdade-que-inventa', 'Inventora', false, () => ({
    atendeu: true,
    texto: 'A exposição chega a 87% das portas críticas, incluindo ep-inexistente-1.'
  }));
  const roteador = new RoteadorDeFaculdades(
    [
      { faculdade: new NucleoDeterministico(), degrau: 0, taxaDeFabricacao: 0, prosasVerificadas: 0 },
      { faculdade: mentirosa, degrau: 1, taxaDeFabricacao: null, prosasVerificadas: 0 }
    ],
    relogio
  );

  const { leitura } = await lerParaPublico('DIRECAO', LINHAS, roteador);
  verificar('a prosa inventada não é entregue', leitura.determinista);
  verificar(
    'o que chega à tela é o material apurado',
    leitura.texto.includes('Há 2 revogações pendentes em Farmácia'),
    leitura.texto.slice(0, 80)
  );
  const reprovada = leitura.tentativas.find((t) => t.desfecho === 'ANCORAGEM_REPROVOU');
  verificar('e a tentativa fica registrada como reprovada', reprovada !== undefined);
  verificar(
    'a tela é avisada de que o texto não é a leitura pedida',
    leitura.explicacao.includes('MATERIAL APURADO'),
    leitura.explicacao
  );

  const elos = elosDaLeitura(
    { publico: 'DIRECAO', leitura, em: relogio.agora() },
    { organizationId: 'org-sinergentia' }
  );
  igual('dois elos: a rota e o descarte', elos.length, 2);
  verificar(
    'o descarte nomeia as âncoras inventadas',
    (elos[1]!.dados?.ancorasIntroduzidas as { texto: string }[]).some(
      (a) => a.texto === 'ep-inexistente-1'
    )
  );
  // A prosa inventada NÃO entra na cadeia por extenso: a cadeia é o único lugar
  // deste produto onde tudo é verdade conferida.
  verificar(
    'e o texto inventado não é copiado para a cadeia',
    !JSON.stringify(elos).includes('87% das portas críticas')
  );
  verificar('nenhum dos dois elos tem origem de decisão', elos.every((e) => e.decisionOrigin === undefined));
}

grupo('Circuito, orçamento e a faculdade que cai');
{
  const relogio = new RelogioFixo('2026-09-17T08:00:00');
  let chamadas = 0;
  const caida = new FaculdadeDeBancada('faculdade-caida', 'Caída', false, () => {
    chamadas += 1;
    return new Error('conexão recusada');
  });
  const roteador = new RoteadorDeFaculdades(
    [
      { faculdade: new NucleoDeterministico(), degrau: 0, taxaDeFabricacao: 0, prosasVerificadas: 0 },
      { faculdade: caida, degrau: 1, taxaDeFabricacao: null, prosasVerificadas: 0 }
    ],
    relogio,
    { limiarDeFalhas: 2, pausaDoCircuitoMs: 60_000 }
  );

  await lerParaPublico('DIRECAO', LINHAS, roteador);
  await lerParaPublico('QUALIDADE', LINHAS, roteador);
  igual('duas falhas seguidas', chamadas, 2);

  const terceira = await lerParaPublico('DIRECAO', LINHAS, roteador);
  igual('na terceira o circuito já está aberto', chamadas, 2);
  verificar(
    'e a tentativa registra por quê',
    terceira.leitura.tentativas.some((t) => t.desfecho === 'CIRCUITO_ABERTO')
  );
  // O ponto que sustenta a independência: com a faculdade caída, o produto
  // continua entregando. Nenhum caminho devolve silêncio.
  verificar('o painel continua tendo o que mostrar', terceira.leitura.texto.length > 0);
}

grupo('Sem degrau zero não há produto — e o roteador recusa em vez de aproximar');
{
  const relogio = new RelogioFixo('2026-09-17T08:00:00');
  const soExterna = new RoteadorDeFaculdades(
    [
      {
        faculdade: new FaculdadeDeBancada('so-remota', 'Só remota', false, () => ({
          atendeu: true,
          texto: 'qualquer coisa'
        })),
        degrau: 1,
        taxaDeFabricacao: null,
        prosasVerificadas: 0
      }
    ],
    relogio
  );
  let lancou: unknown = null;
  try {
    await lerParaPublico('SEGURANCA', LINHAS, soExterna);
  } catch (erro) {
    lancou = erro;
  }
  verificar('um roteador sem núcleo determinístico lança', lancou instanceof Error);
  verificar(
    'e diz que esta casa não fala por modelo',
    (lancou as Error).message.includes('não fala por modelo'),
    (lancou as Error).message
  );
}

grupo('A bancada é o sistema montado: as quatro leituras chegam à tela');
{
  const b = montarBancada();
  await tick(b);
  b.simulador.colocarEndpointOffline('ep-farm-2');
  b.mundo = {
    ...b.mundo,
    vinculos: b.mundo.vinculos.map((v) =>
      v.id === 'vin-marina' ? { ...v, situacao: 'TERMINATED' as const } : v
    )
  };
  const relatorio = await tick(b, 60_000);
  const linhas = resumirDivergencias(b.mundo.topologia, relatorio.assurance.filaDeRisco);
  const leituras = await lerParaTodosOsPublicos(linhas, roteadorDeterministico(b.relogio));
  igual('quatro públicos, quatro leituras', leituras.length, 4);
  // Sem faculdade contratada, os quatro saem do núcleo — e é isso que se quer
  // provar: o produto entrega inteiro sem modelo nenhum. A diferença entre os
  // públicos está no que a explicação diz, não em haver ou não entrega.
  igual(
    'sem faculdade contratada, os quatro saem do núcleo',
    leituras.filter((l) => l.leitura.determinista).length,
    4
  );
  igual(
    'e nenhuma consulta externa acontece',
    leituras.filter((l) => l.leitura.consultouFaculdadeExterna).length,
    0
  );
  const atendidos = leituras.filter(
    (l) => !l.leitura.explicacao.includes('MATERIAL APURADO')
  );
  igual('dois públicos recebem a leitura pedida', atendidos.length, 2);
  verificar(
    'e os outros dois recebem o material com o declínio à vista',
    leituras
      .filter((l) => l.publico === 'DIRECAO' || l.publico === 'QUALIDADE')
      .every((l) => l.leitura.explicacao.includes('MATERIAL APURADO'))
  );

  const painel = montarPainel(b.mundo.topologia, relatorio.assurance, [], { leituras });
  igual('as leituras chegam ao painel', painel.leituras.length, 4);
  verificar(
    'e o aviso da parceria fica na tela, não no rodapé',
    painel.avisoDaParceria.includes('não produz número'),
    painel.avisoDaParceria
  );
  const html = renderizarPainel(painel);
  verificar('a seção existe no HTML', html.includes('<h2>Leitura por público</h2>'));
  verificar('com a procedência antes do texto', html.includes('núcleo determinístico</span>'));
}

fechar('Sinergentia³: cascata de faculdades e ancoragem');
