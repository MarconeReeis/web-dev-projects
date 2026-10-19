import type { SupabaseClient } from '@supabase/supabase-js';
import { discardImage, storeImage } from './supabase-core';

const BASE = 'https://exemplo.supabase.co/storage/v1/object/public/midia/';
const TENANT = '00000000-0000-4000-8000-000000000001';
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Storage falso que registra o que recebeu. */
function fakeClient() {
  const uploads: { path: string; type: string }[] = [];
  const removed: string[][] = [];

  const bucket = {
    upload: async (path: string, blob: Blob, options: { contentType: string }) => {
      uploads.push({ path, type: options.contentType ?? blob.type });
      return { error: null };
    },
    getPublicUrl: (path: string) => ({ data: { publicUrl: BASE + path } }),
    remove: async (paths: string[]) => {
      removed.push(paths);
      return { error: null };
    },
  };

  const client = { storage: { from: () => bucket } } as unknown as SupabaseClient;
  return { client, uploads, removed };
}

describe('imagens no Storage', () => {
  it('imagem embutida vai para a pasta da barbearia e volta como link', async () => {
    const { client, uploads } = fakeClient();

    const url = await storeImage(client, TENANT, 'profissionais', PIXEL);

    expect(uploads).toHaveLength(1);
    expect(uploads[0].type).toBe('image/png');
    expect(uploads[0].path).toMatch(new RegExp(`^${TENANT}/profissionais/[0-9a-f-]{36}\\.png$`));
    expect(url).toBe(BASE + uploads[0].path);
  });

  it('link já salvo e foto vazia passam direto, sem enviar nada', async () => {
    const { client, uploads } = fakeClient();

    expect(await storeImage(client, TENANT, 'marca', BASE + 'x.jpg')).toBe(BASE + 'x.jpg');
    expect(await storeImage(client, TENANT, 'marca', null)).toBeNull();
    expect(uploads).toHaveLength(0);
  });

  it('cada envio tem nome novo — o cache do celular nunca mostra a foto velha', async () => {
    const { client } = fakeClient();
    const first = await storeImage(client, TENANT, 'profissionais', PIXEL);
    const second = await storeImage(client, TENANT, 'profissionais', PIXEL);
    expect(first).not.toBe(second);
  });

  it('apaga só a imagem antiga do nosso bucket, e só se mudou', async () => {
    const { client, removed } = fakeClient();
    const old = `${BASE}${TENANT}/profissionais/antiga.jpg`;

    await discardImage(client, old, old); // não mudou
    await discardImage(client, PIXEL, BASE + 'nova.jpg'); // antiga era embutida, não é arquivo
    await discardImage(client, 'https://outro-site.com/foto.jpg', null); // link de fora
    expect(removed).toHaveLength(0);

    await discardImage(client, old, BASE + 'nova.jpg');
    expect(removed).toEqual([[`${TENANT}/profissionais/antiga.jpg`]]);
  });
});
