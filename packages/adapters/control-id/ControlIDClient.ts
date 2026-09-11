// ---------------------------------------------------------------------------
// ControlIDClient — fronteira de rede não integrada
//
// Mesma disciplina do cliente TTLock: nenhuma rota, nenhum campo, nenhum verbo
// do fabricante escrito de memória. O que existe é a lista do que precisará
// existir, e o motivo de cada item.
// ---------------------------------------------------------------------------

import { IntegracaoNaoDisponivel, StatusDeIntegracao } from '../contrato/tipos';

export interface CredenciaisControlID {
  /** Endereço do equipamento ou do servidor intermediário, na rede da instituição. */
  referenciaDeHost: string;
  /** Referência ao segredo no cofre — nunca o segredo. */
  referenciaDoSegredo: string;
}

export const OPERACOES_NECESSARIAS: readonly { nome: string; descricao: string; pendencia: string }[] =
  Object.freeze([
    {
      nome: 'userUpsert',
      descricao: 'Criar ou atualizar usuário no equipamento.',
      pendencia: 'Confirmar identificador estável e limite de usuários por equipamento.'
    },
    {
      nome: 'credentialUpsert',
      descricao: 'Vincular cartão, QR, PIN ou biometria ao usuário.',
      pendencia: 'Confirmar se o template biométrico é gerenciável fora do equipamento.'
    },
    {
      nome: 'accessRuleUpsert',
      descricao: 'Definir a regra de acesso (porta, horário, grupo).',
      pendencia: 'Confirmar granularidade da regra e comportamento em turno noturno.'
    },
    {
      nome: 'credentialRevoke',
      descricao: 'Remover credencial ou usuário do equipamento.',
      pendencia: 'Confirmar se a remoção é imediata na base local e se retorna confirmação.'
    },
    {
      nome: 'readLocalBase',
      descricao: 'Ler a base local para reconciliação física.',
      pendencia: 'Confirmar se a leitura integral é permitida e qual o custo operacional.'
    },
    {
      nome: 'eventStream',
      descricao: 'Receber eventos de acesso, online e em lote.',
      pendencia: 'Confirmar se o evento informa que a decisão foi local por timeout.'
    },
    {
      nome: 'onlineDecision',
      descricao: 'Responder ALLOW/DENY ao equipamento no instante do acesso.',
      pendencia: 'Confirmar protocolo, timeout aceito e comportamento padrão na ausência de resposta.'
    }
  ]);

export class ControlIDClient {
  constructor(
    private readonly credenciais: CredenciaisControlID | null,
    private readonly statusDeIntegracao: StatusDeIntegracao
  ) {}

  temCredenciais(): boolean {
    return this.credenciais !== null;
  }

  recusar(operacao: string): never {
    const pendencia =
      OPERACOES_NECESSARIAS.find((item) => item.nome === operacao)?.pendencia ??
      'Documentação técnica do fabricante ainda não confirmada.';
    throw new IntegracaoNaoDisponivel('CONTROL_ID', operacao, this.statusDeIntegracao, pendencia);
  }
}
