// ---------------------------------------------------------------------------
// RELÓGIO — a dependência que nenhum motor pode ler do ambiente
//
// Todo juízo deste sistema é temporal: uma revogação pendente há 4 minutos e
// uma pendente há 4 horas produzem o mesmo estado semântico e riscos
// diferentes. Se os motores lessem `Date.now()` diretamente, o mesmo cenário
// produziria resultados diferentes a cada execução — e um sistema de auditoria
// que não é reprodutível não é auditável.
//
// Por isso o tempo entra por parâmetro, sempre. `RelogioFixo` é o que a
// bateria usa; `relogioDoSistema` é o que a aplicação usa.
// ---------------------------------------------------------------------------

export interface Relogio {
  agora(): Date;
}

export const relogioDoSistema: Relogio = {
  agora: () => new Date()
};

/** Relógio determinístico. Avança apenas quando alguém manda avançar. */
export class RelogioFixo implements Relogio {
  private instante: number;

  constructor(inicio: Date | string) {
    this.instante = typeof inicio === 'string' ? Date.parse(inicio) : inicio.getTime();
  }

  agora(): Date {
    return new Date(this.instante);
  }

  avancarMs(ms: number): Date {
    this.instante += ms;
    return this.agora();
  }

  avancarMinutos(minutos: number): Date {
    return this.avancarMs(minutos * 60_000);
  }

  avancarHoras(horas: number): Date {
    return this.avancarMs(horas * 3_600_000);
  }
}

export function minutosEntre(inicio: Date, fim: Date): number {
  return (fim.getTime() - inicio.getTime()) / 60_000;
}

export function msEntre(inicio: Date, fim: Date): number {
  return fim.getTime() - inicio.getTime();
}

/** Idade em minutos de uma marca temporal opcional. `null` quando nunca houve marca. */
export function idadeEmMinutos(marca: Date | null | undefined, agora: Date): number | null {
  if (!marca) return null;
  return minutosEntre(marca, agora);
}
