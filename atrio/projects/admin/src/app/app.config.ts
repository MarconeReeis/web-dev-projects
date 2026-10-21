import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAtrioConfig, provideTurnstile } from '@atrio/core';
import { provideDemoData, provideSupabaseAdminData, provideSupabaseStaffAuth } from '@atrio/data';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

const supabase = { url: environment.supabaseUrl, key: environment.supabaseKey };

/**
 * De onde vêm dados e login.
 *
 * No modo demonstração com login real, o login vem DEPOIS dos dados para
 * substituir o da demonstração: o último provider de um token é o que vale.
 */
function dataProviders() {
  if (environment.dataSource === 'supabase') return provideSupabaseAdminData(supabase);
  return [
    provideDemoData(),
    environment.auth === 'supabase' ? provideSupabaseStaffAuth(supabase) : [],
  ];
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // Parâmetros de rota chegam como inputs do componente, sem ActivatedRoute.
      withComponentInputBinding(),
      //
      // NÃO use withViewTransitions() aqui.
      //
      // Ele faz a navegação esperar a promessa de document.startViewTransition().
      // Em ambientes onde essa promessa não resolve — webview embutido, página
      // em segundo plano, compositor sem produzir quadros — a rota nunca ativa
      // e o painel fica em branco, sem erro que explique.
      //
      // Aconteceu de verdade: clicar no menu deixava de navegar e a tela
      // esvaziava. O ganho era um cross-fade decorativo; a perda, um painel
      // inutilizável no tablet do balcão. Troca ruim.
    ),

    // Captcha nos pedidos de conta (entrar, criar conta, link de senha).
    ...provideTurnstile(environment.turnstileSiteKey),

    provideAtrioConfig({
      productName: 'Átrio',
      appName: 'admin',
      dataSource: environment.dataSource,
      demoMode: environment.dataSource === 'demo',
      version: '0.1.0',
    }),

    ...dataProviders(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
