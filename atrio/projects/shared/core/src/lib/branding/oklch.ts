/**
 * Conversão sRGB para OKLCH.
 *
 * Existe para o white-label: a barbearia escolhe UMA cor de marca e o sistema
 * deriva hover, fundo suave e cor de texto a partir dela. Em HSL isso não
 * funciona — "L 55%" em amarelo e em azul têm luminosidade real muito
 * diferente, e o texto ficaria ilegível em metade das marcas.
 *
 * Em OKLCH o L é perceptual: fixar L e variar o matiz mantém o contraste.
 *
 * Fórmulas: Björn Ottosson, "A perceptual color space for image processing".
 */

export interface Oklch {
  /** 0 a 1. */
  readonly l: number;
  readonly c: number;
  /** Graus, 0 a 360. */
  readonly h: number;
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** Aceita "#6C4DF6", "6C4DF6" ou "#6C4". Retorna null se não for hex válido. */
export function hexToOklch(hex: string): Oklch | null {
  let value = hex.trim().replace('#', '');

  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;

  const [r, g, b] = [0, 2, 4].map((i) =>
    srgbToLinear(Number.parseInt(value.slice(i, i + 2), 16) / 255),
  );

  const lCone = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mCone = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sCone = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const l = 0.2104542553 * lCone + 0.793617785 * mCone - 0.0040720468 * sCone;
  const a = 1.9779984951 * lCone - 2.428592205 * mCone + 0.4505937099 * sCone;
  const bAxis = 0.0259040371 * lCone + 0.7827717662 * mCone - 0.808675766 * sCone;

  const c = Math.hypot(a, bAxis);
  let h = (Math.atan2(bAxis, a) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l, c, h: c < 0.0005 ? 0 : h };
}

export function oklchToCss({ l, c, h }: Oklch): string {
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
}

/**
 * Deriva a escala de marca a partir de uma cor só.
 *
 * Os valores de L e C são os mesmos da paleta padrão do Átrio (ver
 * tokens.css), então uma marca personalizada mantém exatamente o mesmo
 * contraste e peso visual do roxo original.
 */
export interface BrandScale {
  readonly brand: string;
  readonly strong: string;
  readonly deep: string;
  readonly soft: string;
  readonly contrast: string;
}

export function deriveBrandScale(hex: string): BrandScale | null {
  const base = hexToOklch(hex);
  if (!base) return null;

  const { c, h } = base;
  // Clareia marcas muito escuras e escurece as muito claras: a cor fica
  // reconhecível mas o sistema continua legível.
  const l = Math.min(0.68, Math.max(0.45, base.l));

  return {
    brand: oklchToCss({ l, c, h }),
    strong: oklchToCss({ l: l - 0.05, c, h }),
    deep: oklchToCss({ l: 0.456, c: Math.min(c, 0.24), h }),
    soft: oklchToCss({ l: 0.946, c: Math.min(c * 0.12, 0.04), h }),
    // Texto sobre a marca: branco acima de L≈0.62 já perde contraste.
    contrast: l > 0.62 ? oklchToCss({ l: 0.22, c: Math.min(c, 0.06), h }) : 'oklch(1 0 0)',
  };
}
