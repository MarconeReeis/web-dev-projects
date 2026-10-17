import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAtrioConfig } from '@atrio/core';
import { provideDemoData } from '@atrio/data';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';

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

    provideAtrioConfig({
      productName: 'Átrio',
      appName: 'admin',
      dataSource: 'demo',
      demoMode: true,
      version: '0.1.0',
    }),

    // Única linha a trocar quando o Firebase entrar: provideFirebaseData().
    provideDemoData(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
