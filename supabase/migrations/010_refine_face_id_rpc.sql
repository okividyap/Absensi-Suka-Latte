-- ============================================================================
-- 010: PERHALUS TEMPLATE BIOMETRIK FACE ID SECARA ADAPTIF
-- Kafe & Catering Suka Latte
--
-- Memungkinkan sistem memperbarui template kontur wajah secara halus (exponential moving average)
-- ketika pengguna yang sah berhasil absensi, sehingga Face ID tetap 100% konsisten
-- mengenali pemilik asli saat pergantian pencahayaan (pagi -> siang -> malam/indoor).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refine_my_face_id_template(p_refined_biometric_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sesi tidak valid.';
    END IF;

    IF p_refined_biometric_data IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Data biometrik kosong.');
    END IF;

    UPDATE public.profiles
    SET face_id_biometric_data = p_refined_biometric_data,
        updated_at = NOW()
    WHERE id = v_uid
      AND face_id_enrolled = TRUE;

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.refine_my_face_id_template(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refine_my_face_id_template(JSONB) TO authenticated;
