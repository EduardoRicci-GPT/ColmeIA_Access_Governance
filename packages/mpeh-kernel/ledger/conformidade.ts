// ---------------------------------------------------------------------------
// SUÍTE DE CONFORMIDADE DA PORTA
//
// Isto é o produto mais importante desta extração, e não o código do ledger.
//
// Não há Postgres nesta máquina — sem psql, sem docker, sem driver `pg`. Eu
// poderia escrever um adaptador de Postgres hoje, e ele não teria sido
// executado uma única vez. Código de banco não testado apresentado como pronto
// é exatamente o gênero de coisa que a Onda 9 encontrou no Prumo do aplicativo:
// parecia uma cadeia de evidência e não era.
//
// A alternativa honesta é esta: em vez do adaptador não verificado, o TESTE que
// o adaptador terá de passar. Quando houver Postgres, roda-se esta mesma suíte
// contra ele; se passar, o adaptador é conforme pela mesma régua que o de
// memória e o de localStorage já passaram. A verificação deixa de ser promessa
// e vira procedimento.
//
// A suíte é parametrizada pela FÁBRICA do armazenamento, e não por uma
// instância, para que cada caso comece com um ledger limpo.
// ---------------------------------------------------------------------------

import { Ledger } from './ledger';
import { verificarCadeia } from './cadeia';
import { ArmazenamentoDoLedger, EventoLedger, SequenciaJaExiste } from './tipos';

export interface ResultadoDeChecagem {
  nome: string;
  passou: boolean;
  detalhe: string;
}

export interface AlvoDeConformidade<T extends string = string> {
  nome: string;
  /** Devolve um armazenamento VAZIO a cada chamada. */
  criar(): Promise<ArmazenamentoDoLedger<T>> | ArmazenamentoDoLedger<T>;
  /**
   * Substitui a cadeia por fora do kernel, simulando adulteração no substrato.
   *
   * Opcional de propósito: um adaptador de produção bem feito NÃO consegue
   * fazer isto — no Postgres o `REVOKE UPDATE, DELETE` impede. Quando ausente,
   * os casos de adulteração são pulados e o relatório diz que foram pulados,
   * em vez de somem em silêncio.
   */
  adulterar?(
    armazenamento: ArmazenamentoDoLedger<T>,
    cadeia: EventoLedger<T>[]
  ): Promise<void> | void;
}

const TIPO = 'leitura_rvep';

