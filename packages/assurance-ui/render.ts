// ---------------------------------------------------------------------------
// RENDERIZADOR DO PAINEL ACCESS ASSURANCE
//
// Produz HTML como STRING, sem tocar em DOM. A razão é a mesma que mantém os
// motores puros: este painel precisa poder ser gerado no servidor (para um
// relatório noturno enviado por e-mail), no navegador (para a tela ao vivo) e
// numa ferramenta de linha de comando (para a bateria de testes). Um
// renderizador que dependesse de `document` só serviria ao segundo caso.
//
// Duas decisões visuais carregam a tese do produto:
//
// 1. INCERTEZA TEM COR PRÓPRIA. `UNKNOWN` não é pintado de vermelho nem de
//    verde: é ardósia. Um estado que o sistema não conhece não é uma
//    gravidade — é uma categoria distinta, e colori-lo como gravidade
//    obrigaria o operador a decidir, no olho, se aquele vermelho é um fato ou
//    uma ignorância.
//
// 2. O SCORE ABRE. Cada cartão é um `<details>`: o número está na superfície,
//    a composição está a um clique. O item 7 exige que nunca haja score sem
//    explicação — aqui a explicação é parte do mesmo elemento, não uma tela
//    separada que alguém pode esquecer de construir.
// ---------------------------------------------------------------------------

import { EscalationCase } from '../dominio/escalonamento';
import { CartaoDeEscopo, ItemDaFila, PainelDeAssurance } from './painel';
import { LinhaDoTempo } from './timeline';

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dataLegivel(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const hora = String(data.getHours()).padStart(2, '0');
  const minuto = String(data.getMinutes()).padStart(2, '0');
  return `${dia}/${mes} ${hora}:${minuto}`;
}

