import { describe, expect, it } from 'vitest';
import { formatPhone, maskPhone } from './phone';

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

describe('maskPhone', () => {
  it('vai formando enquanto se digita', () => {
    expect(maskPhone('1')).toBe('(1');
    expect(maskPhone('11')).toBe('(11');
    expect(maskPhone('119')).toBe('(11) 9');
    expect(maskPhone('1191234')).toBe('(11) 9123-4');
    expect(maskPhone('1198434839')).toBe('(11) 9843-4839');
    expect(maskPhone('11912345678')).toBe('(11) 91234-5678');
  });

  it('para no 11º dígito, ignora o que não é número e deixa "+" livre', () => {
    expect(maskPhone('119123456789')).toBe('(11) 91234-5678');
    expect(maskPhone('(11) 9a1234-5678')).toBe('(11) 91234-5678');
    expect(maskPhone('')).toBe('');
    expect(maskPhone('+1 415')).toBe('+1 415');
  });
});
