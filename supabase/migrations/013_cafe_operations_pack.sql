-- ============================================================================
-- SUKA LATTE ATTENDANCE SYSTEM - MIGRATION 013
-- CAFE OPERATIONS SUITE:
-- 1. SOP Opening & Closing Shift Checklists (Mesin Espresso, Grinder, Bar, Kasir)
-- 2. Buku Catatan Handover Antar Shift (Shift Logbook)
-- 3. Pengajuan Izin, Sakit & Cuti Mandiri (+ Bukti Surat Dokter)
-- 4. Papan Pengumuman Internal Outlet (Notice Board / Broadcast)
-- ============================================================================

-- 1. SOP OPENING & CLOSING SHIFT CHECKLISTS
CREATE TABLE IF NOT EXISTS public.shift_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    shift_id UUID REFERENCES public.work_shifts(id) ON DELETE SET NULL,
    checklist_type TEXT NOT NULL CHECK (checklist_type IN ('opening', 'closing')),
    submitted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    submitted_by_name TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_checklists_date ON public.shift_checklists(work_date);
CREATE INDEX IF NOT EXISTS idx_shift_checklists_outlet ON public.shift_checklists(outlet_id);
CREATE INDEX IF NOT EXISTS idx_shift_checklists_type ON public.shift_checklists(checklist_type);

ALTER TABLE public.shift_checklists ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shift_checklists' AND policyname = 'checklists_select_all_active') THEN
        CREATE POLICY "checklists_select_all_active" ON public.shift_checklists
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND status = 'active' AND first_login_approved = true
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shift_checklists' AND policyname = 'checklists_insert_own') THEN
        CREATE POLICY "checklists_insert_own" ON public.shift_checklists
        FOR INSERT WITH CHECK (
            auth.uid() = submitted_by AND
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND status = 'active' AND first_login_approved = true
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shift_checklists' AND policyname = 'checklists_update_own_or_manager') THEN
        CREATE POLICY "checklists_update_own_or_manager" ON public.shift_checklists
        FOR UPDATE USING (
            auth.uid() = submitted_by OR
            public.get_current_user_role() IN ('super_admin', 'admin')
        );
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.shift_checklists TO authenticated;


-- 2. BUKU CATATAN HANDOVER ANTAR SHIFT (SHIFT LOGBOOK)
CREATE TABLE IF NOT EXISTS public.shift_logbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    shift_id UUID REFERENCES public.work_shifts(id) ON DELETE SET NULL,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'umum' CHECK (category IN ('stok', 'mesin_alat', 'tamu_event', 'kebersihan', 'kasir', 'umum')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'penting', 'mendesak')),
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_logbooks_date ON public.shift_logbooks(work_date);
CREATE INDEX IF NOT EXISTS idx_shift_logbooks_outlet ON public.shift_logbooks(outlet_id);
CREATE INDEX IF NOT EXISTS idx_shift_logbooks_created ON public.shift_logbooks(created_at DESC);

ALTER TABLE public.shift_logbooks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shift_logbooks' AND policyname = 'logbooks_select_active') THEN
        CREATE POLICY "logbooks_select_active" ON public.shift_logbooks
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND status = 'active' AND first_login_approved = true
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shift_logbooks' AND policyname = 'logbooks_insert_active') THEN
        CREATE POLICY "logbooks_insert_active" ON public.shift_logbooks
        FOR INSERT WITH CHECK (
            auth.uid() = author_id AND
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND status = 'active' AND first_login_approved = true
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shift_logbooks' AND policyname = 'logbooks_update_author_or_manager') THEN
        CREATE POLICY "logbooks_update_author_or_manager" ON public.shift_logbooks
        FOR UPDATE USING (
            auth.uid() = author_id OR
            public.get_current_user_role() IN ('super_admin', 'admin')
        );
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.shift_logbooks TO authenticated;


-- 3. PAPAN PENGUMUMAN INTERNAL OUTLET (NOTICE BOARD)
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    badge_tag TEXT DEFAULT 'Pengumuman',
    priority TEXT NOT NULL DEFAULT 'info' CHECK (priority IN ('info', 'penting', 'urgent')),
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON public.announcements(is_pinned);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'announcements' AND policyname = 'announcements_select_active') THEN
        CREATE POLICY "announcements_select_active" ON public.announcements
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND status = 'active' AND first_login_approved = true
            )
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'announcements' AND policyname = 'announcements_manage_managers') THEN
        CREATE POLICY "announcements_manage_managers" ON public.announcements
        FOR ALL USING (
            public.get_current_user_role() IN ('super_admin', 'admin')
        )
        WITH CHECK (
            public.get_current_user_role() IN ('super_admin', 'admin')
        );
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;


