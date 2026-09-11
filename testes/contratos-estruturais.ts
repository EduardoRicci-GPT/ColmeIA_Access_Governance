// ---------------------------------------------------------------------------
// CONTRATOS ESTRUTURAIS DO MPE-H APLICADOS AO ACESSO
//
// Três coisas são verificadas aqui, e a terceira é a que prova que o porte é
// honesto:
//
//   1. Filtro Zero — a pré-condição que obriga a perguntar quem é afetado.
//   2. O Freio — o risco de FALTAR direito numa zona de cuidado, que é o erro
//      simétrico ao que o resto do sistema persegue.
//   3. Guardrail estrutural — porte com PROVA DIFERENCIAL contra a origem na
//      Aletheia. Mesmo corpus, mesma saída, ou o teste quebra.
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fechar, grupo, igual, verificar } from './runner';
import {
  auditarEstrutura,
  avaliarAcao,
  avaliarLoteDeAcesso,
  combinarCanais,
  montarCobertura,
  normalizar,
  verificarFiltroZero,
  zonaDeCuidado
} from '../packages/contratos-estruturais';
import { montarBancada, tick } from './bancada';

grupo('Filtro Zero · pré-condição, não etapa');
igual('sem declaração, não passa', verificarFiltroZero(null).respondido, false);
verificar(
  'e diz o que faltou',
  verificarFiltroZero(null).falta?.includes('quem é afetado') === true
);
igual(
  'lista sem necessidade declarada não passa',
  verificarFiltroZero({ pessoas: ['p-1'], necessidade: '  ' }).respondido,
  false
);
igual(
  'lista vazia não passa',
  verificarFiltroZero({ pessoas: [], zonas: [], necessidade: 'entrar' }).respondido,
  false
);
verificar(
  'declaração completa passa',
  verificarFiltroZero({ pessoas: ['p-1'], zonas: ['z-uti'], necessidade: 'assistir o paciente' }).respondido
);

grupo('Zona de cuidado: o mesmo dado servindo a dois medos opostos');
verificar('UTI (HIGH) é zona de cuidado', zonaDeCuidado('HIGH'));
verificar('cofre (CRITICAL) é zona de cuidado', zonaDeCuidado('CRITICAL'));
verificar('copa (LOW) não é', !zonaDeCuidado('LOW'));

grupo('O Freio · fail-closed sobre ausência de avaliação');
igual(
  'risco não avaliado não autoriza',
  avaliarAcao({ riscoDeDorFisica: null, riscoDeDorEmocional: null }).decisao,
  'nao_avaliada'
);
verificar(
  'e transfere ao humano',
  avaliarAcao({ riscoDeDorFisica: null, riscoDeDorEmocional: null }).transfereParaHumano
);
igual(
  'risco físico freia',
  avaliarAcao({ riscoDeDorFisica: true, riscoDeDorEmocional: false }).decisao,
  'freia'
);
igual(
  'sem risco, segue',
  avaliarAcao({ riscoDeDorFisica: false, riscoDeDorEmocional: false }).decisao,
  'segue'
);
{
  const comInstinto = avaliarAcao({
    riscoDeDorFisica: false,
    riscoDeDorEmocional: false,
    sinalDeInstinto: true
  });
  igual('instinto NÃO freia', comInstinto.decisao, 'segue');
  verificar('mas acompanha como aviso', comInstinto.motivo.includes('instinto'), comInstinto.motivo);
}

grupo('O Freio no lote · a UTI que ficaria sem ninguém');
{
  const filtroZero = verificarFiltroZero({
    pessoas: ['p-eduardo'],
    zonas: ['z-uti'],
    necessidade: 'assistir os pacientes internados'
  });
  const semNinguem = avaliarLoteDeAcesso({
    filtroZero,
    cobertura: [
      montarCobertura({ zonaId: 'z-uti', nome: 'UTI Adulto', criticidade: 'HIGH', antes: 1, depois: 0 }),
      montarCobertura({ zonaId: 'z-admin', nome: 'Administrativo', criticidade: 'LOW', antes: 3, depois: 0 })
    ]
  });
  igual('o freio dispara', semNinguem.decisao, 'freia');
  igual('só a zona de cuidado conta', semNinguem.zonasDescobertas.length, 1);
  igual('e é a UTI', semNinguem.zonasDescobertas[0]?.zonaId, 'z-uti');
  verificar(
    'a REVOGAÇÃO SEGUE — segurá-la seria a falha oposta',
    semNinguem.revogacaoProssegue,
    semNinguem.motivo
  );
  verificar(
    'e o que se transfere é a decisão sobre a escala',
    semNinguem.motivo.includes('quem responde pela escala'),
    semNinguem.motivo
  );
}
{
  const semZonaVazia = avaliarLoteDeAcesso({
    filtroZero: verificarFiltroZero({ pessoas: ['p-1'], zonas: ['z-uti'], necessidade: 'entrar' }),
    cobertura: [montarCobertura({ zonaId: 'z-uti', nome: 'UTI', criticidade: 'HIGH', antes: 4, depois: 3 })]
  });
  igual('sem zona vazia, segue', semZonaVazia.decisao, 'segue');
  igual('e nada a escalar', semZonaVazia.zonasDescobertas.length, 0);
}
{
  const semFiltro = avaliarLoteDeAcesso({ filtroZero: verificarFiltroZero(null), cobertura: [] });
  igual('sem Filtro Zero, não avaliada', semFiltro.decisao, 'nao_avaliada');
  verificar('mas a revogação ainda segue', semFiltro.revogacaoProssegue);
}

