// ---------------------------------------------------------------------------
// SEGREGAÇÃO DE FUNÇÕES — a incompatibilidade é entre ATIVIDADES, não entre
// nomes de cargo
//
// O produto já tinha `regraDeSegregacao(papelA, papelB)`: uma fábrica que nega
// o acesso quando dois papéis coexistem no mesmo vínculo. Ela nunca foi usada,
// não está no conjunto base, e três coisas explicam por quê.
//
// PRIMEIRA: PAR DE PAPÉIS NÃO ESCALA, E O BURACO É SILENCIOSO
//
// Segregar por par exige escrever N² regras à mão. A instalação que esquecer
// um par fica descoberta — e, o que é pior, fica descoberta sem saber, porque
// a ausência de regra tem exatamente a mesma aparência de "não há conflito
// aqui". O controle interno clássico não separa cargos: separa as quatro
// atividades que, juntas na mesma pessoa, deixam de se vigiar — autorizar,
// executar, custodiar e conferir. Cargos mudam de nome a cada reforma
// administrativa; a razão pela qual não se deve guardar o estoque e conferir o
// próprio estoque não muda.
//
// SEGUNDA: NEGAR É O DESFECHO ERRADO, E ESTE PRODUTO JÁ SABIA DISSO
//
// Se alguém acumula duas atividades incompatíveis, o problema não está na
// porta — está no acúmulo. Negar o acesso fecha a porta para quem
// provavelmente precisa entrar, e deixa o acúmulo intacto: o inventário
// continua sendo guardado e conferido pela mesma pessoa, só que agora ela usa
// a chave de outro. Numa unidade pequena — uma Santa Casa num domingo —
// acumular função não é exceção, é a escala possível.
//
// O Freio (ADR-0014) resolveu o caso simétrico com a frase que vale aqui: ele
// não bloqueia a ação, bloqueia o silêncio sobre ela. Conflito de segregação
// exige REVISÃO HUMANA, não negativa. E revisão humana, depois do ADR-0017 e
// do ADR-0018, deixou de ser um marcador em relatório: abre pedido de fato e
// chama quem tem alçada.
//
// TERCEIRA: UMA MATRIZ SEM PROCEDÊNCIA É UMA REGRA QUE NINGUÉM RESPONDE
//
// Dizer "custodiar e conferir são incompatíveis" é afirmar algo sobre o mundo.
// Este produto já tem tratamento para afirmação sem lastro — `ConstanteCalibrada`
// obriga procedência, curador e data de verificação, e a leitura em sombra sai
// com a ressalva colada. A matriz de segregação carrega os mesmos campos pela
// mesma razão: a tela mostra de onde a incompatibilidade veio, e quem a
// contestar sabe a quem perguntar.
// ---------------------------------------------------------------------------

import { PedidoDeDecisao, RegraDePolitica } from './tipos';

/**
 * As quatro atividades que o controle interno separa.
 *
 * O vocabulário vem da tradição do controle interno (COSO, adotado no Brasil
 * pelos órgãos de controle), onde a separação entre autorizar, executar,
 * custodiar e conferir é o mecanismo que faz um desvio precisar de duas
 * pessoas em conluio, em vez de uma pessoa distraída.
 */
export type AtividadeSensivel =
  /** Decide que a operação deve acontecer — prescrever, liberar, aprovar. */
  | 'AUTORIZAR'
  /** Realiza a operação — dispensar, administrar, instalar. */
  | 'EXECUTAR'
  /** Guarda o bem — estoque, cofre, chave, credencial. */
  | 'CUSTODIAR'
  /** Verifica depois — inventário, auditoria, conciliação. */
  | 'CONFERIR';

export type ParDeAtividades = readonly [AtividadeSensivel, AtividadeSensivel];

/**
 * Um domínio de segregação: onde a separação vale e o que ela separa.
 *
 * `zonas` liga a matriz a portas concretas. Sem isso, a regra teria de valer em
 * toda a instalação, e uma pessoa que acumula atividades da farmácia seria
 * barrada na entrada do administrativo — o que ensina a equipe a desligar a
 * regra inteira por causa de um falso positivo.
 */
export interface DominioDeSegregacao {
  id: string;
  rotulo: string;
  zonas: readonly string[];
  /** Papel → atividades que ele exerce NESTE domínio. */
  atividadesPorPapel: Readonly<Record<string, readonly AtividadeSensivel[]>>;
  /** Pares que não podem coexistir na mesma pessoa. */
  incompativeis: readonly ParDeAtividades[];
  /** Onde conferir a origem desta separação. Não é descrição: é endereço. */
  procedencia: string;
  /** Quem responde por ela. Matriz sem dono é matriz que ninguém revisa. */
  curador: string;
  verificadoEm: string;
  /** Por que ela ainda não é norma literal, quando não é. */
  ressalva?: string;
}

