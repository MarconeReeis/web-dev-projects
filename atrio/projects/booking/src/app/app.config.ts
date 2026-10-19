import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  isDevMode,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { BrandingService, provideAtrioConfig } from '@atrio/core';
import { TenantRepository, provideDemoData, provideSupabaseData } from '@atrio/data';
import { filter, firstValueFrom, timeout } from 'rxjs';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

const demo = environment.dataSource === 'demo';

/**
 * Barbearia deste acesso, pelo caminho: /b/<slug>/…
 *
 * Lida uma vez, na inicialização. Quem abre a raiz cai na barbearia padrão
 * — o mesmo destino do redirecionamento de app.routes.
 */
function tenantSlugFromUrl(): string {
  return location.pathname.match(/^\/b\/([^/]+)/)?.[1] ?? environment.defaultTenantSlug;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),

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
     * Aplica a identidade da barbearia antes da primeira pintura.
     *
     * Se isso rodasse dentro de um componente, o cliente veria o roxo do
     * Átrio piscar antes da cor da barbearia — o oposto do que um produto
     * white-label deve parecer.
     *
     * Com o banco, a barbearia chega pela rede: a inicialização espera por
     * ela, até um limite. Rede ruim não pode deixar a tela em branco — passado
     * o limite, o app abre com a cor padrão e segue.
     */
    provideAppInitializer(async () => {
      const tenants = inject(TenantRepository);
      const branding = inject(BrandingService);
      try {
        const tenant = await firstValueFrom(
          tenants.watchCurrent().pipe(filter(Boolean), timeout({ first: 2500 })),
        );
        branding.apply(tenant.branding);
      } catch {
        // Sem barbearia a tempo: segue com a identidade padrão.
      }
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
