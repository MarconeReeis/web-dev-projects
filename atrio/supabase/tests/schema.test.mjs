/**
 * Testes do esquema do banco, contra um Postgres de verdade (PGlite: Postgres
 * compilado para WebAssembly, sem servidor nem Docker).
 *
 *   npm run test:db
 *
 * Carrega as migrações e o seed na ordem em que o Supabase carregaria, e
 * exercita as regras como cada tipo de visitante: anon, cliente com conta,
 * equipe de uma barbearia, equipe de outra. A RLS vale de verdade aqui — cada
 * consulta roda com o papel trocado, não como superusuário.
 *
 * O que o Supabase fornece e as migrações pressupõem (papéis anon e
 * authenticated, auth.users, auth.uid(), o esquema extensions) é recriado no
 * mínimo necessário em `supabaseStandIn`.
 */
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const TENANT = '00000000-0000-4000-8000-000000000001';
const RAFAEL = '00000000-0000-4000-8000-0000000000b1';
const DIEGO = '00000000-0000-4000-8000-0000000000b2';
const CAIO = '00000000-0000-4000-8000-0000000000b3';
const MARCOS = '00000000-0000-4000-8000-0000000000b4';
const CORTE = '00000000-0000-4000-8000-0000000000a1';
const BARBA = '00000000-0000-4000-8000-0000000000a2';

const ANA = '10000000-0000-4000-8000-000000000001';
const BETO = '10000000-0000-4000-8000-000000000002';
const STAFF = '10000000-0000-4000-8000-000000000003';
const OTHER_STAFF = '10000000-0000-4000-8000-000000000004';
const NO_PROFILE = '10000000-0000-4000-8000-000000000005';
const ATTENDANT = '10000000-0000-4000-8000-000000000006';

const supabaseStandIn = `
  create role anon nologin;
  create role authenticated nologin;
  -- Como no Supabase: a chave de administrador ignora a RLS.
  create role service_role nologin bypassrls;
  create schema extensions;
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    last_sign_in_at timestamptz
  );
  -- Como o Supabase: o usuário vem do JWT da requisição.
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;

  -- Storage: só o que as políticas usam. A RLS vem ligada, como no Supabase.
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text not null,
    owner uuid default auth.uid()
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
`;

let db;

/** Roda como `user` (null = anon; 'service_role' = chave de administrador). */
async function as(user, sql, params = []) {
  return db.transaction(async (tx) => {
    const role = user === 'service_role' ? 'service_role' : user ? 'authenticated' : 'anon';
    await tx.query(`set local role ${role}`);
    const sub = user && user !== 'service_role' ? user : '';
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
    return (await tx.query(sql, params)).rows;
  });
}

/** Espera uma falha; devolve o hint (código estável) ou a mensagem. */
async function fails(promise) {
  try {
    await promise;
  } catch (error) {
    return error.hint ?? error.message;
  }
  assert.fail('era para falhar, e passou');
}

/** Próxima segunda-feira, hh:mm em São Paulo, como timestamptz ISO. */
async function nextWeek(weekdayOffset, clock) {
  const { rows } = await db.query(
    `select ((date_trunc('week', now() at time zone 'America/Sao_Paulo')
              + interval '7 days' + $1 * interval '1 day' + $2::time)
             at time zone 'America/Sao_Paulo') as at`,
    [weekdayOffset, clock],
  );
  return rows[0].at.toISOString();
}

const book = (user, professional, service, at) =>
  as(user, `select * from public.book_appointment($1, $2, $3)`, [professional, service, at]);

