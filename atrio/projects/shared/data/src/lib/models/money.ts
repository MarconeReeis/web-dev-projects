import { Cents } from './common';

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** 4500 vira "R$ 45,00". */
export function formatMoney(cents: Cents): string {
  return BRL.format(cents / 100);
}

/** 4500 vira "45,00" — sem símbolo, para dentro de inputs. */
export function formatAmount(cents: Cents): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Converte o que o usuário digitou em centavos.
 *
 * Aceita "45", "45,00", "45.00", "R$ 1.234,56". Retorna null quando não dá
 * para extrair um número — o formulário trata isso como erro de validação,
 * nunca como zero.
 */
export function parseMoney(input: string): Cents | null {
  const cleaned = input
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');

  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return null;

  return Math.round(value * 100);
}
