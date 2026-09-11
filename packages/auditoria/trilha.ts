// ---------------------------------------------------------------------------
// TRILHA DE ACESSO — a auditoria passa a ser cadeia, não lista
//
// A primeira versão deste produto guardava eventos num array ordenado por
// data. Funcionava, e provava nada: um array pode perder um elemento do meio
// sem que nenhuma leitura note. Num sistema cuja razão de existir é dizer
// "quem tinha acesso, até quando e por quê", a linha do tempo que sustenta a
// resposta precisa ser evidência — e evidência é o que resiste a ser
// adulterada em silêncio.
//
// O ledger do MPE-H resolve isso com três garantias que um array não tem:
//
//   · sequência contígua — apanha evento REMOVIDO do meio, que é como se
//     esconde o que foi decidido;
//   · encadeamento por hash — apanha elo religado a outro ponto;
//   · recomputação — apanha conteúdo EDITADO com os hashes mantidos.
//
// E traz uma exigência junto: todo evento declara o CORPO que o originou
// (ADR-0003). Um evento sem corpo não entra. Isso obriga cada motor deste
// produto a dizer, a cada registro, se está decidindo, aconselhando,
// executando ou sendo humano — o que é exatamente a pergunta que uma
// investigação hospitalar faz primeiro.
// ---------------------------------------------------------------------------

import { Ledger } from '../mpeh-kernel/ledger/ledger';
import { ArmazenamentoEmMemoria } from '../mpeh-kernel/ledger/adaptadores/memoria';
import {
  ArmazenamentoDoLedger,
  EventoLedger,
  PedidoDeRegistro,
  VerdictoDeIntegridade
} from '../mpeh-kernel/ledger/tipos';
import { EventoDeDominio, OrigemDeIngestao, TipoDeEvento, DecisionOrigin } from '../dominio/eventos';
import { Relogio } from '../dominio/tempo';
import { CorpoDeOrigem, corpoDoTipo, decisaoMisturouCorpos } from './corpos';

/** Quem assina o registro, por motor. O ledger exige autor; não há anônimo. */
export type AutorDeRegistro =
  | 'policy-engine'
  | 'entitlement-reconciliation'
  | 'physical-state-reconciliation'
  | 'observability-assurance'
  | 'adaptador'
  | 'operador';

export interface OpcoesDaTrilha {
  relogio: Relogio;
  armazenamento?: ArmazenamentoDoLedger<TipoDeEvento>;
  prefixoDeId?: string;
}

/** Converte um evento de domínio em pedido de registro no ledger. */
export function paraPedido(evento: EventoDeDominio, autor: AutorDeRegistro): PedidoDeRegistro<TipoDeEvento> {
  // A precedência aqui importa, e a primeira versão a tinha invertida.
  //
  // O CORPO responde "que tipo de ato é este evento". `decisionOrigin` responde
  // "quem decidiu o que está sendo executado". São perguntas diferentes, e uma
  // ordem física enviada ao provedor prova isso: o ato é EXECUTIVO, embora a
  // decisão que o originou tenha sido da ColmeIA — decisão já registrada, no
  // seu próprio elo, como DIRETIVO.
  //
  // Deixar a origem mandar no corpo faria toda ordem enviada pela ColmeIA
  // aparecer como ato diretivo, e a cadeia perderia justamente a separação que
  // o ADR-0003 existe para preservar: a decisão deixaria de ser conferível
  // antes de virar ato, porque as duas viriam carimbadas iguais.
  //
  // A exceção é o humano: quando uma pessoa age, o ato é dela, qualquer que
  // seja o tipo do evento.
  const corpo: CorpoDeOrigem =
    evento.decisionOrigin === 'MANUAL_OPERATOR' ? 'HUMANO' : corpoDoTipo(evento.tipo);
  return {
    tipo: evento.tipo,
    // "Sobre o que é o evento": a credencial, quando há; senão o endpoint.
    objeto: evento.credentialId ?? evento.endpointId ?? evento.entitlementId ?? evento.organizationId,
    decisao: evento.resumo,
    autor,
    corpo,
    detalhes: {
      eventoId: evento.id,
      ocorridoEm: evento.ocorridoEm.toISOString(),
      origemDeIngestao: evento.origemDeIngestao,
      decisionOrigin: evento.decisionOrigin ?? null,
      // A mistura de corpos é CONTADA, não escondida: a catraca em standalone
      // decide e executa ao mesmo tempo, e a auditoria precisa poder somar
      // quantas vezes isso aconteceu.
      misturouCorpos: decisaoMisturouCorpos(evento.decisionOrigin),
      correlationId: evento.correlationId ?? null,
      idempotencyKey: evento.idempotencyKey ?? null,
      organizationId: evento.organizationId,
      facilityId: evento.facilityId ?? null,
      endpointId: evento.endpointId ?? null,
      gatewayId: evento.gatewayId ?? null,
      providerId: evento.providerId ?? null,
      personId: evento.personId ?? null,
      entitlementId: evento.entitlementId ?? null,
      credentialId: evento.credentialId ?? null,
      dados: evento.dados ?? {}
    }
  };
}

function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

