// ---------------------------------------------------------------------------
// FEDERAÇÃO — D-057: visibilidade hierárquica não é autoridade federada
//
// A hierarquia deste produto vai de `ORGANIZATION` a `ENDPOINT`, e ela é uma
// hierarquia de LUGARES. Funciona para o Health Score, que sobe somando fatos
// sobre portas. Não funciona para autoridade, e o delta desta semana aponta
// exatamente onde ela quebra.
//
// Quem opera a ColmeIA em escala não é um hospital: é uma integradora com
// trinta clientes, ou uma rede com doze unidades sob um CNPJ e quatro sob
// outro, ou um hospital que terceirizou a manutenção das fechaduras. A
// hierarquia de LUGARES não descreve nenhuma dessas relações, e a tentação é
// esticá-la: criar um nó acima da organização para a integradora, e deixar a
// autoridade subir por ele como o score sobe.
//
// Esticar a hierarquia dessa maneira produz o pior defeito que um produto
// multicliente pode ter: o administrador da integradora passa a poder aprovar
// acesso ao cofre de psicotrópicos de um hospital que ele nunca visitou,
// porque o nó dele é pai do nó do hospital. Não é escalada de privilégio por
// bug — é escalada por desenho, e nenhum teste de permissão a pega, porque o
// sistema está funcionando como foi modelado.
//
// A SEPARAÇÃO
//
//   VISIBILIDADE COMERCIAL — quem pode VER o quê. Sobe pela árvore comercial.
//     A integradora vê a frota, os chamados, o inventário, a saúde dos
//     equipamentos que ela instalou. Isso é o contrato dela.
//
//   AUTORIDADE INSTITUCIONAL — quem pode DECIDIR o quê. NÃO sobe por árvore
//     nenhuma. Nasce num domínio de autoridade, que pertence a uma organização
//     assistencial, e só se move por DELEGAÇÃO EXPLÍCITA, com escopo, vigência
//     e quem a concedeu.
//
// As duas respostas são independentes, e a função que as cruza — `autoridadeEfetiva`
// — ignora a árvore comercial por construção: ela não recebe o tenant. Não é
// uma verificação que alguém poderia esquecer de fazer; é uma informação que a
// função não tem.
//
// O SEGUNDO CASO, MAIS SUTIL
//
// A mesma pessoa trabalha em dois hospitais da mesma rede. Identidade federada
// resolve o login — ela entra com uma credencial só, e isso é bom. O que não
// pode acontecer é o direito atravessar junto: ser enfermeira-chefe no Hospital
// A não torna ninguém enfermeira-chefe no Hospital B. `autoridadeEfetiva`
// calcula POR ORGANIZAÇÃO e nunca une os conjuntos — e o teste que prova isso
// é o que impede a regressão mais provável deste módulo.
// ---------------------------------------------------------------------------

import { Janela, janelaVigente } from '../dominio/entitlement';

/**
 * Os atores comerciais. Note o que não está aqui: papel assistencial.
 *
 * Um tenant é quem paga, administra frota e abre chamado. A palavra
 * "organização" aparece como `organizacoesAtendidas` — uma lista de quem ele
 * ATENDE, e não de quem ele comanda.
 */
export type EspecieDeTenant = 'CLIENTE_DIRETO' | 'INTEGRADORA' | 'OPERADORA_DE_FROTA';

export interface Tenant {
  id: string;
  nome: string;
  especie: EspecieDeTenant;
  /** Organizações assistenciais sob contrato com este tenant. */
  organizacoesAtendidas: readonly string[];
}

/**
 * O que um ator comercial pode VER.
 *
 * Quatro faixas, e a ausência da quinta é o ponto: não existe faixa de
 * visibilidade que inclua decisão. `ATRIBUTOS_DE_PESSOA` é a mais sensível, e
 * existe porque uma integradora que gerencia credenciais precisa saber que
 * existe um portador — nunca quem ele é, que vínculo tem, nem onde atua.
 */
