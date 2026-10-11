// ---------------------------------------------------------------------------
// INCIDENTE FÍSICO PROJETADO — o que o Health Score precisa saber
//
// O incidente inteiro vive na governança (`governanca/intervencao.ts`), com
// observações, avaliação, critério e autorização. Nada disso cabe num
// indicador, e a razão é de camada: `observability-assurance` lê `dominio/` e
// `physical-state-reconciliation`, nunca `governanca/`. Inverter essa seta
// deixaria o painel dependente do módulo que decide, que é o acoplamento que o
// ADR-0003 separa.
//
// Dos cinco campos abaixo, `papeisEncaminhados` é o que carrega o achado: um
// incidente aberto com a lista vazia é um incidente que não chamou ninguém. É a
// sétima aparição do D-022 neste repositório — e a primeira em que o defeito
// entra no número desde o início, em vez de ser descoberto depois.
// ---------------------------------------------------------------------------

import { NivelDeRisco } from './risco';

export interface IncidenteFisicoProjetado {
  incidenteId: string;
  sistemaId: string;
  /** Zona em que o sistema está. Ausente = não localizado na hierarquia. */
  zonaId?: string;
  severidade: NivelDeRisco;
  /** Vazio = ninguém foi chamado para este incidente. */
  papeisEncaminhados: readonly string[];
  /** O incidente ainda está em aberto no instante do cálculo? */
  emAberto: boolean;
}

/**
 * A porta do host para os incidentes físicos em aberto.
 *
 * Quem mantém observação, avaliação e incidente é a governança
 * (`governanca/intervencao.ts`); quem os projeta para o painel é ela também.
 * Esta interface mora aqui porque é o ciclo que a consome e o painel que a lê,
 * e nenhum dos dois pode depender de `governanca/` sem inverter a seta.
 *
 * Ausente significa que a instalação não tem o módulo de incidentes ligado — e
 * isso NÃO é zero incidente: é ausência de leitura, e o relatório do ciclo diz
 * qual das duas coisas aconteceu.
 */
export interface ConsultaDeIncidentesFisicos {
  projetarParaAssurance(agora: Date): readonly IncidenteFisicoProjetado[];
}

export const SEM_INCIDENTES_FISICOS: ConsultaDeIncidentesFisicos = Object.freeze({
  projetarParaAssurance(): readonly IncidenteFisicoProjetado[] {
    return [];
  }
});
