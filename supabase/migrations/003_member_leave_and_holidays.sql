-- ============================================================================
-- SUKA LATTE ATTENDANCE SYSTEM — MIGRASI 003
-- Mengaktifkan pengajuan Izin / Sakit / Cuti / Libur oleh Anggota dari luar outlet
-- serta memperketat RLS INSERT agar status awal pengajuan Anggota selalu 'pending'.
-- ============================================================================

UPDATE public.system_settings
SET value = jsonb_set(value, '{allow_member_request_leaves}', 'true'::jsonb, true),
    updated_at = NOW()
WHERE key = 'operational_config';

DROP POLICY IF EXISTS "leaves_insert_own_or_manager" ON public.holidays_and_leaves;
CREATE POLICY "leaves_insert_own_or_manager" ON public.holidays_and_leaves
FOR INSERT WITH CHECK (
    (
        employee_id = auth.uid()
        AND type IN ('izin', 'sakit', 'cuti')
        AND status = 'pending'
        AND date_end >= date_start
        AND public.get_current_user_role() = 'member'
    )
    OR public.get_current_user_role() IN ('super_admin', 'admin')
);
