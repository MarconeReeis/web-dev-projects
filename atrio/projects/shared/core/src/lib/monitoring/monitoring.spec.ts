import { scrubBreadcrumb, scrubEvent, stripUrl } from './monitoring';

describe('monitoramento: nada de token nos erros', () => {
  it('tira busca e âncora dos endereços', () => {
    expect(stripUrl('https://painel.atrioagenda.com.br/responder?token=abc&acao=confirmar')).toBe(
      'https://painel.atrioagenda.com.br/responder',
    );
    expect(stripUrl('https://atrioagenda.com.br/navalha/nova-senha#access_token=xyz')).toBe(
      'https://atrioagenda.com.br/navalha/nova-senha',
    );
    expect(stripUrl('/hoje')).toBe('/hoje');
  });

  it('limpa o endereço, a busca e o Referer do erro', () => {
    const event = scrubEvent({
      request: {
        url: 'https://painel.atrioagenda.com.br/responder?token=abc',
        query_string: 'token=abc',
        headers: { Referer: 'https://mail.example.com/?token=abc', 'User-Agent': 'x' },
      },
    });
    expect(event.request?.url).toBe('https://painel.atrioagenda.com.br/responder');
    expect(event.request?.query_string).toBeUndefined();
    expect(event.request?.headers).toEqual({ 'User-Agent': 'x' });
  });

  it('limpa navegação e chamadas de rede no rastro', () => {
    const nav = scrubBreadcrumb({ category: 'navigation', data: { from: '/a?token=1', to: '/b#access_token=2' } });
    expect(nav.data).toEqual({ from: '/a', to: '/b' });
    const fetch = scrubBreadcrumb({ category: 'fetch', data: { url: 'https://x.supabase.co/rest/v1/t?id=eq.1', status_code: 200 } });
    expect(fetch.data).toEqual({ url: 'https://x.supabase.co/rest/v1/t', status_code: 200 });
  });
});
