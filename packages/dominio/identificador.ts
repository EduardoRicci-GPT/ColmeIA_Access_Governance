// ---------------------------------------------------------------------------
// IDENTIFICADOR OBSERVADO — D-053: identificador observado não é prova
//
// O produto já separa identidade de credencial e credencial de autorização
// (D-014, implementado): o direito nasce de política sobre vínculo, papel e
// contexto, e nunca da posse de um crachá. Falta a espécie que chega quando a
// portaria ganha câmera.
//
// Uma câmera de LPR lê `ABC-1D23` no portão de serviço. Um sistema de
// reconhecimento facial devolve um rosto com 0,94 de confiança. Um leitor
// óptico decodifica o QR impresso na ordem de serviço. Nenhum dos três é uma
// credencial apresentada: ninguém APRESENTOU nada. O sensor OBSERVOU, e
// observar é um ato de terceiro sobre o qual o observado não tem controle.
//
// A diferença é inteira, e ela tem três degraus:
//
//   1. O IDENTIFICADOR OBSERVADO — `ABC-1D23`. É um fato do sensor.
//   2. A AFIRMAÇÃO — "este identificador pertence ao veículo da transportadora
//      X". É uma inferência, de um cadastro ou de um operador.
//   3. A PROVA — a credencial foi apresentada por quem a detém, e o vínculo
//      entre credencial e portador foi estabelecido antes, por alguém com
//      alçada.
//
// Um sistema que trata o degrau 1 como degrau 3 abre o portão para qualquer
// placa clonada, e abre com registro impecável: a trilha dirá que o veículo
// autorizado entrou. A clonagem de placa custa menos que uma fechadura.
//
// A REGRA DESTE MÓDULO
//
// Uma observação, sozinha, NUNCA produz `PROVADA`. O melhor que ela produz é
// `APENAS_OBSERVADA` — que o motor de política é obrigado a tratar como
// ausência de prova, e que no máximo CONVOCA corroboração humana. A observação
// é excelente para três coisas: antecipar (abrir a cancela da fila de espera),
// corroborar (a placa casa com a OS que o motorista apresentou) e auditar (quem
// esteve no pátio às 3h). Para nenhuma delas ela precisa virar autorização.
//
// E UMA FRONTEIRA DE DADO PESSOAL
//
// Nada aqui carrega imagem, template biométrico ou a placa em claro além do
// necessário. `valorProjetado` é projeção — placa mascarada, hash, referência
// opaca — pela mesma disciplina que mantém diagnóstico fora do motor
// (ADR-0007). Reconhecimento facial e LPR reais exigem avaliação de privacidade
// e integração verificada, e nada neste arquivo os implementa.
// ---------------------------------------------------------------------------

import { CredentialMethod } from './topologia';

export type EspecieDeIdentificadorObservado =
  | 'PLACA_DE_VEICULO'
  | 'ROSTO'
  | 'CRACHA_LIDO_POR_CAMERA'
  | 'QR_IMPRESSO'
  | 'ETIQUETA_RFID_PASSIVA';

/**
 * O que o sensor viu. Fato do sensor, e nada além.
 *
 * `confiancaDoSensor` é o número que o fabricante devolve, guardado como ele
 * vem e explicitamente NÃO usado como limiar de autorização neste módulo. Um
 * produto que autorizasse acima de 0,9 estaria deixando o fabricante calibrar
 * a porta — e `classificarRisco` já estabeleceu que severidade não se
 * terceiriza (item 28).
 */
export interface IdentificadorObservado {
  id: string;
  especie: EspecieDeIdentificadorObservado;
  /** Projeção: placa mascarada, hash, referência opaca. Nunca a imagem. */
  valorProjetado: string;
  observadoEm: Date;
  sensorId: string;
  endpointId?: string;
  confiancaDoSensor?: number;
}

export type OrigemDaAfirmacao = 'CADASTRO' | 'OPERADOR' | 'SENSOR';

export type EspecieDeSujeito = 'PESSOA' | 'VEICULO';

export interface SujeitoAfirmado {
  especie: EspecieDeSujeito;
  /** `personId` ou `vehicleId`, conforme a espécie. */
  sujeitoId: string;
}

/**
 * A inferência: alguém diz que aquele identificador corresponde a este sujeito.
 *
 * `afirmadaPor: 'SENSOR'` é o caso que precisa de nome próprio: o sensor que
 * decodifica a placa e consulta o cadastro sozinho está fazendo as duas coisas
 * ao mesmo tempo, e registrar isso como `CADASTRO` esconderia que nenhum humano
 * participou da correspondência.
 */
