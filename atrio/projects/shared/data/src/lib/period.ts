import { signal } from '@angular/core';
import { DateRange, IsoDate } from './models/common';

export type PeriodPreset = 'hoje' | 'semana' | 'mes' | 'personalizado';

export const PERIOD_LABEL: Readonly<Record<PeriodPreset, string>> = {
  hoje: 'Hoje',
  semana: 'Esta semana',
  mes: 'Este mês',
  personalizado: 'Período personalizado',
};

/**
 * Datas e horas no FUSO DA BARBEARIA, não no do aparelho.
 *
 * O "10:00" é o da barbearia, para todo mundo: o cliente com o celular em
 * outro fuso (viajando, ou de outro estado) vê 10:00, e o caixa do dono em
 * Rio Branco fecha à meia-noite de Rio Branco. O banco já confere tudo em
 * `tenants.time_zone`; aqui o app passa a enxergar o mesmo relógio.
 *
 * Dois tipos de valor circulam, e a diferença importa:
 *
 * - INSTANTE (`IsoDateTime`, ou `Date` vindo de um): um momento real. Os
 *   formatadores (formatTime, formatLongDate…) o mostram no fuso da
 *   barbearia.
 * - DIA (`Date` à meia-noite do aparelho): só ano, mês e dia importam — o
 *   dia do calendário escolhido na tela. As contas de calendário
 *   (startOfWeek, addDays, getDay) rodam nele sem fuso nenhum. Vira
 *   instante só por `shopInstant`, e nasce de um instante só por `shopDay`.
 *
 * Todos os intervalos são [início, fim) — fim exclusivo. É o que impede o
 * atendimento da meia-noite de ser contado em dois dias e o último dia do mês
 * de entrar duas vezes ao somar períodos.
 */

const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

/** Sinal: as telas recalculam sozinhas quando a barbearia chega. */
const zone = signal(DEFAULT_TIME_ZONE);

/**
 * Chamado quando a barbearia é lida (ver os repositórios de tenant). Fuso
 * desconhecido pelo navegador fica no padrão, em vez de quebrar as telas.
 */
export function setShopTimeZone(timeZone: string | null | undefined): void {
  const next = timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  if (next !== zone()) zone.set(next);
}

export function shopTimeZone(): string {
  return zone();
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Formatador `pt-BR` no fuso da barbearia, guardado por opções — criar um
 * Intl.DateTimeFormat custa caro, e a agenda formata centenas de horários.
 * Só para INSTANTES; um DIA se formata com um Intl comum, sem fuso.
 */
export function shopFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const timeZone = zone();
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('pt-BR', { ...options, timeZone });
    formatters.set(key, formatter);
  }
  return formatter;
}

interface WallClock {
  readonly year: number;
  /** 1–12 */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/** O que o relógio da barbearia marca neste instante. */
function wallClock(instant: Date): WallClock {
  const parts: Record<string, number> = {};
  const format = shopFormat({
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  for (const part of format.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts['year'],
    month: parts['month'],
    day: parts['day'],
    // Alguns motores escrevem a meia-noite como "24" mesmo com h23.
    hour: parts['hour'] % 24,
    minute: parts['minute'],
  };
}

/** Quanto o relógio da barbearia está à frente do UTC neste instante, em ms. */
function offsetAt(epoch: number): number {
  const wall = wallClock(new Date(epoch));
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  return asUtc - Math.floor(epoch / 60_000) * 60_000;
}

/** O DIA da barbearia em que cai o instante (agora, se omitido). */
export function shopDay(instant: string | Date = new Date()): Date {
  const wall = wallClock(new Date(instant));
  return new Date(wall.year, wall.month - 1, wall.day);
}

/**
 * O instante em que o relógio da barbearia marca `minutes` depois da
 * meia-noite do `day` — "dia 20, 600 minutos" é 20/10 às 10:00 de lá.
 * Minutos além de 1440 transbordam para o dia seguinte.
 */
export function shopInstant(day: Date, minutes = 0): Date {
  const guess = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
  // O deslocamento que vale é o do próprio instante procurado; a segunda
  // leitura acerta o palpite que caiu do outro lado de uma troca de horário.
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}

/** Minutos desde a meia-noite da barbearia: 10:30 de lá é 630. */
export function shopMinutes(instant: string | Date): number {
  const wall = wallClock(new Date(instant));
  return wall.hour * 60 + wall.minute;
}

/** `days` dias de calendário a partir de `day`: do começo do primeiro ao fim do último. */
export function dayRange(day: Date, days = 1): DateRange {
  return {
    from: shopInstant(day).toISOString(),
    to: shopInstant(addDays(day, days)).toISOString(),
  };
}

/** O dia `n` dias depois (antes, com `n` negativo). */
export function addDays(day: Date, n: number): Date {
  const next = startOfDay(day);
  next.setDate(next.getDate() + n);
  return next;
}

/** "2026-10-20" → o dia. */
export function dayOf(value: IsoDate): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** O dia → "2026-10-20". */
export function isoDateOf(day: Date): IsoDate {
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}

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
  const today = shopDay(now);
  switch (preset) {
    case 'hoje':
    case 'personalizado':
      // Personalizado sem datas escolhidas ainda cai no dia — a tela
      // substitui por customRange assim que o usuário confirma o período.
      return dayRange(today);

    case 'semana':
      return dayRange(startOfWeek(today), 7);

    case 'mes': {
      const from = startOfMonth(today);
      const to = new Date(from);
      to.setMonth(to.getMonth() + 1);
      return { from: shopInstant(from).toISOString(), to: shopInstant(to).toISOString() };
    }
  }
}

/** Intervalo a partir de duas datas de calendário, com o fim incluído. */
export function customRange(from: IsoDate, to: IsoDate): DateRange {
  return {
    from: shopInstant(dayOf(from)).toISOString(),
    to: shopInstant(addDays(dayOf(to), 1)).toISOString(),
  };
}

/** "14:30" */
export function formatTime(instant: string | Date): string {
  return shopFormat({ hour: '2-digit', minute: '2-digit' }).format(new Date(instant));
}

/** "sexta-feira, 16 de outubro" */
export function formatLongDate(instant: string | Date): string {
  return shopFormat({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(instant));
}

/**
 * "Seg, 19 de out" — para rodapés, cards e listas, onde a data longa não cabe.
 * O Intl devolve "seg., 19 de out."; os pontos saem e só a primeira letra sobe.
 */
export function formatShortDay(instant: string | Date): string {
  const label = shopFormat({ weekday: 'short', day: 'numeric', month: 'short' })
    .format(new Date(instant))
    .replaceAll('.', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** "16/10" */
export function formatShortDate(instant: string | Date): string {
  return shopFormat({ day: '2-digit', month: '2-digit' }).format(new Date(instant));
}

/** Os dois são o mesmo DIA de calendário (ver "DIA" no topo do arquivo). */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
