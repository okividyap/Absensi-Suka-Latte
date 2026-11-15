-- ============================================================================
-- SUKA LATTE ATTENDANCE SYSTEM — MIGRASI 007
-- 1. Pendaftaran 1 Wajah per 1 Akun Google (Biometric Face ID Anti-Joki)
-- 2. Pertukaran Shift / Pertukaran Libur (Mutual Shift & Day-Off Swap)
-- ============================================================================

-- A. EKSTENSI TABEL PROFILES UNTUK FACE ID RESMI
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS face_id_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS face_id_enrolled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS face_id_biometric_data JSONB,
ADD COLUMN IF NOT EXISTS face_id_photo_path TEXT;

-- B. RPC PENDAFTARAN FACE ID OLEH KARYAWAN (1 WAJAH PER AKUN GOOGLE)
CREATE OR REPLACE FUNCTION public.register_face_id(
    p_biometric_data JSONB,
    p_photo_path TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_actor.status <> 'active' OR v_actor.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Akun pengguna tidak aktif atau belum disetujui.';
    END IF;

    UPDATE public.profiles
    SET 
        face_id_enrolled = TRUE,
        face_id_enrolled_at = NOW(),
        face_id_biometric_data = p_biometric_data,
        face_id_photo_path = p_photo_path,
        updated_at = NOW()
    WHERE id = auth.uid();

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
        auth.uid(),
        v_actor.full_name,
        v_actor.role::TEXT,
        'FACE_ID_ENROLLED',
        'profiles',
        v_actor.id::TEXT,
        FORMAT('Pendaftaran Face ID resmi berhasil untuk akun Google %s (%s)', v_actor.email, v_actor.employee_code)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Face ID resmi berhasil didaftarkan untuk akun Google Anda.'
    );
END;
$$;

-- C. RPC RESET FACE ID OLEH MANAGER (SUPER ADMIN & ADMIN)
CREATE OR REPLACE FUNCTION public.reset_face_id(
    p_employee_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_target public.profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_actor.status <> 'active' OR v_actor.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Akun pengelola tidak aktif.';
    END IF;
    IF v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Hanya Super Admin atau Admin yang dapat mereset Face ID.';
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_employee_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Karyawan tidak ditemukan.';
    END IF;

    UPDATE public.profiles
    SET 
        face_id_enrolled = FALSE,
        face_id_enrolled_at = NULL,
        face_id_biometric_data = NULL,
        face_id_photo_path = NULL,
        updated_at = NOW()
    WHERE id = p_employee_id;

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
        auth.uid(),
        v_actor.full_name,
        v_actor.role::TEXT,
        'FACE_ID_RESET',
        'profiles',
        p_employee_id::TEXT,
        FORMAT('Reset Face ID resmi untuk %s (%s) oleh %s. Alasan: %s', v_target.full_name, v_target.employee_code, v_actor.full_name, COALESCE(p_reason, 'Permintaan pembaruan biometrik'))
    );

    RETURN jsonb_build_object('ok', true, 'message', 'Face ID karyawan berhasil direset.');
END;
$$;

