/**
 * Monta cada e-mail do agendamento a partir de uma linha da fila
 * (public.claim_emails). Puro — sem Deno, sem rede —, para ser testado no
 * Node (render.test.ts) e usado pela função (index.ts).
 *
 * Datas e horas no fuso da barbearia: o "15:00" do e-mail é o da agenda,
 * esteja o cliente onde estiver.
 */

export type EmailKind = 'agendado' | 'novo_horario' | 'cancelado' | 'reagendado' | 'lembrete';

export interface EmailRow {
  id: string;
  kind: EmailKind;
  recipient: 'cliente' | 'barbearia';
  to_email: string;
  reply_to: string | null;
  appointment_id: string;
  starts_at: string;
  ends_at: string;
  previous_starts_at: string | null;
  service_name: string;
  price_cents: number;
  professional_name: string;
  client_name: string;
  client_phone: string | null;
  notes: string | null;
  tenant_name: string;
  tenant_slug: string;
  tenant_phone: string | null;
  tenant_address: Record<string, string | null> | null;
  time_zone: string;
}

export interface RenderOptions {
  /** Endereço do app do cliente, sem barra no fim: https://atrioagenda.com.br */
  appUrl: string;
  /** Endereço do painel, sem barra no fim. */
  painelUrl: string;
  /** "Agora", para o lembrete dizer "hoje" ou "amanhã". */
  now?: Date;
}

export interface RenderedEmail {
  fromName: string;
  subject: string;
  html: string;
  text: string;
}

/** Antecedência mínima para o cliente mudar pelo app — ver private.change_limit. */
const CHANGE_LIMIT_HOURS = 2;

export function render(row: EmailRow, options: RenderOptions): RenderedEmail {
  const when = describeTime(row, options.now ?? new Date());
  const shop = row.tenant_name;
  const client = row.client_name;
  const myAppointment = `${options.appUrl}/${row.tenant_slug}/meus-horarios/${row.appointment_id}`;
  const inAgenda = `${options.painelUrl}/agenda?agendamento=${row.appointment_id}`;
  const fromClientSide = `${shop} · Átrio Agenda`;
  const fromShopSide = 'Átrio Agenda';

  const details: Detail[] = [
    ['Serviço', `${row.service_name} · ${minutesBetween(row.starts_at, row.ends_at)} min`],
    ['Profissional', row.professional_name],
    ['Data', capitalize(when.longDate)],
    ['Horário', `${when.start} – ${when.end}`],
  ];
  const clientDetails: Detail[] = [
    ...details,
    ['Valor', `${money(row.price_cents)} · pagamento na barbearia`],
    ...(address(row.tenant_address) ? [['Local', address(row.tenant_address)] as Detail] : []),
  ];
  const shopDetails: Detail[] = [
    ['Cliente', row.client_phone ? `${client} · ${formatPhone(row.client_phone)}` : client],
    ...details,
    ...(row.notes ? [['Observações', row.notes] as Detail] : []),
  ];

  switch (row.kind) {
    case 'agendado':
      return compose({
        fromName: fromClientSide,
        subject: `Horário confirmado: ${when.shortDate} às ${when.start}`,
        brand: shop,
        heading: 'Seu horário está marcado',
        lead: sentence(`Te esperamos na ${shop}`),
        details: clientDetails,
        action: ['Ver meu agendamento', myAppointment],
        footnote: `Precisa mudar? Reagende ou cancele pelo app até ${CHANGE_LIMIT_HOURS} horas antes.`,
      });

    case 'lembrete':
      return compose({
        fromName: fromClientSide,
        subject: `${capitalize(when.relativeDay)} às ${when.start}: ${row.service_name} na ${shop}`,
        brand: shop,
        heading: `${capitalize(when.relativeDay)} é dia de ${row.service_name.toLowerCase()}`,
        lead: `Lembrete do seu horário com ${row.professional_name}.`,
        details: clientDetails,
        action: ['Ver meu agendamento', myAppointment],
        footnote: `Não vai conseguir ir? Reagende ou cancele pelo app até ${CHANGE_LIMIT_HOURS} horas antes — o horário fica livre para outra pessoa.`,
      });

    case 'reagendado': {
      const before = row.previous_starts_at ? describeInstant(row.previous_starts_at, row.time_zone) : null;
      const previous: Detail[] = before ? [['Antes', `${before.shortDate} às ${before.start}`]] : [];
      return row.recipient === 'cliente'
        ? compose({
            fromName: fromClientSide,
            subject: `Horário alterado: agora ${when.shortDate} às ${when.start}`,
            brand: shop,
            heading: 'Seu horário mudou',
            lead: 'O novo horário já está na agenda da barbearia.',
            details: [...clientDetails, ...previous],
            action: ['Ver meu agendamento', myAppointment],
          })
        : compose({
            fromName: fromShopSide,
            subject: `Remarcado: ${client} · agora ${when.shortDate} às ${when.start}`,
            brand: shop,
            heading: 'Um cliente remarcou',
            lead: `${client} mudou o horário pelo app.`,
            details: [...shopDetails, ...previous],
            action: ['Abrir na agenda', inAgenda],
          });
    }

    case 'cancelado':
      return row.recipient === 'cliente'
        ? compose({
            fromName: fromClientSide,
            subject: `Horário cancelado: ${when.shortDate} às ${when.start}`,
            brand: shop,
            heading: 'Seu horário foi cancelado',
            lead: `A ${shop} cancelou o seu horário. Se quiser, marque outro pelo app.`,
            details,
            action: ['Marcar outro horário', `${options.appUrl}/${row.tenant_slug}/agendar`],
            footnote: 'Dúvidas? Responda este e-mail para falar com a barbearia.',
          })
        : compose({
            fromName: fromShopSide,
            subject: `Cancelado: ${client} · ${when.shortDate} às ${when.start}`,
            brand: shop,
            heading: 'Um cliente cancelou',
            lead: `${client} cancelou pelo app. O horário já está livre na agenda.`,
            details: shopDetails,
            action: ['Abrir na agenda', inAgenda],
          });

    case 'novo_horario':
      return compose({
        fromName: fromShopSide,
        subject: `Novo horário: ${client} · ${when.shortDate} às ${when.start}`,
        brand: shop,
        heading: 'Novo agendamento pelo app',
        lead: `${client} marcou um horário.`,
        details: shopDetails,
        action: ['Abrir na agenda', inAgenda],
      });
  }
}

