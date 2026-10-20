import { afterEach, describe, expect, it } from 'vitest';

import { Professional } from './models/professional';
import { EMPTY_DAY, workingDay } from './models/schedule';
import { Service } from './models/service';
import { availableSlots } from './availability/availability';
import {
  customRange,
  formatLongDate,
  formatTime,
  rangeFor,
  setShopTimeZone,
  shopDay,
  shopInstant,
  shopMinutes,
  shopTimeZone,
} from './period';

/**
 * O fuso da barbearia contra o do aparelho.
 *
 * Os casos trocam o fuso da BARBEARIA (Rio Branco, Tóquio, Nova York) e
 * conferem em UTC — o resultado não pode depender do fuso da máquina que roda
 * o teste, que é justamente o que esta mudança tira da conta.
 *
 * 20/10/2026 é uma terça-feira.
 */
const TUESDAY = new Date(2026, 9, 20);

afterEach(() => setShopTimeZone('America/Sao_Paulo'));

describe('fuso da barbearia', () => {
  it('começa em São Paulo e ignora fuso desconhecido', () => {
    expect(shopTimeZone()).toBe('America/Sao_Paulo');
    setShopTimeZone('Marte/Olympus');
    expect(shopTimeZone()).toBe('America/Sao_Paulo');
  });

  it('shopInstant: 10:00 de Rio Branco é 15:00 em UTC', () => {
    setShopTimeZone('America/Rio_Branco');
    expect(shopInstant(TUESDAY, 600).toISOString()).toBe('2026-10-20T15:00:00.000Z');
  });

  it('shopInstant: a meia-noite de Tóquio ainda é o dia anterior em UTC', () => {
    setShopTimeZone('Asia/Tokyo');
    expect(shopInstant(TUESDAY).toISOString()).toBe('2026-10-19T15:00:00.000Z');
  });

  it('shopInstant acompanha o horário de verão', () => {
    setShopTimeZone('America/New_York');
    // 08/03/2026: os relógios de Nova York adiantam às 02:00.
    expect(shopInstant(new Date(2026, 2, 7), 600).toISOString()).toBe('2026-03-07T15:00:00.000Z');
    expect(shopInstant(new Date(2026, 2, 8), 600).toISOString()).toBe('2026-03-08T14:00:00.000Z');
  });

  it('shopDay: 22:30 de Rio Branco ainda é o dia 20, já 00:30 do 21 em São Paulo', () => {
    const instant = '2026-10-21T03:30:00.000Z';
    expect(shopDay(instant).getDate()).toBe(21);
    setShopTimeZone('America/Rio_Branco');
    expect(shopDay(instant).getDate()).toBe(20);
  });

  it('shopMinutes e formatTime leem o relógio da barbearia', () => {
    setShopTimeZone('America/Rio_Branco');
    expect(shopMinutes('2026-10-20T15:00:00.000Z')).toBe(600);
    expect(formatTime('2026-10-20T15:00:00.000Z')).toBe('10:00');
  });

  it('formatLongDate mostra o dia da barbearia', () => {
    setShopTimeZone('Asia/Tokyo');
    // 20/10 às 20:00 em UTC já é quarta, 21/10, em Tóquio.
    expect(formatLongDate('2026-10-20T20:00:00.000Z')).toBe('quarta-feira, 21 de outubro');
  });

  it('rangeFor("hoje") fecha o dia na meia-noite da barbearia', () => {
    setShopTimeZone('America/Rio_Branco');
    expect(rangeFor('hoje', new Date('2026-10-21T03:30:00.000Z'))).toEqual({
      from: '2026-10-20T05:00:00.000Z',
      to: '2026-10-21T05:00:00.000Z',
    });
  });

  it('customRange inclui o último dia inteiro', () => {
    expect(customRange('2026-10-01', '2026-10-31')).toEqual({
      from: '2026-10-01T03:00:00.000Z',
      to: '2026-11-01T03:00:00.000Z',
    });
  });

  it('os horários livres saem no relógio da barbearia', () => {
    setShopTimeZone('Asia/Tokyo');
    const professional = {
      id: 'pro',
      serviceIds: ['svc'],
      active: true,
      schedule: { 0: EMPTY_DAY, 1: EMPTY_DAY, 2: workingDay('09:00', '10:00'), 3: EMPTY_DAY, 4: EMPTY_DAY, 5: EMPTY_DAY, 6: EMPTY_DAY },
    } as unknown as Professional;
    const service = { id: 'svc', durationMinutes: 30 } as Service;

    const slots = availableSlots({ date: TUESDAY, professional, service, existing: [], blocks: [] });

    // 09:00 de Tóquio (UTC+9) é meia-noite em UTC.
    expect(slots[0]).toBe('2026-10-20T00:00:00.000Z');
    expect(slots.map(formatTime)).toEqual(['09:00', '09:15', '09:30']);
  });
});
