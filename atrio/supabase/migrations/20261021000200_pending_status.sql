-- ════════════════════════════════════════════════════════════════════════
-- Átrio — status "pendente"
--
-- Horário pedido pelo cliente que a barbearia ainda vai confirmar (ver
-- 20261021000300_booking_confirmation.sql). Arquivo à parte porque o
-- Postgres só deixa usar um valor novo de enum depois que ele foi gravado.
-- ════════════════════════════════════════════════════════════════════════

alter type public.appointment_status add value if not exists 'pendente' before 'agendado';
