// ---------------------------------------------------------------------------
// SINERGENTIA³ — a parceria cognitiva, e os três "não" que a definem
//
// A frase que governa este pacote inteiro está escrita no registro de
// faculdades da Aletheia, e vale repeti-la porque ela é a decisão, não o
// enfeite:
//
//   "A Aletheia não tem um provedor de IA. Tem FACULDADES: capacidades de
//    linguagem que ela usa, cada uma vinda de uma escola diferente, cada uma
//    com alcance declarado e desempenho medido. A distinção não é retórica.
//    Um PROVEDOR é de quem se depende; uma FACULDADE é o que se usa."
//
// A diferença entre as duas palavras é a diferença entre um produto que
// funciona quando a rede cai e um que não funciona. E ela não se sustenta por
// intenção: sustenta-se por arquitetura.
//
// O QUE A SINERGENTIA³ É, NESTE PRODUTO
//
// Uma identidade com autoridade declarada — e a declaração é feita de
// negativas. Do registro público que a Aletheia já mantém
// (`src/data/sinergentiaStatus.ts`):
//
//   autoridade: { decisao: false, acaoExterna: false, numerica: false }
//
// Três "não" que respondem a três perguntas distintas:
//
//   · NÃO DECIDE. Nenhuma faculdade de linguagem entra no caminho que abre ou
//     fecha porta. No vocabulário do ADR-0003, ela é CONSULTIVA e nunca
//     DIRETIVA nem EXECUTIVA — e o motor de política deste produto sequer tem
//     porta por onde consultá-la.
//
//   · NÃO AGE PARA FORA. Não envia comando a equipamento, não grava na cadeia,
//     não altera entitlement. Produz texto, e texto é lido por gente.
//
//   · NÃO PRODUZ NÚMERO. É a negativa mais importante deste produto e a que
//     mais exige guarda ativa, porque é a única que um modelo viola sem má
//     intenção: pedir "resuma este painel" e receber "aproximadamente 40% dos
//     endpoints" quando a fonte dizia 3 de 10. O número da tela vem do Health
//     Score, que abre em componentes (item 7). Um número que aparece na prosa
//     e não está no material é invenção, e o `ancoragem.ts` existe para
//     descartá-la — não para corrigi-la.
//
// POR QUE O RUNTIME DA ALETHEIA NÃO É COPIADO PARA CÁ
//
// O registro da Aletheia diz `runtimeAtivoNaAletheia: false` e
// `laboratorioEstado: 'SHADOW_INTEGRATION_CANDIDATE'`. Copiar para cá um
// runtime que a origem mantém em sombra seria dar a ele, por mudança de
// endereço, uma autoridade que ele não tem na origem — exatamente o que o
// estatuto de calibração deste produto impede para um número.
//
// O que atravessa é a DOUTRINA, reimplementada no vocabulário desta casa e
// verificada aqui: a cascata de faculdades, a ancoragem, os três "não". O que
// não atravessa é código em sombra fingindo estatuto.
// ---------------------------------------------------------------------------

import { CorpoDeOrigem } from '../mpeh-kernel/ledger/tipos';

export interface AutoridadeDaParceria {
  /** Pode decidir acesso? Sempre `false`. Ver ADR-0003. */
  decisao: false;
  /** Pode agir sobre o mundo — equipamento, cadeia, entitlement? Sempre `false`. */
  acaoExterna: false;
  /** Pode produzir número? Sempre `false`. Ver `ancoragem.ts`. */
  numerica: false;
}

export interface IdentidadeDaParceria {
  nomePublico: string;
  slug: string;
  subtitulo: string;
  contratoDeIdentidade: string;
  contratoAceitoEm: string;
  /** Versão do laboratório de origem, como ela se declara. Não é desta casa. */
  laboratorioVersao: string;
  laboratorioEstado: string;
  /** O corpo que assina qualquer coisa vinda daqui. */
  corpo: CorpoDeOrigem;
  autoridade: AutoridadeDaParceria;
  procedencia: string;
  aviso: string;
}

/**
 * O registro, com procedência apontando para a fonte e não para esta cópia.
 *
 * Mesmo desenho do `MPEH_MANIFEST`: o que é espelho diz de onde veio, e uma
 * correção volta pela origem. O que muda aqui é o CORPO — na Aletheia a
 * Sinergentia³ é referência de identidade; neste produto ela é, sem exceção,
 * um corpo consultivo.
 */
export const SINERGENTIA: IdentidadeDaParceria = Object.freeze({
  nomePublico: 'Sinergentia³',
  slug: 'sinergentia3',
  subtitulo: 'parceira cognitiva',
  contratoDeIdentidade: 'sinergentia-identity-and-cognitive-partnership-v1',
  contratoAceitoEm: '2026-08-14',
  laboratorioVersao: '0.11.0',
  laboratorioEstado: 'SHADOW_INTEGRATION_CANDIDATE',
  corpo: 'CONSULTIVO',
  autoridade: Object.freeze({ decisao: false, acaoExterna: false, numerica: false }),
  procedencia:
    'Aletheia · src/data/sinergentiaStatus.ts — registro público de identidade e parceria ' +
    'cognitiva. A doutrina foi reimplementada neste produto; o runtime do laboratório, que a ' +
    'origem mantém em SHADOW, não foi copiado.',
  aviso:
    'A Sinergentia³ não decide acesso, não age sobre equipamento e não produz número. ' +
    'Ela lê material já apurado por instrumentos determinísticos e o escreve em prosa. ' +
    'Toda prosa que introduz identificador ou número ausente do material é descartada.'
});

/**
 * A pergunta que o produto faz antes de deixar qualquer faculdade falar.
 *
 * Existe como função, e não como comentário, para que a resposta seja
 * verificável em teste: se alguém um dia acrescentar uma quarta autoridade
 * positiva à parceria, a bateria reprova antes da tela.
 */
export function parceriaPodeDecidir(): boolean {
  return (
    SINERGENTIA.autoridade.decisao ||
    SINERGENTIA.autoridade.acaoExterna ||
    SINERGENTIA.autoridade.numerica
  );
}
