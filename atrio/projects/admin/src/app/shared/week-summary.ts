import { Weekday } from '@atrio/data';

export const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export const WEEKDAY_SHORT: Readonly<Record<Weekday, string>> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

export interface WeekGroup {
  /** "Seg–Qui", "Sex", "Seg, Qua, Sex". */
  readonly label: string;
  readonly value: string;
  readonly days: readonly Weekday[];
}

/**
 * Comprime dias contíguos: [1,2,3,4] vira "Seg–Qui", [1,3,5] vira
 * "Seg, Qua, Sex". Dois dias seguidos ficam separados por vírgula, porque
 * "Seg–Ter" ocupa o mesmo espaço de "Seg, Ter" e lê pior.
 */
export function daysLabel(days: readonly Weekday[]): string {
  const runs: Weekday[][] = [];

  for (const day of [...days].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && day === last[last.length - 1] + 1) last.push(day);
    else runs.push([day]);
  }

  return runs
    .map((run) =>
      run.length > 2
        ? `${WEEKDAY_SHORT[run[0]]}–${WEEKDAY_SHORT[run[run.length - 1]]}`
        : run.map((day) => WEEKDAY_SHORT[day]).join(', '),
    )
    .join(', ');
}

/**
 * Agrupa a semana por valores iguais.
 *
 * `describe` devolve o texto do dia, ou null quando não há nada a mostrar
 * (folga, loja fechada). Serve tanto para a jornada de um profissional quanto
 * para o horário da barbearia inteira — em ambos os casos a pergunta é a
 * mesma: quais dias têm o mesmo horário?
 *
 * A ordem da semana é preservada para "Seg–Qui" sair contíguo.
 */
export function groupWeek(describe: (day: Weekday) => string | null): WeekGroup[] {
  const groups: { value: string; days: Weekday[] }[] = [];

  for (const day of WEEKDAYS) {
    const value = describe(day);
    if (value === null) continue;

    const existing = groups.find((group) => group.value === value);
    if (existing) existing.days.push(day);
    else groups.push({ value, days: [day] });
  }

  return groups.map((group) => ({
    label: daysLabel(group.days),
    value: group.value,
    days: group.days,
  }));
}