export interface AfirmacaoDeIdentidade {
  id: string;
  identificadorObservadoId: string;
  sujeito: SujeitoAfirmado;
  afirmadaPor: OrigemDaAfirmacao;
  afirmadaEm: Date;
  /** Quem assinou, quando a afirmação é de operador. */
  operador?: string;
}

/** A credencial que foi, de fato, apresentada por alguém no ponto de acesso. */
export interface CredencialApresentada {
  credentialId: string;
  metodo: CredentialMethod;
  endpointId: string;
  apresentadaEm: Date;
}

/**
 * O vínculo entre credencial e portador, estabelecido ANTES e por quem tem
 * alçada. É este objeto que falta numa placa clonada: a placa existe, o
 * cadastro existe, e ninguém jamais vinculou aquele identificador a um portador
 * com responsabilidade declarada.
 */
export interface VinculoDeCredencial {
  credentialId: string;
  /** Vínculo institucional, não pessoa: é o vínculo que carrega papel. */
  relationshipId: string;
  personId: string;
  vinculadoEm: Date;
  vinculadoPor: string;
}

/** O sujeito veículo — a espécie que o pátio de um hospital move todo dia. */
export interface SujeitoVeiculo {
  id: string;
  /** Placa projetada. Nunca a placa em claro além do necessário. */
  placaProjetada: string;
  transportadoraId?: string;
  /** Vínculo do motorista, quando declarado. É o vínculo que tem papel. */
  motoristaRelationshipId?: string;
  ordemDeServicoId?: string;
  /** O que este veículo vem fazer: coleta de resíduo, gases, rouparia. */
  missao?: string;
}

/**
 * Três valores, e o do meio é o que o delta acrescenta.
 *
 * `APENAS_OBSERVADA` não é um erro nem uma recusa: é o estado honesto de um
 * portão com câmera e sem credencial apresentada. O motor de política o trata
 * como ausência de prova; a operação o trata como fila que avança mais rápido
 * porque o sistema já sabe quem está chegando.
 */
export type ProvaDeAutorizacao = 'PROVADA' | 'APENAS_OBSERVADA' | 'NAO_PROVADA';

export interface LeituraDeProva {
  prova: ProvaDeAutorizacao;
  /** O sujeito que o conjunto de fatos sustenta, quando sustenta algum. */
  sujeito?: SujeitoAfirmado;
  /** Verdadeiro quando a observação CASA com a credencial apresentada. */
  corroborado: boolean;
  fatores: readonly string[];
  explicacao: string;
}

export interface EntradaDeProva {
  endpointId: string;
  agora: Date;
  /** O que o sensor observou, se observou algo. */
  observado?: IdentificadorObservado;
  /** A afirmação sobre a observação, se houver. */
  afirmacao?: AfirmacaoDeIdentidade;
  /** A credencial efetivamente apresentada, se houver. */
  apresentada?: CredencialApresentada;
  /** O vínculo da credencial apresentada, se existir. */
  vinculo?: VinculoDeCredencial;
  /** Tolerância entre a observação e a apresentação para que uma corrobore a outra. */
  minutosDeCorroboracao?: number;
}

const MINUTOS_DE_CORROBORACAO_PADRAO = 5;

/**
 * Avalia o que o conjunto de fatos prova.
 *
 * A estrutura da função é a regra: o caminho que devolve `PROVADA` exige
 * credencial apresentada E vínculo de credencial. Não há ramo em que uma
 * observação, com qualquer confiança, alcance `PROVADA` — e é por isso que a
 * ordem dos testes começa pela credencial, e não pelo sensor.
 */
