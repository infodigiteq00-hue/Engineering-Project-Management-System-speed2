-- =====================================================
-- Migration: Company Highlights Schema Updates
-- Description: Adds missing columns needed for Company Highlights feature
-- Date: 2024
-- =====================================================

-- 1. Add completion_date to equipment table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'equipment' AND column_name = 'completion_date'
  ) THEN
    ALTER TABLE public.equipment 
    ADD COLUMN completion_date date;
    
    COMMENT ON COLUMN public.equipment.completion_date IS 'Expected completion date for manufacturing timeline';
  END IF;
END $$;

-- 2. Add document_name alias to vdcr_documents (or ensure we can query from vdcr_records)
-- Note: vdcr_documents has original_name and file_name, but document_name is in vdcr_records
-- We'll update the API query to join properly, but let's also add a computed column if needed
-- Actually, the API already joins vdcr_records, so we just need to ensure the query selects document_name from vdcr_records

-- 3. Ensure equipment_progress_entries has image_url column (already added in schema backup line 435)
-- The schema already includes this via the DO block, so it should be fine

-- 4. Add index on completion_date for better query performance
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_equipment_completion_date'
  ) THEN
    CREATE INDEX idx_equipment_completion_date ON public.equipment(completion_date);
  END IF;
END $$;

-- 5. Add index on equipment_progress_entries.created_at for faster date filtering
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_equipment_progress_entries_created_at'
  ) THEN
    CREATE INDEX idx_equipment_progress_entries_created_at ON public.equipment_progress_entries(created_at);
  END IF;
END $$;

-- 6. Add index on vdcr_records.updated_at for faster status change filtering
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_vdcr_records_updated_at'
  ) THEN
    CREATE INDEX idx_vdcr_records_updated_at ON public.vdcr_records(updated_at);
  END IF;
END $$;

-- 7. Add index on vdcr_documents.created_at for faster date filtering
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_vdcr_documents_created_at'
  ) THEN
    CREATE INDEX idx_vdcr_documents_created_at ON public.vdcr_documents(created_at);
  END IF;
END $$;

-- =====================================================
-- Verification Queries (run these to check schema)
-- =====================================================
-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'equipment' AND column_name = 'completion_date';

-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'equipment_progress_entries' AND column_name = 'image_url';