const ESTILO = `
:root{
  /* Tipografia SEM egresso.
     A primeira versão carregava IBM Plex do Google Fonts, e o gate
     NO_UNDECLARED_EGRESS deste repositório a recusou. O gate estava certo, e
     por uma razão que vale para o produto e não só para a Aletheia: um painel
     de garantia de acesso é lido no CPD de um hospital às 3h da manhã,
     possivelmente com a internet caída — que é exatamente a circunstância em
     que ele mais importa. Uma tela que depende de buscar fonte externa para
     ficar legível escolheu a estética errada.
     A pilha abaixo resolve para faces de instrumentação em todo sistema
     moderno, e resolve para ALGUMA coisa legível em qualquer um. */
  --fonte-ui:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  --fonte-dados:ui-monospace,"SF Mono","Cascadia Mono","Roboto Mono",Menlo,Consolas,"Liberation Mono",monospace;
  --ground:#F5F8F8; --surface:#FFFFFF; --surface-2:#EDF2F2;
  --ink:#101E1D; --ink-muted:#5B6E6C; --line:#D7E0DF;
  --accent:#0E6E63; --accent-soft:#DCEAE8;
  --bom:#2F7D4F; --atencao:#A96A00; --critico:#AE2A20; --incerto:#585B78;
  --bom-soft:#E3F0E8; --atencao-soft:#F6EBD8; --critico-soft:#F6E1DF; --incerto-soft:#E6E6EF;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ground:#0C1413; --surface:#141F1E; --surface-2:#1B2827;
    --ink:#E7F0EF; --ink-muted:#93A5A3; --line:#2A3A38;
    --accent:#4FBDAE; --accent-soft:#16302C;
    --bom:#6FC38D; --atencao:#DCA34A; --critico:#E8796D; --incerto:#9FA1C4;
    --bom-soft:#152A1F; --atencao-soft:#2C2416; --critico-soft:#301A18; --incerto-soft:#1E1F2E;
  }
}
:root[data-theme="dark"]{
  --ground:#0C1413; --surface:#141F1E; --surface-2:#1B2827;
  --ink:#E7F0EF; --ink-muted:#93A5A3; --line:#2A3A38;
  --accent:#4FBDAE; --accent-soft:#16302C;
  --bom:#6FC38D; --atencao:#DCA34A; --critico:#E8796D; --incerto:#9FA1C4;
  --bom-soft:#152A1F; --atencao-soft:#2C2416; --critico-soft:#301A18; --incerto-soft:#1E1F2E;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--ground); color:var(--ink);
  font-family:var(--fonte-ui);
  font-size:15px; line-height:1.55;
}
.envelope{max-width:1120px; margin:0 auto; padding:28px 20px 72px}
.tabular{font-variant-numeric:tabular-nums}
.mono{font-family:var(--fonte-dados)}

.cabecalho{display:flex; flex-wrap:wrap; gap:20px; align-items:flex-end; justify-content:space-between;
  padding-bottom:18px; border-bottom:2px solid var(--ink)}
.marca{font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--accent); font-weight:600}
h1{font-size:clamp(26px,4vw,36px); margin:.15em 0 0; font-weight:600; letter-spacing:-.02em; text-wrap:balance}
.carimbo{font-size:12.5px; color:var(--ink-muted)}

.tese{margin:22px 0 0; padding:16px 18px; background:var(--accent-soft); border-left:3px solid var(--accent);
  font-size:15px; max-width:62ch}
.tese strong{font-weight:600}

.ressalva{margin-top:18px; background:var(--incerto-soft); border-left:3px solid var(--incerto);
  padding:14px 16px; font-size:13.5px; color:var(--ink)}
.ressalva summary{cursor:pointer; max-width:72ch}
.ressalva summary:focus-visible{outline:2px solid var(--incerto); outline-offset:2px}
.ressalva ul{margin:12px 0 0; padding-left:18px; display:flex; flex-direction:column; gap:6px}
.ressalva li{font-size:12.5px; color:var(--ink-muted)}

.faixa{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1px;
  background:var(--line); border:1px solid var(--line); margin-top:26px}
.medida{background:var(--surface); padding:14px 16px}
.medida dt{font-size:11px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-muted); font-weight:600}
.medida dd{margin:6px 0 0; font-size:26px; font-weight:600; font-family:var(--fonte-dados)}
.medida .unidade{font-size:12px; color:var(--ink-muted); font-weight:400; margin-left:4px}
.medida.destaque dd{color:var(--accent)}
.medida.incerteza dd{color:var(--incerto)}

h2{font-size:13px; letter-spacing:.12em; text-transform:uppercase; font-weight:600;
  margin:44px 0 4px; color:var(--ink)}
.subtitulo{margin:0 0 16px; font-size:13.5px; color:var(--ink-muted); max-width:64ch}

.colunas{display:grid; grid-template-columns:minmax(0,1fr); gap:34px}
@media (min-width:900px){.colunas{grid-template-columns:minmax(0,340px) minmax(0,1fr)}}

.arvore{display:flex; flex-direction:column; gap:6px}
.escopo{background:var(--surface); border:1px solid var(--line)}
.escopo summary{display:flex; align-items:center; gap:10px; padding:9px 12px; cursor:pointer; list-style:none}
.escopo summary::-webkit-details-marker{display:none}
.escopo summary:focus-visible{outline:2px solid var(--accent); outline-offset:-2px}
.escopo .nome{flex:1; min-width:0; font-size:13.5px; overflow-wrap:anywhere}
.escopo .nivel{font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-muted)}
.escopo .valor{font-family:var(--fonte-dados); font-size:17px; font-weight:600; font-variant-numeric:tabular-nums}
.escopo[data-faixa="BOM"] .valor{color:var(--bom)}
.escopo[data-faixa="ATENCAO"] .valor{color:var(--atencao)}
.escopo[data-faixa="CRITICO"] .valor{color:var(--critico)}
.escopo .composicao{border-top:1px solid var(--line); padding:10px 12px; background:var(--surface-2)}
.escopo .composicao li{font-family:var(--fonte-dados); font-size:12px; list-style:none; padding:2px 0}
.escopo .composicao ul{margin:0; padding:0}
.escopo .composicao .fecha{margin-top:8px; font-family:var(--fonte-ui); font-size:11.5px; color:var(--ink-muted)}
.recuo-1{margin-left:12px} .recuo-2{margin-left:24px} .recuo-3{margin-left:36px} .recuo-4{margin-left:48px}

.fila{display:flex; flex-direction:column; gap:10px}
.ocorrencia{background:var(--surface); border:1px solid var(--line); border-left-width:4px; padding:14px 16px}
.ocorrencia[data-risco="CRITICAL"]{border-left-color:var(--critico)}
.ocorrencia[data-risco="HIGH"]{border-left-color:var(--critico)}
.ocorrencia[data-risco="MEDIUM"]{border-left-color:var(--atencao)}
.ocorrencia[data-risco="LOW"]{border-left-color:var(--ink-muted)}
.ocorrencia header{display:flex; flex-wrap:wrap; gap:8px; align-items:baseline; justify-content:space-between}
.ocorrencia h3{margin:0; font-size:15.5px; font-weight:600}
.selos{display:flex; flex-wrap:wrap; gap:6px; margin-top:10px}
.selo{font-size:11px; letter-spacing:.06em; text-transform:uppercase; font-weight:600; padding:3px 8px; border-radius:2px}
.selo.risco-CRITICAL,.selo.risco-HIGH{background:var(--critico-soft); color:var(--critico)}
.selo.risco-MEDIUM{background:var(--atencao-soft); color:var(--atencao)}
.selo.risco-LOW{background:var(--surface-2); color:var(--ink-muted)}
.selo.conf-CONFIRMED{background:var(--bom-soft); color:var(--bom)}
.selo.conf-PROBABLE{background:var(--atencao-soft); color:var(--atencao)}
.selo.conf-UNKNOWN{background:var(--incerto-soft); color:var(--incerto)}
.selo.acao{background:var(--accent-soft); color:var(--accent)}
.estado{margin:12px 0 0; padding:0; list-style:none; display:flex; flex-direction:column; gap:2px}
.estado li{font-size:13.5px; color:var(--ink)}
.estado li::before{content:"— "; color:var(--ink-muted)}
.porque{margin:10px 0 0; font-size:12px; color:var(--ink-muted); font-family:var(--fonte-dados)}

.resumos{display:flex; flex-direction:column; gap:8px; margin:0; padding:0; list-style:none}
.resumos li{background:var(--surface); border:1px solid var(--line); padding:12px 14px; font-size:14.5px}
.resumos .sem-causa{color:var(--ink-muted); font-size:12.5px; display:block; margin-top:4px}

table{width:100%; border-collapse:collapse; font-size:13.5px}
.rolagem{overflow-x:auto; border:1px solid var(--line); background:var(--surface)}
th{text-align:left; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--ink-muted);
  padding:10px 12px; border-bottom:1px solid var(--line); white-space:nowrap}
td{padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:top}
tr:last-child td{border-bottom:none}

.linhadotempo{margin:0; padding:0; list-style:none; border-left:2px solid var(--line); margin-left:8px}
.linhadotempo li{position:relative; padding:0 0 16px 20px}
.linhadotempo li::before{content:""; position:absolute; left:-5px; top:7px; width:8px; height:8px;
  background:var(--surface); border:2px solid var(--accent); border-radius:50%}
.linhadotempo li[data-abre="1"]::before{border-color:var(--critico); background:var(--critico)}
.linhadotempo li[data-fecha="1"]::before{border-color:var(--bom); background:var(--bom)}
.linhadotempo .hora{font-family:var(--fonte-dados); font-size:12.5px; color:var(--ink-muted)}
.linhadotempo .rotulo{font-weight:600; font-size:14px}
.linhadotempo .detalhe{font-size:13px; color:var(--ink-muted)}
.selo-cadeia{margin-top:12px; font-size:12.5px; color:var(--ink-muted); font-family:var(--fonte-dados)}
.janela{margin-top:10px; padding:10px 12px; background:var(--critico-soft); color:var(--critico); font-size:13.5px}
.janela.fechada{background:var(--surface-2); color:var(--ink)}

.rodape{margin-top:56px; padding-top:18px; border-top:1px solid var(--line); font-size:12.5px; color:var(--ink-muted); max-width:70ch}
.vazio{padding:16px; background:var(--surface); border:1px dashed var(--line); color:var(--ink-muted); font-size:13.5px}
`;

