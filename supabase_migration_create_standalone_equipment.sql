-- Migration: Create Standalone Equipment Schema
-- Date: 2024
-- Description: Creates standalone_equipment table and related tables for equipment not connected to any project
--              Also creates a separate storage bucket for standalone equipment documents

-- ============================================================================
-- 1. CREATE STANDALONE_EQUIPMENT TABLE
-- ============================================================================
-- Same schema as equipment table but without project_id foreign key
CREATE TABLE IF NOT EXISTS public.standalone_equipment (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  -- Note: No project_id column - standalone equipment is not connected to any project
  -- Note: No firm_id column - firm ownership is determined via created_by -> users.firm_id
  type character varying,
  tag_number character varying,
  job_number character varying,
  manufacturing_serial character varying,
  status character varying DEFAULT 'pending'::character varying,
  progress integer DEFAULT 0,
  progress_phase character varying DEFAULT 'documentation'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid, -- Track who created the equipment (used to determine firm_id via users table)
  updated_by uuid, -- Track who last updated the equipment
  location character varying,
  next_milestone character varying,
  next_milestone_date timestamp with time zone,
  po_cdd character varying,
  name character varying,
  priority character varying DEFAULT 'medium'::character varying,
  is_basic_info boolean DEFAULT true,
  notes text,
  completion_date timestamp with time zone,
  -- Technical specifications
  size character varying,
  weight character varying,
  design_code character varying,
  material character varying,
  working_pressure character varying,
  design_temp character varying,
  -- JSONB fields for flexible data
  progress_images text[] DEFAULT '{}'::text[],
  custom_team_positions jsonb DEFAULT '[]'::jsonb,
  custom_fields jsonb DEFAULT '[]'::jsonb,
  progress_entries jsonb DEFAULT '[]'::jsonb,
  technical_sections jsonb DEFAULT '[]'::jsonb,
  team_custom_fields jsonb DEFAULT '[]'::jsonb,
  field_names jsonb DEFAULT '{"status": "Status", "material": "Material", "pressure": "Pressure", "temperature": "Temperature", "dimensions": "Dimensions", "weight": "Weight", "supervisor": "Supervisor", "engineer": "Engineer", "welder": "Welder", "qcInspector": "QC Inspector", "projectManager": "Project Manager"}'::jsonb,
  -- Legacy custom fields (for backward compatibility)
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
  CONSTRAINT standalone_equipment_pkey PRIMARY KEY (id),
  CONSTRAINT standalone_equipment_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT standalone_equipment_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id)
);

-- Add created_by column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'standalone_equipment' 
    AND column_name = 'created_by'
  ) THEN
    ALTER TABLE public.standalone_equipment 
    ADD COLUMN created_by uuid;
    
    -- Add foreign key constraint if column was added
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'standalone_equipment' 
      AND column_name = 'created_by'
    ) THEN
      -- Check if constraint doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_schema = 'public' 
        AND table_name = 'standalone_equipment' 
        AND constraint_name = 'standalone_equipment_created_by_fkey'
      ) THEN
        ALTER TABLE public.standalone_equipment
        ADD CONSTRAINT standalone_equipment_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES public.users(id);
      END IF;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 2. CREATE STANDALONE_EQUIPMENT_DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.standalone_equipment_documents (
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
  CONSTRAINT standalone_equipment_documents_pkey PRIMARY KEY (id),
  CONSTRAINT standalone_equipment_documents_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.standalone_equipment(id) ON DELETE CASCADE,
  CONSTRAINT standalone_equipment_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 3. CREATE STANDALONE_EQUIPMENT_PROGRESS_ENTRIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.standalone_equipment_progress_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  entry_text text NOT NULL,
  entry_type character varying DEFAULT 'general'::character varying,
  image_url text, -- Optional image URL for the entry
  image_description text, -- Optional description for the image
  audio_data text, -- Base64 encoded audio file
  audio_duration integer, -- Audio duration in seconds
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT standalone_equipment_progress_entries_pkey PRIMARY KEY (id),
  CONSTRAINT standalone_equipment_progress_entries_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.standalone_equipment(id) ON DELETE CASCADE,
  CONSTRAINT standalone_equipment_progress_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 4. CREATE STANDALONE_EQUIPMENT_PROGRESS_IMAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.standalone_equipment_progress_images (
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
  CONSTRAINT standalone_equipment_progress_images_pkey PRIMARY KEY (id),
  CONSTRAINT standalone_equipment_progress_images_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.standalone_equipment(id) ON DELETE CASCADE
);

-- ============================================================================
-- 5. CREATE STANDALONE_EQUIPMENT_TEAM_POSITIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.standalone_equipment_team_positions (
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
  CONSTRAINT standalone_equipment_team_positions_pkey PRIMARY KEY (id),
  CONSTRAINT standalone_equipment_team_positions_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.standalone_equipment(id) ON DELETE CASCADE,
  CONSTRAINT standalone_equipment_team_positions_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id)
);

