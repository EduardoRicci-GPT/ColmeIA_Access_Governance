// ---------------------------------------------------------------------------
// TTLockClient — a fronteira de rede que ainda não existe
//
// Nenhuma URL, nenhum caminho de endpoint, nenhum nome de campo do fabricante
// aparece aqui. Não é omissão: é recusa deliberada a inventar API.
//
// Um cliente com endpoints imaginados seria pior que um cliente ausente. Ele
// compilaria, passaria em teste com mock, entraria em revisão parecendo pronto
// — e só falharia contra o servidor real, depois de a arquitetura inteira já
// ter sido desenhada em cima de um formato que não existe.
//
// O que este arquivo entrega é o CONTRATO do que o cliente precisará: as
// operações, as credenciais exigidas e a pendência que impede cada uma.
// ---------------------------------------------------------------------------

import { IntegracaoNaoDisponivel, StatusDeIntegracao } from '../contrato/tipos';

export interface CredenciaisTTLock {
  /** Identificador da aplicação registrada junto ao fabricante. */
  clientId: string;
  /** Referência ao segredo no cofre — nunca o segredo em si. */
  referenciaDoSegredo: string;
  /** Conta proprietária das fechaduras. */
  contaProprietaria: string;
}

export interface OperacaoDeCliente {
  nome: string;
  descricao: string;
  pendencia: string;
}

/** O mapa do que falta. É a lista de compras da integração, não documentação. */
export const OPERACOES_NECESSARIAS: readonly OperacaoDeCliente[] = Object.freeze([
  {
    nome: 'lockDiscovery',
    descricao: 'Listar as fechaduras da conta e seus identificadores internos.',
    pendencia: 'Confirmar formato de paginação e identificador estável da fechadura.'
  },
  {
    nome: 'lockRegistration',
    descricao: 'Associar uma fechadura física a um endpoint da ColmeIA.',
    pendencia: 'Confirmar se o pareamento exige presença física e aplicativo do fabricante.'
  },
  {
    nome: 'eKeyIssue',
    descricao: 'Emitir eKey com janela temporal para um usuário.',
    pendencia: 'Confirmar limites de janela recorrente e se a eKey exige conta do destinatário.'
  },
  {
    nome: 'passcodeIssue',
    descricao: 'Emitir senha numérica temporária ou permanente.',
    pendencia: 'Confirmar se a senha gerada offline pode ser revogada sem gateway.'
  },
  {
    nome: 'credentialRevoke',
    descricao: 'Revogar eKey ou senha.',
    pendencia: 'Confirmar comportamento da revogação quando o gateway está ausente.'
  },
  {
    nome: 'accessRecords',
    descricao: 'Recuperar registros de acesso da fechadura.',
    pendencia: 'Confirmar granularidade, atraso típico e se há cursor estável.'
  },
  {
    nome: 'lockStatus',
    descricao: 'Consultar bateria, hora do equipamento e última comunicação.',
    pendencia: 'Confirmar se a hora do equipamento é exposta (necessária para desvio de relógio).'
  },
  {
    nome: 'gatewayStatus',
    descricao: 'Consultar disponibilidade do gateway e fechaduras atendidas.',
    pendencia: 'Confirmar se o estado do gateway é consultável de forma independente.'
  }
]);

export class TTLockClient {
  constructor(
    private readonly credenciais: CredenciaisTTLock | null,
    private readonly statusDeIntegracao: StatusDeIntegracao
  ) {}

  temCredenciais(): boolean {
    return this.credenciais !== null;
  }

  recusar(operacao: string): never {
    const pendencia =
      OPERACOES_NECESSARIAS.find((item) => item.nome === operacao)?.pendencia ??
      'Documentação técnica do fabricante ainda não confirmada.';
    throw new IntegracaoNaoDisponivel('TTLOCK', operacao, this.statusDeIntegracao, pendencia);
  }
}
