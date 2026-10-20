/**
 * Telefone brasileiro no formato de leitura: "(11) 91234-5678".
 *
 * Quem digita escreve de qualquer jeito — "11912345678", "+55 11 9 1234
 * 5678" — e o número aparece assim na agenda e nos e-mails da barbearia.
 * Formatar ao salvar deixa todos iguais. O que não parece telefone
 * brasileiro (número de fora, ramal) fica como foi digitado.
 *
 * A ligação com o histórico do balcão compara só os dígitos
 * (private.phone_key), então o formato não muda quem é quem.
 */
export function formatPhone(value: string): string {
  const typed = value.trim();
  let digits = typed.replace(/\D/g, '');
  // "+" de outro país: não é número daqui, mesmo que tenha 10 ou 11 dígitos.
  if (typed.startsWith('+') && !digits.startsWith('55')) return typed;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }

  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return typed;
}