// ─── datas ──────────────────────────────────────────────────────────────

interface InstantLabels {
  /** "terça-feira, 20 de outubro" */
  longDate: string;
  /** "ter, 20/10" */
  shortDate: string;
  /** "15:00" */
  start: string;
  /** "2026-10-20", para comparar dias */
  isoDay: string;
}

function describeInstant(instant: string, timeZone: string): InstantLabels {
  const date = new Date(instant);
  const fmt = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('pt-BR', { ...options, timeZone }).format(date);
  const weekday = fmt({ weekday: 'short' }).replace('.', '');
  return {
    longDate: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
    shortDate: `${weekday}, ${fmt({ day: '2-digit', month: '2-digit' })}`,
    start: fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    isoDay: new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date),
  };
}

function describeTime(row: EmailRow, now: Date) {
  const start = describeInstant(row.starts_at, row.time_zone);
  const end = describeInstant(row.ends_at, row.time_zone);
  const today = describeInstant(now.toISOString(), row.time_zone).isoDay;
  const tomorrow = describeInstant(new Date(now.getTime() + 86_400_000).toISOString(), row.time_zone).isoDay;
  const relativeDay =
    start.isoDay === today ? 'hoje' : start.isoDay === tomorrow ? 'amanhã' : start.longDate;
  return { ...start, end: end.start, relativeDay };
}

function minutesBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
}

// ─── formato ────────────────────────────────────────────────────────────

function money(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function address(value: EmailRow['tenant_address']): string | null {
  if (!value) return null;
  const street = [value['street'], value['number']].filter(Boolean).join(', ');
  const line = [street, value['complement'], value['district']].filter(Boolean).join(' · ');
  const city = [value['city'], value['state']].filter(Boolean).join(' - ');
  return [line, city].filter(Boolean).join(' — ') || null;
}

/**
 * "(11) 91234-5678" — o mesmo formato do app (projects/shared/data/src/lib/
 * phone.ts). Cadastros antigos guardaram só os dígitos.
 */
function formatPhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+') && !digits.startsWith('55')) return value.trim();
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value.trim();
}

/** Fecha a frase com ponto — sem dobrar o de "Navalha & Co.". */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Nome, observação e serviço vêm de quem digitou: nunca viram HTML. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ─── o e-mail ───────────────────────────────────────────────────────────

type Detail = [label: string, value: string];

interface Composition {
  fromName: string;
  subject: string;
  /** Linha pequena acima do título: de onde vem o aviso. */
  brand: string;
  heading: string;
  lead: string;
  details: Detail[];
  action: [label: string, url: string];
  footnote?: string;
}

/**
 * Mesmo desenho dos e-mails de conta (supabase/templates): cartão branco,
 * título, texto, um botão e o aviso de e-mail automático.
 */
function compose(c: Composition): RenderedEmail {
  const rows = c.details
    .map(
      ([label, value]) => `
            <tr>
              <td style="padding:6px 0;font-size:13px;color:#71717a;vertical-align:top;width:110px;">${escapeHtml(label)}</td>
              <td style="padding:6px 0;font-size:14px;color:#18181b;font-weight:600;">${escapeHtml(value)}</td>
            </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(c.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;">
            <tr>
              <td style="padding:32px 32px 0;font-size:14px;font-weight:700;color:#71717a;">${escapeHtml(c.brand)}</td>
            </tr>
            <tr>
              <td style="padding:12px 32px 0;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;">${escapeHtml(c.heading)}</h1>
                <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#3f3f46;">${escapeHtml(c.lead)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;">${rows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0;">
                <a href="${escapeHtml(c.action[1])}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 24px;border-radius:12px;">${escapeHtml(c.action[0])}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;font-size:13px;line-height:1.6;color:#71717a;">${c.footnote ? escapeHtml(c.footnote) : '&nbsp;'}</td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">Átrio Agenda · E-mail automático.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    c.heading,
    '',
    c.lead,
    '',
    ...c.details.map(([label, value]) => `${label}: ${value}`),
    '',
    `${c.action[0]}: ${c.action[1]}`,
    ...(c.footnote ? ['', c.footnote] : []),
    '',
    '— Átrio Agenda',
  ].join('\n');

  return { fromName: c.fromName, subject: c.subject, html, text };
}
