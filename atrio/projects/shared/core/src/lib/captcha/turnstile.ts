import { Injectable, InjectionToken, Provider, inject } from '@angular/core';
import { CAPTCHA_TOKEN } from '@atrio/data';

/** Chave pública do Turnstile (Cloudflare). Nula: sem captcha. */
export const TURNSTILE_SITE_KEY = new InjectionToken<string | null>('TURNSTILE_SITE_KEY');

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Chave de teste da Cloudflare: sempre aprova, em qualquer endereço. */
const TEST_SITE_KEY = '1x00000000000000000000AA';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const TIMEOUT_MS = 20_000;

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Captcha da Cloudflare (Turnstile) para entrar, criar conta e pedir link de
 * senha.
 *
 * Invisível na quase totalidade das vezes: o desafio só aparece — numa
 * caixinha no rodapé da tela — quando a Cloudflare desconfia. Um token por
 * pedido (cada token vale uma vez), feito na hora, então nenhum formulário
 * precisa de campo novo.
 *
 * O script só carrega no primeiro pedido: quem só olha a vitrine não paga
 * por ele.
 */
@Injectable({ providedIn: 'root' })
export class TurnstileCaptcha {
  private readonly siteKey = inject(TURNSTILE_SITE_KEY, { optional: true });
  private script: Promise<TurnstileApi> | null = null;

  /** Um token novo, ou `undefined` sem captcha configurado ou se falhar. */
  async token(): Promise<string | undefined> {
    if (!this.siteKey) return undefined;
    try {
      const api = await this.load();
      return await this.solve(api, this.siteKey);
    } catch (cause) {
      // O Supabase recusa com captcha_failed, e a tela explica.
      console.error('[captcha]', cause);
      return undefined;
    }
  }

  private load(): Promise<TurnstileApi> {
    this.script ??= new Promise<TurnstileApi>((resolve, reject) => {
      if (window.turnstile) return resolve(window.turnstile);
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile ausente')));
      script.onerror = () => {
        this.script = null; // a próxima tentativa carrega de novo
        reject(new Error('Não foi possível carregar o Turnstile'));
      };
      document.head.appendChild(script);
    });
    return this.script;
  }

  private solve(api: TurnstileApi, sitekey: string): Promise<string> {
    // Caixa no rodapé, por cima de tudo: só tem tamanho quando o desafio
    // pede interação (appearance: interaction-only).
    const host = document.createElement('div');
    host.style.cssText =
      'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;';
    document.body.appendChild(host);

    return new Promise<string>((resolve, reject) => {
      let widgetId: string | null = null;
      const finish = () => {
        clearTimeout(timer);
        if (widgetId) api.remove(widgetId);
        host.remove();
      };
      const timer = setTimeout(() => {
        finish();
        reject(new Error('Turnstile demorou demais'));
      }, TIMEOUT_MS);

      widgetId = api.render(host, {
        sitekey,
        appearance: 'interaction-only',
        language: 'pt-br',
        callback: (token: string) => {
          finish();
          resolve(token);
        },
        'error-callback': () => {
          finish();
          reject(new Error('Turnstile recusou'));
        },
      });
    });
  }
}

/**
 * Liga o captcha nos pedidos de conta da camada de dados. Sem chave (nula),
 * nada muda: os pedidos seguem sem token.
 *
 * No computador (localhost), troca a chave pela de teste: a de verdade só
 * vale nos endereços do widget, e a Cloudflare recomenda não liberar
 * localhost nela. O par é a secret de teste no Supabase de desenvolvimento;
 * a secret de verdade fica só no de produção.
 */
export function provideTurnstile(siteKey: string | null): Provider[] {
  const local = LOCAL_HOSTS.includes(globalThis.location?.hostname ?? '');
  return [
    { provide: TURNSTILE_SITE_KEY, useValue: siteKey && local ? TEST_SITE_KEY : siteKey },
    {
      provide: CAPTCHA_TOKEN,
      useFactory: () => {
        const captcha = inject(TurnstileCaptcha);
        return () => captcha.token();
      },
    },
  ];
}