before(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  await db.exec(supabaseStandIn);

  const migrations = readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const file of migrations) {
    await db.exec(readFileSync(join(root, 'migrations', file), 'utf8'));
  }
  await db.exec(readFileSync(join(root, 'seed.sql'), 'utf8'));

  // Contas: dois clientes, a equipe da Navalha, a equipe de outra barbearia
  // e uma conta sem nome/telefone (como as criadas pelo painel do Supabase).
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'ana@exemplo.com',  '{"name":"Ana Souza","phone":"(11) 91111-1111"}'),
       ($2, 'beto@exemplo.com', '{"name":"Beto Lima","phone":"(11) 92222-2222"}'),
       ($3, 'equipe@navalha.com', '{}'),
       ($4, 'equipe@outra.com', '{}'),
       ($5, 'semdados@exemplo.com', '{}'),
       ($6, 'atendente@navalha.com', '{}')`,
    [ANA, BETO, STAFF, OTHER_STAFF, NO_PROFILE, ATTENDANT],
  );
  await db.query(
    `insert into public.tenant_members (tenant_id, user_id, role) values ($1, $2, 'atendente')`,
    [TENANT, ATTENDANT],
  );
  await db.query(`insert into public.tenant_members (tenant_id, user_id, role) values ($1, $2, 'dono')`, [
    TENANT,
    STAFF,
  ]);
  await db.exec(`
    insert into public.tenants (id, slug, name) values
      ('00000000-0000-4000-8000-000000000002', 'outra-barbearia', 'Outra');
    insert into public.tenant_members (tenant_id, user_id, role) values
      ('00000000-0000-4000-8000-000000000002', '${OTHER_STAFF}', 'dono');
  `);
});

after(async () => {
  await db?.close();
});

describe('vitrine (anon)', () => {
  test('lê barbearia, profissionais e serviços ativos', async () => {
    const tenants = await as(null, `select slug from public.tenants where id = $1`, [TENANT]);
    const pros = await as(null, `select name from public.professionals order by name`);
    const services = await as(null, `select name from public.services`);

    assert.equal(tenants[0].slug, 'navalha-e-co');
    assert.deepEqual(pros.map((p) => p.name), ['Caio Prado', 'Diego Nunes', 'Rafael Lima']);
    assert.equal(services.length, 4);
  });

  test('não lê agenda, bloqueios, caixa nem dados da assinatura', async () => {
    for (const table of ['appointments', 'time_blocks', 'finance_entries', 'tenant_accounts', 'clients']) {
      const reason = await fails(as(null, `select * from public.${table}`));
      assert.match(reason, /permission denied/, table);
    }
  });
});

describe('conta nova', () => {
  test('cadastro com nome e telefone ganha perfil; conta sem dados, não', async () => {
    const { rows } = await db.query(`select id from public.profiles order by name`);
    assert.deepEqual(rows.map((r) => r.id), [ANA, BETO]);
  });

  test('cada um lê só o próprio perfil', async () => {
    const rows = await as(ANA, `select name from public.profiles`);
    assert.deepEqual(rows.map((r) => r.name), ['Ana Souza']);
  });
});

describe('horário duplo', () => {
  test('marca, e o mesmo horário recusa a segunda pessoa', async () => {
    const at = await nextWeek(0, '10:00');
    const [row] = await book(ANA, RAFAEL, BARBA, at);

    assert.equal(row.price_cents, 3500);
    assert.equal(row.duration_minutes, 30);
    assert.equal(row.client_name, 'Ana Souza');
    assert.equal(new Date(row.ends_at) - new Date(row.starts_at), 30 * 60_000);

    assert.equal(await fails(book(BETO, RAFAEL, BARBA, at)), 'horario_ocupado');
  });

  test('sobreposição parcial também recusa; encostar não', async () => {
    assert.equal(await fails(book(BETO, RAFAEL, CORTE, await nextWeek(0, '09:30'))), 'horario_ocupado');
    assert.equal(await fails(book(BETO, RAFAEL, BARBA, await nextWeek(0, '10:15'))), 'horario_ocupado');

    // Termina 10:00 e começa 10:30: intervalo [início, fim).
    await book(BETO, RAFAEL, BARBA, await nextWeek(0, '09:30'));
    await book(BETO, RAFAEL, BARBA, await nextWeek(0, '10:30'));
  });

  test('outro profissional no mesmo horário está livre', async () => {
    await book(BETO, DIEGO, BARBA, await nextWeek(0, '10:00'));
  });

  test('vale até para escrita direta como superusuário', async () => {
    const reason = await fails(
      db.query(
        `insert into public.appointments (tenant_id, professional_id, service_id, service_name,
           duration_minutes, price_cents, client_name, starts_at, ends_at)
         values ($1, $2, $3, 'Barba', 30, 3500, 'Fulano', $4, $4::timestamptz + interval '30 minutes')`,
        [TENANT, RAFAEL, BARBA, await nextWeek(0, '10:10')],
      ),
    );
    assert.match(reason, /appointments_no_overlap/);
  });
});

describe('expediente e regras de marcação', () => {
  const cases = [
    ['antes de abrir', 0, '07:00', 'fora_do_expediente'],
    ['no almoço', 0, '12:15', 'fora_do_expediente'],
    ['terminando depois de fechar', 0, '19:45', 'fora_do_expediente'],
    ['domingo', 6, '10:00', 'fora_do_expediente'],
  ];
  for (const [name, day, clock, expected] of cases) {
    test(`recusa: ${name}`, async () => {
      assert.equal(await fails(book(ANA, RAFAEL, CORTE, await nextWeek(day, clock))), expected);
    });
  }

  test('aceita o último horário que ainda termina no expediente', async () => {
    await book(ANA, DIEGO, CORTE, await nextWeek(0, '19:15'));
  });

  test('recusa horário que já passou', async () => {
    const reason = await fails(book(ANA, RAFAEL, BARBA, new Date(Date.now() - 3_600_000).toISOString()));
    assert.equal(reason, 'horario_passado');
  });

  test('recusa serviço que o profissional não faz', async () => {
    assert.equal(await fails(book(ANA, CAIO, BARBA, await nextWeek(1, '10:00'))), 'servico_indisponivel');
  });

  test('recusa profissional inativo', async () => {
    assert.equal(await fails(book(ANA, MARCOS, BARBA, await nextWeek(1, '10:00'))), 'profissional_indisponivel');
  });

  test('recusa horário bloqueado pela equipe', async () => {
    const from = await nextWeek(1, '10:00');
    await as(
      STAFF,
      `insert into public.time_blocks (tenant_id, professional_id, starts_at, ends_at, reason)
       values ($1, $2, $3, $3::timestamptz + interval '2 hours', 'Consulta médica')`,
      [TENANT, RAFAEL, from],
    );
    assert.equal(await fails(book(ANA, RAFAEL, BARBA, await nextWeek(1, '10:30'))), 'horario_bloqueado');
  });

  test('anon e conta sem perfil não marcam', async () => {
    const at = await nextWeek(2, '10:00');
    assert.match(await fails(book(null, RAFAEL, BARBA, at)), /permission denied/);
    assert.equal(await fails(book(NO_PROFILE, RAFAEL, BARBA, at)), 'perfil_incompleto');
  });

  test('cliente não grava na tabela direto', async () => {
    const reason = await fails(
      as(ANA, `insert into public.appointments (tenant_id) values ($1)`, [TENANT]),
    );
    assert.match(reason, /permission denied/);
  });
});

describe('quem vê o quê na agenda', () => {
  test('cliente vê só os próprios horários', async () => {
    const ana = await as(ANA, `select client_name from public.appointments`);
    const beto = await as(BETO, `select client_name from public.appointments`);

    assert.ok(ana.length > 0 && ana.every((r) => r.client_name === 'Ana Souza'));
    assert.ok(beto.length > 0 && beto.every((r) => r.client_name === 'Beto Lima'));
  });

  test('equipe vê a agenda inteira da própria barbearia; a de outra, nada', async () => {
    const own = await as(STAFF, `select count(*)::int as n from public.appointments`);
    const other = await as(OTHER_STAFF, `select count(*)::int as n from public.appointments`);
    const total = await db.query(`select count(*)::int as n from public.appointments`);

    assert.equal(own[0].n, total.rows[0].n);
    assert.equal(other[0].n, 0);
  });

  test('horários ocupados: intervalos para todos, id só do que é seu', async () => {
    const from = await nextWeek(0, '00:00');
    const to = await nextWeek(2, '00:00');
    const sql = `select * from public.busy_intervals($1, $2, $3)`;

    const anon = await as(null, sql, [TENANT, from, to]);
    const ana = await as(ANA, sql, [TENANT, from, to]);

    assert.ok(anon.length > 0);
    assert.ok(anon.every((r) => r.appointment_id === null));
    assert.ok(ana.some((r) => r.appointment_id !== null));
    // O bloqueio aparece como intervalo, sem o motivo.
    const block = anon.find((r) => r.kind === 'bloqueio');
    assert.deepEqual(Object.keys(block).sort(), [
      'appointment_id', 'ends_at', 'kind', 'professional_id', 'starts_at',
    ]);
    assert.ok(anon.some((r) => r.kind === 'agendamento'));
  });

  test('horários ocupados não abrem janela maior que 62 dias', async () => {
    const reason = await fails(
      as(null, `select * from public.busy_intervals($1, now(), now() + interval '90 days')`, [TENANT]),
    );
    assert.equal(reason, 'janela_invalida');
  });
});

describe('reagendar e cancelar', () => {
  let anaMonday;

  before(async () => {
    const [row] = await as(
      ANA,
      `select id from public.appointments where professional_id = $1 and starts_at = $2`,
      [RAFAEL, await nextWeek(0, '10:00')],
    );
    anaMonday = row.id;
  });

  const reschedule = (user, id, at, professional = null) =>
    as(user, `select * from public.reschedule_appointment($1, $2, $3)`, [id, at, professional]);

  test('cliente move o próprio horário; o antigo não conta como ocupado', async () => {
    const [moved] = await reschedule(ANA, anaMonday, await nextWeek(0, '11:00'));
    assert.equal(new Date(moved.starts_at).toISOString(), await nextWeek(0, '11:00'));

    // 11:00 → 11:15 sobrepõe o próprio horário de agora — e precisa passar.
    const [nudged] = await reschedule(ANA, anaMonday, await nextWeek(0, '11:15'));
    assert.equal(new Date(nudged.starts_at).toISOString(), await nextWeek(0, '11:15'));
  });

  test('não move para cima de outro horário', async () => {
    assert.equal(await fails(reschedule(ANA, anaMonday, await nextWeek(0, '10:30'))), 'horario_ocupado');
  });

  test('cliente não troca de profissional nem mexe no horário de outro', async () => {
    assert.equal(await fails(reschedule(ANA, anaMonday, await nextWeek(0, '15:00'), DIEGO)), 'sem_permissao');
    assert.equal(await fails(reschedule(BETO, anaMonday, await nextWeek(0, '15:00'))), 'nao_encontrado');
  });

  test('a menos de 2h, o cliente não cancela; a equipe sim', async () => {
    // A equipe encaixa a Ana daqui a 1h, fora do expediente se for o caso.
    const [{ id: clientId }] = await db.query(
      `select id from public.clients where user_id = $1`,
      [ANA],
    ).then((r) => r.rows);
    const [soon] = await as(
      STAFF,
      `select * from public.create_appointment($1, $2, now() + interval '1 hour', 'Ana Souza', null, $3)`,
      [CAIO, CORTE, clientId],
    );

    assert.equal(await fails(as(ANA, `select * from public.cancel_appointment($1)`, [soon.id])), 'prazo_encerrado');
    const [cancelled] = await as(STAFF, `select * from public.cancel_appointment($1)`, [soon.id]);
    assert.equal(cancelled.status, 'cancelado');
  });

  test('cancelado libera o horário para outra pessoa', async () => {
    const at = await nextWeek(3, '15:00');
    const [mine] = await book(ANA, RAFAEL, BARBA, at);
    const [cancelled] = await as(ANA, `select * from public.cancel_appointment($1)`, [mine.id]);

    assert.equal(cancelled.status, 'cancelado');
    await book(BETO, RAFAEL, BARBA, at);
  });

  test('estado final não volta', async () => {
    const [row] = await as(ANA, `select id from public.appointments where status = 'cancelado' limit 1`);
    const reason = await fails(
      as(STAFF, `update public.appointments set status = 'agendado' where id = $1`, [row.id]),
    );
    assert.equal(reason, 'transicao_invalida');
  });
});

describe('caixa', () => {
  let paid;

  test('receber dá baixa e lança o recebimento juntos, uma vez só', async () => {
    const [target] = await as(
      STAFF,
      `select id from public.appointments where status = 'agendado' and client_name = 'Beto Lima' limit 1`,
    );
    const [first] = await as(STAFF, `select * from public.register_payment($1, 'pix')`, [target.id]);
    await as(STAFF, `select * from public.register_payment($1, 'dinheiro')`, [target.id]);
    paid = target.id;

    const entries = await as(STAFF, `select * from public.finance_entries where appointment_id = $1`, [paid]);
    assert.equal(first.payment_status, 'pago');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].method, 'pix');
    assert.equal(entries[0].amount_cents, first.price_cents);
  });

  test('recebimento é imutável', async () => {
    const update = `update public.finance_entries set amount_cents = 1 where appointment_id = $1`;
    const remove = `delete from public.finance_entries where appointment_id = $1`;
    assert.equal(await fails(as(STAFF, update, [paid])), 'recebimento_imutavel');
    assert.equal(await fails(as(STAFF, remove, [paid])), 'recebimento_imutavel');
  });

  test('despesa entra pela tabela; recebimento, não', async () => {
    await as(
      STAFF,
      `insert into public.finance_entries (tenant_id, kind, description, amount_cents, occurred_at, category)
       values ($1, 'despesa', 'Lâminas', 8900, now(), 'produtos')`,
      [TENANT],
    );
    const reason = await fails(
      as(
        STAFF,
        `insert into public.finance_entries (tenant_id, kind, description, amount_cents, occurred_at, method, appointment_id)
         values ($1, 'recebimento', 'Forjado', 100, now(), 'pix', $2)`,
        [TENANT, paid],
      ),
    );
    assert.match(reason, /row-level security/);
  });

  test('cliente não registra pagamento nem lê o caixa', async () => {
    assert.equal(await fails(as(BETO, `select * from public.register_payment($1, 'pix')`, [paid])), 'nao_encontrado');
    assert.equal((await as(BETO, `select * from public.finance_entries`)).length, 0);
  });
});

describe('isolamento entre barbearias', () => {
  test('equipe de outra barbearia não marca nem edita aqui', async () => {
    const reason = await fails(
      as(
        OTHER_STAFF,
        `select * from public.create_appointment($1, $2, now() + interval '3 days', 'Intruso')`,
        [RAFAEL, CORTE],
      ),
    );
    assert.equal(reason, 'nao_encontrado');

    const updated = await as(
      OTHER_STAFF,
      `update public.services set price_cents = 1 where id = $1 returning id`,
      [CORTE],
    );
    assert.equal(updated.length, 0);
  });

  test('o banco recusa relacionar dados de barbearias diferentes', async () => {
    const pro = await db.query(
      `insert into public.professionals (tenant_id, name)
       values ('00000000-0000-4000-8000-000000000002', 'Alheio') returning id`,
    );
    const reason = await fails(
      db.query(
        `insert into public.appointments (tenant_id, professional_id, service_id, service_name,
           duration_minutes, price_cents, client_name, starts_at, ends_at)
         values ($1, $2, $3, 'Corte', 45, 4500, 'Fulano', now(), now() + interval '45 minutes')`,
        [TENANT, pro.rows[0].id, CORTE],
      ),
    );
    assert.match(reason, /foreign key/);
  });
});

describe('painel: escritas em mais de uma tabela', () => {
  const NEW_PRO = '20000000-0000-4000-8000-000000000001';
  const schedule = [
    { weekday: 1, kind: 'expediente', starts: '10:00', ends: '24:00' },
    { weekday: 1, kind: 'intervalo', starts: '14:00', ends: '15:00' },
  ];

  const saveProfessional = (user, id, tenant, name, services, rows, active = true) =>
    as(
      user,
      `select public.save_professional($1, $2, $3, null, null, null, null, $4, $5, $6) as id`,
      [id, tenant, name, active, services, JSON.stringify(rows)],
    );

  test('cria profissional com expediente e serviços numa operação', async () => {
    await saveProfessional(STAFF, NEW_PRO, TENANT, 'Novo', [CORTE, BARBA], schedule);

    const rows = await as(
      null,
      `select p.name,
              (select count(*)::int from public.professional_schedule s where s.professional_id = p.id) as horarios,
              (select count(*)::int from public.professional_services l where l.professional_id = p.id) as servicos,
              (select max(ends)::text from public.professional_schedule s where s.professional_id = p.id) as fecha
         from public.professionals p where p.id = $1`,
      [NEW_PRO],
    );
    assert.deepEqual(rows[0], { name: 'Novo', horarios: 2, servicos: 2, fecha: '24:00:00' });
  });

  test('salvar de novo substitui expediente e serviços, sem acumular', async () => {
    await saveProfessional(STAFF, NEW_PRO, TENANT, 'Novo Nome', [CORTE], schedule.slice(0, 1));

    const [row] = await as(
      null,
      `select p.name,
              (select count(*)::int from public.professional_schedule s where s.professional_id = p.id) as horarios,
              (select count(*)::int from public.professional_services l where l.professional_id = p.id) as servicos
         from public.professionals p where p.id = $1`,
      [NEW_PRO],
    );
    assert.deepEqual(row, { name: 'Novo Nome', horarios: 1, servicos: 1 });
  });

  test('o novo profissional já recebe agendamento dentro do expediente salvo', async () => {
    // Segunda 22:00 só cabe porque o expediente salvo vai até 24:00; 09:00,
    // antes de abrir às 10:00, não cabe.
    await book(ANA, NEW_PRO, CORTE, await nextWeek(0, '22:00'));
    assert.equal(await fails(book(ANA, NEW_PRO, CORTE, await nextWeek(0, '09:00'))), 'fora_do_expediente');
  });

  test('equipe de outra barbearia não salva nem "toma" o profissional', async () => {
    const other = '00000000-0000-4000-8000-000000000002';
    assert.equal(await fails(saveProfessional(OTHER_STAFF, NEW_PRO, TENANT, 'X', [], [])), 'nao_encontrado');
    // Mesmo id, barbearia dela: não move o registro de dono.
    assert.equal(await fails(saveProfessional(OTHER_STAFF, NEW_PRO, other, 'X', [], [])), 'nao_encontrado');

    const [row] = await db.query(`select tenant_id, name from public.professionals where id = $1`, [NEW_PRO]).then((r) => r.rows);
    assert.deepEqual(row, { tenant_id: TENANT, name: 'Novo Nome' });
  });

  test('erro no meio desfaz tudo', async () => {
    // Serviço inexistente: o vínculo falha, e o nome não pode ter mudado.
    const reason = await fails(
      saveProfessional(STAFF, NEW_PRO, TENANT, 'Meio Salvo', ['30000000-0000-4000-8000-000000000009'], schedule),
    );
    assert.match(reason, /foreign key/);
    const [row] = await db.query(`select name from public.professionals where id = $1`, [NEW_PRO]).then((r) => r.rows);
    assert.equal(row.name, 'Novo Nome');
  });

  test('tela de Serviços define quem realiza', async () => {
    await as(STAFF, `select public.set_service_professionals($1, $2)`, [BARBA, [RAFAEL, NEW_PRO]]);
    const rows = await as(
      null,
      `select professional_id from public.professional_services where service_id = $1 order by professional_id`,
      [BARBA],
    );
    assert.deepEqual(rows.map((r) => r.professional_id).sort(), [RAFAEL, NEW_PRO].sort());

    assert.equal(
      await fails(as(OTHER_STAFF, `select public.set_service_professionals($1, $2)`, [BARBA, []])),
      'nao_encontrado',
    );
  });

  test('configurações: dono salva; atendente e outra barbearia, não', async () => {
    const save = (user) =>
      as(
        user,
        `select public.save_tenant_settings($1, 'Navalha & Co.', '(11) 98888-1234', null, '{}', null, 'Novo Responsável', 'novo@navalha.com')`,
        [TENANT],
      );

    await save(STAFF);
    const [account] = await as(STAFF, `select admin_name, admin_email from public.tenant_accounts`);
    assert.deepEqual(account, { admin_name: 'Novo Responsável', admin_email: 'novo@navalha.com' });

    assert.equal(await fails(save(ATTENDANT)), 'sem_permissao');
    assert.equal(await fails(save(OTHER_STAFF)), 'sem_permissao');
  });
});

describe('cadastro de barbearia', () => {
  const OWNER = '10000000-0000-4000-8000-000000000007';

  before(async () => {
    await db.query(`insert into auth.users (id, email) values ($1, 'ze@barbeariadoze.com')`, [OWNER]);
  });

  const create = (user, slug, email = 'ze@barbeariadoze.com', catalog = true) =>
    as(
      user,
      `select public.create_tenant($1, 'Barbearia do Zé', $2, 'José Silva', '(11) 95555-0000', null, $3) as id`,
      [slug, email, catalog],
    );

  test('só a chave de administrador cria barbearia', async () => {
    assert.match(await fails(create(null, 'nao-deveria')), /permission denied/);
    assert.match(await fails(create(STAFF, 'nao-deveria')), /permission denied/);
  });

  test('cria vitrine, ficha, dono e catálogo de uma vez', async () => {
    const [{ id }] = await create('service_role', 'Barbearia-do-Ze');

    const [tenant] = await as(null, `select slug, name from public.tenants where id = $1`, [id]);
    assert.deepEqual(tenant, { slug: 'barbearia-do-ze', name: 'Barbearia do Zé' });

    // O dono entra no painel dela — e só dela.
    const members = await as(OWNER, `select tenant_id, role from public.tenant_members`);
    assert.deepEqual(members, [{ tenant_id: id, role: 'dono' }]);
    const [account] = await as(OWNER, `select admin_name, admin_email, subscription from public.tenant_accounts`);
    assert.deepEqual(account, { admin_name: 'José Silva', admin_email: 'ze@barbeariadoze.com', subscription: 'trial' });

    const services = await as(null, `select name from public.services where tenant_id = $1 order by price_cents`, [id]);
    assert.deepEqual(services.map((s) => s.name), ['Acabamento', 'Barba', 'Corte', 'Corte + Barba']);
  });

  test('endereço repetido é recusado, e nada fica pela metade', async () => {
    const before = await db.query(`select count(*)::int as n from public.tenants`);
    assert.equal(await fails(create('service_role', 'barbearia-do-ze')), 'endereco_em_uso');
    const after = await db.query(`select count(*)::int as n from public.tenants`);
    assert.equal(after.rows[0].n, before.rows[0].n);
  });

  test('dono sem conta é recusado antes de criar qualquer coisa', async () => {
    assert.equal(await fails(create('service_role', 'outra-do-ze', 'ninguem@exemplo.com')), 'dono_inexistente');
    const rows = await db.query(`select 1 from public.tenants where slug = 'outra-do-ze'`);
    assert.equal(rows.rows.length, 0);
  });

  test('sem catálogo inicial, quando pedido', async () => {
    const [{ id }] = await create('service_role', 'segunda-do-ze', 'ze@barbeariadoze.com', false);
    const services = await as(null, `select 1 from public.services where tenant_id = $1`, [id]);
    assert.equal(services.length, 0);
  });
});

describe('imagens no Storage', () => {
  const OTHER_TENANT = '00000000-0000-4000-8000-000000000002';
  const upload = (user, name) =>
    as(user, `insert into storage.objects (bucket_id, name) values ('midia', $1) returning name`, [name]);

  test('o bucket existe e é público para leitura', async () => {
    const { rows } = await db.query(`select public, allowed_mime_types from storage.buckets where id = 'midia'`);
    assert.deepEqual(rows[0], { public: true, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] });
  });

  test('equipe envia para a pasta da própria barbearia', async () => {
    const [row] = await upload(STAFF, `${TENANT}/profissionais/foto.jpg`);
    assert.equal(row.name, `${TENANT}/profissionais/foto.jpg`);
  });

  test('ninguém envia para a pasta de outra barbearia, nem fora do formato', async () => {
    assert.match(await fails(upload(OTHER_STAFF, `${TENANT}/profissionais/intruso.jpg`)), /row-level security/);
    assert.match(await fails(upload(ANA, `${TENANT}/profissionais/cliente.jpg`)), /row-level security/);
    assert.match(await fails(upload(null, `${TENANT}/marca/anon.jpg`)), /row-level security/);
    assert.match(await fails(upload(STAFF, `qualquer-coisa/foto.jpg`)), /row-level security/);
  });

  test('"../" no nome não escapa da pasta: o dono é sempre a primeira pasta', async () => {
    // No Storage o nome é uma chave literal, sem navegação de diretório: este
    // arquivo fica na pasta da OUTRA barbearia (quem enviou), com um nome
    // esquisito — não na Navalha.
    const name = `${OTHER_TENANT}/../${TENANT}/x.jpg`;
    const { rows } = await db.query(`select private.tenant_of_path($1) as tenant`, [name]);
    assert.equal(rows[0].tenant, OTHER_TENANT);
  });

  test('só a equipe dona remove', async () => {
    const name = `${TENANT}/marca/logo.jpg`;
    await upload(STAFF, name);

    const other = await as(OTHER_STAFF, `delete from storage.objects where name = $1 returning name`, [name]);
    assert.equal(other.length, 0);

    const own = await as(STAFF, `delete from storage.objects where name = $1 returning name`, [name]);
    assert.equal(own.length, 1);
  });
});

describe('histórico do balcão ligado à conta', () => {
  // Ana tem conta e já marcou pelo app (ficha com user_id e telefone
  // "(11) 91111-1111"). No balcão, a equipe digita o telefone de outro jeito.
  const counter = async (clock, phone = '11 91111-1111') => {
    const [row] = await as(
      STAFF,
      `select * from public.create_appointment($1, $2, $3, 'Ana (balcão)', $4)`,
      [CAIO, CORTE, await nextWeek(4, clock), phone],
    );
    return row;
  };
  const anaSees = async (id) =>
    (await as(ANA, `select id from public.appointments where id = $1`, [id])).length === 1;

  let first;

  test('antes da confirmação, o horário do balcão não é da conta', async () => {
    first = await counter('10:00');
    assert.equal(first.client_id, null);
    assert.equal(await anaSees(first.id), false);
  });

  test('a equipe recebe a sugestão; a cliente e outra barbearia, não', async () => {
    await counter('11:00', '+55 (11) 91111-1111'); // mesmo telefone, outro formato

    const [suggestion] = await as(STAFF, `select * from public.link_suggestion($1)`, [first.id]);
    assert.equal(suggestion.client_name, 'Ana Souza');
    assert.equal(suggestion.pending, 2);

    assert.equal((await as(ANA, `select * from public.link_suggestion($1)`, [first.id])).length, 0);
    assert.equal((await as(OTHER_STAFF, `select * from public.link_suggestion($1)`, [first.id])).length, 0);
  });

  test('telefone sem ficha do app não sugere nada', async () => {
    const stranger = await counter('12:00', '(11) 90000-0000');
    assert.equal((await as(STAFF, `select * from public.link_suggestion($1)`, [stranger.id])).length, 0);
  });

  test('outra barbearia não confirma a ligação', async () => {
    const [suggestion] = await as(STAFF, `select * from public.link_suggestion($1)`, [first.id]);
    assert.equal(
      await fails(as(OTHER_STAFF, `select public.link_counter_history($1)`, [suggestion.client_id])),
      'nao_encontrado',
    );
    assert.equal(await anaSees(first.id), false);
  });

  test('confirmada, o histórico aparece para a cliente — e o que vier depois também', async () => {
    const [suggestion] = await as(STAFF, `select * from public.link_suggestion($1)`, [first.id]);
    const [{ count }] = await as(STAFF, `select public.link_counter_history($1) as count`, [suggestion.client_id]);

    assert.equal(count, 2);
    assert.equal(await anaSees(first.id), true);

    // Marcado no balcão depois da confirmação: já nasce ligado.
    const later = await counter('15:00', '(11) 91111-1111');
    assert.equal(later.client_id, suggestion.client_id);
    assert.equal(await anaSees(later.id), true);
  });

  test('conta que só cadastrou o mesmo telefone não herda nada', async () => {
    // Alguém cria conta com o telefone do Beto e marca uma vez pelo app:
    // a ficha existe, mas a equipe nunca confirmou — o balcão não liga.
    const IMPOSTOR = '10000000-0000-4000-8000-000000000008';
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, 'impostor@exemplo.com', '{"name":"Impostor","phone":"(11) 92222-2222"}')`,
      [IMPOSTOR],
    );
    await book(IMPOSTOR, RAFAEL, BARBA, await nextWeek(5, '16:00'));

    const [row] = await as(
      STAFF,
      `select * from public.create_appointment($1, $2, $3, 'Beto (balcão)', '(11) 92222-2222')`,
      [DIEGO, CORTE, await nextWeek(4, '16:00')],
    );
    assert.equal(row.client_id, null);
    assert.equal((await as(IMPOSTOR, `select id from public.appointments where id = $1`, [row.id])).length, 0);
  });
});

