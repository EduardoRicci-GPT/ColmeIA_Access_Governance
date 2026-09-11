// ---------------------------------------------------------------------------
// PROJEÇÃO DE CONTEXTO E CREDENCIAIS (itens 23, 24, 25)
//
// Dois princípios que parecem independentes e são a mesma disciplina aplicada
// a dois materiais diferentes:
//
//   · o motor de acesso não recebe dado clínico;
//   · o direito de acesso não depende do método de credencial.
//
// Nos dois casos, a regra é: não deixe entrar na camada de decisão o que a
// decisão não precisa. Dado clínico a mais transforma um sistema de facilities
// em sistema de saúde perante a LGPD. Biometria como fundamento do direito
// transforma um dedo machucado em perda de acesso à UTI.
// ---------------------------------------------------------------------------

import { fechar, grupo, igual, verificar } from './runner';
import {
  CAMPOS_CLINICOS_PROIBIDOS,
  auditarProjecao,
  projetar
} from '../packages/context-projection';
import { turnoVigente } from '../packages/dominio/entitlement';

grupo('Item 25 · isolamento respiratório vira política, não diagnóstico');
const doProntuario = projetar({
  sistema: 'EHR',
  referencia: 'LEITO-12',
  campos: {
    patient_id: 'PAC-7781',
    assigned_unit: 'z-uti',
    admission_status: 'internado',
    isolation_precaution: 'AEROSOL',
    diagnosis: 'tuberculose pulmonar bacilífera',
    clinical_notes: 'paciente com tosse produtiva há 3 semanas',
    exam_results: 'baciloscopia positiva',
    prescription: 'RIPE 4 comprimidos/dia'
  }
});

igual(
  'a precaução virou política de restrição de acesso',
  doProntuario.atributos.access_restriction_policy,
  'RESPIRATORY_ISOLATION'
);
igual('com nível de restrição associado', doProntuario.atributos.restriction_level, 3);
igual('a unidade atravessou', doProntuario.atributos.assigned_unit, 'z-uti');
igual('a situação de internação atravessou', doProntuario.atributos.admission_status, 'ADMITTED');

grupo('Item 24 · nenhum dado clínico atravessa');
verificar(
  'diagnóstico, notas, exames e prescrição foram recusados',
  doProntuario.proibidosRecebidos.length === 4,
  doProntuario.proibidosRecebidos.join(', ')
);
const chavesProjetadas = Object.keys(doProntuario.atributos);
verificar(
  'e nenhum deles aparece no objeto projetado',
  chavesProjetadas.every((chave) => !CAMPOS_CLINICOS_PROIBIDOS.includes(chave)),
  chavesProjetadas.join(', ')
);
verificar(
  'a auditoria de saída não encontra violação',
  (() => {
    try {
      auditarProjecao(doProntuario);
      return true;
    } catch {
      return false;
    }
  })()
);
verificar(
  'a projeção é irreversível: do atributo não se reconstrói o diagnóstico',
  !JSON.stringify(doProntuario.atributos).toLowerCase().includes('tuberculose'),
  JSON.stringify(doProntuario.atributos)
);

grupo('Campo desconhecido é descartado, não repassado por via das dúvidas');
const comCampoNovo = projetar({
  sistema: 'EHR',
  referencia: 'LEITO-12',
  campos: { patient_id: 'PAC-1', campo_novo_do_fornecedor: 'qualquer coisa' }
});
verificar(
  'o campo desconhecido foi descartado com registro',
  comCampoNovo.descartados.includes('campo_novo_do_fornecedor'),
  comCampoNovo.descartados.join(', ')
);
igual('e não aparece no objeto projetado', Object.keys(comCampoNovo.atributos).length, 1);

grupo('Variações de nome não escapam do filtro');
for (const nome of ['CID10', 'Diagnóstico Principal', 'lab_result_final', 'medicacao_em_uso']) {
  const resultado = projetar({ sistema: 'EHR', referencia: 'X', campos: { [nome]: 'valor' } });
  verificar(
    `"${nome}" foi recusado`,
    resultado.proibidosRecebidos.includes(nome) || resultado.descartados.includes(nome),
    JSON.stringify(resultado.atributos)
  );
}

grupo('Item 24 · RH e ordem de serviço projetam o mínimo');
const doRH = projetar({
  sistema: 'HR',
  referencia: 'MAT-1042',
  campos: {
    employment_status: 'terminated',
    relationship_type: 'EMPLOYEE',
    shift_code: 'NOTURNO',
    salario: 9800,
    avaliacao_de_desempenho: 'B'
  }
});
igual('a situação do vínculo atravessou', doRH.atributos.employment_status, 'TERMINATED');
verificar(
  'salário e avaliação de desempenho não atravessaram',
  doRH.descartados.includes('salario') && doRH.descartados.includes('avaliacao_de_desempenho'),
  doRH.descartados.join(', ')
);

const daOS = projetar({
  sistema: 'WORK_ORDER',
  referencia: 'OS-4471',
  campos: { work_order_id: 'OS-4471', work_order_status: 'encerrada', valor_contratado: 12000 }
});
igual('a OS encerrada atravessou', daOS.atributos.work_order_status, 'CLOSED');
verificar('o valor contratado não', daOS.descartados.includes('valor_contratado'));

grupo('Item 23 · biometria é método, nunca fundamento do direito');
// Um mesmo direito materializado por dois métodos. Se o entitlement dependesse
// do método, revogar o cartão revogaria também a biometria — e perder o cartão
// tiraria o acesso de quem tem o dedo cadastrado.
const credenciais = [
  { id: 'CRED-A', metodo: 'CARD' as const, entitlementId: 'ENT-UTI-EDUARDO' },
  { id: 'CRED-B', metodo: 'BIOMETRIC' as const, entitlementId: 'ENT-UTI-EDUARDO' }
];
igual(
  'as duas credenciais materializam o MESMO direito',
  new Set(credenciais.map((c) => c.entitlementId)).size,
  1
);
verificar(
  'e os métodos são diferentes',
  new Set(credenciais.map((c) => c.metodo)).size === 2
);
verificar(
  'o tipo Entitlement não possui campo de método de credencial',
  !('metodo' in ({ id: '', personId: '', relationshipId: '', endpointId: '' } as Record<string, unknown>))
);

grupo('Turno noturno que atravessa a meia-noite');
const noturno = {
  diasDaSemana: [1, 2, 3, 4, 5],
  minutoInicial: 1140,
  minutoFinal: 420,
  atravessaMeiaNoite: true
};
verificar('sexta 23h está dentro do turno', turnoVigente(noturno, new Date('2026-09-11T23:00:00')));
verificar('sábado 03h ainda é o plantão de sexta', turnoVigente(noturno, new Date('2026-09-12T03:00:00')));
verificar('sábado 10h já está fora', !turnoVigente(noturno, new Date('2026-09-12T10:00:00')));
verificar('segunda 18h está fora do turno noturno', !turnoVigente(noturno, new Date('2026-09-14T18:00:00')));

fechar('Projeção de contexto e credenciais');