REVOKE ALL ON FUNCTION public.register_face_id(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_face_id(JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.reset_face_id(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_face_id(UUID, TEXT) TO authenticated;

-- D. TABEL PERTUKARAN SHIFT / LIBUR (MUTUAL SHIFT SWAP REQUESTS)
CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    requester_date DATE NOT NULL,
    requester_schedule_type TEXT NOT NULL DEFAULT 'work' CHECK (requester_schedule_type IN ('work', 'off')),
    requester_shift_id UUID REFERENCES public.work_shifts(id) ON DELETE SET NULL,
    target_date DATE NOT NULL,
    target_schedule_type TEXT NOT NULL DEFAULT 'work' CHECK (target_schedule_type IN ('work', 'off')),
    target_shift_id UUID REFERENCES public.work_shifts(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    requester_notes TEXT,
    target_response_notes TEXT,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_swap_distinct_employees CHECK (requester_id <> target_employee_id)
);

CREATE INDEX IF NOT EXISTS idx_shift_swaps_requester ON public.shift_swap_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_shift_swaps_target ON public.shift_swap_requests(target_employee_id);
CREATE INDEX IF NOT EXISTS idx_shift_swaps_status ON public.shift_swap_requests(status);

ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'shift_swap_requests' AND policyname = 'swap_select_parties_and_managers'
    ) THEN
        CREATE POLICY "swap_select_parties_and_managers" ON public.shift_swap_requests
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                  AND status = 'active' 
                  AND first_login_approved = true
                  AND (
                    id = shift_swap_requests.requester_id 
                    OR id = shift_swap_requests.target_employee_id 
                    OR role IN ('super_admin', 'admin')
                  )
            )
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'shift_swap_requests' AND policyname = 'swap_insert_requester'
    ) THEN
        CREATE POLICY "swap_insert_requester" ON public.shift_swap_requests
        FOR INSERT WITH CHECK (
            auth.uid() = requester_id AND
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                  AND status = 'active' 
                  AND first_login_approved = true
            )
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'shift_swap_requests' AND policyname = 'swap_update_parties'
    ) THEN
        CREATE POLICY "swap_update_parties" ON public.shift_swap_requests
        FOR UPDATE USING (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                  AND status = 'active' 
                  AND first_login_approved = true
                  AND (
                    (id = shift_swap_requests.target_employee_id AND shift_swap_requests.status = 'pending')
                    OR (id = shift_swap_requests.requester_id AND shift_swap_requests.status = 'pending')
                    OR role IN ('super_admin', 'admin')
                  )
            )
        );
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON public.shift_swap_requests TO authenticated;

