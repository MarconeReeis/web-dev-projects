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

  -- E-mails: Vault, pg_net e pg_cron, só o que a migração usa. As chamadas
  -- ficam gravadas para o teste conferir.
  create schema vault;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  create schema net;
  create table net.calls (url text, headers jsonb, body jsonb);
  create function net.http_post(
    url text, body jsonb default '{}', params jsonb default '{}',
    headers jsonb default '{}', timeout_milliseconds integer default 5000
  ) returns bigint language sql as $$
    insert into net.calls values (url, headers, body);
    select 1::bigint
  $$;
  create schema cron;
  create table cron.jobs (name text primary key, schedule text, command text);
  create function cron.schedule(job_name text, schedule text, command text)
  returns bigint language sql as $$
    insert into cron.jobs values (job_name, schedule, command)
    on conflict (name) do update set schedule = excluded.schedule, command = excluded.command;
    select 1::bigint
  $$;
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
       ($1, 'ana@exemplo.com',  '{"name":"Ana Souza","phone":"(11) 91111-1111","terms_version":"2026-10-21"}'),
       ($2, 'beto@exemplo.com', '{"name":"Beto Lima","phone":"(11) 92222-2222","terms_version":"2026-10-21"}'),
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

  test('cada um edita só o próprio perfil, e com dados válidos', async () => {
    const mine = await as(ANA, `update public.profiles set name = 'Ana S.' where id = $1 returning name`, [ANA]);
    assert.deepEqual(mine.map((r) => r.name), ['Ana S.']);
    await as(ANA, `update public.profiles set name = 'Ana Souza' where id = $1`, [ANA]);

    // O do outro não aparece para ela: o update não acha linha nenhuma.
    const other = await as(ANA, `update public.profiles set name = 'Invasor' where id = $1 returning id`, [BETO]);
    assert.equal(other.length, 0);

    assert.match(
      await fails(as(ANA, `update public.profiles set phone = '123' where id = $1`, [ANA])),
      /check constraint/,
    );
  });
});