export type FaixaDeVisibilidade =
  | 'INVENTARIO_E_SAUDE'
  | 'EVENTOS_TECNICOS'
  | 'CHAMADOS_E_SINCRONIZACAO'
  | 'ATRIBUTOS_DE_PESSOA';

export const VISIBILIDADE_POR_ESPECIE: Readonly<Record<EspecieDeTenant, readonly FaixaDeVisibilidade[]>> =
  Object.freeze({
    CLIENTE_DIRETO: Object.freeze([
      'INVENTARIO_E_SAUDE',
      'EVENTOS_TECNICOS',
      'CHAMADOS_E_SINCRONIZACAO'
    ]) as readonly FaixaDeVisibilidade[],
    INTEGRADORA: Object.freeze([
      'INVENTARIO_E_SAUDE',
      'EVENTOS_TECNICOS',
      'CHAMADOS_E_SINCRONIZACAO'
    ]) as readonly FaixaDeVisibilidade[],
    OPERADORA_DE_FROTA: Object.freeze([
      'INVENTARIO_E_SAUDE',
      'CHAMADOS_E_SINCRONIZACAO'
    ]) as readonly FaixaDeVisibilidade[]
  });

/**
 * O domínio de autoridade — onde a decisão nasce.
 *
 * Pertence a uma organização ASSISTENCIAL, nunca a um tenant. A separação de
 * campos é literal: não há `tenantId` nesta interface, e acrescentá-lo seria o
 * primeiro passo para a herança indevida voltar.
 */
export interface DominioDeAutoridade {
  id: string;
  organizationId: string;
  /** Unidades alcançadas por este domínio. Vazio = a organização inteira. */
  unidadeIds: readonly string[];
  /** Papéis que este domínio confere a quem pertence a ele. */
  papeisLocais: readonly string[];
  /** Quem pertence a este domínio, por vínculo e não por pessoa. */
  relationshipIds: readonly string[];
}

export type EspecieDeEscopo = 'OPERACIONAL' | 'TECNICO' | 'ASSISTENCIAL';

/**
 * A delegação explícita — o único caminho pelo qual autoridade se move.
 *
 * Cinco campos obrigatórios que nenhuma delegação implícita teria: de onde vem,
 * para quem, com que escopo, por quanto tempo, e quem assinou. A ausência de
 * qualquer um deles é o que distingue delegação de vazamento.
 */
export interface DelegacaoDeAutoridade {
  id: string;
  /** Domínio de autoridade que delega. */
  dominioOrigemId: string;
  /** Vínculo que recebe. Nunca uma pessoa, nunca um tenant. */
  relationshipDestinoId: string;
  escopo: EspecieDeEscopo;
  /** Papéis delegados. Subconjunto dos papéis do domínio de origem. */
  papeis: readonly string[];
  vigencia: Janela;
  concedidaPor: string;
  motivo: string;
}

export interface EntradaDeAutoridade {
  /** O vínculo de quem pede. A pessoa não entra: é o vínculo que tem papel. */
  relationshipId: string;
  /** A organização em que a autoridade está sendo exercida. */
  organizationId: string;
  /** Unidade em que a autoridade está sendo exercida, quando há. */
  unidadeId?: string;
  dominios: readonly DominioDeAutoridade[];
  delegacoes: readonly DelegacaoDeAutoridade[];
  agora: Date;
}

export interface LeituraDeAutoridade {
  /** Papéis que este vínculo efetivamente tem NESTA organização. */
  papeis: readonly string[];
  /** Domínios que sustentaram os papéis. */
  dominios: readonly string[];
  /** Delegações vigentes que acrescentaram papéis. */
  delegacoes: readonly string[];
  fatores: readonly string[];
  explicacao: string;
}