/** Roda a suíte inteira contra um alvo. Devolve os resultados, não imprime. */
export async function verificarConformidade(
  alvo: AlvoDeConformidade
): Promise<ResultadoDeChecagem[]> {
  const r: ResultadoDeChecagem[] = [];
  const ok = (nome: string, passou: boolean, detalhe = '') => r.push({ nome, passou, detalhe });

  const novoLedger = async () => {
    const arm = await alvo.criar();
    return { arm, ledger: new Ledger(arm, { prefixoDeId: 'CONF' }) };
  };

  const base = (n: number) => ({
    tipo: TIPO,
    objeto: `objeto ${n}`,
    decisao: `decisão ${n}`,
    autor: 'suíte de conformidade',
    corpo: 'EXECUTIVO' as const
  });

  // ---- cadeia vazia -------------------------------------------------------
  {
    const { ledger } = await novoLedger();
    const v = await ledger.verificar();
    ok('cadeia vazia é íntegra e tem total 0', v.integra && v.total === 0, JSON.stringify(v));
    ok('cadeia vazia não tem topo', (await ledger.topo()) === null);
  }

  // ---- encadeamento -------------------------------------------------------
  {
    const { ledger } = await novoLedger();
    const g = await ledger.registrar(base(0));
    ok('gênese tem sequência 0', g.sequencia === 0, String(g.sequencia));
    ok('gênese não tem elo anterior', g.priorEventHash === '', g.priorEventHash);
    ok('hash tem forma de SHA-256', /^[0-9a-f]{64}$/.test(g.thisEventHash), g.thisEventHash);

    const e1 = await ledger.registrar(base(1));
    ok('segundo elo aponta para o primeiro', e1.priorEventHash === g.thisEventHash);
    ok('sequência avança de um', e1.sequencia === 1, String(e1.sequencia));
    ok('hashes distintos para conteúdos distintos', e1.thisEventHash !== g.thisEventHash);
    ok('topo é o último registrado', (await ledger.topo())?.id === e1.id);

    await ledger.registrar(base(2));
    const v = await ledger.verificar();
    ok('cadeia de três elos é íntegra', v.integra && v.total === 3, JSON.stringify(v));
  }

  // ---- a porta recusa sequência repetida ----------------------------------
  {
    const { arm, ledger } = await novoLedger();
    await ledger.registrar(base(0));
    const cadeia = await arm.ler();
    let lancou = false;
    try {
      await arm.anexar({ ...(cadeia[0] as EventoLedger), id: 'CLONE' });
    } catch (e) {
      lancou = e instanceof SequenciaJaExiste;
    }
    ok('anexar sequência já existente lança SequenciaJaExiste', lancou);
  }

  // ---- concorrência: nenhuma escrita pode sumir ---------------------------
  {
    const { ledger } = await novoLedger();
    const N = 20;
    await Promise.all(Array.from({ length: N }, (_, i) => ledger.registrar(base(i))));
    const cadeia = await ledger.obterCadeia();
    ok(`${N} escritas simultâneas produzem ${N} elos`, cadeia.length === N, String(cadeia.length));
    ok(
      'as sequências ficam contíguas de 0 a N-1',
      cadeia.every((e, i) => e.sequencia === i),
      cadeia.map((e) => e.sequencia).join(',')
    );
    const v = await ledger.verificar();
    ok('a cadeia concorrente é íntegra', v.integra, JSON.stringify(v));
  }

  // ---- adulteração no substrato (só se o alvo permitir) -------------------
  if (alvo.adulterar) {
    const montar = async () => {
      const { arm, ledger } = await novoLedger();
      for (let i = 0; i < 3; i++) await ledger.registrar(base(i));
      return { arm, ledger, cadeia: await ledger.obterCadeia() };
    };

    {
      const { arm, ledger, cadeia } = await montar();
      const alterada = cadeia.map((e) => ({ ...e }));
      (alterada[2] as EventoLedger).decisao = 'decisão trocada depois do registro';
      await alvo.adulterar(arm, alterada);
      const v = await ledger.verificar();
      ok('APANHA conteúdo editado após o registro', !v.integra, JSON.stringify(v));
      ok('e nomeia a alteração', /alterado/i.test(v.motivo ?? ''), v.motivo ?? '');
    }

    {
      const { arm, ledger, cadeia } = await montar();
      const religada = cadeia.map((e) => ({ ...e }));
      (religada[2] as EventoLedger).priorEventHash = (religada[0] as EventoLedger).thisEventHash;
      await alvo.adulterar(arm, religada);
      const v = await ledger.verificar();
      ok('APANHA elo religado a outro ponto', !v.integra, JSON.stringify(v));
      ok('e nomeia o encadeamento', /priorEventHash/i.test(v.motivo ?? ''), v.motivo ?? '');
    }

    {
      const { arm, ledger, cadeia } = await montar();
      const comBuraco = cadeia.filter((_, i) => i !== 1);
      await alvo.adulterar(arm, comBuraco);
      const v = await ledger.verificar();
      ok('APANHA elo removido do meio', !v.integra, JSON.stringify(v));
    }

    {
      const { arm, ledger, cadeia } = await montar();
      const comApendice = [
        ...cadeia.map((e) => ({ ...e })),
        { ...(cadeia[2] as EventoLedger), sequencia: 3, id: 'FORJADO', priorEventHash: 'f'.repeat(64) }
      ];
      await alvo.adulterar(arm, comApendice);
      const v = await ledger.verificar();
      ok('APANHA elo anexado com elo anterior inventado', !v.integra, JSON.stringify(v));
    }

    {
      const { arm, ledger, cadeia } = await montar();
      await alvo.adulterar(arm, cadeia);
      const v = await ledger.verificar();
      ok('restaurada a cadeia original, volta a ser íntegra', v.integra && v.total === 3, JSON.stringify(v));
    }
  } else {
    ok(
      'adulteração no substrato: PULADA — o alvo não permite escrever por fora',
      true,
      'é o comportamento desejado num adaptador de produção'
    );
  }

  // ---- reprodutibilidade por terceiro --------------------------------------
  {
    const { ledger } = await novoLedger();
    for (let i = 0; i < 3; i++) await ledger.registrar(base(i));
    const exportada = JSON.parse(JSON.stringify(await ledger.obterCadeia()));
    const v = await verificarCadeia(exportada);
    ok(
      'a cadeia serializada verifica fora do ledger que a produziu',
      v.integra && v.total === 3,
      JSON.stringify(v)
    );
  }

  // ---- a porta não oferece como apagar -------------------------------------
  {
    const arm = await alvo.criar();
    const superficie = [
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(arm)),
      ...Object.keys(arm as object)
    ];
    const proibidos = superficie.filter((m) =>
      /^(remover|apagar|excluir|editar|atualizar|limpar|delete|update|truncate)/i.test(m)
    );
    ok('o armazenamento não expõe remover/atualizar', proibidos.length === 0, proibidos.join(', '));
  }

  return r;
}