function cartaoHtml(cartao: CartaoDeEscopo, profundidade: number, aberto: boolean): string {
  const recuo = profundidade > 0 ? ` recuo-${Math.min(profundidade, 4)}` : '';
  const componentes =
    cartao.componentes.length === 0
      ? '<li>Sem penalidades: nenhum componente reduz este score.</li>'
      : cartao.componentes.map((item) => `<li>${escapar(item.detalhe)}</li>`).join('');
  return `
    <details class="escopo${recuo}" data-faixa="${cartao.faixa}"${aberto ? ' open' : ''}>
      <summary>
        <span class="nome">${escapar(cartao.nome)}<br><span class="nivel">${cartao.nivel}</span></span>
        <span class="valor">${cartao.score}</span>
      </summary>
      <div class="composicao">
        <ul>${componentes}</ul>
        <p class="fecha">100 − ${cartao.somaDasPenalidades} = ${cartao.score}. Toda penalidade acima é um fato apurado, com evidência associada.</p>
      </div>
    </details>`;
}

function ocorrenciaHtml(item: ItemDaFila): string {
  return `
    <article class="ocorrencia" data-risco="${item.risco}">
      <header>
        <h3>${escapar(item.nomeDoEndpoint)}</h3>
        <span class="mono" style="font-size:12px;color:var(--ink-muted)">${escapar(item.zonaId)}</span>
      </header>
      <div class="selos">
        <span class="selo risco-${item.risco}">risco ${item.risco}</span>
        <span class="selo conf-${item.confianca}">leitura ${item.confianca}</span>
        <span class="selo acao">ação ${item.acao}</span>
        ${item.minutosEmAberto === null ? '' : `<span class="selo risco-LOW">${Math.round(item.minutosEmAberto)} min em aberto</span>`}
      </div>
      <ul class="estado">${item.linhas.map((linha) => `<li>${escapar(linha)}</li>`).join('')}</ul>
      <p class="porque">${escapar(item.fatoresDeRisco.join(' · '))}</p>
    </article>`;
}