-- ============================================================================
-- 6. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_created_by ON public.standalone_equipment(created_by);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_status ON public.standalone_equipment(status);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_type ON public.standalone_equipment(type);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_tag_number ON public.standalone_equipment(tag_number);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_created_at ON public.standalone_equipment(created_at);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_documents_equipment_id ON public.standalone_equipment_documents(equipment_id);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_progress_entries_equipment_id ON public.standalone_equipment_progress_entries(equipment_id);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_progress_images_equipment_id ON public.standalone_equipment_progress_images(equipment_id);
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_team_positions_equipment_id ON public.standalone_equipment_team_positions(equipment_id);

-- ============================================================================
-- 7. ADD TABLE COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE public.standalone_equipment IS 'Standalone equipment items not connected to any project';
COMMENT ON TABLE public.standalone_equipment_documents IS 'Documents associated with standalone equipment';
COMMENT ON TABLE public.standalone_equipment_progress_entries IS 'Progress tracking entries for standalone equipment';
COMMENT ON TABLE public.standalone_equipment_progress_images IS 'Progress images for standalone equipment with audio support';
COMMENT ON TABLE public.standalone_equipment_team_positions IS 'Team positions and assignments for standalone equipment';

-- ============================================================================
-- 8. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================
-- Enable RLS on all tables
ALTER TABLE public.standalone_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standalone_equipment_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standalone_equipment_progress_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standalone_equipment_progress_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standalone_equipment_team_positions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8.1. CREATE RLS POLICIES FOR STANDALONE_EQUIPMENT
-- ============================================================================
-- Policy: Users can only see standalone equipment from their own firm
-- Firm ownership is determined via created_by -> users.firm_id
CREATE POLICY "Users can view standalone equipment from their firm"
ON public.standalone_equipment FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u1
    WHERE u1.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u2
      WHERE u2.id = standalone_equipment.created_by
      AND u2.firm_id = u1.firm_id
    )
  )
  OR created_by = auth.uid() -- Allow users to see equipment they created
);

-- Policy: Users can insert standalone equipment (will be filtered by their firm_id)
CREATE POLICY "Users can create standalone equipment"
ON public.standalone_equipment FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

-- Policy: Users can update standalone equipment from their firm
CREATE POLICY "Users can update standalone equipment from their firm"
ON public.standalone_equipment FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u1
    WHERE u1.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u2
      WHERE u2.id = standalone_equipment.created_by
      AND u2.firm_id = u1.firm_id
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u1
    WHERE u1.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u2
      WHERE u2.id = standalone_equipment.created_by
      AND u2.firm_id = u1.firm_id
    )
  )
);

-- Policy: Users can delete standalone equipment from their firm
CREATE POLICY "Users can delete standalone equipment from their firm"
ON public.standalone_equipment FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u1
    WHERE u1.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u2
      WHERE u2.id = standalone_equipment.created_by
      AND u2.firm_id = u1.firm_id
    )
  )
);

-- ============================================================================
-- 8.2. CREATE RLS POLICIES FOR RELATED TABLES
-- ============================================================================
-- Policy for standalone_equipment_documents
CREATE POLICY "Users can view documents for equipment from their firm"
ON public.standalone_equipment_documents FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u1
    WHERE u1.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u2 ON u2.id = se.created_by
      WHERE se.id = standalone_equipment_documents.equipment_id
      AND u2.firm_id = u1.firm_id
    )
  )
);

CREATE POLICY "Users can manage documents for equipment from their firm"
ON public.standalone_equipment_documents FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u1
    WHERE u1.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u2 ON u2.id = se.created_by
      WHERE se.id = standalone_equipment_documents.equipment_id
      AND u2.firm_id = u1.firm_id
    )
  )
);

-- Policy for standalone_equipment_progress_entries
CREATE POLICY "Users can view progress entries for equipment from their firm"
ON public.standalone_equipment_progress_entries FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u1
    WHERE u1.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u2 ON u2.id = se.created_by
      WHERE se.id = standalone_equipment_progress_entries.equipment_id
      AND u2.firm_id = u1.firm_id
    )
  )
);

