// ---------------------------------------------------------------------------
// MODELO DE PERSISTÊNCIA — item 34
//
// O registro central deste produto não é a pessoa nem a porta: é o PAR
// (credencial, endpoint) com seus quatro estados. É esse registro que responde
// à pergunta do item 41, e é por isso que ele — e não uma tabela de permissões
// — fica no centro do esquema.
//
// A consequência de modelagem que segue daí: não existe coluna `has_access`.
// Existem quatro colunas de estado, duas marcas temporais e um histórico de
// tentativas. Uma consulta que queira saber "quem entra na farmácia hoje"
// precisa declarar qual das quatro camadas está perguntando — e essa fricção
// é intencional.
// ---------------------------------------------------------------------------

import { AccessState } from '../dominio/estado';
import { EstadoDeTentativas } from '../dominio/escalonamento';
import { CredentialMethod } from '../dominio/topologia';

export interface RegistroDeAcesso {
  credentialId: string;
  entitlementId: string;
  personId: string;
  endpointId: string;
  metodo: CredentialMethod;
  /** Referência da credencial no fabricante. Ausente até a primeira emissão. */
  referenciaDaCredencial?: string;
  estado: AccessState;
  tentativas: EstadoDeTentativas;
  /** Quando a divergência atual foi detectada pela primeira vez. */
  divergenciaDetectadaEm?: Date;
  atualizadoEm: Date;
}

export type EstadoDoSyncJob = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ESCALATED';

export interface SyncJob {
  id: string;
  tipo: 'GRANT' | 'REVOKE' | 'SYNC';
  endpointId: string;
  credentialId: string;
  entitlementId?: string;
  personId?: string;
  idempotencyKey: string;
  correlationId: string;
  estado: EstadoDoSyncJob;
  criadoEm: Date;
  atualizadoEm: Date;
  tentativas: EstadoDeTentativas;
}

export interface SyncAttempt {
  id: string;
  syncJobId: string;
  numero: number;
  iniciadoEm: Date;
  concluidoEm?: Date;
  resultado: 'ACCEPTED' | 'CONFIRMED' | 'PENDING' | 'FAILED' | 'UNKNOWN';
  mensagem?: string;
  operationId?: string;
}
