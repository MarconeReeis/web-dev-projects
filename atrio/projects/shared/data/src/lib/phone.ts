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

/**
 * Máscara enquanto se digita: "11912" vira "(11) 912", e ao completar,
 * "(11) 91234-5678". Começando com "+", é número de fora: fica livre.
 */
export function maskPhone(value: string): string {
  if (value.trim().startsWith('+')) return value;
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Aplica a máscara no próprio campo e devolve o valor mascarado — para usar
 * no (input): `phone.set(maskPhoneInput($any($event.target)))`.
 *
 * O cursor fica depois do mesmo número de dígitos de antes: apagar o "-"
 * ou corrigir um dígito no meio não joga o cursor para o fim.
 */
export function maskPhoneInput(input: HTMLInputElement): string {
  const caret = input.selectionStart ?? input.value.length;
  const digitsBefore = input.value.slice(0, caret).replace(/\D/g, '').length;
  const masked = maskPhone(input.value);
  if (masked === input.value) return masked;

  input.value = masked;
  let position = 0;
  for (let seen = 0; position < masked.length && seen < digitsBefore; position++) {
    if (/\d/.test(masked[position])) seen++;
  }
  input.setSelectionRange(position, position);
  return masked;
}