describe('excluir minha conta (LGPD)', () => {
  let anaClient;
  let paid;
  let future;

  before(async () => {
    [{ id: anaClient }] = (await db.query(`select id from public.clients where user_id = $1`, [ANA])).rows;
    // Um atendimento da Ana já pago (vira recebimento no caixa) e um futuro.
    // Rafael: um teste anterior tirou a Barba do Diego (tela de Serviços).
    [future] = await book(ANA, RAFAEL, BARBA, await nextWeek(2, '17:00'));
    const [past] = (
      await db.query(
        `select id from public.appointments where client_id = $1 and status = 'agendado' and id <> $2 limit 1`,
        [anaClient, future.id],
      )
    ).rows;
    await as(STAFF, `select public.register_payment($1, 'pix')`, [past.id]);
    paid = past.id;
  });

  test('anônimo não exclui nada; conta da equipe não sai pelo app', async () => {
    assert.match(await fails(as(null, `select public.delete_my_account()`)), /permission denied/);
    assert.equal(await fails(as(STAFF, `select public.delete_my_account()`)), 'conta_da_equipe');
  });

  test('o recebimento continua imutável fora da exclusão', async () => {
    const reason = await fails(
      as(STAFF, `update public.finance_entries set description = 'x' where appointment_id = $1`, [paid]),
    );
    assert.equal(reason, 'recebimento_imutavel');
  });

  test('a conta sai; o histórico fica sem o nome; o caixa fica com os valores', async () => {
    const [before] = (await db.query(`select amount_cents from public.finance_entries where appointment_id = $1`, [paid])).rows;
    const ids = (await db.query(`select id from public.appointments where client_id = $1`, [anaClient])).rows.map((r) => r.id);
    assert.ok(ids.length >= 3);

    await as(ANA, `select public.delete_my_account()`);

    const { rows: user } = await db.query(`select 1 from auth.users where id = $1`, [ANA]);
    const { rows: profile } = await db.query(`select 1 from public.profiles where id = $1`, [ANA]);
    const { rows: clients } = await db.query(`select 1 from public.clients where user_id = $1 or id = $2`, [ANA, anaClient]);
    assert.equal(user.length + profile.length + clients.length, 0);

    // Os atendimentos da conta continuam existindo, sem nada que a identifique.
    // (Um marcado no balcão com OUTRO telefone e nunca ligado à conta é da
    // barbearia, não da conta — fica como está.)
    const { rows: history } = await db.query(
      `select client_id, client_name, client_phone, notes from public.appointments where id = any($1)`,
      [ids],
    );
    assert.equal(history.length, ids.length);
    for (const row of history) {
      assert.deepEqual(row, { client_id: null, client_name: 'Cliente removido', client_phone: null, notes: null });
    }

    const [entry] = (await db.query(`select description, amount_cents from public.finance_entries where appointment_id = $1`, [paid])).rows;
    assert.match(entry.description, /Cliente removido$/);
    assert.equal(entry.amount_cents, before.amount_cents);

    const [{ status }] = (await db.query(`select status from public.appointments where id = $1`, [future.id])).rows;
    assert.equal(status, 'cancelado');
  });

  test('os dados de outros clientes ficam como estavam', async () => {
    const { rows } = await db.query(`select 1 from public.appointments where client_name = 'Beto Lima'`);
    assert.ok(rows.length > 0);
    const { rows: beto } = await db.query(`select 1 from auth.users where id = $1`, [BETO]);
    assert.equal(beto.length, 1);
  });
});

