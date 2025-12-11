-- Migration: Add recommendation_letter column to projects table
-- This migration is safe and will not affect existing functionality
-- Run this in Supabase SQL Editor

-- Add recommendation_letter JSONB column to projects table
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS recommendation_letter jsonb DEFAULT '{
  "status": "not-requested",
  "requestDate": null,
  "lastReminderDate": null,
  "lastReminderDateTime": null,
  "reminderCount": 0,
  "clientEmail": null,
  "clientContactPerson": null,
  "receivedDocument": null
}'::jsonb;

-- Add comment to document the column
COMMENT ON COLUMN public.projects.recommendation_letter IS 'Stores recommendation letter request status, reminders, and document metadata';

-- Verify the column was added (optional check)
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'projects' AND column_name = 'recommendation_letter';

