/**
 * @atrio/data — domínio e acesso a dados.
 *
 * Três camadas, nesta ordem de dependência:
 *
 *   models/        tipos do negócio. Não importam Angular nem RxJS.
 *   repositories/  contratos de leitura e escrita (classes abstratas = tokens de DI).
 *   demo/          implementação em memória para o modo demonstração.
 *
 * `supabase/` implementa os mesmos contratos sobre o banco real. Componente
 * nenhum muda.
 */

export * from './lib/models/common';
export * from './lib/models/schedule';
export * from './lib/models/tenant';
export * from './lib/models/professional';
export * from './lib/models/service';
export * from './lib/models/client';
export * from './lib/models/client-account';
export * from './lib/models/staff';
export * from './lib/models/appointment';
export * from './lib/models/finance';
export * from './lib/models/notification';
export * from './lib/models/money';

export * from './lib/period';
export * from './lib/phone';
export * from './lib/availability/availability';
export * from './lib/availability/open-slots';
export * from './lib/availability/busy';

export * from './lib/repositories/repositories';

export * from './lib/demo/demo-seed';
export * from './lib/demo/demo-store';
export * from './lib/demo/demo-repositories';
export * from './lib/demo/demo-auth';
export * from './lib/demo/demo-staff-auth';
export * from './lib/demo/demo-counter-pin';

export { provideSupabaseData } from './lib/supabase/supabase-auth';
export { provideSupabaseAdminData, provideSupabaseStaffAuth } from './lib/supabase/supabase-staff-auth';
export type { SupabaseDataConfig } from './lib/supabase/supabase-core';
