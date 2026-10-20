import { describe, expect, it } from 'vitest';
import { formatPhone } from './phone';

describe('formatPhone', () => {
  it('celular e fixo com DDD', () => {
    expect(formatPhone('11912345678')).toBe('(11) 91234-5678');
    expect(formatPhone('1198434839')).toBe('(11) 9843-4839');
  });

  it('aceita o que a pessoa digitar, com +55, espaços e traços', () => {
    expect(formatPhone('+55 11 9 1234-5678')).toBe('(11) 91234-5678');
    expect(formatPhone(' (11) 91234 5678 ')).toBe('(11) 91234-5678');
  });

  it('o que não parece telefone brasileiro fica como foi digitado', () => {
    expect(formatPhone('+1 415 555 0100')).toBe('+1 415 555 0100');
    expect(formatPhone('1234')).toBe('1234');
  });
});
