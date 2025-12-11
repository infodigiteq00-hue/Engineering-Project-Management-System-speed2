-- ============================================================================
-- STANDALONE EQUIPMENT ACTIVITY LOGS TABLE
-- ============================================================================
-- Description: Separate table for logging all activities related to standalone equipment
-- This table is similar to equipment_activity_logs but specifically for standalone equipment
-- No project_id field since standalone equipment is not associated with projects
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.standalone_equipment_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL,
  activity_type character varying NOT NULL,
  action_description text NOT NULL,
  field_name character varying,
  old_value text,
  new_value text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT standalone_equipment_activity_logs_pkey PRIMARY KEY (id),
  CONSTRAINT standalone_equipment_activity_logs_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.standalone_equipment(id) ON DELETE CASCADE,
  CONSTRAINT standalone_equipment_activity_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for querying logs by equipment
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_activity_logs_equipment_id 
  ON public.standalone_equipment_activity_logs(equipment_id);

-- Index for querying logs by activity type
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_activity_logs_activity_type 
  ON public.standalone_equipment_activity_logs(activity_type);

-- Index for querying logs by created_by (user)
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_activity_logs_created_by 
  ON public.standalone_equipment_activity_logs(created_by);

-- Index for querying logs by created_at (for date range queries)
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_activity_logs_created_at 
  ON public.standalone_equipment_activity_logs(created_at DESC);

-- Composite index for common query patterns (equipment + date)
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_activity_logs_equipment_created_at 
  ON public.standalone_equipment_activity_logs(equipment_id, created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.standalone_equipment_activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view logs for equipment in their firm
-- (Assuming equipment ownership is determined via created_by -> users.firm_id)
CREATE POLICY "Users can view standalone equipment activity logs from their firm"
  ON public.standalone_equipment_activity_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u ON se.created_by = u.id
      WHERE se.id = standalone_equipment_activity_logs.equipment_id
      AND u.firm_id = (SELECT firm_id FROM public.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can insert logs for equipment in their firm
CREATE POLICY "Users can insert standalone equipment activity logs for their firm"
  ON public.standalone_equipment_activity_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u ON se.created_by = u.id
      WHERE se.id = standalone_equipment_activity_logs.equipment_id
      AND u.firm_id = (SELECT firm_id FROM public.users WHERE id = auth.uid())
    )
    AND created_by = auth.uid()
  );

-- Policy: Users can update logs they created (optional - for corrections)
CREATE POLICY "Users can update their own standalone equipment activity logs"
  ON public.standalone_equipment_activity_logs
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Policy: Users can delete logs they created (optional - for corrections)
CREATE POLICY "Users can delete their own standalone equipment activity logs"
  ON public.standalone_equipment_activity_logs
  FOR DELETE
  USING (created_by = auth.uid());

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.standalone_equipment_activity_logs IS 'Activity logs for standalone equipment (equipment not associated with projects)';
COMMENT ON COLUMN public.standalone_equipment_activity_logs.equipment_id IS 'Reference to standalone_equipment table';
COMMENT ON COLUMN public.standalone_equipment_activity_logs.activity_type IS 'Type of activity (e.g., equipment_created, equipment_updated, document_uploaded)';
COMMENT ON COLUMN public.standalone_equipment_activity_logs.action_description IS 'Human-readable description of the activity';
COMMENT ON COLUMN public.standalone_equipment_activity_logs.metadata IS 'Additional JSON data about the activity';

-- ============================================================================
-- SCHEMA CREATION COMPLETE
-- ============================================================================