CREATE POLICY "Users can manage progress entries for equipment from their firm"
ON public.standalone_equipment_progress_entries FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u1
    WHERE u1.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u2 ON u2.id = se.created_by
      WHERE se.id = standalone_equipment_progress_entries.equipment_id
      AND u2.firm_id = u1.firm_id
    )
  )
);

-- Policy for standalone_equipment_progress_images
CREATE POLICY "Users can view progress images for equipment from their firm"
ON public.standalone_equipment_progress_images FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u1
    WHERE u1.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u2 ON u2.id = se.created_by
      WHERE se.id = standalone_equipment_progress_images.equipment_id
      AND u2.firm_id = u1.firm_id
    )
  )
);

CREATE POLICY "Users can manage progress images for equipment from their firm"
ON public.standalone_equipment_progress_images FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u1
    WHERE u1.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u2 ON u2.id = se.created_by
      WHERE se.id = standalone_equipment_progress_images.equipment_id
      AND u2.firm_id = u1.firm_id
    )
  )
);

-- Policy for standalone_equipment_team_positions
CREATE POLICY "Users can view team positions for equipment from their firm"
ON public.standalone_equipment_team_positions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u1
    WHERE u1.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u2 ON u2.id = se.created_by
      WHERE se.id = standalone_equipment_team_positions.equipment_id
      AND u2.firm_id = u1.firm_id
    )
  )
);

CREATE POLICY "Users can manage team positions for equipment from their firm"
ON public.standalone_equipment_team_positions FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u1
    WHERE u1.id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u2 ON u2.id = se.created_by
      WHERE se.id = standalone_equipment_team_positions.equipment_id
      AND u2.firm_id = u1.firm_id
    )
  )
);

-- ============================================================================
-- 9. CREATE STORAGE BUCKET FOR STANDALONE EQUIPMENT DOCUMENTS
-- ============================================================================
-- Note: Storage buckets are created via Supabase Dashboard or using the storage API
-- This SQL creates the bucket policy. The bucket itself needs to be created in Supabase Dashboard
-- or via the Supabase Management API.

-- Create the storage bucket (if it doesn't exist)
-- This requires the storage extension to be enabled
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'standalone-equipment-documents',
  'standalone-equipment-documents',
  true, -- Public bucket (like VDCR-DOCS)
  52428800, -- 50MB file size limit
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/gif', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================================================
-- 10. CREATE STORAGE POLICIES FOR STANDALONE EQUIPMENT DOCUMENTS BUCKET
-- ============================================================================

-- Policy: Allow authenticated users to upload files (like VDCR-DOCS)
CREATE POLICY "Allow authenticated uploads to standalone-equipment-documents"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'standalone-equipment-documents' AND
  (storage.foldername(name))[1] = 'standalone-equipment'
);

-- Policy: Allow public downloads (like VDCR-DOCS)
CREATE POLICY "Allow public downloads from standalone-equipment-documents"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'standalone-equipment-documents' AND
  (storage.foldername(name))[1] = 'standalone-equipment'
);

-- ============================================================================
-- 11. CREATE STORAGE BUCKET FOR STANDALONE EQUIPMENT PROGRESS IMAGES
-- ============================================================================
-- Create a separate bucket for progress images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'standalone-equipment-progress-images',
  'standalone-equipment-progress-images',
  true, -- Public bucket (like VDCR-DOCS)
  10485760, -- 10MB file size limit for images
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy: Allow authenticated users to upload progress images (like VDCR-DOCS)
CREATE POLICY "Allow authenticated uploads to standalone-equipment-progress-images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'standalone-equipment-progress-images' AND
  (storage.foldername(name))[1] = 'standalone-equipment'
);

-- Policy: Allow public downloads (like VDCR-DOCS)
CREATE POLICY "Allow public downloads from standalone-equipment-progress-images"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'standalone-equipment-progress-images' AND
  (storage.foldername(name))[1] = 'standalone-equipment'
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- 1. Created standalone_equipment table (same schema as equipment, without project_id)
-- 2. Created standalone_equipment_documents table
-- 3. Created standalone_equipment_progress_entries table
-- 4. Created standalone_equipment_progress_images table
-- 5. Created standalone_equipment_team_positions table
-- 6. Created indexes for performance
-- 7. Added table comments
-- 8. Enabled Row Level Security
-- 9. Created storage bucket: 'standalone-equipment-documents' (50MB limit)
-- 10. Created storage bucket: 'standalone-equipment-progress-images' (10MB limit)
-- 11. Created storage policies for both buckets