grupo('Guardrail estrutural · lê a relação, não a palavra');
{
  // Os padrões do canal são os da origem, e as frases abaixo foram escritas
  // contra eles — a primeira versão deste teste usava paráfrases e falhava,
  // enquanto o diferencial passava: sinal de que o defeito era da expectativa,
  // não do porte.
  const coercao = auditarEstrutura(
    'Cumpra a determinação de liberar o acesso. O profissional não pode recusar. ' +
      'Esta regra vale para todos, exceto a direção.'
  );
  verificar('reconhece recusa proibida', coercao.sinais.includes('REFUSAL_PROHIBITED'), coercao.sinais.join(','));
  verificar(
    'reconhece autoisenção de quem decide',
    coercao.sinais.includes('DECIDER_SELF_EXEMPTION'),
    coercao.sinais.join(',')
  );
  verificar(
    'e a combinação de ordem com recusa proibida',
    coercao.sinais.includes('DIRECTIVE_WITH_SANCTION_OR_NO_REFUSAL'),
    coercao.sinais.join(',')
  );
  verificar('exige revisão humana', coercao.exigeRevisaoHumana);
  igual('e NÃO produz número', coercao.scoreNumerico, null);

  const sancionado = auditarEstrutura(
    'Quem discordar da liberação perderá o acesso ao sistema.'
  );
  verificar(
    'reconhece dissenso sancionado',
    sancionado.sinais.includes('SANCTIONED_DISSENT'),
    sancionado.sinais.join(',')
  );

  const protecao = auditarEstrutura(
    'Para sua segurança, cumpra o procedimento: as alternativas não serão apresentadas.'
  );
  verificar(
    'reconhece proteção justificando restrição',
    protecao.sinais.includes('PROTECTION_JUSTIFIES_CONSTRAINT'),
    protecao.sinais.join(',')
  );
  verificar(
    'e escolha constrangida',
    protecao.sinais.includes('CONSTRAINED_CHOICE'),
    protecao.sinais.join(',')
  );
}
{
  const comSalvaguarda = auditarEstrutura(
    'O profissional pode recusar sem punição. As alternativas foram apresentadas. ' +
      'Há revisão independente antes de qualquer liberação.'
  );
  verificar(
    'reconhece recusa livre',
    comSalvaguarda.salvaguardas.includes('FREE_REFUSAL_WITHOUT_PENALTY'),
    comSalvaguarda.salvaguardas.join(',')
  );
  verificar('reconhece revisão independente', comSalvaguarda.salvaguardas.includes('INDEPENDENT_REVIEW'));
  verificar('e não exige revisão humana', !comSalvaguarda.exigeRevisaoHumana);
}
// ACHADO SOBRE A ORIGEM, registrado e não corrigido aqui.
//
// `FREE_REFUSAL` casa "sem punição" e "without penalty", e NÃO casa
// "sem penalidade" — que, em português institucional brasileiro, é ao menos tão
// comum quanto a primeira. Um regulamento hospitalar que diga "o profissional
// pode recusar sem penalidade" perde a salvaguarda e é lido como mais coercivo
// do que é.
//
// Não corrijo no porte: isso quebraria a prova diferencial e a decisão é da
// origem, que presta contas ao `structural_guardrail.py` selado. O teste abaixo
// CONGELA o comportamento atual, para que a lacuna não se perca — e para que,
// quando a origem a corrigir, este teste quebre e alguém saiba por quê.
{
  const comPenalidade = auditarEstrutura('O profissional pode recusar sem penalidade.');
  verificar(
    'LACUNA CONHECIDA: "sem penalidade" não é reconhecido como salvaguarda',
    !comPenalidade.salvaguardas.includes('FREE_REFUSAL_WITHOUT_PENALTY'),
    'se este teste falhou, a origem passou a reconhecer a variante — atualize o porte e remova a ressalva'
  );
  const comPunicao = auditarEstrutura('O profissional pode recusar sem punição.');
  verificar(
    'e "sem punição" é',
    comPunicao.salvaguardas.includes('FREE_REFUSAL_WITHOUT_PENALTY'),
    comPunicao.salvaguardas.join(',')
  );
}

