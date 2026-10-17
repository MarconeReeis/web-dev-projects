/** Lado do avatar depois do recorte, em pixels. */
const SIZE = 192;

/** Qualidade do JPEG gerado. 0.82 é o ponto em que o artefato some do rosto. */
const QUALITY = 0.82;

/**
 * Lê a foto escolhida e devolve um JPEG quadrado pequeno, em data URL.
 *
 * O recorte acontece no navegador de propósito. Em modo demonstração o avatar
 * vai para o localStorage, que tem alguns megabytes no total — uma foto de
 * celular de 4 MB estoura a cota sozinha e derruba a demonstração inteira.
 * A 192px o arquivo fica na casa dos 10 kB.
 *
 * Quando o Firebase Storage entrar, esta função continua útil: o upload passa
 * a ser do blob reduzido, e não do original, poupando banda do tablet numa
 * conexão de barbearia.
 */
export async function readSquareAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Escolha um arquivo de imagem.');
  }

  const bitmap = await createImageBitmap(file);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível processar a imagem.');

    // Recorte central: fotos de retrato e paisagem viram o mesmo quadrado sem
    // distorcer o rosto, que é o que aconteceria esticando para caber.
    const side = Math.min(bitmap.width, bitmap.height);
    const left = (bitmap.width - side) / 2;
    const top = (bitmap.height - side) / 2;

    context.drawImage(bitmap, left, top, side, side, 0, 0, SIZE, SIZE);

    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    bitmap.close();
  }
}
