import { InjectionToken, Provider } from '@angular/core';

export type DataSource = 'demo' | 'supabase';

/**
 * Configuração do app, injetada na raiz.
 *
 * Um token em vez de um arquivo `environment.ts` importado direto: assim o
 * valor é substituível em teste e as duas aplicações (admin e booking) usam a
 * mesma forma sem compartilhar arquivo de build.
 */
export interface AtrioConfig {
  /** Nome do produto. Sempre "Átrio" — não é o nome da barbearia. */
  readonly productName: string;
  readonly appName: 'admin' | 'booking';
  readonly dataSource: DataSource;
  /** Mostra o selo "Modo demonstração" e o aviso de dados fictícios. */
  readonly demoMode: boolean;
  readonly version: string;
}

export const ATRIO_CONFIG = new InjectionToken<AtrioConfig>('ATRIO_CONFIG');

export function provideAtrioConfig(config: AtrioConfig): Provider {
  return { provide: ATRIO_CONFIG, useValue: config };
}
