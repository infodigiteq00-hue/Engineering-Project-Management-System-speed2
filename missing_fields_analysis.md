# Missing Fields Analysis for `standalone_equipment` Table

## Fields Being Sent from Form (handleAddStandaloneEquipment)

### Step 1: Equipment Information
- `type` ✅ (exists)
- `tag_number` ✅ (exists)
- `name` ✅ (exists)
- `job_number` ✅ (exists)
- `manufacturing_serial` ✅ (exists)
- `size` ✅ (exists)
- `material` ✅ (exists)
- `design_code` ✅ (exists)

### Step 2: Basic Information
- `client_name` ❌ **MISSING**
- `plant_location` ❌ **MISSING** (note: `location` exists but may be different)
- `po_number` ❌ **MISSING**
- `sales_order_date` ❌ **MISSING**
- `completion_date` ✅ (exists)
- `client_industry` ❌ **MISSING**
- `equipment_manager` ❌ **MISSING**
- `consultant` ❌ **MISSING**
- `tpi_agency` ❌ **MISSING**
- `client_focal_point` ❌ **MISSING**

### Step 3: Scope & Documents
- `services_included` ❌ **MISSING** (JSONB object with boolean values)
- `scope_description` ❌ **MISSING**
- `kickoff_meeting_notes` ❌ **MISSING**
- `special_production_notes` ❌ **MISSING**

## SQL Queries to Add Missing Fields

See `add_missing_fields.sql` for the complete SQL script.

### Summary of Missing Fields (13 fields):

1. **client_name** - character varying
2. **plant_location** - character varying
3. **po_number** - character varying
4. **sales_order_date** - timestamp with time zone
5. **client_industry** - character varying
6. **equipment_manager** - character varying
7. **consultant** - character varying
8. **tpi_agency** - character varying
9. **client_focal_point** - character varying
10. **services_included** - jsonb (stores object with boolean values for services)
11. **scope_description** - text
12. **kickoff_meeting_notes** - text
13. **special_production_notes** - text

### Notes:
- `completion_date` already exists in the schema ✅
- `location` exists but `plant_location` is a separate field for the form
- `services_included` is stored as JSONB to handle the object structure: `{ design: boolean, manufacturing: boolean, ... }`

