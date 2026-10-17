/**
 * Conversões entre Date e o formato de `<input type="date">`.
 *
 * O input espera "aaaa-mm-dd" em hora LOCAL. `toISOString().slice(0, 10)`
 * parece resolver e erra: ele converte para UTC antes de cortar, então no
 * Brasil (UTC-3) qualquer data entre a meia-noite e as 03:00 volta um dia.
 */

export function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "2026-10-16" → Date à meia-noite local. */
export function fromDateInputValue(value: string): Date {
  // O sufixo de hora força a interpretação local; sem ele, "2026-10-16"
  // sozinho é lido como UTC pelo construtor de Date.
  return new Date(`${value}T00:00:00`);
}