-- 4. EKSTENSI TABEL HOLIDAYS_AND_LEAVES UNTUK SURAT DOKTER & ATTACHMENT
ALTER TABLE public.holidays_and_leaves
ADD COLUMN IF NOT EXISTS attachment_path TEXT,
ADD COLUMN IF NOT EXISTS applicant_name TEXT;

-- RPC PENGAJUAN IZIN / SAKIT / CUTI OLEH KARYAWAN
CREATE OR REPLACE FUNCTION public.request_leave(
    p_type TEXT,
    p_date_start DATE,
    p_date_end DATE,
    p_title TEXT,
    p_reason TEXT,
    p_attachment_path TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_leave public.holidays_and_leaves%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_actor.status <> 'active' OR v_actor.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Akun tidak aktif atau belum disetujui.';
    END IF;

    IF p_date_end < p_date_start THEN
        RAISE EXCEPTION 'INVALID_DATE: Tanggal selesai tidak boleh mendahului tanggal mulai.';
    END IF;

    IF p_type NOT IN ('izin', 'sakit', 'cuti') THEN
        RAISE EXCEPTION 'INVALID_TYPE: Tipe pengajuan hanya boleh izin, sakit, atau cuti.';
    END IF;

    INSERT INTO public.holidays_and_leaves (
        employee_id,
        applicant_name,
        title,
        date_start,
        date_end,
        type,
        reason,
        attachment_path,
        status,
        created_at,
        updated_at
    )
    VALUES (
        v_actor.id,
        v_actor.full_name,
        COALESCE(NULLIF(TRIM(p_title), ''), 'Pengajuan ' || INITCAP(p_type)),
        p_date_start,
        p_date_end,
        p_type,
        COALESCE(NULLIF(TRIM(p_reason), ''), '-'),
        p_attachment_path,
        'pending'::public.approval_status,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_leave;

    INSERT INTO public.audit_logs (
        actor_user_id,
        actor_name,
        actor_role,
        action,
        target_type,
        target_id,
        detail
    )
    VALUES (
        v_actor.id,
        v_actor.full_name,
        v_actor.role::TEXT,
        'LEAVE_REQUESTED',
        'holidays_and_leaves',
        v_leave.id::TEXT,
        FORMAT('Pengajuan %s (%s s/d %s): %s', p_type, p_date_start, p_date_end, p_reason)
    );

    RETURN jsonb_build_object('ok', true, 'leave', to_jsonb(v_leave));
END;
$$;

-- RPC REVIEW PERSETUJUAN / PENOLAKAN IZIN OLEH PENGELOLA
CREATE OR REPLACE FUNCTION public.review_leave_request(
    p_leave_id UUID,
    p_approved BOOLEAN,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_leave public.holidays_and_leaves%ROWTYPE;
    v_new_status public.approval_status;
BEGIN
    SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_actor.status <> 'active' OR v_actor.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Akun tidak aktif.';
    END IF;

    IF v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Hanya Admin atau Super Admin yang dapat meninjau permohonan izin.';
    END IF;

    SELECT * INTO v_leave FROM public.holidays_and_leaves WHERE id = p_leave_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Data pengajuan tidak ditemukan.';
    END IF;

    IF p_approved THEN
        v_new_status := 'approved'::public.approval_status;
    ELSE
        v_new_status := 'rejected'::public.approval_status;
    END IF;

    UPDATE public.holidays_and_leaves
    SET
        status = v_new_status,
        approved_by = v_actor.id,
        reviewed_at = NOW(),
        reason = CASE 
            WHEN p_notes IS NOT NULL AND p_notes <> '' THEN reason || ' [Catatan Admin: ' || p_notes || ']'
            ELSE reason 
        END,
        updated_at = NOW()
    WHERE id = p_leave_id
    RETURNING * INTO v_leave;

    INSERT INTO public.audit_logs (
        actor_user_id,
        actor_name,
        actor_role,
        action,
        target_type,
        target_id,
        detail
    )
    VALUES (
        v_actor.id,
        v_actor.full_name,
        v_actor.role::TEXT,
        'LEAVE_REVIEWED',
        'holidays_and_leaves',
        v_leave.id::TEXT,
        FORMAT('%s pengajuan izin %s (%s). Catatan: %s', 
            CASE WHEN p_approved THEN 'Menyetujui' ELSE 'Menolak' END,
            v_leave.type, v_leave.applicant_name, COALESCE(p_notes, '-')
        )
    );

    RETURN jsonb_build_object('ok', true, 'status', v_new_status::TEXT, 'leave', to_jsonb(v_leave));
END;
$$;

REVOKE ALL ON FUNCTION public.request_leave(TEXT, DATE, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_leave(TEXT, DATE, DATE, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.review_leave_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_leave_request(UUID, BOOLEAN, TEXT) TO authenticated;
