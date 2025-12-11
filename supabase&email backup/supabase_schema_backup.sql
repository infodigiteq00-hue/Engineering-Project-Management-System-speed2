-- Supabase Database Schema Backup
-- This file contains the complete and executable schema for your Supabase project
-- All tables, constraints, and relationships are properly ordered for execution

-- Drop existing tables in correct order (to avoid foreign key constraints)
DROP TABLE IF EXISTS public.equipment_progress_images CASCADE;
DROP TABLE IF EXISTS public.equipment_team_positions CASCADE;
DROP TABLE IF EXISTS public.equipment_progress_entries CASCADE;
DROP TABLE IF EXISTS public.equipment_documents CASCADE;
DROP TABLE IF EXISTS public.equipment CASCADE;
DROP TABLE IF EXISTS public.project_members CASCADE;
DROP TABLE IF EXISTS public.unpriced_po_documents CASCADE;
DROP TABLE IF EXISTS public.design_inputs_documents CASCADE;
DROP TABLE IF EXISTS public.client_reference_documents CASCADE;
DROP TABLE IF EXISTS public.other_documents CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.firms CASCADE;

-- Create firms table first (no dependencies)
CREATE TABLE public.firms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL UNIQUE,
  subscription_plan character varying DEFAULT 'basic'::character varying,
  is_active boolean DEFAULT true,
  max_users integer DEFAULT 5,
  admin_name character varying,
  admin_email character varying UNIQUE,
  admin_phone character varying,
  admin_whatsapp character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT firms_pkey PRIMARY KEY (id)
);

-- Create users table (without project_id foreign key initially to avoid circular dependency)
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email character varying NOT NULL UNIQUE,
  full_name character varying NOT NULL,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['super_admin'::character varying::text, 'firm_admin'::character varying::text, 'project_manager'::character varying::text, 'vdcr_manager'::character varying::text, 'editor'::character varying::text, 'viewer'::character varying::text])),
  firm_id uuid,
  assigned_by uuid,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id),
  CONSTRAINT users_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);

-- Create projects table
CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL,
  client character varying,
  location character varying,
  manager character varying,
  deadline date,
  po_number character varying,
  firm_id uuid,
  created_by uuid,
  project_manager_id uuid,
  vdcr_manager_id uuid,
  scope_of_work text,
  completed_date date,
  equipment_count integer DEFAULT 0,
  active_equipment integer DEFAULT 0,
  progress integer DEFAULT 0,
  status character varying DEFAULT 'active'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  unpriced_po_documents jsonb DEFAULT '[]'::jsonb,
  design_inputs_documents jsonb DEFAULT '[]'::jsonb,
  client_reference_documents jsonb DEFAULT '[]'::jsonb,
  other_documents jsonb DEFAULT '[]'::jsonb,
  services_included jsonb DEFAULT '{"design": false, "testing": false, "commissioning": false, "documentation": false, "manufacturing": false, "installationSupport": false}'::jsonb,
  kickoff_meeting_notes text DEFAULT ''::text,
  special_production_notes text DEFAULT ''::text,
  equipment_documents jsonb DEFAULT '[]'::jsonb,
  vdcr_manager character varying,
  consultant character varying,
  tpi_agency character varying,
  client_industry character varying,
  recommendation_letter jsonb DEFAULT '{
    "status": "not-requested",
    "requestDate": null,
    "lastReminderDate": null,
    "lastReminderDateTime": null,
    "reminderCount": 0,
    "clientEmail": null,
    "clientContactPerson": null,
    "receivedDocument": null
  }'::jsonb,
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_project_manager_id_fkey FOREIGN KEY (project_manager_id) REFERENCES public.users(id),
  CONSTRAINT projects_vdcr_manager_id_fkey FOREIGN KEY (vdcr_manager_id) REFERENCES public.users(id),
  CONSTRAINT projects_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id),
  CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- Add the project_id foreign key to users table after projects table is created
ALTER TABLE public.users
ADD COLUMN project_id uuid;

ALTER TABLE public.users
ADD CONSTRAINT fk_users_project FOREIGN KEY (project_id) REFERENCES public.projects(id);

