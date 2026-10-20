import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type EmailRow, render } from './render.ts';

/**
 * Os e-mails como o cliente e a barbearia os recebem: horário no fuso da
 * barbearia, link certo, e nada do que alguém digitou virando HTML.
 *
 * 20/10/2026, 15:00 em São Paulo = 18:00 UTC.
 */
const base: EmailRow = {
  id: 'e1',
  kind: 'agendado',
  recipient: 'cliente',
  to_email: 'beto@exemplo.com',
  reply_to: 'admin@navalhaeco.com.br',
  appointment_id: 'ap1',
  starts_at: '2026-10-20T18:00:00Z',
  ends_at: '2026-10-20T18:40:00Z',
  previous_starts_at: null,
  service_name: 'Corte masculino',
  price_cents: 5500,
  professional_name: 'Rafael Souza',
  client_name: 'Beto Lima',
  client_phone: '(11) 92222-2222',
  notes: null,
  tenant_name: 'Navalha & Co.',
  tenant_slug: 'navalha-e-co',
  tenant_phone: '(11) 98888-1234',
  tenant_address: { street: 'Rua Augusta', number: '1472', district: 'Consolação', city: 'São Paulo', state: 'SP' },
  time_zone: 'America/Sao_Paulo',
};
const options = { appUrl: 'https://atrioagenda.com.br', painelUrl: 'https://painel.atrioagenda.com.br' };

describe('e-mails do agendamento', () => {
  test('confirmação: data e hora no fuso da barbearia, valor e link do agendamento', () => {
    const mail = render(base, options);
    assert.equal(mail.subject, 'Horário confirmado: ter, 20/10 às 15:00');
    assert.equal(mail.fromName, 'Navalha & Co. · Átrio Agenda');
    assert.match(mail.text, /Data: Terça-feira, 20 de outubro/);
    assert.match(mail.text, /Horário: 15:00 – 15:40/);
    assert.match(mail.text, /Valor: R\$\s55,00 · pagamento na barbearia/);
    assert.match(mail.text, /Local: Rua Augusta, 1472 · Consolação — São Paulo - SP/);
    assert.match(mail.html, /href="https:\/\/atrioagenda\.com\.br\/navalha-e-co\/meus-horarios\/ap1"/);
  });

  test('nome que já termina em ponto não ganha outro', () => {
    assert.match(render(base, options).text, /Te esperamos na Navalha & Co\.\n/);
    assert.match(render({ ...base, tenant_name: 'Barbearia do Zé' }, options).text, /Te esperamos na Barbearia do Zé\.\n/);
  });

  test('a mesma hora em Rio Branco sai como 13:00', () => {
    const mail = render({ ...base, time_zone: 'America/Rio_Branco' }, options);
    assert.match(mail.subject, /às 13:00$/);
  });

  test('aviso à barbearia: quem marcou, com telefone, e o link da agenda', () => {
    const mail = render({ ...base, kind: 'novo_horario', recipient: 'barbearia', notes: 'Manter o topo' }, options);
    assert.equal(mail.subject, 'Novo horário: Beto Lima · ter, 20/10 às 15:00');
    assert.equal(mail.fromName, 'Átrio Agenda');
    assert.match(mail.text, /Cliente: Beto Lima · \(11\) 92222-2222/);
    assert.match(mail.text, /Observações: Manter o topo/);
    assert.match(mail.html, /href="https:\/\/painel\.atrioagenda\.com\.br\/agenda\?agendamento=ap1"/);
  });

  test('telefone guardado só com dígitos sai formatado', () => {
    const mail = render({ ...base, kind: 'novo_horario', recipient: 'barbearia', client_phone: '1198434839' }, options);
    assert.match(mail.text, /Cliente: Beto Lima · \(11\) 9843-4839/);
  });

  test('remarcação mostra o horário de antes', () => {
    const mail = render({ ...base, kind: 'reagendado', previous_starts_at: '2026-10-19T13:00:00Z' }, options);
    assert.equal(mail.subject, 'Horário alterado: agora ter, 20/10 às 15:00');
    assert.match(mail.text, /Antes: seg, 19\/10 às 10:00/);
  });

  test('cancelamento pela barbearia convida a marcar de novo', () => {
    const mail = render({ ...base, kind: 'cancelado' }, options);
    assert.equal(mail.subject, 'Horário cancelado: ter, 20/10 às 15:00');
    assert.match(mail.html, /href="https:\/\/atrioagenda\.com\.br\/navalha-e-co\/agendar"/);
  });

  test('lembrete diz "amanhã" e "hoje" no relógio da barbearia', () => {
    const tomorrow = render({ ...base, kind: 'lembrete' }, { ...options, now: new Date('2026-10-19T20:00:00Z') });
    assert.equal(tomorrow.subject, 'Amanhã às 15:00: Corte masculino na Navalha & Co.');

    const today = render({ ...base, kind: 'lembrete' }, { ...options, now: new Date('2026-10-20T11:00:00Z') });
    assert.match(today.subject, /^Hoje às 15:00/);
  });

  test('o que alguém digitou nunca vira HTML', () => {
    const mail = render(
      { ...base, kind: 'novo_horario', recipient: 'barbearia', client_name: '<img src=x onerror=alert(1)>' },
      options,
    );
    assert.doesNotMatch(mail.html, /<img src=x/);
    assert.match(mail.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });
});