/**
 * De onde veio o conflito — e a distinção decide QUEM conserta.
 *
 * Acúmulo de papéis é problema da escala: resolve-se redistribuindo gente.
 * Papel mal desenhado é problema do cadastro: um único cargo que já nasce
 * carregando custódia e conferência produz conflito em toda pessoa que o
 * receber, e redistribuir escala não resolve nada. Chamar os dois pelo mesmo
 * nome mandaria a coordenação procurar no lugar errado.
 */
export type OrigemDoConflito = 'ACUMULO_DE_PAPEIS' | 'PAPEL_MAL_DESENHADO';

export interface ConflitoDeSegregacao {
  dominioId: string;
  rotulo: string;
  atividades: ParDeAtividades;
  origem: OrigemDoConflito;
  /** Papéis que trouxeram cada atividade, na ordem do par. */
  papeisEnvolvidos: readonly string[];
  /** Frase determinística, pronta para tela e trilha. */
  explicacao: string;
  procedencia: string;
  curador: string;
}

function papeisQueExercem(
  atividade: AtividadeSensivel,
  papeis: readonly string[],
  dominio: DominioDeSegregacao
): readonly string[] {
  return papeis.filter((papel) => (dominio.atividadesPorPapel[papel] ?? []).includes(atividade));
}

/**
 * Os conflitos que estes papéis produzem neste domínio.
 *
 * Determinística e ordenada: mesma entrada, mesma saída, para sempre — a mesma
 * propriedade que permite auditar uma decisão de política meses depois.
 */
export function conflitosDe(
  papeis: readonly string[],
  dominio: DominioDeSegregacao
): readonly ConflitoDeSegregacao[] {
  const conflitos: ConflitoDeSegregacao[] = [];
  const ordenados = [...papeis].sort();

  for (const [primeira, segunda] of dominio.incompativeis) {
    const comPrimeira = papeisQueExercem(primeira, ordenados, dominio);
    const comSegunda = papeisQueExercem(segunda, ordenados, dominio);
    if (comPrimeira.length === 0 || comSegunda.length === 0) continue;

    // Um único papel carregando as duas atividades é defeito de cadastro, e
    // não de escala. A busca por um papel em comum responde exatamente isso.
    const emComum = comPrimeira.filter((papel) => comSegunda.includes(papel));
    const origem: OrigemDoConflito =
      emComum.length > 0 ? 'PAPEL_MAL_DESENHADO' : 'ACUMULO_DE_PAPEIS';
    const envolvidos =
      origem === 'PAPEL_MAL_DESENHADO'
        ? emComum
        : [...new Set([comPrimeira[0]!, comSegunda[0]!])];

    conflitos.push({
      dominioId: dominio.id,
      rotulo: dominio.rotulo,
      atividades: [primeira, segunda],
      origem,
      papeisEnvolvidos: envolvidos,
      explicacao:
        origem === 'PAPEL_MAL_DESENHADO'
          ? `O papel ${envolvidos.join(', ')} acumula ${primeira} e ${segunda} em ${dominio.rotulo}. ` +
            'O conflito nasce do cadastro do papel: toda pessoa que o receber vai carregá-lo, e ' +
            'redistribuir a escala não resolve.'
          : `${primeira} e ${segunda} em ${dominio.rotulo} recaem sobre a mesma pessoa, por ` +
            `acúmulo dos papéis ${envolvidos.join(' e ')}. Numa unidade pequena isso é a escala ` +
            'possível, não irregularidade automática — por isso exige revisão humana, e não ' +
            'porta fechada.',
      procedencia: dominio.procedencia,
      curador: dominio.curador
    });
  }

  return conflitos;
}

/** Os conflitos de um vínculo em TODOS os domínios, independentes de porta. */
export function conflitosDoVinculo(
  papeis: readonly string[],
  dominios: readonly DominioDeSegregacao[]
): readonly ConflitoDeSegregacao[] {
  return dominios.flatMap((dominio) => conflitosDe(papeis, dominio));
}

/** Os domínios que se materializam nesta zona. */
export function dominiosDaZona(
  zonaId: string,
  dominios: readonly DominioDeSegregacao[]
): readonly DominioDeSegregacao[] {
  return dominios.filter((dominio) => dominio.zonas.includes(zonaId));
}

/**
 * Uma regra para todos os pares, em vez de uma regra por par.
 *
 * O efeito é `REQUIRE_APPROVAL` por decisão, e ela é o coração deste módulo:
 * negar fecharia a porta para quem precisa entrar e deixaria o acúmulo de pé.
 * Exigir revisão transfere ao humano a única pergunta que o motor não pode
 * responder — se aquele acúmulo é aceitável naquela unidade, naquele plantão.
 *
 * A prioridade fica acima da aprovação por criticidade e abaixo dos bloqueios
 * estruturais: vínculo encerrado continua negando antes de qualquer discussão
 * sobre segregação, porque quem não tem vínculo não tem função a segregar.
 */