-- Create equipment table (with ARRAY syntax fix)
CREATE TABLE public.equipment (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  type character varying,
  tag_number character varying,
  job_number character varying,
  manufacturing_serial character varying,
  status character varying DEFAULT 'pending'::character varying,
  progress integer DEFAULT 0,
  progress_phase character varying DEFAULT 'documentation'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  supervisor character varying,
  welder character varying,
  qc_inspector character varying,
  project_manager character varying,
  location character varying,
  next_milestone character varying,
  po_cdd character varying,
  name character varying,
  priority character varying DEFAULT 'medium'::character varying,
  is_basic_info boolean DEFAULT true,
  notes text,
  progress_images text[] DEFAULT '{}'::text[], -- Fixed: ARRAY changed to text[]
  custom_team_positions jsonb DEFAULT '[]'::jsonb,
  welder_role character varying DEFAULT 'viewer'::character varying,
  qc_inspector_role character varying DEFAULT 'viewer'::character varying,
  project_manager_role character varying DEFAULT 'viewer'::character varying,
  supervisor_role character varying DEFAULT 'viewer'::character varying,
  custom_fields jsonb DEFAULT '[]'::jsonb,
  progress_entries jsonb DEFAULT '[]'::jsonb,
  field_names jsonb DEFAULT '{"status": "Status", "material": "Material", "pressure": "Pressure", "temperature": "Temperature", "dimensions": "Dimensions", "weight": "Weight", "supervisor": "Supervisor", "engineer": "Engineer", "welder": "Welder", "qcInspector": "QC Inspector", "projectManager": "Project Manager"}'::jsonb,
  custom_field_1_name character varying,
  custom_field_1_value character varying,
  custom_field_2_name character varying,
  custom_field_2_value character varying,
  custom_field_3_name character varying,
  custom_field_3_value character varying,
  custom_field_4_name character varying,
  custom_field_4_value character varying,
  custom_field_5_name character varying,
  custom_field_5_value character varying,
  custom_field_6_name character varying,
  custom_field_6_value character varying,
  custom_field_7_name character varying,
  custom_field_7_value character varying,
  custom_field_8_name character varying,
  custom_field_8_value character varying,
  custom_field_9_name character varying,
  custom_field_9_value character varying,
  custom_field_10_name character varying,
  custom_field_10_value character varying,
  custom_field_11_name character varying,
  custom_field_11_value character varying,
  custom_field_12_name character varying,
  custom_field_12_value character varying,
  custom_field_13_name character varying,
  custom_field_13_value character varying,
  custom_field_14_name character varying,
  custom_field_14_value character varying,
  custom_field_15_name character varying,
  custom_field_15_value character varying,
  custom_field_16_name character varying,
  custom_field_16_value character varying,
  custom_field_17_name character varying,
  custom_field_17_value character varying,
  custom_field_18_name character varying,
  custom_field_18_value character varying,
  custom_field_19_name character varying,
  custom_field_19_value character varying,
  custom_field_20_name character varying,
  custom_field_20_value character varying,
  certification_title character varying,
  CONSTRAINT equipment_pkey PRIMARY KEY (id),
  CONSTRAINT fk_equipment_project FOREIGN KEY (project_id) REFERENCES public.projects(id)
);

-- Create document tables (referencing projects and users)
CREATE TABLE public.client_reference_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  document_name character varying NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid,
  file_size bigint,
  mime_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT client_reference_documents_pkey PRIMARY KEY (id),
  CONSTRAINT client_reference_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT client_reference_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);

CREATE TABLE public.design_inputs_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  document_name character varying NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid,
  file_size bigint,
  mime_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT design_inputs_documents_pkey PRIMARY KEY (id),
  CONSTRAINT design_inputs_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT design_inputs_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);

CREATE TABLE public.other_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  document_name character varying NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid,
  file_size bigint,
  mime_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT other_documents_pkey PRIMARY KEY (id),
  CONSTRAINT other_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT other_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);

