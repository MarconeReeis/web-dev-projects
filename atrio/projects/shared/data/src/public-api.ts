/**
 * @atrio/data — domínio e acesso a dados.
 *
 * Três camadas, nesta ordem de dependência:
 *
 *   models/        tipos do negócio. Não importam Angular nem RxJS.
 *   repositories/  contratos de leitura e escrita (classes abstratas = tokens de DI).
 *   demo/          implementação em memória para o modo demonstração.
 *
 * Quando o Firebase entrar, ele vira uma quarta pasta `firebase/` implementando
 * os mesmos contratos. Componente nenhum muda.
 */

export * from './lib/models/common';
export * from './lib/models/schedule';
export * from './lib/models/tenant';
export * from './lib/models/professional';
export * from './lib/models/service';
export * from './lib/models/client';
export * from './lib/models/client-account';
export * from './lib/models/appointment';
export * from './lib/models/finance';
export * from './lib/models/money';

export * from './lib/period';
export * from './lib/availability/availability';
export * from './lib/availability/open-slots';

export * from './lib/repositories/repositories';

export * from './lib/demo/demo-seed';
export * from './lib/demo/demo-store';
export * from './lib/demo/demo-repositories';
export * from './lib/demo/demo-auth';
