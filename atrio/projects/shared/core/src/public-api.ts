/**
 * @atrio/core — serviços transversais das duas aplicações.
 *
 * Entra aqui o que admin e booking compartilham e não é nem domínio puro
 * (@atrio/data) nem apresentação (@atrio/ui): configuração, contexto da
 * barbearia logada, identidade visual white-label e, adiante, autenticação,
 * guards e interceptors.
 */

export * from './lib/config/app-config';
export * from './lib/tenant/tenant-context';
export * from './lib/branding/oklch';
export * from './lib/branding/branding';
export * from './lib/pwa/install-prompt';
export * from './lib/captcha/turnstile';
