-- ============================================================================
-- STANDALONE EQUIPMENT TEAM POSITIONS TABLE
-- ============================================================================
-- Description: Separate table for team positions/members for standalone equipment
-- This table is similar to equipment_team_positions but specifically for standalone equipment
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
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for querying team positions by equipment
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_team_positions_equipment_id 
  ON public.standalone_equipment_team_positions(equipment_id);

-- Index for querying team positions by assigned_by (user)
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_team_positions_assigned_by 
  ON public.standalone_equipment_team_positions(assigned_by);

-- Index for querying team positions by role
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_team_positions_role 
  ON public.standalone_equipment_team_positions(role);

-- Composite index for common query patterns (equipment + role)
CREATE INDEX IF NOT EXISTS idx_standalone_equipment_team_positions_equipment_role 
  ON public.standalone_equipment_team_positions(equipment_id, role);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.standalone_equipment_team_positions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running this script)
DROP POLICY IF EXISTS "Users can view standalone equipment team positions from their firm" ON public.standalone_equipment_team_positions;
DROP POLICY IF EXISTS "Users can insert standalone equipment team positions for their firm" ON public.standalone_equipment_team_positions;
DROP POLICY IF EXISTS "Users can update standalone equipment team positions for their firm" ON public.standalone_equipment_team_positions;
DROP POLICY IF EXISTS "Users can delete standalone equipment team positions for their firm" ON public.standalone_equipment_team_positions;

-- Policy: Users can view team positions for equipment in their firm
CREATE POLICY "Users can view standalone equipment team positions from their firm"
  ON public.standalone_equipment_team_positions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u ON se.created_by = u.id
      WHERE se.id = standalone_equipment_team_positions.equipment_id
      AND u.firm_id = (SELECT firm_id FROM public.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can insert team positions for equipment in their firm
CREATE POLICY "Users can insert standalone equipment team positions for their firm"
  ON public.standalone_equipment_team_positions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u ON se.created_by = u.id
      WHERE se.id = standalone_equipment_team_positions.equipment_id
      AND u.firm_id = (SELECT firm_id FROM public.users WHERE id = auth.uid())
    )
    AND (assigned_by = auth.uid() OR assigned_by IS NULL)
  );

-- Policy: Users can update team positions they assigned or for equipment in their firm
CREATE POLICY "Users can update standalone equipment team positions for their firm"
  ON public.standalone_equipment_team_positions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u ON se.created_by = u.id
      WHERE se.id = standalone_equipment_team_positions.equipment_id
      AND u.firm_id = (SELECT firm_id FROM public.users WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u ON se.created_by = u.id
      WHERE se.id = standalone_equipment_team_positions.equipment_id
      AND u.firm_id = (SELECT firm_id FROM public.users WHERE id = auth.uid())
    )
  );

-- Policy: Users can delete team positions for equipment in their firm
CREATE POLICY "Users can delete standalone equipment team positions for their firm"
  ON public.standalone_equipment_team_positions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.standalone_equipment se
      JOIN public.users u ON se.created_by = u.id
      WHERE se.id = standalone_equipment_team_positions.equipment_id
      AND u.firm_id = (SELECT firm_id FROM public.users WHERE id = auth.uid())
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.standalone_equipment_team_positions IS 'Team positions/members for standalone equipment (equipment not associated with projects)';
COMMENT ON COLUMN public.standalone_equipment_team_positions.equipment_id IS 'Reference to standalone_equipment table';
COMMENT ON COLUMN public.standalone_equipment_team_positions.position_name IS 'Job title or position name (e.g., "Engineer", "QC Inspector")';
COMMENT ON COLUMN public.standalone_equipment_team_positions.role IS 'Access role: editor or viewer';

-- ============================================================================
-- SCHEMA CREATION COMPLETE
-- ============================================================================

