import { CAPTCHA_FAILED_MESSAGE, CAPTCHA_TOKEN } from '../captcha';
import { Injectable, inject } from '@angular/core';
import { filter, firstValueFrom } from 'rxjs';
import { PinCheck, PinStatus, StaffAuthError } from '../models/staff';
import { CounterPin, StaffAuth } from '../repositories/repositories';
import { SUPABASE_CLIENT, iso, toAppError } from './supabase-core';

interface CheckRow {
  ok: boolean;
  remaining: number | null;
  locked_until: string | null;
}

/** PIN do balcão pelo banco: conferência, limite e resumo ficam todos lá. */
@Injectable()
export class SupabaseCounterPin extends CounterPin {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly captcha = inject(CAPTCHA_TOKEN);
  private readonly auth = inject(StaffAuth);

  async status(): Promise<PinStatus> {
    const { data, error } = await this.client.rpc('counter_pin_status', {
      p_tenant_id: await this.tenantId(),
    });
    if (error) throw toAppError(error);
    const row = (data as { configured: boolean; locked_until: string | null }[])[0];
    return { configured: !!row?.configured, lockedUntil: iso(row?.locked_until ?? null) };
  }

  async verify(pin: string): Promise<PinCheck> {
    const { data, error } = await this.client.rpc('verify_counter_pin', {
      p_tenant_id: await this.tenantId(),
      p_pin: pin,
    });
    if (error) throw toAppError(error);
    return toCheck((data as CheckRow[])[0]);
  }

  async change(next: string, current: string | null): Promise<PinCheck> {
    const { data, error } = await this.client.rpc('set_counter_pin', {
      p_tenant_id: await this.tenantId(),
      p_new_pin: next,
      p_current_pin: current,
    });
    if (error) throw toAppError(error);
    return toCheck((data as CheckRow[])[0]);
  }

  /**
   * A senha é conferida entrando de novo com ela — é esse login recente que
   * o banco exige (reset_counter_pin) para criar o PIN sem o atual.
   */
  async reset(password: string, next: string): Promise<void> {
    const session = await firstValueFrom(this.auth.watchSession().pipe(filter(Boolean)));
    const { error: authError } = await this.client.auth.signInWithPassword({
      email: session.email,
      password,
      options: { captchaToken: await this.captcha() },
    });
    if (authError?.code === 'captcha_failed') {
      throw new StaffAuthError('indisponivel', CAPTCHA_FAILED_MESSAGE);
    }
    if (authError) throw new StaffAuthError('credenciais', 'Senha incorreta.');

    const { error } = await this.client.rpc('reset_counter_pin', {
      p_tenant_id: session.tenantId,
      p_new_pin: next,
    });
    if (error) throw toAppError(error);
  }

  private async tenantId(): Promise<string> {
    const session = await firstValueFrom(this.auth.watchSession().pipe(filter(Boolean)));
    return session.tenantId;
  }
}

function toCheck(row: CheckRow | undefined): PinCheck {
  return {
    ok: !!row?.ok,
    remaining: row?.remaining ?? null,
    lockedUntil: iso(row?.locked_until ?? null),
  };
}