/**
 * A autoridade efetiva de um vínculo numa organização.
 *
 * Três propriedades que os testes guardam, e que são o delta inteiro:
 *
 *  1. a função NÃO recebe tenant. A árvore comercial não pode influenciar o
 *     resultado porque não entra;
 *  2. o cálculo é POR organização. Papéis de outra organização não são unidos,
 *     nem quando o `relationshipId` é o mesmo;
 *  3. delegação vencida não conta, e delegação de papel que o domínio de origem
 *     não possui também não — ninguém delega o que não tem.
 */
export function autoridadeEfetiva(entrada: EntradaDeAutoridade): LeituraDeAutoridade {
  const fatores: string[] = [
    `vínculo ${entrada.relationshipId} na organização ${entrada.organizationId}`
  ];
  const papeis = new Set<string>();
  const dominiosUsados: string[] = [];
  const delegacoesUsadas: string[] = [];

  const dominiosDaOrganizacao = entrada.dominios.filter(
    (dominio) => dominio.organizationId === entrada.organizationId
  );
  const ignorados = entrada.dominios.length - dominiosDaOrganizacao.length;
  if (ignorados > 0) {
    fatores.push(
      `${ignorados} domínio(s) de outra(s) organização(ões) ignorado(s): autoridade não atravessa organização`
    );
  }

  for (const dominio of dominiosDaOrganizacao) {
    if (!dominio.relationshipIds.includes(entrada.relationshipId)) continue;
    if (
      entrada.unidadeId !== undefined &&
      dominio.unidadeIds.length > 0 &&
      !dominio.unidadeIds.includes(entrada.unidadeId)
    ) {
      fatores.push(`domínio ${dominio.id} não alcança a unidade ${entrada.unidadeId}`);
      continue;
    }
    dominiosUsados.push(dominio.id);
    for (const papel of dominio.papeisLocais) papeis.add(papel);
    fatores.push(`domínio ${dominio.id} confere ${dominio.papeisLocais.length} papel(éis)`);
  }

  const dominioPorId = new Map(entrada.dominios.map((dominio) => [dominio.id, dominio]));
  for (const delegacao of entrada.delegacoes) {
    if (delegacao.relationshipDestinoId !== entrada.relationshipId) continue;
    if (!janelaVigente(delegacao.vigencia, entrada.agora)) {
      fatores.push(`delegação ${delegacao.id} fora de vigência`);
      continue;
    }
    const origem = dominioPorId.get(delegacao.dominioOrigemId);
    if (!origem) {
      fatores.push(`delegação ${delegacao.id} aponta para domínio inexistente`);
      continue;
    }
    if (origem.organizationId !== entrada.organizationId) {
      // Este é o caso que o delta nomeia. Uma delegação assinada no Hospital A
      // não produz autoridade no Hospital B, mesmo que o mesmo vínculo exista
      // nos dois e mesmo que a identidade seja a mesma.
      fatores.push(
        `delegação ${delegacao.id} vem do domínio ${origem.id}, da organização ` +
          `${origem.organizationId} → não vale em ${entrada.organizationId}`
      );
      continue;
    }
    const concedidos = delegacao.papeis.filter((papel) => origem.papeisLocais.includes(papel));
    const excedentes = delegacao.papeis.filter((papel) => !origem.papeisLocais.includes(papel));
    if (excedentes.length > 0) {
      fatores.push(
        `delegação ${delegacao.id} tenta delegar ${excedentes.length} papel(éis) que o domínio ` +
          'de origem não possui → descartado(s)'
      );
    }
    if (concedidos.length === 0) continue;
    delegacoesUsadas.push(delegacao.id);
    for (const papel of concedidos) papeis.add(papel);
    fatores.push(
      `delegação ${delegacao.id} (${delegacao.escopo}, por ${delegacao.concedidaPor}) acrescenta ` +
        `${concedidos.length} papel(éis)`
    );
  }

  const lista = [...papeis].sort();
  return {
    papeis: lista,
    dominios: dominiosUsados,
    delegacoes: delegacoesUsadas,
    fatores,
    explicacao:
      lista.length === 0
        ? `Este vínculo não tem autoridade em ${entrada.organizationId}. Visibilidade comercial, ` +
          'quando existe, não confere papel: ela mostra equipamento, não decide porta.'
        : `Autoridade em ${entrada.organizationId}: ${lista.join(', ')}. ` +
          `Sustentada por ${dominiosUsados.length} domínio(s) e ${delegacoesUsadas.length} delegação(ões) vigente(s).`
  };
}

