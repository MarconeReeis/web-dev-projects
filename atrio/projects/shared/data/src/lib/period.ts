import { DateRange, IsoDate } from './models/common';

export type PeriodPreset = 'hoje' | 'semana' | 'mes' | 'personalizado';

export const PERIOD_LABEL: Readonly<Record<PeriodPreset, string>> = {
  hoje: 'Hoje',
  semana: 'Esta semana',
  mes: 'Este mês',
  personalizado: 'Período personalizado',
};

/**
 * Períodos do filtro.
 *
 * Todos os intervalos são [início, fim) — fim exclusivo. É o que impede o
 * atendimento da meia-noite de ser contado em dois dias e o último dia do mês
 * de entrar duas vezes ao somar períodos.
 *
 * As contas usam o fuso do navegador, que no tablet da barbearia é o fuso
 * dela. Quando o backend entrar, o cálculo precisa usar `tenant.timeZone`:
 * o dono em Rio Branco não pode ver o caixa fechar às 21h.
 */

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

/** Semana começando no domingo, como o calendário brasileiro. */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function startOfMonth(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

export function rangeFor(preset: PeriodPreset, now = new Date()): DateRange {
  switch (preset) {
    case 'hoje':
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };

    case 'semana': {
      const from = startOfWeek(now);
      const to = new Date(from);
      to.setDate(to.getDate() + 7);
      return { from: from.toISOString(), to: to.toISOString() };
    }

    case 'mes': {
      const from = startOfMonth(now);
      const to = new Date(from);
      to.setMonth(to.getMonth() + 1);
      return { from: from.toISOString(), to: to.toISOString() };
    }

    case 'personalizado':
      // Sem datas escolhidas ainda, cai no dia — a tela substitui por
      // customRange assim que o usuário confirma o período.
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
  }
}

/** Intervalo a partir de duas datas de calendário, com o fim incluído. */
export function customRange(from: IsoDate, to: IsoDate): DateRange {
  return {
    from: startOfDay(new Date(`${from}T00:00:00`)).toISOString(),
    to: endOfDay(new Date(`${to}T00:00:00`)).toISOString(),
  };
}

const TIME = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const LONG_DATE = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/** "14:30" */
export function formatTime(instant: string | Date): string {
  return TIME.format(new Date(instant));
}

/** "sexta-feira, 16 de outubro" */
export function formatLongDate(instant: string | Date): string {
  return LONG_DATE.format(new Date(instant));
}

const SHORT_DAY = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/**
 * "Seg, 19 de out" — para rodapés, cards e listas, onde a data longa não cabe.
 * O Intl devolve "seg., 19 de out."; os pontos saem e só a primeira letra sobe.
 */
export function formatShortDay(instant: string | Date): string {
  const label = SHORT_DAY.format(new Date(instant)).replaceAll('.', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "16/10" */
export function formatShortDate(instant: string | Date): string {
  return SHORT_DATE.format(new Date(instant));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
