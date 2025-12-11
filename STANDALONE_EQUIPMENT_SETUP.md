# Standalone Equipment Setup Guide

This guide explains how to set up the Standalone Equipment feature, including the database schema and storage buckets.

## Database Migration

Run the migration file to create all necessary tables:

```bash
# In Supabase SQL Editor, run:
supabase_migration_create_standalone_equipment.sql
```

This will create:
- `standalone_equipment` table (main table, same schema as `equipment` but without `project_id`)
- `standalone_equipment_documents` table
- `standalone_equipment_progress_entries` table
- `standalone_equipment_progress_images` table
- `standalone_equipment_team_positions` table

## Storage Buckets Setup

The migration SQL attempts to create storage buckets automatically, but if that doesn't work, you can create them manually via the Supabase Dashboard:

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to **Storage** in your Supabase Dashboard
2. Click **New bucket**
3. Create the following buckets:

#### Bucket 1: `standalone-equipment-documents`
- **Name**: `standalone-equipment-documents`
- **Public**: No (Private)
- **File size limit**: 50 MB
- **Allowed MIME types**: 
  - `application/pdf`
  - `application/msword`
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `image/jpeg`
  - `image/png`
  - `image/gif`
  - `application/vnd.ms-excel`
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

#### Bucket 2: `standalone-equipment-progress-images`
- **Name**: `standalone-equipment-progress-images`
- **Public**: No (Private)
- **File size limit**: 10 MB
- **Allowed MIME types**:
  - `image/jpeg`
  - `image/png`
  - `image/gif`
  - `image/webp`

### Option 2: Via SQL (If storage extension is enabled)

The migration SQL includes bucket creation statements. If they don't work, you can run them separately:

```sql
-- Create documents bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'standalone-equipment-documents',
  'standalone-equipment-documents',
  false,
  52428800, -- 50MB
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/gif', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- Create progress images bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'standalone-equipment-progress-images',
  'standalone-equipment-progress-images',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
```

## Storage Policies

The migration SQL automatically creates storage policies for both buckets. These policies allow:
- Authenticated users to upload files
- Authenticated users to view files
- Authenticated users to update files
- Authenticated users to delete files

All files must be stored in folders starting with `standalone-equipment/` to match the policy conditions.

## Schema Overview

### Main Table: `standalone_equipment`

Same structure as `equipment` table but **without** the `project_id` column:

- Basic Information: `id`, `type`, `tag_number`, `job_number`, `manufacturing_serial`, `name`
- Status & Progress: `status`, `progress`, `progress_phase`, `priority`, `is_basic_info`
- Dates: `po_cdd`, `next_milestone`, `next_milestone_date`, `completion_date`, `created_at`, `updated_at`
- Location & Team: `location`, `supervisor`, `welder`, `qc_inspector`, `project_manager`, `engineer`
- Technical Specs: `size`, `weight`, `design_code`, `material`, `working_pressure`, `design_temp`
- Team Contacts: `welder_email`, `welder_phone`, `qc_inspector_email`, `qc_inspector_phone`, `project_manager_email`, `project_manager_phone`, `supervisor_email`, `supervisor_phone`
- Team Roles: `welder_role`, `qc_inspector_role`, `project_manager_role`, `supervisor_role`
- JSONB Fields: `custom_fields`, `technical_sections`, `team_custom_fields`, `progress_entries`, `progress_images`, `custom_team_positions`
- Other: `notes`, `certification_title`, `updated_by`

### Related Tables

1. **standalone_equipment_documents**: Stores document metadata (files stored in storage bucket)
2. **standalone_equipment_progress_entries**: Stores progress update entries with optional images/audio
3. **standalone_equipment_progress_images**: Stores progress images with descriptions and audio
4. **standalone_equipment_team_positions**: Stores custom team position assignments

## File Storage Structure

Files should be stored with the following folder structure:

```
standalone-equipment-documents/
  └── standalone-equipment/
      └── {equipment_id}/
          └── {document_name}

standalone-equipment-progress-images/
  └── standalone-equipment/
      └── {equipment_id}/
          └── {image_name}
```

## Verification

After running the migration, verify:

1. All tables are created:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'standalone_equipment%';
```

2. Storage buckets exist:
```sql
SELECT id, name, public, file_size_limit 
FROM storage.buckets 
WHERE id LIKE 'standalone-equipment%';
```

3. Storage policies are active:
```sql
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects' 
AND policyname LIKE '%standalone%';
```

## Notes

- Standalone equipment does NOT have a `project_id` - it exists independently
- All uniqueness checks (tag_number, job_number, manufacturing_serial) work across both `equipment` and `standalone_equipment` tables
- Row Level Security (RLS) is enabled on all tables - you may need to create policies based on your authentication requirements
- The storage buckets are private by default - files require authentication to access