verificar(
  'normalização apanha caractere invisível no meio da palavra',
  normalizar('obe​deça') === 'obedeça',
  normalizar('obe​deça')
);

grupo('Discordância entre canais é dado, não ruído');
{
  const estrutural = auditarEstrutura('Cumpra a ordem: o profissional não pode recusar.');
  const combinado = combinarCanais({
    riskLevel: 'neutro',
    finalFreedomTest: 'MAIS LIVRE',
    i2e: 0,
    estrutural
  });
  verificar(
    'radar neutro com restrição estrutural é nomeado',
    combinado.discordancias.includes('LEGACY_NEUTRAL_WITH_STRUCTURAL_CONSTRAINT'),
    combinado.discordancias.join(',')
  );
  verificar('e a leitura é explicada em português', combinado.leiaAssim.length > 0, combinado.leiaAssim.join(' | '));
  verificar('nenhum canal vence o outro: os dois pedem revisão', combinado.exigeRevisaoHumana);
}

grupo('PROVA DIFERENCIAL do porte contra a origem na Aletheia');
{
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const origem = path.resolve(aqui, '..', '..', 'src', 'services', 'guardrailEstrutural.ts');
  if (!existsSync(origem)) {
    verificar('origem não está neste checkout: diferencial não executado', true, origem);
  } else {
    const daOrigem = await import(origem);
    const corpus = [
      'Cumpra a determinação. O profissional não pode recusar.',
      'Quem discordar perderá o acesso. Esta regra vale para todos, exceto a direção.',
      'O profissional pode recusar sem penalidade e há revisão independente.',
      'Para sua segurança, obedeça: as alternativas não serão apresentadas.',
      'A equipe pode discordar sem punição; as alternativas foram apresentadas.',
      'Aceite o procedimento. Sem direito de recusar. Você tem tempo para decidir.',
      'Acesso concedido conforme escala vigente do plantão noturno.',
      'A liderança revisa sozinha os pedidos de acesso ao cofre.'
    ];
    let iguais = 0;
    const divergentes: string[] = [];
    for (const texto of corpus) {
      const meu = JSON.stringify(auditarEstrutura(texto));
      const dele = JSON.stringify(daOrigem.auditarEstrutura(texto));
      if (meu === dele) iguais += 1;
      else divergentes.push(`"${texto.slice(0, 40)}…"\n        porte : ${meu}\n        origem: ${dele}`);
    }
    igual(`o porte reproduz a origem em ${corpus.length} textos`, iguais, corpus.length);
    verificar('sem divergência', divergentes.length === 0, divergentes.join('\n      '));

    igual(
      'a normalização também é idêntica',
      normalizar('OBE​DEÇA  já'),
      daOrigem.normalizar('OBE​DEÇA  já')
    );
  }
}

grupo('O freio no ciclo completo');
{
  const b = montarBancada();
  await tick(b);
  await tick(b, 3_000);
  // Desligar a farmacêutica esvazia a Farmácia, que é zona de cuidado.
  b.mundo = {
    ...b.mundo,
    vinculos: b.mundo.vinculos.map((v) =>
      v.id === 'vin-marina' ? { ...v, situacao: 'TERMINATED' as const } : v
    )
  };
  const relatorio = await tick(b, 60_000);
  igual('o freio disparou', relatorio.freio.decisao, 'freia');
  verificar(
    'nomeando a Farmácia',
    relatorio.freio.zonasDescobertas.some((z) => z.nome === 'Farmácia'),
    relatorio.freio.zonasDescobertas.map((z) => z.nome).join(', ')
  );
  verificar('e a revogação seguiu mesmo assim', relatorio.freio.revogacaoProssegue);
  verificar(
    'o direito foi de fato revogado',
    relatorio.acoesLogicas.some((a) => a.tipo === 'REVOKE' && a.relationshipId === 'vin-marina')
  );
  const lacuna = b.assurance.casosAbertos().find((c) => c.type === 'COVERAGE_GAP');
  verificar('e a lacuna virou caso escalado', lacuna !== undefined, lacuna?.reason);

  // Reentrância: o mesmo lote não abre um segundo caso.
  const antes = b.assurance.casosAbertos().filter((c) => c.type === 'COVERAGE_GAP').length;
  await tick(b, 60_000);
  const depois = b.assurance.casosAbertos().filter((c) => c.type === 'COVERAGE_GAP').length;
  igual('a lacuna não vira uma fila de casos idênticos', depois, antes);
}

fechar('Contratos estruturais do MPE-H');
