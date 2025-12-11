-- WARNING: This will DELETE all existing data in the standalone_equipment table!
-- Only run this if you want to recreate the table from scratch

DROP TABLE IF EXISTS public.standalone_equipment CASCADE;

create table public.standalone_equipment (
  id uuid not null default gen_random_uuid (),
  type character varying null,
  tag_number character varying null,
  job_number character varying null,
  manufacturing_serial character varying null,
  status character varying null default 'pending'::character varying,
  progress integer null default 0,
  progress_phase character varying null default 'documentation'::character varying,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  updated_by uuid null,
  location character varying null,
  next_milestone character varying null,
  next_milestone_date timestamp with time zone null,
  po_cdd character varying null,
  name character varying null,
  priority character varying null default 'medium'::character varying,
  is_basic_info boolean null default true,
  notes text null,
  completion_date timestamp with time zone null,
  size character varying null,
  weight character varying null,
  design_code character varying null,
  material character varying null,
  working_pressure character varying null,
  design_temp character varying null,
  progress_images text[] null default '{}'::text[],
  custom_team_positions jsonb null default '[]'::jsonb,
  custom_fields jsonb null default '[]'::jsonb,
  progress_entries jsonb null default '[]'::jsonb,
  technical_sections jsonb null default '[]'::jsonb,
  team_custom_fields jsonb null default '[]'::jsonb,
  field_names jsonb null default '{"status": "Status", "weight": "Weight", "welder": "Welder", "engineer": "Engineer", "material": "Material", "pressure": "Pressure", "dimensions": "Dimensions", "supervisor": "Supervisor", "qcInspector": "QC Inspector", "temperature": "Temperature", "projectManager": "Project Manager"}'::jsonb,
  custom_field_1_name character varying null,
  custom_field_1_value character varying null,
  custom_field_2_name character varying null,
  custom_field_2_value character varying null,
  custom_field_3_name character varying null,
  custom_field_3_value character varying null,
  custom_field_4_name character varying null,
  custom_field_4_value character varying null,
  custom_field_5_name character varying null,
  custom_field_5_value character varying null,
  custom_field_6_name character varying null,
  custom_field_6_value character varying null,
  custom_field_7_name character varying null,
  custom_field_7_value character varying null,
  custom_field_8_name character varying null,
  custom_field_8_value character varying null,
  custom_field_9_name character varying null,
  custom_field_9_value character varying null,
  custom_field_10_name character varying null,
  custom_field_10_value character varying null,
  custom_field_11_name character varying null,
  custom_field_11_value character varying null,
  custom_field_12_name character varying null,
  custom_field_12_value character varying null,
  custom_field_13_name character varying null,
  custom_field_13_value character varying null,
  custom_field_14_name character varying null,
  custom_field_14_value character varying null,
  custom_field_15_name character varying null,
  custom_field_15_value character varying null,
  custom_field_16_name character varying null,
  custom_field_16_value character varying null,
  custom_field_17_name character varying null,
  custom_field_17_value character varying null,
  custom_field_18_name character varying null,
  custom_field_18_value character varying null,
  custom_field_19_name character varying null,
  custom_field_19_value character varying null,
  custom_field_20_name character varying null,
  custom_field_20_value character varying null,
  certification_title character varying null,
  created_by uuid null,
  constraint standalone_equipment_pkey primary key (id),
  constraint standalone_equipment_created_by_fkey foreign KEY (created_by) references users (id),
  constraint standalone_equipment_updated_by_fkey foreign KEY (updated_by) references users (id)
) TABLESPACE pg_default;

create index IF not exists idx_standalone_equipment_status on public.standalone_equipment using btree (status) TABLESPACE pg_default;

create index IF not exists idx_standalone_equipment_type on public.standalone_equipment using btree (type) TABLESPACE pg_default;

create index IF not exists idx_standalone_equipment_tag_number on public.standalone_equipment using btree (tag_number) TABLESPACE pg_default;

create index IF not exists idx_standalone_equipment_created_at on public.standalone_equipment using btree (created_at) TABLESPACE pg_default;

create index IF not exists idx_standalone_equipment_created_by on public.standalone_equipment using btree (created_by) TABLESPACE pg_default;



