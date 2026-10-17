import { ClockTime, Id, IsoDateTime, TenantScoped } from './common';

/** 0 = domingo, seguindo Date.getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_LABEL: Readonly<Record<Weekday, string>> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

/** Janela de tempo no relógio local, fim exclusivo. */
export interface TimeWindow {
  readonly start: ClockTime;
  readonly end: ClockTime;
}

export interface DaySchedule {
  readonly working: boolean;
  /** Pode ter mais de uma: barbearia que fecha para almoço tem duas. */
  readonly windows: readonly TimeWindow[];
  /** Intervalos dentro do expediente (café, almoço). */
  readonly breaks: readonly TimeWindow[];
}

export type WeeklySchedule = Readonly<Record<Weekday, DaySchedule>>;

/**
 * Bloqueio pontual de agenda: folga, feriado, consulta médica.
 *
 * `professionalId` nulo bloqueia a barbearia inteira.
 */
export interface TimeBlock extends TenantScoped {
  readonly id: Id;
  readonly professionalId: Id | null;
  readonly startsAt: IsoDateTime;
  readonly endsAt: IsoDateTime;
  readonly reason: string | null;
}

export const EMPTY_DAY: DaySchedule = { working: false, windows: [], breaks: [] };

export function workingDay(
  start: ClockTime,
  end: ClockTime,
  breaks: readonly TimeWindow[] = [],
): DaySchedule {
  return { working: true, windows: [{ start, end }], breaks };
}