CREATE TABLE public.unpriced_po_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid,
  document_name character varying NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid,
  file_size bigint,
  mime_type character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unpriced_po_documents_pkey PRIMARY KEY (id),
  CONSTRAINT unpriced_po_documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT unpriced_po_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);

-- Create equipment-related tables
CREATE TABLE public.equipment_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  document_name character varying NOT NULL,
  document_url text NOT NULL,
  document_type character varying,
  file_size bigint,
  uploaded_by uuid,
  upload_date timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT equipment_documents_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_documents_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id),
  CONSTRAINT equipment_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) -- Fixed: auth.users to public.users
);

CREATE TABLE public.equipment_progress_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  entry_text text NOT NULL,
  entry_type character varying DEFAULT 'general'::character varying,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT equipment_progress_entries_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_progress_entries_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id),
  CONSTRAINT equipment_progress_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) -- Fixed: auth.users to public.users
);

CREATE TABLE public.equipment_progress_images (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  image_url text NOT NULL,
  description text,
  audio_data text, -- Base64 encoded audio file
  audio_duration integer, -- Audio duration in seconds
  uploaded_by text,
  upload_date timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT equipment_progress_images_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_progress_images_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id)
);

CREATE TABLE public.equipment_team_positions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  position_name character varying NOT NULL,
  person_name character varying NOT NULL,
  email character varying,
  phone character varying,
  role character varying DEFAULT 'viewer'::character varying CHECK (role::text = ANY (ARRAY['editor'::character varying::text, 'viewer'::character varying::text])),
  assigned_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT equipment_team_positions_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_team_positions_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id),
  CONSTRAINT equipment_team_positions_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) -- Fixed: auth.users to public.users
);

-- Create project_members table
CREATE TABLE public.project_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  name character varying NOT NULL,
  email character varying NOT NULL,
  phone character varying,
  position character varying,
  role character varying NOT NULL DEFAULT 'viewer'::character varying,
  status character varying NOT NULL DEFAULT 'active'::character varying,
  permissions jsonb DEFAULT '[]'::jsonb,
  equipment_assignments jsonb DEFAULT '[]'::jsonb,
  data_access jsonb DEFAULT '[]'::jsonb,
  access_level character varying NOT NULL DEFAULT 'viewer'::character varying,
  avatar character varying,
  last_active timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_members_pkey PRIMARY KEY (id),
  CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id)
);

-- Create indexes for better performance
CREATE INDEX idx_equipment_project_id ON public.equipment(project_id);
CREATE INDEX idx_equipment_status ON public.equipment(status);
CREATE INDEX idx_projects_firm_id ON public.projects(firm_id);
CREATE INDEX idx_users_firm_id ON public.users(firm_id);
CREATE INDEX idx_project_members_project_id ON public.project_members(project_id);

-- Add comments for documentation
COMMENT ON TABLE public.firms IS 'Company/firm information and subscription details';
COMMENT ON TABLE public.users IS 'User accounts with role-based access control';
COMMENT ON TABLE public.projects IS 'Engineering projects with client and equipment information';
COMMENT ON COLUMN public.projects.recommendation_letter IS 'Stores recommendation letter request status, reminders, and document metadata';
COMMENT ON TABLE public.equipment IS 'Equipment items within projects with detailed specifications';
COMMENT ON TABLE public.project_members IS 'Team members assigned to specific projects';
COMMENT ON TABLE public.equipment_documents IS 'Documents associated with specific equipment';
COMMENT ON TABLE public.equipment_progress_entries IS 'Progress tracking entries for equipment';
COMMENT ON TABLE public.equipment_progress_images IS 'Progress images for equipment with audio support';
COMMENT ON TABLE public.equipment_team_positions IS 'Team positions and assignments for equipment';

-- =============================
-- Additional domain tables
-- =============================

-- Invites
CREATE TABLE IF NOT EXISTS public.invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email character varying NOT NULL,
  full_name character varying,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['super_admin'::character varying::text, 'firm_admin'::character varying::text, 'project_manager'::character varying::text, 'vdcr_manager'::character varying::text, 'editor'::character varying::text, 'viewer'::character varying::text])),
  project_id uuid,
  firm_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  status character varying DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying::text, 'accepted'::character varying::text, 'expired'::character varying::text])),
  invitation_token character varying,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT invites_pkey PRIMARY KEY (id),
  CONSTRAINT invites_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id),
  CONSTRAINT invites_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.users(id)
);