function casoHtml(caso: EscalationCase): string {
  return `
    <tr>
      <td class="mono">${escapar(caso.id)}</td>
      <td>${escapar(caso.type)}</td>
      <td><span class="selo risco-${caso.severity}">${caso.severity}</span></td>
      <td>${escapar(caso.endpointId ?? '—')}</td>
      <td>${escapar(caso.reason)}</td>
      <td class="mono tabular">${dataLegivel(caso.createdAt)}</td>
    </tr>`;
}

function timelineHtml(linha: LinhaDoTempo): string {
  const selo =
    linha.integridade === undefined
      ? ''
      : `<p class="selo-cadeia">${
          linha.integridade.integra
            ? `Cadeia de auditoria íntegra: ${linha.integridade.total} elo(s) conferidos por hash encadeado.`
            : `CADEIA ROMPIDA na sequência ${linha.integridade.rompeuNaSequencia}: ${escapar(linha.integridade.motivo ?? '')}`
        }</p>`;
  const entradas = linha.entradas
    .map((entrada) => {
      const abre = entrada.tipo === 'PhysicalSyncPending' || entrada.tipo === 'PhysicalRevocationRequested';
      const fecha =
        entrada.tipo === 'PhysicalRevocationConfirmed' || entrada.tipo === 'PhysicalGrantConfirmed';
      return `
      <li data-abre="${abre ? 1 : 0}" data-fecha="${fecha ? 1 : 0}">
        <div class="hora">${entrada.hora} · elo ${entrada.sequencia} · ${entrada.corpo}${entrada.atrasoDeConhecimentoMin > 0 ? ` · soubemos ${entrada.atrasoDeConhecimentoMin} min depois` : ''}</div>
        <div class="rotulo">${escapar(entrada.rotulo)}</div>
        <div class="detalhe">${escapar(entrada.detalhe)}</div>
      </li>`;
    })
    .join('');

  // Uma trilha longa acumula dezenas de janelas curtas de concessão. O que
  // interessa ao auditor são as abertas e as longas — as outras viram contagem.
  const relevantes = [...linha.janelasDeRisco]
    .filter((janela) => janela.fechamentoEm === null || (janela.minutos ?? 0) >= 1)
    .slice(0, 3);
  const omitidas = linha.janelasDeRisco.length - relevantes.length;
  const janelas = relevantes
    .map(
      (janela) =>
        `<p class="janela${janela.fechamentoEm ? ' fechada' : ''}">${
          janela.fechamentoEm
            ? `Janela de risco físico fechada após ${janela.minutos} min.`
            : 'Janela de risco físico AINDA ABERTA.'
        } ${escapar(janela.descricao)}</p>`
    )
    .join('');
  const nota =
    omitidas > 0
      ? `<p class="detalhe" style="font-size:12.5px;color:var(--ink-muted)">Mais ${omitidas} janela(s) de segundos, omitidas por irrelevância operacional.</p>`
      : '';

  return `<section><h3 class="mono" style="font-size:12.5px;color:var(--ink-muted);margin:0 0 12px">${escapar(linha.chave)}</h3><ul class="linhadotempo">${entradas}</ul>${janelas}${nota}${selo}</section>`;
}

