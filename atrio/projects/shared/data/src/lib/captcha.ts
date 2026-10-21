import { InjectionToken } from '@angular/core';

/**
 * Prova de que é gente, não robô — pedida antes de entrar, criar conta e
 * pedir link de senha.
 *
 * Com o captcha ligado no Supabase (Authentication → Attack Protection),
 * essas chamadas sem um token válido são recusadas. A camada de dados só
 * pede o token; quem o produz é o app (TurnstileCaptcha, em @atrio/core),
 * porque depende do navegador.
 *
 * Sem captcha configurado, devolve `undefined` e tudo funciona como antes.
 * Nunca falha: se o desafio não carregar, o Supabase recusa o login com
 * `captcha_failed`, e a tela explica.
 */
export const CAPTCHA_TOKEN = new InjectionToken<() => Promise<string | undefined>>('CAPTCHA_TOKEN', {
  providedIn: 'root',
  factory: () => async () => undefined,
});

/** O que a tela diz quando o Supabase recusa por captcha. */
export const CAPTCHA_FAILED_MESSAGE =
  'Não foi possível confirmar que você não é um robô. Recarregue a página e tente de novo.';