/** Lê o elo de volta como evento de domínio. O ledger é a fonte da verdade. */
export function deElo(elo: EventoLedger<TipoDeEvento>): EventoDeDominio {
  const d = elo.detalhes;
  const ocorrido = texto(d.ocorridoEm) ?? elo.registradoEm;
  return {
    id: texto(d.eventoId) ?? elo.id,
    tipo: elo.tipo,
    ocorridoEm: new Date(ocorrido),
    registradoEm: new Date(elo.registradoEm),
    origemDeIngestao: (texto(d.origemDeIngestao) as OrigemDeIngestao) ?? 'LOCAL_EVENT',
    decisionOrigin: (texto(d.decisionOrigin) as DecisionOrigin) ?? undefined,
    correlationId: texto(d.correlationId),
    idempotencyKey: texto(d.idempotencyKey),
    organizationId: texto(d.organizationId) ?? '',
    facilityId: texto(d.facilityId),
    endpointId: texto(d.endpointId),
    gatewayId: texto(d.gatewayId),
    providerId: texto(d.providerId) as EventoDeDominio['providerId'],
    personId: texto(d.personId),
    entitlementId: texto(d.entitlementId),
    credentialId: texto(d.credentialId),
    dados: (d.dados as Record<string, unknown>) ?? {},
    resumo: elo.decisao
  };
}

/** O elo, com o selo que o torna verificável. */
export interface EloDeAuditoria {
  evento: EventoDeDominio;
  sequencia: number;
  hash: string;
  hashAnterior: string;
  corpo: EventoLedger<TipoDeEvento>['corpo'];
  autor: string;
}

export class TrilhaDeAcesso {
  private readonly ledger: Ledger<TipoDeEvento>;
  private readonly chaves = new Set<string>();
  private duplicatas = 0;

  constructor(opcoes: OpcoesDaTrilha) {
    this.ledger = new Ledger<TipoDeEvento>(
      opcoes.armazenamento ?? new ArmazenamentoEmMemoria<TipoDeEvento>(),
      {
        prefixoDeId: opcoes.prefixoDeId ?? 'ACC',
        // Relógio injetado: cadeia com hash que depende do relógio de parede
        // não é reproduzível, e cadeia não reproduzível não serve de evidência.
        agora: () => opcoes.relogio.agora().toISOString()
      }
    );
  }

  /**
   * Registra um evento. Devolve `null` quando a chave de idempotência já foi
   * vista — duplicata NÃO é erro: webhook reentregue e polling que alcança o
   * mesmo fato são o funcionamento normal (item 38). A absorção é contada,
   * porque o número de duplicatas é sinal de saúde do canal de ingestão.
   *
   * A deduplicação fica FORA do ledger de propósito: o ledger é append-only e
   * não deve conhecer regra de domínio. Filtrar antes preserva a propriedade
   * de que todo elo da cadeia é um fato distinto.
   */
  async registrar(evento: EventoDeDominio, autor: AutorDeRegistro): Promise<EloDeAuditoria | null> {
    const chave = evento.idempotencyKey ?? evento.id;
    if (this.chaves.has(chave)) {
      this.duplicatas += 1;
      return null;
    }
    this.chaves.add(chave);
    const elo = await this.ledger.registrar(paraPedido(evento, autor));
    return {
      evento: deElo(elo),
      sequencia: elo.sequencia,
      hash: elo.thisEventHash,
      hashAnterior: elo.priorEventHash,
      corpo: elo.corpo,
      autor: elo.autor
    };
  }

  async registrarTodos(eventos: readonly EventoDeDominio[], autor: AutorDeRegistro): Promise<number> {
    let aceitos = 0;
    for (const evento of eventos) if (await this.registrar(evento, autor)) aceitos += 1;
    return aceitos;
  }

  async elos(): Promise<readonly EloDeAuditoria[]> {
    const cadeia = await this.ledger.obterCadeia();
    return cadeia.map((elo) => ({
      evento: deElo(elo),
      sequencia: elo.sequencia,
      hash: elo.thisEventHash,
      hashAnterior: elo.priorEventHash,
      corpo: elo.corpo,
      autor: elo.autor
    }));
  }

  async todos(): Promise<readonly EventoDeDominio[]> {
    return (await this.elos()).map((elo) => elo.evento);
  }

  /** Trilha de uma correlação — a sequência que a timeline desenha. */
  async trilhaDe(correlationId: string): Promise<readonly EloDeAuditoria[]> {
    return (await this.elos()).filter((elo) => elo.evento.correlationId === correlationId);
  }

  async porEndpoint(endpointId: string): Promise<readonly EloDeAuditoria[]> {
    return (await this.elos()).filter((elo) => elo.evento.endpointId === endpointId);
  }

  async porPessoa(personId: string): Promise<readonly EloDeAuditoria[]> {
    return (await this.elos()).filter((elo) => elo.evento.personId === personId);
  }

  /** A cadeia continua íntegra? É a pergunta que a tela de auditoria faz. */
  async verificarIntegridade(): Promise<VerdictoDeIntegridade> {
    return this.ledger.verificar();
  }

  /** Quantas vezes um equipamento decidiu sozinho o que a ColmeIA deveria decidir. */
  async misturasDeCorpo(): Promise<number> {
    const cadeia = await this.ledger.obterCadeia();
    return cadeia.filter((elo) => elo.detalhes.misturouCorpos === true).length;
  }

  duplicatasAbsorvidas(): number {
    return this.duplicatas;
  }

  async tamanho(): Promise<number> {
    return (await this.ledger.obterCadeia()).length;
  }
}
