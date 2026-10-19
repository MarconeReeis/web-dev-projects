import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { StaffAuthError } from '../models/staff';
import { SUPABASE_CLIENT } from './supabase-core';
import { SupabaseStaffAuth } from './supabase-staff-auth';

type Listener = (event: string, session: { user: unknown } | null) => void;

const USER = { id: 'u-1', email: 'equipe@exemplo.com', user_metadata: { name: 'Marcone Reis' } };

/**
 * Um Supabase falso com a mesma ordem de eventos do real: a sessão salva é
 * anunciada logo na criação (nula, aqui), e o login é anunciado pelo
 * onAuthStateChange um pouco DEPOIS de signInWithPassword resolver.
 */
function fakeClient(membership: { tenant_id: string; role: string } | null) {
  let listener: Listener = () => undefined;

  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data: membership, error: null }),
  };

  return {
    auth: {
      onAuthStateChange: (callback: Listener) => {
        listener = callback;
        setTimeout(() => listener('INITIAL_SESSION', null));
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signInWithPassword: async () => {
        setTimeout(() => listener('SIGNED_IN', { user: USER }), 50);
        return { data: { user: USER, session: {} }, error: null };
      },
      signOut: async () => ({ error: null }),
    },
    from: () => query,
  };
}

function setup(membership: { tenant_id: string; role: string } | null) {
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE_CLIENT, useValue: fakeClient(membership) },
      SupabaseStaffAuth,
    ],
  });
  return TestBed.inject(SupabaseStaffAuth);
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('SupabaseStaffAuth', () => {
  it('a sessão já existe quando signIn devolve — antes do aviso do Supabase', async () => {
    const auth = setup({ tenant_id: 't-1', role: 'dono' });
    await tick();
    expect(await firstValueFrom(auth.watchSession())).toBeNull();

    await auth.signIn('equipe@exemplo.com', 'senha');

    // É o que a guarda de rota lê ao navegar para o painel. Se ainda fosse
    // nulo, a guarda devolvia para a tela de entrar.
    const session = await firstValueFrom(auth.watchSession());
    expect(session?.tenantId).toBe('t-1');
    expect(session?.role).toBe('dono');
    expect(session?.name).toBe('Marcone Reis');
  });

  it('conta sem barbearia é barrada e fica sem sessão', async () => {
    const auth = setup(null);
    await tick();

    await expect(auth.signIn('cliente@exemplo.com', 'senha')).rejects.toBeInstanceOf(
      StaffAuthError,
    );
    expect(await firstValueFrom(auth.watchSession())).toBeNull();
  });
});
