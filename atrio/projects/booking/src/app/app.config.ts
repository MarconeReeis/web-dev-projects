import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAtrioConfig, provideTurnstile } from '@atrio/core';
import { TenantRepository, provideDemoData, provideSupabaseData } from '@atrio/data';
import { filter, firstValueFrom, timeout } from 'rxjs';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { AtrioTitleStrategy } from './shared/page-title';
import { provideServiceWorker } from '@angular/service-worker';

const demo = environment.dataSource === 'demo';

/**
 * Barbearia deste acesso, pelo caminho: /<slug>/… (ou o antigo /b/<slug>/…).
 *
 * Lida uma vez, na inicialização. Quem abre a raiz cai na barbearia padrão
 * — o mesmo destino do redirecionamento de app.routes.
 */
function tenantSlugFromUrl(): string {
  const [first, second] = location.pathname.split('/').filter(Boolean);
  return (first === 'b' ? second : first) ?? environment.defaultTenantSlug;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useClass: AtrioTitleStrategy },

    // Captcha nos pedidos de conta (entrar, criar conta, link de senha).
    ...provideTurnstile(environment.turnstileSiteKey),

    provideAtrioConfig({
      productName: 'Átrio',
      appName: 'booking',
      dataSource: environment.dataSource,
      demoMode: demo,
      version: '0.1.0',
    }),

    demo
      ? provideDemoData()
      : provideSupabaseData({
          url: environment.supabaseUrl,
          key: environment.supabaseKey,
          tenantSlug: tenantSlugFromUrl,
        }),

    /**
     * Espera a barbearia antes da primeira tela, até um limite.
     *
     * A identidade visual é a do Átrio para todas (decisão de 20/10/2026) —
     * a barbearia aparece pelo nome, logo e fotos, não pela cor. Esperar
     * ainda vale pelo fuso: com ele já definido, "hoje" e os horários da
     * primeira tela saem no relógio da barbearia (ver period.ts). Rede ruim
     * não pode deixar a tela em branco: passado o limite, o app abre e segue.
     */
    provideAppInitializer(async () => {
      const tenants = inject(TenantRepository);
      try {
        await firstValueFrom(
          tenants.watchCurrent().pipe(filter(Boolean), timeout({ first: 2500 })),
        );
      } catch {
        // Sem barbearia a tempo: segue com o fuso padrão.
      }
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