describe('PIN do balcão', () => {
  const status = (user = STAFF) => as(user, `select * from public.counter_pin_status($1)`, [TENANT]);
  const verify = (pin, user = STAFF) => as(user, `select * from public.verify_counter_pin($1, $2)`, [TENANT, pin]).then((r) => r[0]);
  const setPin = (next, current = null, user = STAFF) =>
    as(user, `select * from public.set_counter_pin($1, $2, $3)`, [TENANT, next, current]).then((r) => r[0]);

  test('começa sem PIN; criar o primeiro não pede nada', async () => {
    assert.deepEqual((await status())[0], { configured: false, locked_until: null });
    assert.equal((await setPin('1234')).ok, true);
    assert.equal((await status())[0].configured, true);
  });

  test('PIN só de 4 números', async () => {
    assert.equal(await fails(setPin('12a4', '1234')), 'pin_invalido');
    assert.equal(await fails(setPin('12345', '1234')), 'pin_invalido');
  });

  test('ninguém lê o resumo do PIN — nem a própria equipe', async () => {
    assert.match(await fails(as(STAFF, `select * from public.staff_pins`)), /permission denied/);
  });

  test('acerta; erra contando as tentativas', async () => {
    assert.deepEqual(await verify('1234'), { ok: true, remaining: null, locked_until: null });
    assert.deepEqual(await verify('0000'), { ok: false, remaining: 4, locked_until: null });
    assert.deepEqual(await verify('1111'), { ok: false, remaining: 3, locked_until: null });
    // Acertar zera a contagem.
    assert.equal((await verify('1234')).ok, true);
    assert.equal((await verify('0000')).remaining, 4);
  });

  test('5 erros travam por 5 minutos — até o PIN certo é recusado', async () => {
    for (const pin of ['1111', '2222', '3333', '4444']) await verify(pin);
    const locked = await verify('5555');
    assert.equal(locked.ok, false);
    assert.ok(new Date(locked.locked_until) > new Date());

    const evenRight = await verify('1234');
    assert.equal(evenRight.ok, false);
    assert.ok(evenRight.locked_until);
    assert.ok((await status())[0].locked_until);

    // Passados os 5 minutos (simulado), volta a aceitar.
    await db.query(`update public.staff_pins set locked_until = now() - interval '1 second'`);
    assert.equal((await verify('1234')).ok, true);
  });

  test('trocar exige o PIN atual', async () => {
    assert.deepEqual(await setPin('9876', '0000'), { ok: false, remaining: 4, locked_until: null });
    assert.equal((await verify('1234')).ok, true); // não mudou

    assert.equal((await setPin('9876', '1234')).ok, true);
    assert.equal((await verify('9876')).ok, true);
    assert.equal((await verify('1234')).ok, false);
  });

  test('esqueci o PIN: só depois de entrar com a senha há pouco', async () => {
    const reset = () => as(STAFF, `select public.reset_counter_pin($1, '4321')`, [TENANT]);

    assert.equal(await fails(reset()), 'reautenticar');

    await db.query(`update auth.users set last_sign_in_at = now() where id = $1`, [STAFF]);
    await reset();
    assert.equal((await verify('4321')).ok, true);
  });

  test('outra barbearia e cliente não usam o PIN daqui', async () => {
    assert.equal(await fails(status(OTHER_STAFF)), 'nao_encontrado');
    assert.equal(await fails(verify('4321', BETO)), 'nao_encontrado');
  });
});