export interface LeituraDeVisibilidade {
  /** Organizações cujos dados técnicos este tenant pode ver. */
  organizacoes: readonly string[];
  faixas: readonly FaixaDeVisibilidade[];
  /** A frase que a tela exibe junto da lista. Não é decorativa. */
  ressalva: string;
}

/**
 * O que um tenant comercial pode ver — e a ressalva que viaja com a resposta.
 *
 * A ressalva está no tipo de retorno de propósito. Uma função que devolvesse só
 * a lista permitiria a um chamador exibir "integradora X: 30 hospitais" sem
 * dizer o que aquilo significa, e é dessa omissão que nasce a expectativa de
 * que visibilidade implique comando.
 */
export function visibilidadeDe(tenant: Tenant): LeituraDeVisibilidade {
  return {
    organizacoes: [...tenant.organizacoesAtendidas],
    faixas: VISIBILIDADE_POR_ESPECIE[tenant.especie] ?? [],
    ressalva:
      `${tenant.nome} atende ${tenant.organizacoesAtendidas.length} organização(ões) e vê ` +
      'inventário, saúde e chamados dos equipamentos. Nenhuma decisão de acesso, aprovação ou ' +
      'direito assistencial decorre dessa visibilidade.'
  };
}

export type MotivoDeRecusaDeAutoridade =
  | 'SEM_PAPEL_NA_ORGANIZACAO'
  | 'PAPEL_DE_OUTRA_ORGANIZACAO'
  | 'DELEGACAO_VENCIDA'
  | 'VISIBILIDADE_COMERCIAL_NAO_E_AUTORIDADE';

export interface VerdictoDeAutoridadeFederada {
  autorizado: boolean;
  motivo?: MotivoDeRecusaDeAutoridade;
  papeisEfetivos: readonly string[];
  explicacao: string;
}

/**
 * Este vínculo pode decidir nesta organização, com um destes papéis?
 *
 * O parâmetro `tenantId` NÃO existe nesta função, e a ausência é a defesa: não
 * há como um chamador passar a credencial comercial e obter autorização
 * institucional, porque a função não aceita o argumento.
 */
export function podeDecidirNaOrganizacao(
  entrada: EntradaDeAutoridade,
  papeisExigidos: readonly string[]
): VerdictoDeAutoridadeFederada {
  const leitura = autoridadeEfetiva(entrada);
  const atendidos = papeisExigidos.filter((papel) => leitura.papeis.includes(papel));

  if (atendidos.length > 0) {
    return {
      autorizado: true,
      papeisEfetivos: leitura.papeis,
      explicacao: `${atendidos.join(', ')} em ${entrada.organizationId}. ${leitura.explicacao}`
    };
  }

  const temPapelEmOutraOrganizacao = entrada.dominios.some(
    (dominio) =>
      dominio.organizationId !== entrada.organizationId &&
      dominio.relationshipIds.includes(entrada.relationshipId) &&
      dominio.papeisLocais.some((papel) => papeisExigidos.includes(papel))
  );
  const temDelegacaoVencida = entrada.delegacoes.some(
    (delegacao) =>
      delegacao.relationshipDestinoId === entrada.relationshipId &&
      !janelaVigente(delegacao.vigencia, entrada.agora) &&
      delegacao.papeis.some((papel) => papeisExigidos.includes(papel))
  );

  const motivo: MotivoDeRecusaDeAutoridade = temPapelEmOutraOrganizacao
    ? 'PAPEL_DE_OUTRA_ORGANIZACAO'
    : temDelegacaoVencida
      ? 'DELEGACAO_VENCIDA'
      : 'SEM_PAPEL_NA_ORGANIZACAO';

  return {
    autorizado: false,
    motivo,
    papeisEfetivos: leitura.papeis,
    explicacao: explicarRecusa(motivo, entrada, papeisExigidos)
  };
}

