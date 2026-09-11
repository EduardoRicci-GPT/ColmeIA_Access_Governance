// ---------------------------------------------------------------------------
// REPOSITÓRIOS EM MEMÓRIA
//
// Mesma disciplina do ledger da Aletheia: a suíte de conformidade é escrita
// contra a PORTA, não contra a implementação, e a implementação de memória
// existe para que a porta seja exercitada antes de existir banco.
//
// O `esquema.sql` ao lado declara o alvo relacional. Quando ele for
// implementado, é esta interface que ele precisa satisfazer — e os testes que
// hoje rodam contra memória rodarão contra Postgres sem alteração.
// ---------------------------------------------------------------------------

import { Entitlement } from '../dominio/entitlement';
import { EventoDeDominio } from '../dominio/eventos';
import { RegistroDeAcesso, SyncAttempt, SyncJob } from './modelo';

export interface RepositorioDeRegistrosDeAcesso {
  obter(credentialId: string): RegistroDeAcesso | undefined;
  salvar(registro: RegistroDeAcesso): void;
  porEndpoint(endpointId: string): readonly RegistroDeAcesso[];
  todos(): readonly RegistroDeAcesso[];
}

export interface RepositorioDeEntitlements {
  obter(id: string): Entitlement | undefined;
  salvar(entitlement: Entitlement): void;
  vigentes(): readonly Entitlement[];
  todos(): readonly Entitlement[];
}

export interface RepositorioDeSyncJobs {
  criar(job: SyncJob): void;
  atualizar(job: SyncJob): void;
  obter(id: string): SyncJob | undefined;
  porChaveDeIdempotencia(chave: string): SyncJob | undefined;
  pendentes(): readonly SyncJob[];
  todos(): readonly SyncJob[];
  registrarTentativa(tentativa: SyncAttempt): void;
  tentativasDe(syncJobId: string): readonly SyncAttempt[];
}

export class RegistrosDeAcessoEmMemoria implements RepositorioDeRegistrosDeAcesso {
  private readonly dados = new Map<string, RegistroDeAcesso>();

  obter(credentialId: string): RegistroDeAcesso | undefined {
    return this.dados.get(credentialId);
  }

  salvar(registro: RegistroDeAcesso): void {
    this.dados.set(registro.credentialId, registro);
  }

  porEndpoint(endpointId: string): readonly RegistroDeAcesso[] {
    return [...this.dados.values()].filter((registro) => registro.endpointId === endpointId);
  }

  todos(): readonly RegistroDeAcesso[] {
    return [...this.dados.values()].sort((a, b) => a.credentialId.localeCompare(b.credentialId));
  }
}

export class EntitlementsEmMemoria implements RepositorioDeEntitlements {
  private readonly dados = new Map<string, Entitlement>();

  obter(id: string): Entitlement | undefined {
    return this.dados.get(id);
  }

  salvar(entitlement: Entitlement): void {
    this.dados.set(entitlement.id, entitlement);
  }

  vigentes(): readonly Entitlement[] {
    return [...this.dados.values()].filter((direito) => !direito.revogadoEm);
  }

  todos(): readonly Entitlement[] {
    return [...this.dados.values()];
  }
}

export class SyncJobsEmMemoria implements RepositorioDeSyncJobs {
  private readonly jobs = new Map<string, SyncJob>();
  private readonly porChave = new Map<string, string>();
  private readonly tentativas = new Map<string, SyncAttempt[]>();

  criar(job: SyncJob): void {
    this.jobs.set(job.id, job);
    this.porChave.set(job.idempotencyKey, job.id);
  }

  atualizar(job: SyncJob): void {
    this.jobs.set(job.id, job);
  }

  obter(id: string): SyncJob | undefined {
    return this.jobs.get(id);
  }

  porChaveDeIdempotencia(chave: string): SyncJob | undefined {
    const id = this.porChave.get(chave);
    return id ? this.jobs.get(id) : undefined;
  }

  pendentes(): readonly SyncJob[] {
    return [...this.jobs.values()].filter(
      (job) => job.estado === 'QUEUED' || job.estado === 'RUNNING' || job.estado === 'FAILED'
    );
  }

  todos(): readonly SyncJob[] {
    return [...this.jobs.values()];
  }

  registrarTentativa(tentativa: SyncAttempt): void {
    const lista = this.tentativas.get(tentativa.syncJobId) ?? [];
    lista.push(tentativa);
    this.tentativas.set(tentativa.syncJobId, lista);
  }

  tentativasDe(syncJobId: string): readonly SyncAttempt[] {
    return this.tentativas.get(syncJobId) ?? [];
  }
}

/** Índice de eventos por correlação — a base da timeline de auditoria. */
export class IndiceDeAuditoria {
  private readonly porCorrelacao = new Map<string, EventoDeDominio[]>();

  indexar(evento: EventoDeDominio): void {
    const chave = evento.correlationId ?? evento.entitlementId ?? evento.endpointId ?? 'sem-correlacao';
    const lista = this.porCorrelacao.get(chave) ?? [];
    lista.push(evento);
    this.porCorrelacao.set(chave, lista);
  }

  trilha(chave: string): readonly EventoDeDominio[] {
    return [...(this.porCorrelacao.get(chave) ?? [])].sort(
      (a, b) => a.ocorridoEm.getTime() - b.ocorridoEm.getTime()
    );
  }

  chaves(): readonly string[] {
    return [...this.porCorrelacao.keys()];
  }
}
