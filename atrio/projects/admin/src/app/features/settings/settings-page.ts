import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TenantContext } from '@atrio/core';
import { AtrCard, AtrEmptyState, AtrPageHeading } from '@atrio/ui';

@Component({
  selector: 'adm-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrPageHeading, AtrCard, AtrEmptyState],
  host: { class: 'mx-auto block w-full max-w-[1600px]' },
  template: `
    <atr-page-heading
      heading="Configurações"
      [description]="'Dados de ' + (tenant.name() || 'sua barbearia') + ' e do administrador.'"
    />
    <atr-card class="mt-6">
      <atr-empty-state
        icon="settings"
        heading="Configurações em construção"
        description="Dados da barbearia, logo, horário de funcionamento, conta do administrador e instalação do PWA."
      />
    </atr-card>
  `,
})
export class SettingsPage {
  protected readonly tenant = inject(TenantContext);
}