export interface OpcoesDeRender {
  /** Documento HTML completo (para arquivo local) ou fragmento (para Artifact). */
  documentoCompleto?: boolean;
  titulo?: string;
}

export function renderizarPainel(painel: PainelDeAssurance, opcoes: OpcoesDeRender = {}): string {
  const titulo = opcoes.titulo ?? 'Access Assurance';

  const profundidadePorId = new Map<string, number>();
  const ordemHierarquica = [...painel.escopos].sort((a, b) => {
    const nivel = ['ORGANIZATION', 'NETWORK', 'FACILITY', 'BUILDING', 'ZONE', 'ENDPOINT'];
    return nivel.indexOf(a.nivel) - nivel.indexOf(b.nivel) || a.score - b.score;
  });
  for (const escopo of ordemHierarquica) {
    const pai = escopo.paiId ? profundidadePorId.get(escopo.paiId) : undefined;
    profundidadePorId.set(escopo.escopoId, pai === undefined ? 0 : pai + 1);
  }

  // A árvore mostra até a ZONA. Os endpoints já aparecem nomeados na fila de
  // risco, e repeti-los aqui — dez, duzentos, oito mil — afogaria justamente a
  // leitura que a hierarquia existe para dar: onde o risco NASCE.
  const naArvore = ordemHierarquica.filter((escopo) => escopo.nivel !== 'ENDPOINT');
  const pior = [...naArvore].sort((a, b) => a.score - b.score)[0];
  const arvore = naArvore
    .map((escopo) =>
      cartaoHtml(escopo, profundidadePorId.get(escopo.escopoId) ?? 0, escopo.escopoId === pior?.escopoId)
    )
    .join('');

  const fila =
    painel.filaDeRisco.length === 0
      ? '<p class="vazio">Nenhuma divergência aberta neste ciclo. Todos os estados desejados têm confirmação física correspondente.</p>'
      : painel.filaDeRisco.map(ocorrenciaHtml).join('');

  const resumos =
    painel.resumo.length === 0
      ? '<li class="vazio">Sem agrupamentos a relatar.</li>'
      : painel.resumo
          .map(
            (linha) =>
              `<li>${escapar(linha.texto)}${linha.causa === null ? '<span class="sem-causa">Causa não atribuível a um fator único — investigação necessária.</span>' : ''}</li>`
          )
          .join('');

  const casos =
    painel.casos.length === 0
      ? '<p class="vazio">Nenhum caso aberto. O automatismo deu conta do ciclo.</p>'
      : `<div class="rolagem"><table>
          <thead><tr><th>Caso</th><th>Tipo</th><th>Severidade</th><th>Endpoint</th><th>Motivo</th><th>Aberto em</th></tr></thead>
          <tbody>${painel.casos.map(casoHtml).join('')}</tbody>
        </table></div>`;

  const timelines =
    painel.timelines.length === 0
      ? '<p class="vazio">Nenhuma trilha selecionada.</p>'
      : painel.timelines.map(timelineHtml).join('');

  const corpo = `
  <div class="envelope">
    <header class="cabecalho">
      <div>
        <p class="marca">ColmeIA · Access Governance</p>
        <h1>${escapar(titulo)}</h1>
      </div>
      <p class="carimbo mono tabular">Ciclo de ${dataLegivel(painel.geradoEm)} · escopo ${escapar(painel.raiz.nome)}</p>
    </header>

    <p class="tese">Esta tela não afirma que portas estão trancadas. Ela declara o que a organização
    <strong>determinou</strong>, o que o equipamento <strong>confirmou</strong>, e a distância entre as duas coisas.
    Onde não há confirmação, ela diz que não sabe — e o quanto isso custa.</p>

    ${
      painel.avisoDeCalibragem === null
        ? ''
        : `<details class="ressalva">
             <summary><strong>Ressalva de calibragem.</strong> ${escapar(painel.avisoDeCalibragem)}</summary>
             <ul>${painel.avisosDeCalibragem.map((aviso) => `<li>${escapar(aviso)}</li>`).join('')}</ul>
           </details>`
    }

    <dl class="faixa">
      <div class="medida destaque"><dt>Health Score</dt><dd>${painel.raiz.score}<span class="unidade">/100</span></dd></div>
      <div class="medida"><dt>Endpoints offline</dt><dd>${painel.raiz.endpointsOffline}</dd></div>
      <div class="medida"><dt>Revogações pendentes</dt><dd>${painel.raiz.revogacoesPendentes}</dd></div>
      <div class="medida incerteza"><dt>Sem evidência física</dt><dd>${painel.incertezas}</dd></div>
      <div class="medida"><dt>Casos abertos</dt><dd>${painel.casos.length}</dd></div>
    </dl>

    <div class="colunas">
      <div>
        <h2>Hierarquia</h2>
        <p class="subtitulo">Cada score é recalculado no seu próprio escopo, sobre os mesmos fatos — não é média dos filhos. Abra um cartão para ver a composição.</p>
        <div class="arvore">${arvore}</div>
      </div>
      <div>
        <h2>Fila por risco</h2>
        <p class="subtitulo">Ordenada por gravidade, nunca por data. Uma revogação crítica de ontem vem antes de um endpoint secundário que caiu agora.</p>
        <div class="fila">${fila}</div>
      </div>
    </div>

    <h2>Leitura agregada</h2>
    <p class="subtitulo">Frases compostas a partir de dados determinísticos. Causa só é atribuída quando é dedutível.</p>
    <ul class="resumos">${resumos}</ul>

    <h2>Escalonamento humano</h2>
    <p class="subtitulo">Onde o automatismo terminou. Cada caso tem severidade determinística e evidência associada.</p>
    ${casos}

    <h2>Timeline de auditoria</h2>
    <p class="subtitulo">O evento aparece no instante em que aconteceu, não no instante em que soubemos. A diferença entre os dois é, ela própria, um indicador.</p>
    ${timelines}

    <p class="rodape">Painel gerado pelos motores Policy · Entitlement Reconciliation · Physical State Reconciliation ·
    Observability &amp; Assurance, sobre o kernel MPE-H (Ledger · HumanGate · Calibration) copiado da Aletheia.
    A auditoria é cadeia encadeada por hash; a aprovação humana é ligada ao conteúdo revisado; os pesos do score
    declaram o próprio estatuto. Provedor em operação: simulado (MockAccessProvider). TTLock, Control iD e Seam
    permanecem em INTERFACE_READY e não produziram nenhum estado nesta tela.</p>
  </div>`;

  const cabeca = `<title>${escapar(titulo)}</title>
<style>${ESTILO}</style>`;

  if (!opcoes.documentoCompleto) return `${cabeca}\n${corpo}`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${cabeca}
</head>
<body>
${corpo}
</body>
</html>`;
}