-- E. RPC MEMBUAT PENGAJUAN TUKAR SHIFT / LIBUR
CREATE OR REPLACE FUNCTION public.create_shift_swap_request(
    p_target_employee_id UUID,
    p_requester_date DATE,
    p_target_date DATE,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_target public.profiles%ROWTYPE;
    v_req_sched public.work_schedules%ROWTYPE;
    v_tar_sched public.work_schedules%ROWTYPE;
    v_req_shift_id UUID;
    v_tar_shift_id UUID;
    v_req_type TEXT := 'work';
    v_tar_type TEXT := 'work';
    v_swap public.shift_swap_requests%ROWTYPE;
    v_pending_exists BOOLEAN;
BEGIN
    SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_actor.status <> 'active' OR v_actor.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Akun tidak aktif.';
    END IF;

    IF auth.uid() = p_target_employee_id THEN
        RAISE EXCEPTION 'INVALID_TARGET: Tidak dapat mengajukan tukar shift dengan diri sendiri.';
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_employee_id;
    IF NOT FOUND OR v_target.status <> 'active' OR v_target.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'NOT_FOUND: Rekan kerja tidak ditemukan atau belum aktif.';
    END IF;

    -- Cegah duplikasi permohonan pending yang sama persis
    SELECT EXISTS (
        SELECT 1 FROM public.shift_swap_requests
        WHERE requester_id = auth.uid()
          AND target_employee_id = p_target_employee_id
          AND requester_date = p_requester_date
          AND target_date = p_target_date
          AND status = 'pending'
    ) INTO v_pending_exists;

    IF v_pending_exists THEN
        RAISE EXCEPTION 'DUPLICATE_REQUEST: Pengajuan tukar shift pada tanggal tersebut masih menunggu persetujuan rekan Anda.';
    END IF;

    -- Ambil jadwal pemohon
    SELECT * INTO v_req_sched FROM public.work_schedules 
    WHERE employee_id = auth.uid() AND schedule_date = p_requester_date;
    IF FOUND THEN
        v_req_type := v_req_sched.schedule_type;
        v_req_shift_id := v_req_sched.shift_id;
    ELSE
        v_req_shift_id := v_actor.shift_id;
        v_req_type := 'work';
    END IF;

    -- Ambil jadwal target
    SELECT * INTO v_tar_sched FROM public.work_schedules 
    WHERE employee_id = p_target_employee_id AND schedule_date = p_target_date;
    IF FOUND THEN
        v_tar_type := v_tar_sched.schedule_type;
        v_tar_shift_id := v_tar_sched.shift_id;
    ELSE
        v_tar_shift_id := v_target.shift_id;
        v_tar_type := 'work';
    END IF;

    -- Validasi sederhana: tidak menukar sesuatu yang sama persis jika tanggalnya sama
    IF p_requester_date = p_target_date AND v_req_type = v_tar_type AND COALESCE(v_req_shift_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(v_tar_shift_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        RAISE EXCEPTION 'SAME_SCHEDULE: Jadwal Anda dan rekan Anda pada tanggal tersebut sudah sama persis.';
    END IF;

    INSERT INTO public.shift_swap_requests (
        requester_id,
        target_employee_id,
        requester_date,
        requester_schedule_type,
        requester_shift_id,
        target_date,
        target_schedule_type,
        target_shift_id,
        status,
        requester_notes
    )
    VALUES (
        auth.uid(),
        p_target_employee_id,
        p_requester_date,
        v_req_type,
        v_req_shift_id,
        p_target_date,
        v_tar_type,
        v_tar_shift_id,
        'pending',
        NULLIF(TRIM(p_notes), '')
    )
    RETURNING * INTO v_swap;

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
        auth.uid(),
        v_actor.full_name,
        v_actor.role::TEXT,
        'SHIFT_SWAP_REQUESTED',
        'shift_swap_requests',
        v_swap.id::TEXT,
        FORMAT('Mengajukan tukar jadwal ke %s (%s): [%s (%s)] ⇄ [%s (%s)]', 
            v_target.full_name, v_target.employee_code,
            p_requester_date, v_req_type,
            p_target_date, v_tar_type
        )
    );

    RETURN jsonb_build_object('ok', true, 'swap_request', to_jsonb(v_swap));
END;
$$;

-- F. RPC MENANGGAPI PERMINTAAN TUKAR SHIFT (SETUJUI / TOLAK ATAS PERSETUJUAN KEDUA BELAH PIHAK)
CREATE OR REPLACE FUNCTION public.respond_shift_swap_request(
    p_request_id UUID,
    p_accept BOOLEAN,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_swap public.shift_swap_requests%ROWTYPE;
    v_requester public.profiles%ROWTYPE;
    v_new_status TEXT;
BEGIN
    SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_actor.status <> 'active' OR v_actor.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Akun tidak aktif.';
    END IF;

    SELECT * INTO v_swap FROM public.shift_swap_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Pengajuan tukar shift tidak ditemukan.';
    END IF;

    IF v_swap.status <> 'pending' THEN
        RAISE EXCEPTION 'INVALID_STATE: Pengajuan tukar shift ini sudah tidak berstatus pending.';
    END IF;

    -- Hanya pihak kedua (target) atau admin yang berhak menyetujui/menolak
    IF v_swap.target_employee_id <> auth.uid() AND v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Hanya rekan yang dituju yang dapat menyetujui pertukaran ini.';
    END IF;

    SELECT * INTO v_requester FROM public.profiles WHERE id = v_swap.requester_id;

    IF p_accept THEN
        v_new_status := 'approved';

        -- EKSEKUSI PERTUKARAN JADWAL SECARA ATOMIK DI TABEL WORK_SCHEDULES
        -- 1. Jadwal pada requester_date:
        -- Jika pertukaran terjadi pada hari yang sama (requester_date = target_date)
        IF v_swap.requester_date = v_swap.target_date THEN
            -- Requester mengambil target_shift & target_type
            INSERT INTO public.work_schedules (
                employee_id, schedule_date, shift_id, outlet_id, schedule_type, notes, created_by, updated_at
            )
            VALUES (
                v_swap.requester_id,
                v_swap.requester_date,
                CASE WHEN v_swap.target_schedule_type = 'off' THEN NULL ELSE v_swap.target_shift_id END,
                v_requester.outlet_id,
                v_swap.target_schedule_type,
                'Tukar shift disetujui bersama ' || v_actor.full_name,
                auth.uid(),
                NOW()
            )
            ON CONFLICT (employee_id, schedule_date)
            DO UPDATE SET
                shift_id = CASE WHEN EXCLUDED.schedule_type = 'off' THEN NULL ELSE EXCLUDED.shift_id END,
                schedule_type = EXCLUDED.schedule_type,
                notes = EXCLUDED.notes,
                updated_at = NOW();

            -- Target mengambil requester_shift & requester_type
            INSERT INTO public.work_schedules (
                employee_id, schedule_date, shift_id, outlet_id, schedule_type, notes, created_by, updated_at
            )
            VALUES (
                v_swap.target_employee_id,
                v_swap.target_date,
                CASE WHEN v_swap.requester_schedule_type = 'off' THEN NULL ELSE v_swap.requester_shift_id END,
                v_actor.outlet_id,
                v_swap.requester_schedule_type,
                'Tukar shift disetujui bersama ' || v_requester.full_name,
                auth.uid(),
                NOW()
            )
            ON CONFLICT (employee_id, schedule_date)
            DO UPDATE SET
                shift_id = CASE WHEN EXCLUDED.schedule_type = 'off' THEN NULL ELSE EXCLUDED.shift_id END,
                schedule_type = EXCLUDED.schedule_type,
                notes = EXCLUDED.notes,
                updated_at = NOW();
        ELSE
            -- Pertukaran pada dua tanggal berbeda:
            -- Pada requester_date: requester mendapatkan target_schedule_type & target_shift_id;
            -- target_employee mengisi posisi requester_date dengan requester_shift
            INSERT INTO public.work_schedules (
                employee_id, schedule_date, shift_id, outlet_id, schedule_type, notes, created_by, updated_at
            )
            VALUES (
                v_swap.requester_id,
                v_swap.requester_date,
                CASE WHEN v_swap.target_schedule_type = 'off' THEN NULL ELSE v_swap.target_shift_id END,
                v_requester.outlet_id,
                v_swap.target_schedule_type,
                'Tukar jadwal disetujui bersama ' || v_actor.full_name,
                auth.uid(),
                NOW()
            )
            ON CONFLICT (employee_id, schedule_date)
            DO UPDATE SET
                shift_id = CASE WHEN EXCLUDED.schedule_type = 'off' THEN NULL ELSE EXCLUDED.shift_id END,
                schedule_type = EXCLUDED.schedule_type,
                notes = EXCLUDED.notes,
                updated_at = NOW();

            INSERT INTO public.work_schedules (
                employee_id, schedule_date, shift_id, outlet_id, schedule_type, notes, created_by, updated_at
            )
            VALUES (
                v_swap.target_employee_id,
                v_swap.requester_date,
                CASE WHEN v_swap.requester_schedule_type = 'off' THEN NULL ELSE v_swap.requester_shift_id END,
                v_actor.outlet_id,
                v_swap.requester_schedule_type,
                'Tukar jadwal disetujui bersama ' || v_requester.full_name,
                auth.uid(),
                NOW()
            )
            ON CONFLICT (employee_id, schedule_date)
            DO UPDATE SET
                shift_id = CASE WHEN EXCLUDED.schedule_type = 'off' THEN NULL ELSE EXCLUDED.shift_id END,
                schedule_type = EXCLUDED.schedule_type,
                notes = EXCLUDED.notes,
                updated_at = NOW();

            -- Pada target_date:
            INSERT INTO public.work_schedules (
                employee_id, schedule_date, shift_id, outlet_id, schedule_type, notes, created_by, updated_at
            )
            VALUES (
                v_swap.requester_id,
                v_swap.target_date,
                CASE WHEN v_swap.requester_schedule_type = 'off' THEN NULL ELSE v_swap.requester_shift_id END,
                v_requester.outlet_id,
                v_swap.requester_schedule_type,
                'Tukar jadwal disetujui bersama ' || v_actor.full_name,
                auth.uid(),
                NOW()
            )
            ON CONFLICT (employee_id, schedule_date)
            DO UPDATE SET
                shift_id = CASE WHEN EXCLUDED.schedule_type = 'off' THEN NULL ELSE EXCLUDED.shift_id END,
                schedule_type = EXCLUDED.schedule_type,
                notes = EXCLUDED.notes,
                updated_at = NOW();

            INSERT INTO public.work_schedules (
                employee_id, schedule_date, shift_id, outlet_id, schedule_type, notes, created_by, updated_at
            )
            VALUES (
                v_swap.target_employee_id,
                v_swap.target_date,
                CASE WHEN v_swap.target_schedule_type = 'off' THEN NULL ELSE v_swap.target_shift_id END,
                v_actor.outlet_id,
                v_swap.target_schedule_type,
                'Tukar jadwal disetujui bersama ' || v_requester.full_name,
                auth.uid(),
                NOW()
            )
            ON CONFLICT (employee_id, schedule_date)
            DO UPDATE SET
                shift_id = CASE WHEN EXCLUDED.schedule_type = 'off' THEN NULL ELSE EXCLUDED.shift_id END,
                schedule_type = EXCLUDED.schedule_type,
                notes = EXCLUDED.notes,
                updated_at = NOW();
        END IF;

    ELSE
        v_new_status := 'rejected';
    END IF;

    UPDATE public.shift_swap_requests
    SET 
        status = v_new_status,
        target_response_notes = NULLIF(TRIM(p_notes), ''),
        responded_at = NOW(),
        updated_at = NOW()
    WHERE id = p_request_id
    RETURNING * INTO v_swap;

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
        auth.uid(),
        v_actor.full_name,
        v_actor.role::TEXT,
        CASE WHEN p_accept THEN 'SHIFT_SWAP_APPROVED' ELSE 'SHIFT_SWAP_REJECTED' END,
        'shift_swap_requests',
        v_swap.id::TEXT,
        FORMAT('%s pertukaran shift dari %s (%s) [%s ⇄ %s]. Catatan: %s',
            CASE WHEN p_accept THEN 'Menyetujui' ELSE 'Menolak' END,
            v_requester.full_name, v_requester.employee_code,
            v_swap.requester_date, v_swap.target_date,
            COALESCE(p_notes, '-')
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'status', v_new_status,
        'swap_request', to_jsonb(v_swap)
    );
END;
$$;

-- G. RPC BATALKAN PENGAJUAN TUKAR SHIFT OLEH PEMOHON
CREATE OR REPLACE FUNCTION public.cancel_shift_swap_request(
    p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_swap public.shift_swap_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_actor.status <> 'active' OR v_actor.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Akun tidak aktif.';
    END IF;

    SELECT * INTO v_swap FROM public.shift_swap_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Pengajuan tukar shift tidak ditemukan.';
    END IF;

    IF v_swap.status <> 'pending' THEN
        RAISE EXCEPTION 'INVALID_STATE: Pengajuan ini tidak dapat dibatalkan karena sudah diproses.';
    END IF;

    IF v_swap.requester_id <> auth.uid() AND v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Hanya pemohon yang dapat membatalkan pengajuan ini.';
    END IF;

    UPDATE public.shift_swap_requests
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_request_id
    RETURNING * INTO v_swap;

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
        auth.uid(),
        v_actor.full_name,
        v_actor.role::TEXT,
        'SHIFT_SWAP_CANCELLED',
        'shift_swap_requests',
        v_swap.id::TEXT,
        'Membatalkan pengajuan tukar shift'
    );

    RETURN jsonb_build_object('ok', true, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.create_shift_swap_request(UUID, DATE, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_shift_swap_request(UUID, DATE, DATE, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.respond_shift_swap_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_shift_swap_request(UUID, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_shift_swap_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_shift_swap_request(UUID) TO authenticated;

-- H. RPC DIREKTORI REKAN KERJA AKTIF (UNTUK ROSTER TIM & TUKAR SHIFT OLEH ANGGOTA)
CREATE OR REPLACE FUNCTION public.get_active_coworkers()
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    employee_code TEXT,
    role public.user_role,
    avatar_url TEXT,
    outlet_id UUID,
    shift_id UUID,
    status public.user_status,
    first_login_approved BOOLEAN,
    face_id_enrolled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND status = 'active' AND first_login_approved = true
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        p.id,
        p.full_name,
        p.employee_code,
        p.role,
        p.avatar_url,
        p.outlet_id,
        p.shift_id,
        p.status,
        p.first_login_approved,
        p.face_id_enrolled
    FROM public.profiles p
    WHERE p.status = 'active' AND p.first_login_approved = true
    ORDER BY p.full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_coworkers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_coworkers() TO authenticated;