function explicarRecusa(
  motivo: MotivoDeRecusaDeAutoridade,
  entrada: EntradaDeAutoridade,
  papeisExigidos: readonly string[]
): string {
  switch (motivo) {
    case 'PAPEL_DE_OUTRA_ORGANIZACAO':
      return (
        `Este vínculo tem ${papeisExigidos.join(' ou ')} em outra organização, e não em ` +
        `${entrada.organizationId}. A identidade atravessa organizações; o papel não. ` +
        'Para valer aqui, é preciso delegação explícita de um domínio desta organização.'
      );
    case 'DELEGACAO_VENCIDA':
      return (
        'A delegação que conferia este papel venceu. Ela não se renova por uso, e o vencimento ' +
        'não é falha: é o que distingue delegação de transferência.'
      );
    case 'VISIBILIDADE_COMERCIAL_NAO_E_AUTORIDADE':
      return (
        'O que existe aqui é visibilidade comercial sobre os equipamentos desta organização. ' +
        'Ver frota, saúde e chamados não confere nenhum papel assistencial ou de aprovação.'
      );
    default:
      return (
        `Nenhum domínio de autoridade de ${entrada.organizationId} inclui este vínculo com ` +
        `${papeisExigidos.join(' ou ')}.`
      );
  }
}

/**
 * O isolamento entre tenants, verificável.
 *
 * Devolve as organizações que o tenant vê e NÃO deveria ver — sempre vazio num
 * sistema correto, e é por isso que a função existe: um invariante que só
 * aparece em teste não protege produção. O ciclo pode chamá-la e registrar o
 * achado na cadeia.
 */
export function vazamentoDeVisibilidade(
  tenant: Tenant,
  organizacoesContratadas: readonly string[]
): readonly string[] {
  const contratadas = new Set(organizacoesContratadas);
  return tenant.organizacoesAtendidas.filter((organizationId) => !contratadas.has(organizationId));
}

/**
 * A conferência federada, em memória — para bancada e piloto.
 *
 * Satisfaz estruturalmente a `ConferenciaDeAutoridadeFederada` da mesa de
 * intervenção sem importá-la, e a ausência do import é deliberada: a seta vai
 * de `intervencao.ts` para cá, e importar de volta fecharia um ciclo entre dois
 * módulos da mesma camada. Tipagem estrutural resolve isso sem truque.
 *
 * Em produção, quem implementa é o host — é ele que sabe quais domínios de
 * autoridade existem e quem assinou cada delegação, pela mesma razão que a
 * `AutoridadeDoHost` não vive aqui.
 */
export class ConferenciaFederadaEmMemoria {
  constructor(
    private readonly dominios: readonly DominioDeAutoridade[],
    private readonly delegacoes: readonly DelegacaoDeAutoridade[] = []
  ) {}

  papelVale(params: {
    relationshipId: string;
    organizationId: string;
    papel: string;
    agora: Date;
    unidadeId?: string;
  }): VerdictoDeAutoridadeFederada {
    return podeDecidirNaOrganizacao(
      {
        relationshipId: params.relationshipId,
        organizationId: params.organizationId,
        unidadeId: params.unidadeId,
        dominios: this.dominios,
        delegacoes: this.delegacoes,
        agora: params.agora
      },
      [params.papel]
    );
  }
}