describe('aceite dos termos (LGPD)', () => {
  const SEM_ACEITE = '00000000-0000-4000-8000-0000000000e1';

  test('o perfil nasce com a versão aceita e a hora do banco', async () => {
    const { rows } = await db.query(
      `select terms_version, terms_accepted_at > now() - interval '1 hour' as recente
         from public.profiles where id = $1`,
      [ANA],
    );
    assert.deepEqual(rows, [{ terms_version: '2026-10-21', recente: true }]);
  });

  test('cadastro de cliente sem aceite é recusado', async () => {
    assert.equal(
      await fails(
        db.query(
          `insert into auth.users (id, email, raw_user_meta_data)
           values ($1, 'semaceite@exemplo.com', '{"name":"Sem Aceite","phone":"(11) 95555-5555"}')`,
          [SEM_ACEITE],
        ),
      ),
      'termos_nao_aceitos',
    );
    const { rows } = await db.query(`select 1 from auth.users where id = $1`, [SEM_ACEITE]);
    assert.equal(rows.length, 0);
  });

  test('o cliente não forja versão nem data por update', async () => {
    assert.match(
      await fails(as(ANA, `update public.profiles set terms_accepted_at = '2020-01-01' where id = $1`, [ANA])),
      /permission denied/,
    );
    assert.match(
      await fails(as(ANA, `update public.profiles set terms_version = '2099-01-01' where id = $1`, [ANA])),
      /permission denied/,
    );
  });

  test('accept_terms registra uma versão nova com a hora do banco', async () => {
    const [{ accept_terms: at }] = await as(ANA, `select public.accept_terms('2027-01-15')`);
    const { rows } = await db.query(`select terms_version, terms_accepted_at from public.profiles where id = $1`, [ANA]);
    assert.equal(rows[0].terms_version, '2027-01-15');
    assert.equal(rows[0].terms_accepted_at.getTime(), at.getTime());

    assert.equal(await fails(as(ANA, `select public.accept_terms('qualquer')`)), 'versao_invalida');
    assert.equal(await fails(as(STAFF, `select public.accept_terms('2027-01-15')`)), 'sem_perfil');
    assert.match(await fails(as(null, `select public.accept_terms('2027-01-15')`)), /permission denied/);

    await db.query(`update public.profiles set terms_version = '2026-10-21' where id = $1`, [ANA]);
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

  test('endereço reservado pelo Átrio ou fora do formato é recusado', async () => {
    assert.equal(await fails(create('service_role', 'planos')), 'endereco_reservado');
    assert.equal(await fails(create('service_role', 'Perfil')), 'endereco_reservado');
    assert.equal(await fails(create('service_role', 'barbearia do zé')), 'endereco_invalido');

    // A regra é da tabela: nem por SQL direto uma barbearia vira "/entrar".
    assert.match(
      await fails(db.query(`update public.tenants set slug = 'entrar' where id = $1`, [TENANT])),
      /tenants_slug_nao_reservado/,
    );
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
       values ($1, 'impostor@exemplo.com', '{"name":"Impostor","phone":"(11) 92222-2222","terms_version":"2026-10-21"}')`,
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

describe('e-mails do agendamento', () => {
  // O e-mail do responsável — um teste de Configurações acima já o trocou.
  let SHOP;
  before(async () => {
    SHOP = (await db.query(`select admin_email from public.tenant_accounts where tenant_id = $1`, [TENANT]))
      .rows[0].admin_email;
  });
  const reschedule = (user, id, at) =>
    as(user, `select * from public.reschedule_appointment($1, $2, null)`, [id, at]);
  const cancel = (user, id) => as(user, `select * from public.cancel_appointment($1)`, [id]);
  const outbox = async (appointmentId) =>
    (
      await db.query(
        `select kind, recipient, to_email, status, previous_starts_at
           from public.email_outbox where appointment_id = $1
          order by kind, recipient`,
        [appointmentId],
      )
    ).rows;
  const betoClient = async () =>
    (await db.query(`select id from public.clients where user_id = $1`, [BETO])).rows[0].id;
  const brief = (rows) => rows.map((r) => `${r.kind}:${r.recipient}:${r.to_email}`);

  let byApp;
  let atCounter;

  test('cliente marca pelo app: confirmação para ele, aviso para a barbearia', async () => {
    [byApp] = await book(BETO, RAFAEL, BARBA, await nextWeek(4, '14:00'));
    assert.deepEqual(brief(await outbox(byApp.id)), [
      'agendado:cliente:beto@exemplo.com',
      `novo_horario:barbearia:${SHOP}`,
    ]);
  });

  test('equipe marca no balcão: só o cliente com conta recebe', async () => {
    [atCounter] = await as(
      STAFF,
      `select * from public.create_appointment($1, $2, now() + interval '3 days', 'Beto Lima', null, $3)`,
      [CAIO, CORTE, await betoClient()],
    );
    assert.deepEqual(brief(await outbox(atCounter.id)), ['agendado:cliente:beto@exemplo.com']);

    const [walkIn] = await as(
      STAFF,
      `select * from public.create_appointment($1, $2, now() + interval '3 days 2 hours', 'Avulso')`,
      [CAIO, CORTE],
    );
    assert.deepEqual(await outbox(walkIn.id), []);
  });

  test('cliente remarca: os dois recebem, com o horário de antes', async () => {
    const before = new Date(byApp.starts_at).getTime();
    await reschedule(BETO, byApp.id, await nextWeek(4, '16:00'));
    const rows = (await outbox(byApp.id)).filter((r) => r.kind === 'reagendado');
    assert.deepEqual(brief(rows), [`reagendado:barbearia:${SHOP}`, 'reagendado:cliente:beto@exemplo.com']);
    assert.ok(rows.every((r) => new Date(r.previous_starts_at).getTime() === before));
  });

  test('quem cancela não é avisado: o outro lado é', async () => {
    await cancel(BETO, byApp.id);
    assert.deepEqual(
      brief((await outbox(byApp.id)).filter((r) => r.kind === 'cancelado')),
      [`cancelado:barbearia:${SHOP}`],
    );

    await cancel(STAFF, atCounter.id);
    assert.deepEqual(
      brief((await outbox(atCounter.id)).filter((r) => r.kind === 'cancelado')),
      ['cancelado:cliente:beto@exemplo.com'],
    );
  });

  test('só a chave de serviço pega a fila', async () => {
    assert.match(await fails(as(BETO, `select * from public.claim_emails()`)), /permission denied/);
    assert.match(await fails(as(STAFF, `select * from public.claim_emails()`)), /permission denied/);
    assert.match(await fails(as(null, `select * from public.email_outbox`)), /permission denied/);
  });

  test('a fila descarta o aviso que perdeu o sentido e entrega o resto completo', async () => {
    const claimed = await as('service_role', `select * from public.claim_emails(1000)`);

    // O horário foi cancelado: confirmar ou lembrar dele não faz mais sentido.
    const stale = (await outbox(byApp.id)).filter((r) => r.kind !== 'cancelado');
    assert.ok(stale.length > 0 && stale.every((r) => r.status === 'descartado'), JSON.stringify(stale));

    const notice = claimed.find((c) => c.appointment_id === byApp.id && c.kind === 'cancelado');
    assert.equal(notice.recipient, 'barbearia');
    assert.equal(notice.reply_to, 'beto@exemplo.com'); // a barbearia responde ao cliente
    assert.equal(notice.tenant_slug, 'navalha-e-co');
    assert.equal(notice.time_zone, 'America/Sao_Paulo');
    assert.equal(notice.professional_name, 'Rafael Lima');

    const toClient = claimed.find((c) => c.appointment_id === atCounter.id && c.kind === 'cancelado');
    assert.equal(toClient.reply_to, SHOP); // e o cliente, à barbearia

    // Reservado não sai de novo numa segunda chamada.
    const again = await as('service_role', `select id from public.claim_emails(1000)`);
    assert.ok(!again.some((c) => c.id === notice.id));
  });

  test('enviado sai da fila; falha volta, até a quinta', async () => {
    const [row] = (
      await db.query(`select id from public.email_outbox where status = 'enviando' order by created_at limit 1`)
    ).rows;
    await as('service_role', `select public.finish_email($1, true)`, [row.id]);
    const [sent] = (await db.query(`select status, sent_at from public.email_outbox where id = $1`, [row.id])).rows;
    assert.equal(sent.status, 'enviado');
    assert.ok(sent.sent_at);

    const [other] = (
      await db.query(`select id from public.email_outbox where status = 'enviando' order by created_at limit 1`)
    ).rows;
    await as('service_role', `select public.finish_email($1, false, 'Resend fora do ar')`, [other.id]);
    const [retry] = (
      await db.query(`select status, last_error from public.email_outbox where id = $1`, [other.id])
    ).rows;
    assert.deepEqual(retry, { status: 'pendente', last_error: 'Resend fora do ar' });

    await db.query(`update public.email_outbox set attempts = 5, status = 'enviando' where id = $1`, [other.id]);
    await as('service_role', `select public.finish_email($1, false, 'de novo')`, [other.id]);
    const [gaveUp] = (await db.query(`select status from public.email_outbox where id = $1`, [other.id])).rows;
    assert.equal(gaveUp.status, 'falhou');
  });

  test('lembrete na véspera, uma vez só, e não para quem marcou em cima', async () => {
    const client = await betoClient();
    const [ahead] = await as(
      STAFF,
      `select * from public.create_appointment($1, $2, now() + interval '20 hours', 'Beto Lima', null, $3)`,
      [CAIO, CORTE, client],
    );
    const [lastMinute] = await as(
      STAFF,
      `select * from public.create_appointment($1, $2, now() + interval '22 hours', 'Beto Lima', null, $3)`,
      [CAIO, CORTE, client],
    );
    // Marcado há três dias: ganha lembrete. O outro, marcado agora, não.
    await db.query(`update public.appointments set created_at = now() - interval '3 days' where id = $1`, [
      ahead.id,
    ]);

    await db.query(`select private.enqueue_reminders()`);
    await db.query(`select private.enqueue_reminders()`);

    assert.deepEqual(brief((await outbox(ahead.id)).filter((r) => r.kind === 'lembrete')), [
      'lembrete:cliente:beto@exemplo.com',
    ]);
    assert.deepEqual((await outbox(lastMinute.id)).filter((r) => r.kind === 'lembrete'), []);
  });

  test('a cada minuto: sem Vault nada é chamado; com ele, a função recebe o segredo', async () => {
    const [job] = (await db.query(`select schedule, command from cron.jobs where name = 'atrio-enviar-emails'`))
      .rows;
    assert.deepEqual(job, { schedule: '* * * * *', command: 'select private.dispatch_emails()' });

    await db.query(`delete from net.calls`);
    await db.query(`select private.dispatch_emails()`);
    assert.equal((await db.query(`select count(*)::int as n from net.calls`)).rows[0].n, 0);

    await db.query(`insert into vault.decrypted_secrets values
      ('emails_url', 'https://exemplo.supabase.co/functions/v1/enviar-emails'),
      ('emails_secret', 'segredo-de-teste')`);
    await db.query(`select private.dispatch_emails()`);
    const calls = (await db.query(`select url, headers from net.calls`)).rows;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://exemplo.supabase.co/functions/v1/enviar-emails');
    assert.equal(calls[0].headers['x-atrio-secret'], 'segredo-de-teste');
  });
});

describe('e-mail para avisos', () => {
  const save = (user, notice) =>
    as(
      user,
      `select public.save_tenant_settings($1, 'Navalha & Co.', '(11) 98888-1234', null, '{}', null,
                                          'Novo Responsável', 'novo@navalha.com', $2)`,
      [TENANT, notice],
    );
  const noticeOf = async (appointmentId) =>
    (
      await db.query(
        `select to_email from public.email_outbox where appointment_id = $1 and recipient = 'barbearia'`,
        [appointmentId],
      )
    ).rows.map((r) => r.to_email);

  test('com e-mail para avisos, os avisos vão para ele; em branco, para o administrador', async () => {
    await save(STAFF, ' Agenda@Navalha.com ');
    const [first] = await book(BETO, RAFAEL, BARBA, await nextWeek(4, '17:00'));
    assert.deepEqual(await noticeOf(first.id), ['agenda@navalha.com']);

    await save(STAFF, '');
    const [second] = await book(BETO, RAFAEL, BARBA, await nextWeek(4, '17:30'));
    assert.deepEqual(await noticeOf(second.id), ['novo@navalha.com']);
  });

  test('e-mail inválido é recusado; atendente não altera', async () => {
    assert.match(await fails(save(STAFF, 'sem-arroba')), /check constraint|notification_email/);
    assert.equal(await fails(save(ATTENDANT, 'outro@navalha.com')), 'sem_permissao');
  });
});

describe('planos', () => {
  // A Barbearia do Zé, criada em "cadastro de barbearia": um dono, nenhum
  // profissional — terreno limpo para os limites do Solo.
  const ZE_OWNER = '10000000-0000-4000-8000-000000000007';
  let ze;
  const setPlan = (user, plan) => as(user, `select public.set_tenant_plan($1, $2)`, [ze, plan]);
  const addPro = (name, active = true) =>
    db.query(`insert into public.professionals (tenant_id, name, active) values ($1, $2, $3) returning id`, [
      ze,
      name,
      active,
    ]);

  before(async () => {
    ze = (await db.query(`select id from public.tenants where slug = 'barbearia-do-ze'`)).rows[0].id;
  });

  test('barbearia nova nasce no plano Barbearia', async () => {
    const [account] = await as(ZE_OWNER, `select plan from public.tenant_accounts where tenant_id = $1`, [ze]);
    assert.equal(account.plan, 'barbearia');
  });

  test('só a chave de serviço troca o plano', async () => {
    assert.match(await fails(setPlan(ZE_OWNER, 'solo')), /permission denied/);
    assert.equal(await fails(setPlan('service_role', 'ouro')), 'plano_invalido');
  });

  test('rebaixar para Solo: recusa com 2 profissionais ativos, aceita com 1', async () => {
    await addPro('Zé');
    const { rows } = await addPro('Tião');
    assert.equal(await fails(setPlan('service_role', 'solo')), 'rebaixar_profissionais');

    await db.query(`update public.professionals set active = false where id = $1`, [rows[0].id]);
    await setPlan('service_role', 'solo');
    const [account] = await as(ZE_OWNER, `select plan from public.tenant_accounts where tenant_id = $1`, [ze]);
    assert.equal(account.plan, 'solo');
  });

  test('no Solo, um segundo profissional ativo é recusado — nem novo, nem reativado', async () => {
    assert.equal(await fails(addPro('Novo')), 'limite_do_plano');

    const { rows } = await addPro('Folguista', false); // inativo pode
    assert.equal(
      await fails(db.query(`update public.professionals set active = true where id = $1`, [rows[0].id])),
      'limite_do_plano',
    );
  });

  test('no Solo, só a conta do dono: atendente é recusado', async () => {
    assert.equal(
      await fails(
        db.query(`insert into public.tenant_members (tenant_id, user_id, role) values ($1, $2, 'atendente')`, [
          ze,
          BETO,
        ]),
      ),
      'limite_do_plano',
    );
  });

  test('no Solo, o caixa não aceita despesa nova', async () => {
    const reason = await fails(
      as(
        ZE_OWNER,
        `insert into public.finance_entries (tenant_id, kind, description, amount_cents, occurred_at, category)
         values ($1, 'despesa', 'Lâminas', 4500, now(), 'produtos')`,
        [ze],
      ),
    );
    assert.match(reason, /row-level security/);
  });

  test('de volta ao Barbearia, os limites somem; com atendente, não rebaixa', async () => {
    await setPlan('service_role', 'barbearia');
    await addPro('Segundo');
    await db.query(`insert into public.tenant_members (tenant_id, user_id, role) values ($1, $2, 'atendente')`, [
      ze,
      BETO,
    ]);
    await as(
      ZE_OWNER,
      `insert into public.finance_entries (tenant_id, kind, description, amount_cents, occurred_at, category)
       values ($1, 'despesa', 'Lâminas', 4500, now(), 'produtos')`,
      [ze],
    );

    await db.query(`update public.professionals set active = false where tenant_id = $1 and name <> 'Zé'`, [ze]);
    assert.equal(await fails(setPlan('service_role', 'solo')), 'rebaixar_equipe');
  });
});

describe('avisos do painel (sino)', () => {
  const notices = async (appointmentId) =>
    (
      await db.query(
        `select kind, client_name, read_at, previous_starts_at
           from public.notifications where appointment_id = $1 order by created_at`,
        [appointmentId],
      )
    ).rows;

  let booked;

  test('cliente marca, remarca e cancela pelo app: um aviso para cada', async () => {
    [booked] = await book(BETO, RAFAEL, BARBA, await nextWeek(1, '16:00'));
    await as(BETO, `select * from public.reschedule_appointment($1, $2, null)`, [
      booked.id,
      await nextWeek(1, '16:30'),
    ]);
    await as(BETO, `select * from public.cancel_appointment($1)`, [booked.id]);

    const rows = await notices(booked.id);
    assert.deepEqual(
      rows.map((r) => r.kind),
      ['novo_horario', 'reagendado', 'cancelado'],
    );
    assert.equal(rows[0].client_name, 'Beto Lima');
    assert.ok(rows[1].previous_starts_at, 'a remarcação guarda o horário de antes');
  });

  test('o que a própria equipe faz não vira aviso', async () => {
    const [atCounter] = await as(
      STAFF,
      `select * from public.create_appointment($1, $2, now() + interval '4 days', 'Balcão')`,
      [CAIO, CORTE],
    );
    await as(STAFF, `select * from public.cancel_appointment($1)`, [atCounter.id]);
    assert.deepEqual(await notices(atCounter.id), []);
  });

  test('a equipe lê e marca como lido; mais nada muda', async () => {
    const mine = await as(STAFF, `select id from public.notifications where appointment_id = $1`, [booked.id]);
    assert.equal(mine.length, 3);

    await as(STAFF, `update public.notifications set read_at = now() where appointment_id = $1`, [booked.id]);
    assert.ok((await notices(booked.id)).every((r) => r.read_at));

    assert.match(
      await fails(as(STAFF, `update public.notifications set client_name = 'Outro' where appointment_id = $1`, [booked.id])),
      /permission denied/,
    );
  });

  test('cliente e outra barbearia não veem os avisos', async () => {
    assert.deepEqual(await as(BETO, `select id from public.notifications`), []);
    assert.deepEqual(await as(OTHER_STAFF, `select id from public.notifications`), []);
    assert.match(await fails(as(null, `select id from public.notifications`)), /permission denied/);
  });

  test('avisos antigos saem uma vez por dia', async () => {
    const [job] = (await db.query(`select schedule, command from cron.jobs where name = 'atrio-limpar-avisos'`)).rows;
    assert.equal(job.schedule, '15 3 * * *');
    assert.match(job.command, /delete from public\.notifications where created_at < now\(\) - interval '60 days'/);
  });
});

describe('confirmação pelo barbeiro', () => {
  const confirm = (user, id) => as(user, `select * from public.confirm_appointment($1)`, [id]);
  const decline = (user, id) => as(user, `select * from public.decline_appointment($1)`, [id]);
  const byToken = (token, action) =>
    as('service_role', `select * from public.respond_by_token($1, $2)`, [token, action]);
  const row = async (id) => (await db.query(`select * from public.appointments where id = $1`, [id])).rows[0];
  const outbox = async (id) =>
    (
      await db.query(
        `select kind || ':' || recipient as k from public.email_outbox where appointment_id = $1 order by created_at, recipient`,
        [id],
      )
    ).rows.map((r) => r.k);
  const notices = async (id) =>
    (await db.query(`select kind, read_at from public.notifications where appointment_id = $1 order by created_at`, [id]))
      .rows;
  const ask = async (clock) => (await book(BETO, RAFAEL, BARBA, await nextWeek(3, clock)))[0];

  before(async () => {
    await db.query(`update public.tenants set confirmation_mode = 'manual' where id = $1`, [TENANT]);
  });
  after(async () => {
    await db.query(`update public.tenants set confirmation_mode = 'automatica' where id = $1`, [TENANT]);
  });

  let request;

  test('cliente pede: nasce pendente, com prazo de 2h antes e token, e o horário fica ocupado', async () => {
    request = await ask('09:00');
    assert.equal(request.status, 'pendente');
    assert.equal(new Date(request.starts_at) - new Date(request.respond_by), 2 * 3600_000);
    assert.ok(request.response_token);

    assert.equal(
      await fails(as(STAFF, `select * from public.create_appointment($1, $2, $3, 'Outro')`, [
        RAFAEL,
        BARBA,
        request.starts_at,
      ])),
      'horario_ocupado',
    );
  });

  test('pedido: cliente recebe "pedido recebido"; a barbearia, o pedido e o aviso no sino', async () => {
    assert.deepEqual(await outbox(request.id), ['pedido:barbearia', 'pedido_recebido:cliente']);
    assert.deepEqual((await notices(request.id)).map((n) => n.kind), ['pedido']);
  });

  test('a equipe marca no balcão: nasce confirmado, mesmo no modo de confirmar', async () => {
    const [counter] = await as(
      STAFF,
      `select * from public.create_appointment($1, $2, now() + interval '5 days', 'Balcão')`,
      [CAIO, CORTE],
    );
    assert.equal(counter.status, 'agendado');
  });

  test('cliente e outra barbearia não respondem o pedido', async () => {
    assert.equal(await fails(confirm(BETO, request.id)), 'nao_encontrado');
    assert.equal(await fails(confirm(OTHER_STAFF, request.id)), 'nao_encontrado');
    assert.match(await fails(as(STAFF, `select * from public.respond_by_token($1, 'confirmar')`, [request.response_token])),
      /permission denied/);
  });

  test('barbearia confirma: vira agendado, o cliente recebe a confirmação e o aviso fica lido', async () => {
    const [confirmed] = await confirm(STAFF, request.id);
    assert.equal(confirmed.status, 'agendado');
    assert.equal(confirmed.response_token, null);
    assert.ok((await outbox(request.id)).includes('agendado:cliente'));
    assert.ok((await notices(request.id)).every((n) => n.read_at));

    assert.equal(await fails(confirm(STAFF, request.id)), 'ja_respondido');
  });

  test('barbearia recusa: o cliente recebe "recusado", ninguém mais é avisado, e o horário fica livre', async () => {
    const asked = await ask('09:30');
    await decline(STAFF, asked.id);

    const declined = await row(asked.id);
    assert.equal(declined.status, 'cancelado');
    assert.equal(declined.declined_reason, 'recusado');
    assert.deepEqual(await outbox(asked.id), ['pedido:barbearia', 'pedido_recebido:cliente', 'recusado:cliente']);
    assert.deepEqual((await notices(asked.id)).map((n) => n.kind), ['pedido']);

    const [again] = await as(STAFF, `select * from public.create_appointment($1, $2, $3, 'Outro')`, [
      RAFAEL,
      BARBA,
      asked.starts_at,
    ]);
    assert.equal(again.status, 'agendado');
  });

  test('pelo e-mail: "ver" não muda nada, "confirmar" vale uma vez', async () => {
    const asked = await ask('10:30');
    const [seen] = await byToken(asked.response_token, 'ver');
    assert.equal(seen.result, 'pendente');
    assert.equal(seen.client_name, 'Beto Lima');
    assert.equal((await row(asked.id)).status, 'pendente');

    const [done] = await byToken(asked.response_token, 'confirmar');
    assert.equal(done.result, 'confirmado');
    assert.equal((await row(asked.id)).status, 'agendado');

    const [reused] = await byToken(asked.response_token, 'recusar');
    assert.equal(reused.result, 'invalido');
    assert.equal((await row(asked.id)).status, 'agendado');
  });

  test('pelo e-mail, recusar também avisa o cliente e não vira "cancelado" no sino', async () => {
    const asked = await ask('11:00');
    const [done] = await byToken(asked.response_token, 'recusar');
    assert.equal(done.result, 'recusado');
    assert.ok((await outbox(asked.id)).includes('recusado:cliente'));
    assert.deepEqual((await notices(asked.id)).map((n) => n.kind), ['pedido']);
  });

  test('sem resposta no prazo: recusado sozinho, cliente avisado, sino avisa', async () => {
    const asked = await ask('11:30');
    await db.query(`update public.appointments set respond_by = now() - interval '1 minute' where id = $1`, [asked.id]);
    await db.query(`select private.expire_pending()`);

    const expired = await row(asked.id);
    assert.equal(expired.status, 'cancelado');
    assert.equal(expired.declined_reason, 'sem_resposta');
    assert.ok((await outbox(asked.id)).includes('recusado:cliente'));
    assert.deepEqual((await notices(asked.id)).map((n) => n.kind), ['pedido', 'sem_resposta']);
  });

  test('cliente pode desistir do pedido: a barbearia é avisada', async () => {
    const asked = await ask('14:00');
    await as(BETO, `select * from public.cancel_appointment($1)`, [asked.id]);
    assert.ok((await outbox(asked.id)).includes('cancelado:barbearia'));
    assert.deepEqual((await notices(asked.id)).map((n) => n.kind), ['pedido', 'cancelado']);
  });

  test('a fila leva o token só no pedido, e descarta o pedido já respondido', async () => {
    const pending = await ask('13:00');
    const answered = await ask('13:30');
    await confirm(STAFF, answered.id);

    const claimed = await as('service_role', `select * from public.claim_emails(1000)`);
    const toShop = claimed.find((c) => c.appointment_id === pending.id && c.kind === 'pedido');
    assert.equal(toShop.response_token, pending.response_token);
    const toClient = claimed.find((c) => c.appointment_id === pending.id && c.kind === 'pedido_recebido');
    assert.equal(toClient.response_token, null);

    const stale = (
      await db.query(
        `select status from public.email_outbox where appointment_id = $1 and kind in ('pedido', 'pedido_recebido')`,
        [answered.id],
      )
    ).rows;
    assert.ok(stale.length === 2 && stale.every((r) => r.status === 'descartado'));
  });
});
