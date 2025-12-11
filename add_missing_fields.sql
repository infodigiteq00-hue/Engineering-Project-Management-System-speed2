-- SQL Queries to Add Missing Fields to standalone_equipment Table
-- Run these queries in Supabase SQL Editor

-- Step 2: Basic Information Fields
ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS client_name character varying NULL;

ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS plant_location character varying NULL;

ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS po_number character varying NULL;

ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS sales_order_date timestamp with time zone NULL;

ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS client_industry character varying NULL;

ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS equipment_manager character varying NULL;

ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS consultant character varying NULL;

ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS tpi_agency character varying NULL;

ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS client_focal_point character varying NULL;

-- Step 3: Scope & Documents Fields
ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS services_included jsonb NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS scope_description text NULL;

ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS kickoff_meeting_notes text NULL;

ALTER TABLE public.standalone_equipment 
ADD COLUMN IF NOT EXISTS special_production_notes text NULL;

-- Optional: Add indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_client_name 
ON public.standalone_equipment USING btree (client_name) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_standalone_equipment_po_number 
ON public.standalone_equipment USING btree (po_number) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_standalone_equipment_equipment_manager 
ON public.standalone_equipment USING btree (equipment_manager) TABLESPACE pg_default;














