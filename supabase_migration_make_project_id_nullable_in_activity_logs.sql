-- Migration: Make project_id nullable in equipment_activity_logs
-- Date: 2024
-- Description: Allows activity logging for standalone equipment (which doesn't have project_id)

-- ============================================================================
-- 1. ALTER equipment_activity_logs TABLE
-- ============================================================================
-- Make project_id nullable to support standalone equipment activity logging
ALTER TABLE public.equipment_activity_logs 
ALTER COLUMN project_id DROP NOT NULL;

-- Note: The foreign key constraint will remain but will allow NULL values
-- This is valid in PostgreSQL - foreign keys can be nullable

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- - Made project_id nullable in equipment_activity_logs table
-- - This allows activity logging for standalone equipment (no project_id)
-- - Regular equipment activity logs will still have project_id set
-- - Foreign key constraint remains but now allows NULL values


