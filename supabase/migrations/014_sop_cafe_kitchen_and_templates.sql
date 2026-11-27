-- ============================================================================
-- SUKA LATTE ATTENDANCE SYSTEM - MIGRATION 014
-- SOP CAFE (BAR/FOh) & SOP KITCHEN (DAPUR/BOH) + EDITABLE SOP TEMPLATES
-- ============================================================================

-- 1. Tambah kolom department ke shift_checklists ('cafe' atau 'kitchen')
ALTER TABLE public.shift_checklists 
ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'cafe';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'shift_checklists_department_check'
    ) THEN
        ALTER TABLE public.shift_checklists 
        ADD CONSTRAINT shift_checklists_department_check 
        CHECK (department IN ('cafe', 'kitchen'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shift_checklists_dept ON public.shift_checklists(department);

-- 2. Masukkan template default SOP Cafe & Kitchen ke system_settings
INSERT INTO public.system_settings (key, value)
VALUES (
    'sop_templates',
    jsonb_build_object(
        'cafe', jsonb_build_object(
            'opening', jsonb_build_array(
                'Nyalakan mesin espresso & water boiler (pastikan tekanan 9 bar & suhu stabil)',
                'Nyalakan grinder & kalibrasi dial-in espresso (cek yield 18g/36g & brew time 25-30s)',
                'Cek stok bahan baku bar (Susu segar, house blend beans, sirup, es batu & cup)',
                'Nyalakan AC, pencahayaan kafe & sound system / playlist resmi',
                'Bersihkan seluruh meja bar, rapikan area seating & hitung kas modal laci kasir'
            ),
            'closing', jsonb_build_array(
                'Backflush group head mesin espresso dengan blind basket & chemical espresso',
                'Bersihkan steam wand (lap basah & rendam air panas), drip tray & kosongkan hopper grinder',
                'Buang ampas kopi, cuci knock box & bersihkan sink tempat cuci bar',
                'Matikan mesin espresso, grinder, AC, sound system & seluruh lampu outlet',
                'Rekap omset transaksi kasir harian & pastikan pintu/jendela terkunci rapat'
            )
        ),
        'kitchen', jsonb_build_object(
            'opening', jsonb_build_array(
                'Nyalakan exhaust hood & periksa ventilasi udara dapur',
                'Periksa suhu chiller (0-4°C) & freezer (-18°C), pastikan semua bahan segar aman',
                'Siapkan mise en place (potongan sayur, daging porsi, bumbu dasar & saus)',
                'Nyalakan kompor, deep fryer, rice cooker, dan cek instalasi api & gas LPG',
                'Sanitasi talenan, pisau, dan seluruh workstation dapur dengan cairan food-grade'
            ),
            'closing', jsonb_build_array(
                'Matikan seluruh kompor gas, regulator api, deep fryer, dan oven',
                'Simpan dan tutup rapat semua bahan makanan di chiller/freezer dengan label tanggal',
                'Kuras dan saring minyak goreng / bersihkan grease trap dapur',
                'Cuci, sterilkan, dan tiriskan seluruh peralatan masak, wajan, panci & pisau dapur',
                'Sapu, pel lantai dapur dengan desinfektan degreaser & buang sampah organik ke luar'
            )
        )
    )
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value;

-- 3. Function RPC simpan template SOP oleh admin
CREATE OR REPLACE FUNCTION public.save_sop_templates(p_templates JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.get_current_user_role() NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Hanya admin atau manajer yang berwenang mengubah template SOP';
    END IF;

    INSERT INTO public.system_settings (key, value, updated_by, updated_at)
    VALUES ('sop_templates', p_templates, auth.uid(), NOW())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW();

    RETURN p_templates;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_sop_templates(JSONB) TO authenticated;