export function avaliarProva(entrada: EntradaDeProva): LeituraDeProva {
  const fatores: string[] = [];
  const tolerancia = entrada.minutosDeCorroboracao ?? MINUTOS_DE_CORROBORACAO_PADRAO;

  if (entrada.observado) {
    fatores.push(
      `sensor ${entrada.observado.sensorId} observou ${entrada.observado.especie} ` +
        `(${entrada.observado.valorProjetado})` +
        (entrada.observado.confiancaDoSensor === undefined
          ? ''
          : ` com confiança declarada ${entrada.observado.confiancaDoSensor}`)
    );
  }
  if (entrada.afirmacao) {
    fatores.push(
      `afirmação de identidade por ${entrada.afirmacao.afirmadaPor}` +
        (entrada.afirmacao.operador ? ` (${entrada.afirmacao.operador})` : '')
    );
  }

  const corroborado =
    entrada.observado !== undefined &&
    entrada.apresentada !== undefined &&
    Math.abs(entrada.apresentada.apresentadaEm.getTime() - entrada.observado.observadoEm.getTime()) <=
      tolerancia * 60_000;
  if (corroborado) {
    fatores.push(`observação e apresentação a menos de ${tolerancia} min → corroboração`);
  }

  if (entrada.apresentada && entrada.vinculo) {
    if (entrada.vinculo.credentialId !== entrada.apresentada.credentialId) {
      fatores.push('o vínculo apresentado é de outra credencial → não prova');
      return {
        prova: 'NAO_PROVADA',
        corroborado,
        fatores,
        explicacao:
          'A credencial apresentada não é a credencial vinculada ao portador declarado. ' +
          'Dois objetos diferentes com o mesmo nome na tela é o começo de uma investigação.'
      };
    }
    fatores.push(
      `credencial ${entrada.apresentada.metodo} apresentada e vinculada por ` +
        `${entrada.vinculo.vinculadoPor} em ${entrada.vinculo.vinculadoEm.toISOString()}`
    );
    return {
      prova: 'PROVADA',
      sujeito: { especie: 'PESSOA', sujeitoId: entrada.vinculo.personId },
      corroborado,
      fatores,
      explicacao:
        'Credencial apresentada, com vínculo estabelecido antes por quem tem alçada. ' +
        (corroborado
          ? 'A observação do sensor corrobora a apresentação, e corroborar é o uso correto dela.'
          : 'A prova não depende de sensor nenhum.')
    };
  }

  if (entrada.apresentada && !entrada.vinculo) {
    fatores.push('credencial apresentada sem vínculo de portador registrado');
    return {
      prova: 'NAO_PROVADA',
      corroborado,
      fatores,
      explicacao:
        'A credencial foi apresentada e ninguém registrou a quem ela pertence. Sem o vínculo, ' +
        'o que existe é um objeto que abre a porta — e um objeto não responde por nada.'
    };
  }

  if (entrada.observado) {
    return {
      prova: 'APENAS_OBSERVADA',
      sujeito: entrada.afirmacao?.sujeito,
      corroborado: false,
      fatores,
      explicacao:
        'Um sensor observou um identificador e alguém afirmou a quem ele corresponde. Nada foi ' +
        'apresentado por ninguém: isto antecipa a fila, corrobora uma apresentação e serve à ' +
        'auditoria do pátio. Não autoriza entrada, e a confiança declarada pelo sensor não muda isso ' +
        '— placa se clona, e clonar placa custa menos que uma fechadura.'
    };
  }

  return {
    prova: 'NAO_PROVADA',
    corroborado: false,
    fatores: ['nenhum identificador observado e nenhuma credencial apresentada'],
    explicacao: 'Não há observação nem apresentação. Não há o que avaliar.'
  };
}

/**
 * A prova sustenta decisão de acesso?
 *
 * Função de uma linha, exportada de propósito: é o ponto por onde o motor de
 * política consome esta leitura, e tê-la nomeada impede que algum chamador
 * escreva `prova !== 'NAO_PROVADA'` — que incluiria a observação e desfaria o
 * delta inteiro numa comparação distraída.
 */
export function provaSustentaDecisao(prova: ProvaDeAutorizacao): boolean {
  return prova === 'PROVADA';
}

/**
 * O que falta para a observação virar entrada, em português, para a portaria.
 *
 * Existe porque a alternativa é a tela dizer "não autorizado" a um motorista
 * que está com a ordem de serviço na mão — e a portaria resolver por telefone,
 * que é onde nada fica registrado.
 */
export function oQueFaltaParaEntrar(leitura: LeituraDeProva, veiculo?: SujeitoVeiculo): string {
  if (leitura.prova === 'PROVADA') return 'Nada: a credencial foi apresentada e está vinculada.';
  if (leitura.prova === 'APENAS_OBSERVADA') {
    const missao = veiculo?.missao ? ` (${veiculo.missao})` : '';
    const os = veiculo?.ordemDeServicoId ? ` da OS ${veiculo.ordemDeServicoId}` : '';
    return (
      `Falta a apresentação de credencial por quem conduz o veículo${missao}${os}: crachá do ` +
      'motorista, ou liberação registrada pelo plantão da portaria. A placa reconhecida ' +
      'adianta a conferência; não a substitui.'
    );
  }
  return 'Falta credencial apresentada e vínculo de portador registrado.';
}