export function regraDeSegregacaoPorAtividade(
  dominios: readonly DominioDeSegregacao[],
  prioridade: number
): RegraDePolitica {
  const conflitosDoPedido = (pedido: PedidoDeDecisao): readonly ConflitoDeSegregacao[] =>
    dominiosDaZona(pedido.contexto.zonaId, dominios).flatMap((dominio) =>
      conflitosDe(pedido.contexto.papeis, dominio)
    );

  return {
    id: 'R-SEGREGACAO-POR-ATIVIDADE',
    descricao:
      'Atividades incompatíveis (autorizar, executar, custodiar, conferir) na mesma pessoa ' +
      'exigem revisão humana no domínio da zona.',
    prioridade,
    efeito: 'REQUIRE_APPROVAL',
    aplicavel: (pedido) => conflitosDoPedido(pedido).length > 0,
    justificativa: (pedido) => {
      const conflitos = conflitosDoPedido(pedido);
      const primeiro = conflitos[0];
      if (!primeiro) return 'Segregação de funções: sem conflito apurado.';
      const demais =
        conflitos.length > 1 ? ` (e mais ${conflitos.length - 1} no mesmo pedido)` : '';
      return `Segregação de funções — ${primeiro.explicacao}${demais} Procedência: ${primeiro.procedencia}`;
    }
  };
}

const CURADOR = 'Nível E — governança de acesso ColmeIA';
const VERIFICADO_EM = '2026-09-17';

/**
 * Medicamentos sob controle especial.
 *
 * A procedência é real e vale a precisão: a Portaria SVS/MS 344/1998 submete
 * as substâncias sob controle especial a escrituração e a responsabilidade
 * técnica farmacêutica. O que a norma estabelece é a responsabilidade e o
 * registro; separar quem CUSTODIA o estoque de quem CONFERE o inventário é
 * prática de controle interno DERIVADA dela, e não texto literal. A ressalva
 * registra a diferença em vez de emprestar à prática a autoridade da norma.
 */
export const SEGREGACAO_MEDICAMENTOS: DominioDeSegregacao = Object.freeze({
  id: 'medicamentos-controlados',
  rotulo: 'medicamentos sob controle especial',
  zonas: ['z-farmacia'],
  atividadesPorPapel: Object.freeze({
    'role-prescricao-medica': Object.freeze(['AUTORIZAR'] as const),
    'role-farmacia': Object.freeze(['EXECUTAR', 'CUSTODIAR'] as const),
    'role-auditoria-interna': Object.freeze(['CONFERIR'] as const)
  }),
  incompativeis: Object.freeze([
    Object.freeze(['AUTORIZAR', 'EXECUTAR'] as const),
    Object.freeze(['CUSTODIAR', 'CONFERIR'] as const)
  ]),
  procedencia:
    'Portaria SVS/MS 344/1998 — escrituração e responsabilidade técnica sobre substâncias ' +
    'sob controle especial. A separação entre custódia e conferência é prática de controle ' +
    'interno derivada da norma, não dispositivo literal dela.',
  curador: CURADOR,
  verificadoEm: VERIFICADO_EM,
  ressalva:
    'A norma exige responsável técnico e escrituração; não enumera esta matriz. Ela sobe de ' +
    'estatuto quando a instalação a ratificar como política interna, com data e responsável.'
});

/**
 * Credenciais de acesso — o domínio que este produto é.
 *
 * Quem concede acesso não deveria conferir os próprios acessos concedidos.
 * Vale registrar que a ColmeIA é parte do problema que descreve: ela é o
 * sistema em que a concessão acontece, e a trilha que ela mesma produz é a
 * conferência. Por isso a separação aqui não é opcional na leitura — mas a
 * matriz continua sendo política interna declarada, sem norma externa atrás.
 */
export const SEGREGACAO_CREDENCIAIS: DominioDeSegregacao = Object.freeze({
  id: 'credenciais-de-acesso',
  rotulo: 'credenciais de acesso',
  zonas: ['z-datacenter'],
  atividadesPorPapel: Object.freeze({
    'role-manutencao': Object.freeze(['EXECUTAR'] as const),
    'role-seguranca': Object.freeze(['AUTORIZAR', 'CONFERIR'] as const),
    'role-administrador-de-acesso': Object.freeze(['EXECUTAR', 'CUSTODIAR'] as const),
    'role-auditoria-interna': Object.freeze(['CONFERIR'] as const)
  }),
  incompativeis: Object.freeze([
    Object.freeze(['AUTORIZAR', 'EXECUTAR'] as const),
    Object.freeze(['CUSTODIAR', 'CONFERIR'] as const)
  ]),
  procedencia:
    'Política interna declarada, derivada da separação clássica do controle interno. Sem ' +
    'norma externa específica: é palpite fundamentado, não citação.',
  curador: CURADOR,
  verificadoEm: VERIFICADO_EM,
  ressalva:
    'Nenhuma instalação ratificou esta matriz. Enquanto isso, o efeito dela é exigir revisão ' +
    'humana — nunca negar acesso, nunca conceder.'
});

export const DOMINIOS_DE_SEGREGACAO_BASE: readonly DominioDeSegregacao[] = Object.freeze([
  SEGREGACAO_MEDICAMENTOS,
  SEGREGACAO_CREDENCIAIS
]);
