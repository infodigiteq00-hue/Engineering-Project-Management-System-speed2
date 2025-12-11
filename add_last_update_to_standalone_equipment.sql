-- Migration: Add last_update column to standalone_equipment table
-- Date: 2025
-- Description: Adds last_update column (date only, no time) to standalone_equipment table
--              This allows users to set a custom "Last Updated On" date for standalone equipment

-- ============================================================================
-- ADD last_update COLUMN TO standalone_equipment TABLE
-- ============================================================================
-- Add last_update column as DATE type (date only, no time component)
ALTER TABLE IF EXISTS public.standalone_equipment
ADD COLUMN IF NOT EXISTS last_update DATE;

-- Add comment to document the column
COMMENT ON COLUMN public.standalone_equipment.last_update IS 'Custom "Last Updated On" date set by user (date only, no time component)';
