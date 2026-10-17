/**
 * Identidade visual derivada do nome da pessoa.
 *
 * Sem foto cadastrada — o caso comum numa barbearia — o avatar precisa ser
 * estável: a mesma pessoa tem sempre a mesma cor, em qualquer tela e em
 * qualquer sessão. Daí um hash determinístico em vez de cor aleatória.
 */

/** Iniciais para avatar: primeiro e último nome, no máximo duas letras. */
export function initialsOf(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 1 || /[A-ZÀ-Ú]/.test(p));

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Hash FNV-1a: barato, bem distribuído e igual em todo lugar. */
export function hueOf(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % 360;
}

/**
 * Par de cores do avatar. L e C fixos garantem contraste AA em qualquer matiz
 * — é o motivo de usar oklch aqui: em HSL o mesmo "L" muda de luminosidade
 * real conforme a cor, e amarelo viraria texto ilegível.
 */
export function avatarColors(seed: string): { background: string; foreground: string } {
  const hue = hueOf(seed);
  return {
    background: `oklch(0.90 0.055 ${hue})`,
    foreground: `oklch(0.42 0.115 ${hue})`,
  };
}
