-- Add logo_url field to firms table for company branding
-- This allows companies to upload and display their logo in the Company Highlights section

ALTER TABLE public.firms 
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Add comment to document the field
COMMENT ON COLUMN public.firms.logo_url IS 'URL or path to company logo image for branding display';