-- VDCR documents
CREATE TABLE IF NOT EXISTS public.vdcr_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  vdcr_record_id uuid,
  file_name character varying NOT NULL,
  original_name character varying NOT NULL,
  file_type character varying NOT NULL,
  file_size bigint NOT NULL,
  file_path text NOT NULL,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vdcr_documents_pkey PRIMARY KEY (id),
  CONSTRAINT vdcr_documents_vdcr_record_id_fkey FOREIGN KEY (vdcr_record_id) REFERENCES public.vdcr_records(id),
  CONSTRAINT vdcr_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);

-- VDCR records
CREATE TABLE IF NOT EXISTS public.vdcr_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  sr_no character varying NOT NULL,
  equipment_tag_numbers text[] NOT NULL,
  mfg_serial_numbers text[] NOT NULL,
  job_numbers text[] NOT NULL,
  client_doc_no character varying NOT NULL,
  internal_doc_no character varying NOT NULL,
  document_name character varying NOT NULL,
  revision character varying NOT NULL,
  code_status character varying NOT NULL CHECK (code_status::text = ANY (ARRAY['Code 1'::character varying, 'Code 2'::character varying, 'Code 3'::character varying, 'Code 4'::character varying]::text[])),
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'sent-for-approval'::character varying, 'received-for-comment'::character varying, 'approved'::character varying, 'rejected'::character varying]::text[])),
  remarks text,
  updated_by uuid,
  document_file_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_update timestamp with time zone DEFAULT now(),
  firm_id uuid,
  document_url text,
  CONSTRAINT vdcr_records_pkey PRIMARY KEY (id),
  CONSTRAINT vdcr_records_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT vdcr_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id),
  CONSTRAINT vdcr_records_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id)
);

-- Equipment activity logs
CREATE TABLE IF NOT EXISTS public.equipment_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  equipment_id uuid,
  activity_type character varying NOT NULL,
  action_description text NOT NULL,
  field_name character varying,
  old_value text,
  new_value text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT equipment_activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_activity_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT equipment_activity_logs_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id),
  CONSTRAINT equipment_activity_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- =============================
-- Non-breaking schema alignments
-- =============================

-- Add optional multimedia fields to equipment_progress_entries if missing
DO $$ BEGIN
  BEGIN
    ALTER TABLE public.equipment_progress_entries
      ADD COLUMN audio_data text,
      ADD COLUMN audio_duration integer,
      ADD COLUMN image_url text,
      ADD COLUMN image_description text;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Add optional sales/client fields to projects if missing
DO $$ BEGIN
  BEGIN
    ALTER TABLE public.projects
      ADD COLUMN sales_order_date date,
      ADD COLUMN client_focal_point character varying;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- Add certification_title field to equipment table if missing
DO $$ BEGIN
  BEGIN
    ALTER TABLE public.equipment
      ADD COLUMN certification_title character varying;
  EXCEPTION WHEN duplicate_column THEN NULL; END;
END $$;

-- =============================
-- Storage (buckets, policies)
-- =============================
-- Buckets from current project (public): project-documents, VDCR-docs

-- Buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('VDCR-docs', 'VDCR-docs', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for project-documents
DO $$ BEGIN
  BEGIN
    CREATE POLICY "Public read project-documents"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'project-documents');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

DO $$ BEGIN
  BEGIN
    CREATE POLICY "Authenticated upload project-documents"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'project-documents');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Policies for VDCR-docs
DO $$ BEGIN
  BEGIN
    CREATE POLICY "Public read VDCR-docs"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'VDCR-docs');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

DO $$ BEGIN
  BEGIN
    CREATE POLICY "Authenticated upload VDCR-docs"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'VDCR-docs');
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Note: storage.objects already has RLS enabled by default in Supabase.