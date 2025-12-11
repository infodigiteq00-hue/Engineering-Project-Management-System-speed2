-- Migration: Add Technical Specifications columns to equipment table
-- Date: 2024
-- Description: Adds size, material, and design_code columns to the equipment table for technical specifications

-- Add size column (dimensions: length x width x height)
ALTER TABLE public.equipment
ADD COLUMN IF NOT EXISTS size character varying;

-- Add material column (primary material specification)
ALTER TABLE public.equipment
ADD COLUMN IF NOT EXISTS material character varying;

-- Add design_code column (applicable design standard)
ALTER TABLE public.equipment
ADD COLUMN IF NOT EXISTS design_code character varying;

-- Add comments for documentation
COMMENT ON COLUMN public.equipment.size IS 'Dimensions (length x width x height), e.g., 4.2m x 1.6m';
COMMENT ON COLUMN public.equipment.material IS 'Primary material specification, e.g., SS 304, Carbon Steel';
COMMENT ON COLUMN public.equipment.design_code IS 'Applicable design standard, e.g., ASME VIII Div 1, TEMA Class R';

