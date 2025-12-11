import axios from "axios";
import { supabase } from './supabase'; // Use the singleton instance instead of creating a new one
import { logEquipmentCreated, logEquipmentDeleted, logEquipmentUpdated } from './activityLogger';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create axios instance for Supabase
const api = axios.create({
  baseURL: `${SUPABASE_URL}/rest/v1`,
  headers: {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  timeout: 30000 // 30 seconds timeout
});

// Fast API functions
export const fastAPI = {
  // Fetch all companies with user count
  async getCompanies() {
    try {
      const response = await api.get('/firms?select=*&order=created_at.desc');
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching companies:', error);
      throw error;
    }
  },

  // Fetch all users
  async getUsers() {
    try {
      const response = await api.get('/users?select=*&order=created_at.desc');
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching users:', error);
      throw error;
    }
  },

  // Fetch team members by project ID
  async getTeamMembersByProject(projectId: string) {
    try {
      // PERFORMANCE: Console logs commented out - uncomment if needed for debugging
      // console.log('👥 Fetching team members for project ID:', projectId);
      const response = await api.get(`/project_members?project_id=eq.${projectId}&select=*,users(*)&order=created_at.desc`);
      // console.log('✅ Team members response:', response.data);
      
      // Transform the data to include user details
      const transformedData = (response.data as any[]).map((member: any) => ({
        id: member.id,
        name: member.users?.full_name || member.users?.name || 'Unknown',
        email: member.users?.email || '',
        role: member.role,
        position: member.position || member.role,
        user_id: member.user_id,
        project_id: member.project_id,
        equipment_assignments: member.equipment_assignments || []
      }));
      
      return transformedData;
    } catch (error) {
      console.error('❌ Error fetching project team members:', error);
      throw error;
    }
  },

  // Fetch team members by firm ID
  async getTeamMembersByFirm(firmId: string) {
    try {
      const response = await api.get(`/users?firm_id=eq.${firmId}&select=*&order=created_at.desc`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching firm team members:', error);
      throw error;
    }
  },

  // Create new team member
  async createTeamMember(memberData: any) {
    try {
      const response = await api.post('/users', memberData);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating team member:', error);
      throw error;
    }
  },

  // Update team member
  async updateTeamMember(memberId: string, updateData: any) {
    try {
      const response = await api.patch(`/users?id=eq.${memberId}`, updateData);
      return response.data;
    } catch (error) {
      console.error('❌ Error updating team member:', error);
      throw error;
    }
  },

  // Delete team member
  async deleteTeamMember(memberId: string) {
    try {
      const response = await api.delete(`/users?id=eq.${memberId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting team member:', error);
      throw error;
    }
  },

  // Create new company
  async createCompany(companyData: any) {
    try {
      const response = await api.post('/firms', companyData);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating company:', error);
      throw error;
    }
  },

  // Update company
  async updateCompany(id: string, companyData: any) {
    try {
      const response = await api.patch(`/firms?id=eq.${id}`, companyData);
      return response.data;
    } catch (error) {
      console.error('❌ Error updating company:', error);
      throw error;
    }
  },

  // Delete company
  async deleteCompany(id: string) {
    try {
      // console.log('🗑️ Starting cascade delete for company:', id);
      
      // Get all projects for this company first
      const projectsResponse = await api.get(`/projects?firm_id=eq.${id}&select=id`);
      const projects = (projectsResponse.data as any[]) || [];
      // console.log(`📋 Found ${projects.length} projects to delete`);
      
      // Delete all related data in correct order
      for (const project of projects) {
        // console.log(`🗑️ Deleting project: ${project.id}`);
        
        // 1. Delete equipment documents
        const equipmentResponse = await api.get(`/equipment?project_id=eq.${project.id}&select=id`);
        const equipment = (equipmentResponse.data as any[]) || [];
        
        for (const eq of equipment) {
          // Delete equipment documents
          await api.delete(`/equipment_documents?equipment_id=eq.${eq.id}`);
          // Delete progress images
          await api.delete(`/equipment_progress_images?equipment_id=eq.${eq.id}`);
          // Delete progress entries
          await api.delete(`/equipment_progress_entries?equipment_id=eq.${eq.id}`);
        }
        
        // 2. Delete equipment
        await api.delete(`/equipment?project_id=eq.${project.id}`);
        
        // 3. Delete project documents
        await api.delete(`/unpriced_po_documents?project_id=eq.${project.id}`);
        await api.delete(`/design_inputs_documents?project_id=eq.${project.id}`);
        await api.delete(`/client_reference_documents?project_id=eq.${project.id}`);
        await api.delete(`/other_documents?project_id=eq.${project.id}`);
        
        // 4. Delete project members
        await api.delete(`/project_members?project_id=eq.${project.id}`);
        
        // 5. Delete VDCR records and documents
        const vdcrResponse = await api.get(`/vdcr_records?project_id=eq.${project.id}&select=id`);
        const vdcrRecords = (vdcrResponse.data as any[]) || [];
        
        for (const vdcr of vdcrRecords) {
          await api.delete(`/vdcr_documents?vdcr_record_id=eq.${vdcr.id}`);
        }
        await api.delete(`/vdcr_records?project_id=eq.${project.id}`);
      }
      
      // 6. Clear project_id references from users table first
      await api.patch(`/users?firm_id=eq.${id}`, { project_id: null });
      // console.log('✅ Cleared project_id references from users');
      
      // 7. Delete projects
      await api.delete(`/projects?firm_id=eq.${id}`);
      // console.log('✅ Projects deleted');
      
      // 8. Delete invites
      await api.delete(`/invites?firm_id=eq.${id}`);
      // console.log('✅ Invites deleted');
      
      // 9. Delete users (now safe)
      await api.delete(`/users?firm_id=eq.${id}`);
      // console.log('✅ Users deleted');
      
      // 10. Finally delete company
      const response = await api.delete(`/firms?id=eq.${id}`);
      // console.log('✅ Company deleted successfully');
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting company:', error);
      throw error;
    }
  },

  // Create user
  async createUser(userData: any) {
    try {
      const response = await api.post('/users', userData);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating user:', error);
      throw error;
    }
  },

  // Update user
  async updateUser(id: string, userData: any) {
    try {
      const response = await api.patch(`/users?id=eq.${id}`, userData);
      return response.data;
    } catch (error) {
      console.error('❌ Error updating user:', error);
      throw error;
    }
  },

  // Delete users by firm_id
  async deleteUsersByFirm(firmId: string) {
    try {
      const response = await api.delete(`/users?firm_id=eq.${firmId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting users by firm:', error);
      throw error;
    }
  },

  // =====================================================
  // PROJECTS API FUNCTIONS
  // =====================================================

  // Fetch projects by firm_id with equipment data and documents
  async getProjectsByFirm(firmId: string, userRole?: string, userId?: string) {
    try {
      let projects: any[] = [];
      
      // Role-based filtering using both users table and project_members table
      if (userRole === 'super_admin') {
        // Super Admin sees all projects
        const response = await api.get(`/projects?select=*&order=created_at.desc`);
        projects = (response.data as any[]) || [];
      } else if (userRole === 'firm_admin') {
        // Firm Admin sees all projects in their firm
        const response = await api.get(`/projects?firm_id=eq.${firmId}&select=*&order=created_at.desc`);
        projects = (response.data as any[]) || [];
      } else if (userId) {
        // All other roles (project_manager, vdcr_manager, editor, viewer) see only assigned projects
        let assignedProjectIds = [];
        
        // Check project_members table for multiple project assignments
        // console.log('🔍 DEBUG: Fetching project assignments for user:', userId);
        const membersResponse = await api.get(`/project_members?user_id=eq.${userId}&select=project_id`);
        // console.log('🔍 DEBUG: Project members response:', membersResponse.data);
        const memberProjectIds = (membersResponse.data as any[]).map((member: any) => member.project_id);
        // console.log('🔍 DEBUG: Extracted project IDs:', memberProjectIds);
        assignedProjectIds = [...memberProjectIds];
        
        // Remove duplicates
        assignedProjectIds = [...new Set(assignedProjectIds)];
        // console.log('🔍 DEBUG: Final assigned project IDs:', assignedProjectIds);
        
        if (assignedProjectIds.length > 0) {
          // Get projects for assigned project IDs
          const projectIdsString = assignedProjectIds.join(',');
          const response = await api.get(`/projects?firm_id=eq.${firmId}&id=in.(${projectIdsString})&select=*&order=created_at.desc`);
          projects = (response.data as any[]) || [];
        }
        // If no assigned projects, return empty array
      } else {
        // Fallback: return empty array
        projects = [];
      }
      
      // Fetch equipment data and documents for each project
      const projectsWithEquipmentAndDocuments = await Promise.all(
        (projects as any[]).map(async (project: any) => {
          try {
            // Fetch equipment data
            const equipmentResponse = await api.get(`/equipment?project_id=eq.${project.id}&select=*&order=created_at.desc`);
            const equipment = equipmentResponse.data || [];
            
            // Create equipment breakdown
            const equipmentBreakdown = (equipment as any[]).reduce((acc: any, eq: any) => {
              const type = eq.type || 'Unknown';
              acc[type] = (acc[type] || 0) + 1;
              return acc;
            }, {});
            
            // Fetch document data from categorized tables
            // console.log(`📄 Fetching documents for project: ${project.id}`);
            const [unpricedPODocs, designInputsDocs, clientRefDocs, otherDocs] = await Promise.all([
              api.get(`/unpriced_po_documents?project_id=eq.${project.id}&select=*&order=created_at.desc`).catch((error) => {
                // console.log(`❌ Error fetching unpriced_po_documents for project ${project.id}:`, error.response?.status);
                return { data: [] };
              }),
              api.get(`/design_inputs_documents?project_id=eq.${project.id}&select=*&order=created_at.desc`).catch((error) => {
                // console.log(`❌ Error fetching design_inputs_documents for project ${project.id}:`, error.response?.status);
                return { data: [] };
              }),
              api.get(`/client_reference_documents?project_id=eq.${project.id}&select=*&order=created_at.desc`).catch((error) => {
                // console.log(`❌ Error fetching client_reference_documents for project ${project.id}:`, error.response?.status);
                return { data: [] };
              }),
              api.get(`/other_documents?project_id=eq.${project.id}&select=*&order=created_at.desc`).catch((error) => {
                // console.log(`❌ Error fetching other_documents for project ${project.id}:`, error.response?.status);
                return { data: [] };
              })
            ]);
            
            // console.log(`📄 Document fetch results for project ${project.id}:`, {
            //   unpricedPODocs: unpricedPODocs.data?.length || 0,
            //   designInputsDocs: designInputsDocs.data?.length || 0,
            //   clientRefDocs: clientRefDocs.data?.length || 0,
            //   otherDocs: otherDocs.data?.length || 0
            // });
            
            return {
              ...project,
              equipment: equipment,
              equipmentBreakdown: equipmentBreakdown,
              equipmentCount: (equipment as any[]).length,
              // Add document data
              unpriced_po_documents: unpricedPODocs.data || [],
              design_inputs_documents: designInputsDocs.data || [],
              client_reference_documents: clientRefDocs.data || [],
              other_documents: otherDocs.data || []
            };
          } catch (equipmentError) {
            console.error(`❌ Error fetching equipment for project ${project.id}:`, equipmentError);
            return {
              ...project,
              equipment: [],
              equipmentBreakdown: {},
              equipmentCount: 0,
              // Add empty document arrays in case of error
              unpriced_po_documents: [],
              design_inputs_documents: [],
              client_reference_documents: [],
              other_documents: []
            };
          }
        })
      );
      
      return projectsWithEquipmentAndDocuments;
    } catch (error) {
      console.error('❌ Error fetching projects:', error);
      throw error;
    }
  },

  // Fetch single project by ID
  async getProjectById(projectId: string) {
    try {
      const response = await api.get(`/projects?id=eq.${projectId}&select=*`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching project by ID:', error);
      throw error;
    }
  },

  // Create new project
  async createProject(projectData: any) {
    try {
      const response = await api.post('/projects', projectData);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating project:', error);
      throw error;
    }
  },

  // Update project
  async updateProject(id: string, projectData: any) {
    try {
      // console.log('🔍 Updating project with data:', projectData);
      // console.log('🔍 Project ID:', id);
      const response = await api.patch(`/projects?id=eq.${id}`, projectData);
      // console.log('✅ Project updated successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error updating project:', error);
      console.error('❌ Error response:', error.response?.data);
      throw error;
    }
  },

  // Delete project
  async deleteProject(id: string) {
    try {
      // console.log('🗑️ Attempting to delete project:', id);
      
      // First get all equipment for this project
      // console.log('🗑️ Getting equipment for project...');
      const equipmentResponse = await api.get(`/equipment?project_id=eq.${id}&select=id`);
      const equipment = equipmentResponse.data || [];
      
      // Delete equipment documents first (they reference equipment)
      // console.log('🗑️ Deleting equipment documents...');
      for (const eq of (equipment as any[])) {
        try {
          await api.delete(`/equipment_documents?equipment_id=eq.${eq.id}`);
        } catch (error) {
          console.log('⚠️ No equipment documents to delete for equipment:', eq.id);
        }
      }
      
      // Delete equipment progress images
      // console.log('🗑️ Deleting equipment progress images...');
      for (const eq of (equipment as any[])) {
        try {
          await api.delete(`/equipment_progress_images?equipment_id=eq.${eq.id}`);
        } catch (error) {
          console.log('⚠️ No progress images to delete for equipment:', eq.id);
        }
      }
      
      // Now delete equipment
      // console.log('🗑️ Deleting related equipment...');
      try {
        await api.delete(`/equipment?project_id=eq.${id}`);
      } catch (error) {
        console.log('⚠️ No equipment to delete for project:', id);
      }
      
      // Delete project members
      // console.log('🗑️ Deleting related project members...');
      try {
        await api.delete(`/project_members?project_id=eq.${id}`);
      } catch (error) {
        console.log('⚠️ No project members to delete for project:', id);
      }
      
      // Delete invites to resolve foreign key constraint
      // console.log('🗑️ Deleting related invites...');
      try {
        await api.delete(`/invites?project_id=eq.${id}`);
      } catch (error) {
        console.log('⚠️ No invites to delete for project:', id);
      }
      
      // Clear user references to this project (set project_id to null)
      // console.log('🗑️ Clearing user references to project...');
      try {
        await api.patch(`/users?project_id=eq.${id}`, { project_id: null });
        // console.log('✅ User references cleared successfully');
      } catch (error) {
        console.log('⚠️ No user references to clear for project:', id);
      }
      
      // Delete VDCR records first (they reference project)
      // console.log('🗑️ Deleting VDCR records...');
      try {
        await api.delete(`/vdcr_records?project_id=eq.${id}`);
      } catch (error) {
        console.log('⚠️ No VDCR records to delete for project:', id);
      }
      
      // Delete related documents
      // console.log('🗑️ Deleting related documents...');
      try {
        await api.delete(`/unpriced_po_documents?project_id=eq.${id}`);
      } catch (error) {
        console.log('⚠️ No unpriced PO documents to delete');
      }
      
      try {
        await api.delete(`/design_inputs_documents?project_id=eq.${id}`);
      } catch (error) {
        console.log('⚠️ No design inputs documents to delete');
      }
      
      try {
        await api.delete(`/client_reference_documents?project_id=eq.${id}`);
      } catch (error) {
        console.log('⚠️ No client reference documents to delete');
      }
      
      try {
        await api.delete(`/other_documents?project_id=eq.${id}`);
      } catch (error) {
        console.log('⚠️ No other documents to delete');
      }
      
      // Now delete the project
      // console.log('🗑️ Deleting project...');
      const response = await api.delete(`/projects?id=eq.${id}`);
      // console.log('✅ Project deleted successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting project:', error);
      console.error('❌ Error response:', error.response?.data);
      throw error;
    }
  },

  // =====================================================
  // EQUIPMENT API FUNCTIONS
  // =====================================================

  // Fetch equipment by project_id with progress images
  async getEquipmentByProject(projectId: string) {
    try {
      // Fetch all equipment first
      const response = await api.get(`/equipment?project_id=eq.${projectId}&select=*&order=created_at.desc`);
      const equipment = response.data;
      
      if (!equipment || !Array.isArray(equipment) || equipment.length === 0) {
        return [];
      }

      // Get all equipment IDs for batch fetching
      const equipmentIds = (equipment as any[]).map(eq => eq.id);
      
      // OPTIMIZATION: Batch fetch ALL progress images and entries in 2 API calls instead of N*2 calls
      // This reduces from 2N API calls to just 2 API calls
      const [progressImagesResponse, progressEntriesResponse] = await Promise.all([
        // Fetch ALL progress images for all equipment in one call
        api.get(`/equipment_progress_images?equipment_id=in.(${equipmentIds.join(',')})&select=*&order=created_at.desc`).catch(() => ({ data: [] })),
        // Fetch ALL progress entries for all equipment in one call
        api.get(`/equipment_progress_entries?equipment_id=in.(${equipmentIds.join(',')})&select=*&order=created_at.desc`).catch(() => ({ data: [] }))
      ]);

      const allProgressImages = progressImagesResponse.data || [];
      const allProgressEntries = progressEntriesResponse.data || [];

      // Map progress data to equipment
      const equipmentWithProgressData = (equipment as any[]).map((eq: any) => {
        // Filter progress images for this equipment
        const progressImages = allProgressImages.filter((img: any) => img.equipment_id === eq.id);
        // Filter progress entries for this equipment
        const progressEntries = allProgressEntries.filter((entry: any) => entry.equipment_id === eq.id);
        
        return {
          ...eq,
          // Main progress images (top section)
          progress_images: progressImages.map((img: any) => img.image_url),
          progress_images_metadata: progressImages,
          // Progress entries (updates tab) - separate from progress images
          progress_entries: progressEntries,
          // Technical sections and custom fields (already in eq from database)
          technical_sections: eq.technical_sections || [],
          custom_fields: eq.custom_fields || [],
          team_custom_fields: eq.team_custom_fields || []
        };
      });
      
      return equipmentWithProgressData;
    } catch (error) {
      console.error('❌ Error fetching equipment:', error);
      throw error;
    }
  },

  // Fetch standalone equipment (not connected to any project) - filtered by firm_id via created_by -> users.firm_id
  async getStandaloneEquipment(firmId?: string) {
    try {
      // Get firm_id from user data if not provided
      if (!firmId) {
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        firmId = userData.firm_id;
      }
      
      if (!firmId) {
        console.error('❌ No firm_id available for fetching standalone equipment');
        return [];
      }
      
      // First, get all user IDs for this firm
      const usersResponse = await api.get(`/users?firm_id=eq.${firmId}&select=id`).catch(() => ({ data: [] }));
      const firmUserIds = (usersResponse.data || []).map((u: any) => u.id);
      
      if (firmUserIds.length === 0) {
        return [];
      }
      
      // Fetch standalone equipment where created_by is in the list of firm user IDs
      // PostgREST supports filtering with 'in' operator
      const response = await api.get(`/standalone_equipment?created_by=in.(${firmUserIds.join(',')})&select=*&order=created_at.desc`);
      const equipment = response.data;
      
      if (!equipment || !Array.isArray(equipment) || equipment.length === 0) {
        return [];
      }

      // Get all equipment IDs for batch fetching
      const equipmentIds = (equipment as any[]).map(eq => eq.id);
      
      // OPTIMIZATION: Batch fetch ALL progress images and entries in 2 API calls instead of N*2 calls
      // This reduces from 2N API calls to just 2 API calls
      const [progressImagesResponse, progressEntriesResponse] = await Promise.all([
        // Fetch ALL progress images for all equipment in one call
        api.get(`/standalone_equipment_progress_images?equipment_id=in.(${equipmentIds.join(',')})&select=*&order=created_at.desc`).catch(() => ({ data: [] })),
        // Fetch ALL progress entries for all equipment in one call
        api.get(`/standalone_equipment_progress_entries?equipment_id=in.(${equipmentIds.join(',')})&select=*&order=created_at.desc`).catch(() => ({ data: [] }))
      ]);

      const allProgressImages = progressImagesResponse.data || [];
      const allProgressEntries = progressEntriesResponse.data || [];

      // Map progress data to equipment
      const equipmentWithProgressData = (equipment as any[]).map((eq: any) => {
        // Filter progress images for this equipment
        const progressImages = allProgressImages.filter((img: any) => img.equipment_id === eq.id);
        // Filter progress entries for this equipment
        const progressEntries = allProgressEntries.filter((entry: any) => entry.equipment_id === eq.id);
        
        return {
          ...eq,
          // Main progress images (top section)
          progress_images: progressImages.map((img: any) => img.image_url),
          progress_images_metadata: progressImages,
          // Progress entries (updates tab) - separate from progress images
          progress_entries: progressEntries,
          // Technical sections and custom fields (already in eq from database)
          technical_sections: eq.technical_sections || [],
          custom_fields: eq.custom_fields || [],
          team_custom_fields: eq.team_custom_fields || []
        };
      });
      
      return equipmentWithProgressData;
    } catch (error) {
      console.error('❌ Error fetching standalone equipment:', error);
      throw error;
    }
  },

  // Create new equipment
  // Check if tag number, job number, or MSN already exists globally (across both equipment and standalone_equipment tables)
  async checkEquipmentUniqueness(tagNumber?: string, jobNumber?: string, manufacturingSerial?: string, excludeEquipmentId?: string, isStandalone?: boolean) {
    try {
      const checks: Array<{ type: string; promise: Promise<any> }> = [];
      const tableName = isStandalone ? 'standalone_equipment' : 'equipment';
      
      if (tagNumber && tagNumber.trim()) {
        let tagQuery = `/${tableName}?tag_number=eq.${encodeURIComponent(tagNumber.trim())}`;
        if (excludeEquipmentId) {
          tagQuery += `&id=neq.${excludeEquipmentId}`;
        }
        checks.push({ type: 'tagNumber', promise: api.get(tagQuery) as Promise<any> });
        
        // Also check the other table for global uniqueness
        const otherTable = isStandalone ? 'equipment' : 'standalone_equipment';
        checks.push({ type: 'tagNumberOther', promise: api.get(`/${otherTable}?tag_number=eq.${encodeURIComponent(tagNumber.trim())}`).catch(() => ({ data: [] })) as Promise<any> });
      }
      
      if (jobNumber && jobNumber.trim()) {
        let jobQuery = `/${tableName}?job_number=eq.${encodeURIComponent(jobNumber.trim())}`;
        if (excludeEquipmentId) {
          jobQuery += `&id=neq.${excludeEquipmentId}`;
        }
        checks.push({ type: 'jobNumber', promise: api.get(jobQuery) as Promise<any> });
        
        // Also check the other table for global uniqueness
        const otherTable = isStandalone ? 'equipment' : 'standalone_equipment';
        checks.push({ type: 'jobNumberOther', promise: api.get(`/${otherTable}?job_number=eq.${encodeURIComponent(jobNumber.trim())}`).catch(() => ({ data: [] })) as Promise<any> });
      }
      
      if (manufacturingSerial && manufacturingSerial.trim()) {
        let msnQuery = `/${tableName}?manufacturing_serial=eq.${encodeURIComponent(manufacturingSerial.trim())}`;
        if (excludeEquipmentId) {
          msnQuery += `&id=neq.${excludeEquipmentId}`;
        }
        checks.push({ type: 'manufacturingSerial', promise: api.get(msnQuery) as Promise<any> });
        
        // Also check the other table for global uniqueness
        const otherTable = isStandalone ? 'equipment' : 'standalone_equipment';
        checks.push({ type: 'manufacturingSerialOther', promise: api.get(`/${otherTable}?manufacturing_serial=eq.${encodeURIComponent(manufacturingSerial.trim())}`).catch(() => ({ data: [] })) as Promise<any> });
      }
      
      const results = await Promise.all(checks.map(c => c.promise));
      const conflicts: string[] = [];
      
      checks.forEach((check, index) => {
        if (results[index]?.data?.length > 0) {
          if (check.type === 'tagNumber' || check.type === 'tagNumberOther') {
            conflicts.push(`Tag Number "${tagNumber}" already exists`);
          } else if (check.type === 'jobNumber' || check.type === 'jobNumberOther') {
            conflicts.push(`Job Number "${jobNumber}" already exists`);
          } else if (check.type === 'manufacturingSerial' || check.type === 'manufacturingSerialOther') {
            conflicts.push(`Manufacturing Serial Number "${manufacturingSerial}" already exists`);
          }
        }
      });
      
      return {
        isUnique: conflicts.length === 0,
        conflicts
      };
    } catch (error: any) {
      console.error('❌ Error checking equipment uniqueness:', error);
      // If check fails, allow creation but log error
      return { isUnique: true, conflicts: [] };
    }
  },

  async createEquipment(equipmentData: any) {
    try {
      // Normalize values before checking (trim whitespace, handle empty strings)
      const tagNumber = equipmentData.tag_number?.trim() || '';
      const jobNumber = equipmentData.job_number?.trim() || '';
      const manufacturingSerial = equipmentData.manufacturing_serial?.trim() || '';
      
      // console.log('🔍 Checking uniqueness for equipment:', {
      //   tag_number: tagNumber,
      //   job_number: jobNumber,
      //   manufacturing_serial: manufacturingSerial
      // });
      
      // Check for global uniqueness before creating
      // Only check non-empty values to avoid false positives
      const uniquenessCheck = await fastAPI.checkEquipmentUniqueness(
        tagNumber || undefined,
        jobNumber || undefined,
        manufacturingSerial || undefined
      );
      
      // console.log('🔍 Uniqueness check result:', uniquenessCheck);
      
      if (!uniquenessCheck.isUnique) {
        const errorMessage = `Cannot create equipment. ${uniquenessCheck.conflicts.join('. ')}. Each Tag Number, Job Number, and Manufacturing Serial Number must be unique across all projects.`;
        console.error('❌ Uniqueness validation failed:', errorMessage);
        throw new Error(errorMessage);
      }
      
      // console.log('✅ Uniqueness validation passed, creating equipment...');
      const response = await api.post('/equipment', equipmentData);
      // console.log('✅ Equipment create API response:', response.data);
      
      // Log equipment creation
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const createdEquipment = response.data[0];
        await logEquipmentCreated(
          createdEquipment.project_id,
          createdEquipment.id,
          createdEquipment.type,
          createdEquipment.tag_number
        );
      }
      
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating equipment:', error);
      throw error;
    }
  },

  // Update equipment

  // Create progress image
  async createProgressImage(imageData: {
    equipment_id: string,
    image_url: string,
    description?: string,
    audio_data?: string,
    audio_duration?: number,
    uploaded_by?: string
  }) {
    try {
      const response = await api.post('/equipment_progress_images', imageData);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating progress image:', error);
      throw error;
    }
  },

  // Create standalone progress image
  async createStandaloneProgressImage(imageData: {
    equipment_id: string,
    image_url: string,
    description?: string,
    audio_data?: string,
    audio_duration?: number,
    uploaded_by?: string
  }) {
    try {
      const response = await api.post('/standalone_equipment_progress_images', imageData);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating standalone progress image:', error);
      throw error;
    }
  },

  // Create progress entry
  async createProgressEntry(entryData: {
    equipment_id: string,
    entry_text: string,
    entry_type: string,
    audio_data?: string,
    audio_duration?: number,
    image_url?: string,
    image_description?: string,
    created_by?: string
  }) {
    try {
      const response = await api.post('/equipment_progress_entries', entryData);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating progress entry:', error);
      throw error;
    }
  },

  // Get progress entries for equipment with user information
  async getProgressEntriesByEquipment(equipmentId: string) {
    try {
      const response = await api.get(`/equipment_progress_entries?equipment_id=eq.${equipmentId}&select=*,users(full_name)&order=created_at.desc`);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching progress entries:', error);
      throw error;
    }
  },

  // Update equipment
  async updateEquipment(id: string, equipmentData: any, currentUserId?: string) {
  try {
    // console.log('🔧 updateEquipment called with:', { id, equipmentData, currentUserId });
    
    // Get current equipment data to track changes
    const currentEquipmentResponse = await api.get(`/equipment?id=eq.${id}&select=*`);
    const currentEquipment = currentEquipmentResponse.data?.[0];
    
    // Check for global uniqueness if tag_number, job_number, or manufacturing_serial are being updated
    // Only check fields that are actually being changed
    const tagNumberToCheck = equipmentData.tag_number !== undefined ? equipmentData.tag_number : undefined;
    const jobNumberToCheck = equipmentData.job_number !== undefined ? equipmentData.job_number : undefined;
    const msnToCheck = equipmentData.manufacturing_serial !== undefined ? equipmentData.manufacturing_serial : undefined;
    
    // Only run uniqueness check if at least one of these fields is being updated
    if (currentEquipment && (tagNumberToCheck !== undefined || jobNumberToCheck !== undefined || msnToCheck !== undefined)) {
      const uniquenessCheck = await fastAPI.checkEquipmentUniqueness(
        tagNumberToCheck !== undefined ? tagNumberToCheck : undefined,
        jobNumberToCheck !== undefined ? jobNumberToCheck : undefined,
        msnToCheck !== undefined ? msnToCheck : undefined,
        id // Exclude current equipment from check
      );
      
      if (!uniquenessCheck.isUnique) {
        const errorMessage = `Cannot update equipment. ${uniquenessCheck.conflicts.join('. ')}. Each Tag Number, Job Number, and Manufacturing Serial Number must be unique across all projects.`;
        throw new Error(errorMessage);
      }
    }
    
    // Add updated_by field to track who made the update
    const updateData = {
      ...equipmentData,
      updated_at: new Date().toISOString(),
      ...(currentUserId && { updated_by: currentUserId })
    };
    
    const response = await api.patch(`/equipment?id=eq.${id}`, updateData);
    // console.log('✅ Equipment update API response:', response.data);
    
    // Track changes for logging
    if (currentEquipment && response.data && Array.isArray(response.data) && response.data.length > 0) {
      const updatedEquipment = response.data[0];
      const changes: Record<string, { old: any; new: any }> = {};
      
      // Compare key fields for changes - only track meaningful changes
      const fieldsToTrack = ['type', 'tag_number', 'status', 'progress', 'progress_phase', 'location', 'priority', 'notes', 'po_cdd'];
      
      // Helper to normalize values - treat "Not Assigned", "Not set", empty, null as equivalent
      const normalizeForComparison = (val: any): string | null => {
        if (val === null || val === undefined) return null;
        const str = String(val).trim();
        const lowerStr = str.toLowerCase();
        // Treat all these as equivalent (no real value set)
        if (str === '' || 
            lowerStr === 'not set' || 
            lowerStr === 'not-set' || 
            lowerStr === 'not assigned' || 
            lowerStr === 'null' || 
            lowerStr === 'undefined') {
          return null;
        }
        return str;
      };
      
      // Check if progress_phase is changing (if so, we'll skip progress percentage changes)
      const progressPhaseChanging = currentEquipment['progress_phase'] !== updatedEquipment['progress_phase'];
      
      fieldsToTrack.forEach(field => {
        const oldValue = currentEquipment[field];
        const newValue = updatedEquipment[field];
        
        // Skip progress percentage if progress_phase is also changing (progress is automatically set based on phase)
        if (field === 'progress' && progressPhaseChanging) {
          return; // Don't log progress changes when phase changes (it's automatic)
        }
        
        // Only track if values actually changed
        if (oldValue !== newValue) {
          const normalizedOld = normalizeForComparison(oldValue);
          const normalizedNew = normalizeForComparison(newValue);
          
          // Skip if both are null/empty/not set (no meaningful change)
          if (!(normalizedOld === null && normalizedNew === null)) {
            // Format values for display
            const displayOld = normalizedOld === null ? 'Not set' : normalizedOld;
            const displayNew = normalizedNew === null ? 'Not set' : normalizedNew;
            
            // Only log if old and new are actually different (skip "Not set" → "Not set")
            if (displayOld !== displayNew) {
              changes[field] = {
                old: displayOld,
                new: displayNew
              };
              
              // Final safety check: remove if both are "Not set"
              if (changes[field].old === 'Not set' && changes[field].new === 'Not set') {
                delete changes[field];
              }
            }
          }
        }
      });
      
      // Track team member fields ONLY if they were explicitly included in the update payload
      // Don't compare fields the user didn't touch
      const teamFieldsToTrack = ['supervisor', 'welder', 'qc_inspector', 'project_manager'];
      const fieldsInUpdate = Object.keys(updateData); // Only fields that were sent in the update
      
      teamFieldsToTrack.forEach(field => {
        // Skip if this field wasn't in the update payload (user didn't change it)
        if (!fieldsInUpdate.includes(field)) {
          return;
        }
        
        const oldValue = currentEquipment[field];
        const newValue = updatedEquipment[field];
        
        // Normalize values for comparison - treat "Not Assigned", "Not set", empty, null as equivalent
        const normalizeValue = (val: any): string | null => {
          if (!val) return null;
          const str = String(val).trim();
          const lowerStr = str.toLowerCase();
          // Treat all these as equivalent (no real value set)
          if (str === '' || 
              lowerStr === 'not set' || 
              lowerStr === 'not-set' || 
              lowerStr === 'not assigned' || 
              lowerStr === 'null' || 
              lowerStr === 'undefined') {
            return null;
          }
          return str;
        };
        
        const normalizedOld = normalizeValue(oldValue);
        const normalizedNew = normalizeValue(newValue);
        
        // Only track if:
        // 1. Going from null/empty to a value
        // 2. Going from a value to null/empty  
        // 3. Going from one value to a different value
        // NEVER log if both are null/empty (futile change)
        if (normalizedOld !== normalizedNew) {
          if (!(normalizedOld === null && normalizedNew === null)) {
            changes[field] = {
              old: normalizedOld || 'Not set',
              new: normalizedNew || 'Not set'
            };
            
            // Double-check: if both end up as "Not set", remove it
            if (changes[field].old === 'Not set' && changes[field].new === 'Not set') {
              delete changes[field];
            }
          }
        }
      });
      
      // Track technical sections changes
      if (JSON.stringify(currentEquipment.technical_sections) !== JSON.stringify(updatedEquipment.technical_sections)) {
        changes['technical_sections'] = {
          old: currentEquipment.technical_sections || 'No sections',
          new: updatedEquipment.technical_sections || 'No sections'
        };
      }
      
      // Track custom fields changes
      if (JSON.stringify(currentEquipment.custom_fields) !== JSON.stringify(updatedEquipment.custom_fields)) {
        changes['custom_fields'] = {
          old: currentEquipment.custom_fields || 'No custom fields',
          new: updatedEquipment.custom_fields || 'No custom fields'
        };
      }
      
      // Track team custom fields changes
      if (JSON.stringify(currentEquipment.team_custom_fields) !== JSON.stringify(updatedEquipment.team_custom_fields)) {
        changes['team_custom_fields'] = {
          old: currentEquipment.team_custom_fields || 'No team fields',
          new: updatedEquipment.team_custom_fields || 'No team fields'
        };
      }
      
      // Log the changes if any
      if (Object.keys(changes).length > 0) {
        await logEquipmentUpdated(
          updatedEquipment.project_id,
          id,
          updatedEquipment.type,
          updatedEquipment.tag_number,
          changes
        );
      }
    }
    
    return response.data;
  } 
  catch (error: any) {
    console.error('❌ Error updating equipment:', error);
    console.error('❌ Error response data:', error.response?.data);
    console.error('❌ Error response status:', error.response?.status);
    throw error;
  }
},

  // Delete equipment
  async deleteEquipment(id: string) {
    try {
      // Get equipment details before deletion for logging
      const equipmentResponse = await api.get(`/equipment?id=eq.${id}&select=project_id,type,tag_number`);
      const equipment = equipmentResponse.data?.[0];
      
      const response = await api.delete(`/equipment?id=eq.${id}`);
      
      // Log equipment deletion
      if (equipment) {
        await logEquipmentDeleted(
          equipment.project_id,
          id,
          equipment.type,
          equipment.tag_number
        );
      }
      
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting equipment:', error);
      throw error;
    }
  },

  // Standalone Equipment CRUD operations
  async createStandaloneEquipment(equipmentData: any) {
    try {
      // Get current user ID to set as created_by (firm_id is determined via created_by -> users.firm_id)
      const userId = localStorage.getItem('userId');
      if (!userId) {
        throw new Error('Cannot create standalone equipment: user ID is required. Please ensure you are logged in.');
      }
      
      // Set created_by to track who created the equipment (firm ownership determined via users.firm_id)
      equipmentData.created_by = userId;
      
      // Normalize values before checking (trim whitespace, handle empty strings)
      const tagNumber = equipmentData.tag_number?.trim() || '';
      const jobNumber = equipmentData.job_number?.trim() || '';
      const manufacturingSerial = equipmentData.manufacturing_serial?.trim() || '';
      
      // Check for global uniqueness (across both equipment and standalone_equipment tables)
      const uniquenessCheck = await fastAPI.checkEquipmentUniqueness(
        tagNumber || undefined,
        jobNumber || undefined,
        manufacturingSerial || undefined,
        undefined,
        true // isStandalone flag
      );
      
      if (!uniquenessCheck.isUnique) {
        const errorMessage = `Cannot create equipment. ${uniquenessCheck.conflicts.join('. ')}. Each Tag Number, Job Number, and Manufacturing Serial Number must be unique across all projects and standalone equipment.`;
        console.error('❌ Uniqueness validation failed:', errorMessage);
        throw new Error(errorMessage);
      }
      
      const response = await api.post('/standalone_equipment', equipmentData);
      
      // Log equipment creation (project_id will be null for standalone equipment)
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const createdEquipment = response.data[0];
        await logEquipmentCreated(
          null, // No project_id for standalone equipment (now allowed in activity_logs)
          createdEquipment.id,
          createdEquipment.type,
          createdEquipment.tag_number
        );
      }
      
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating standalone equipment:', error);
      throw error;
    }
  },

  async updateStandaloneEquipment(id: string, equipmentData: any, currentUserId?: string) {
    try {
      // Get current equipment data to track changes
      const currentEquipmentResponse = await api.get(`/standalone_equipment?id=eq.${id}&select=*`);
      const currentEquipment = currentEquipmentResponse.data?.[0];
      
      // Check for global uniqueness if tag_number, job_number, or manufacturing_serial are being updated
      const tagNumberToCheck = equipmentData.tag_number !== undefined ? equipmentData.tag_number : undefined;
      const jobNumberToCheck = equipmentData.job_number !== undefined ? equipmentData.job_number : undefined;
      const msnToCheck = equipmentData.manufacturing_serial !== undefined ? equipmentData.manufacturing_serial : undefined;
      
      if (currentEquipment && (tagNumberToCheck !== undefined || jobNumberToCheck !== undefined || msnToCheck !== undefined)) {
        const uniquenessCheck = await fastAPI.checkEquipmentUniqueness(
          tagNumberToCheck !== undefined ? tagNumberToCheck : undefined,
          jobNumberToCheck !== undefined ? jobNumberToCheck : undefined,
          msnToCheck !== undefined ? msnToCheck : undefined,
          id,
          true // isStandalone flag
        );
        
        if (!uniquenessCheck.isUnique) {
          const errorMessage = `Cannot update equipment. ${uniquenessCheck.conflicts.join('. ')}. Each Tag Number, Job Number, and Manufacturing Serial Number must be unique across all projects and standalone equipment.`;
          throw new Error(errorMessage);
        }
      }
      
      // Add updated_by field to track who made the update
      const updateData = {
        ...equipmentData,
        updated_at: new Date().toISOString(),
        ...(currentUserId && { updated_by: currentUserId })
      };
      
      const response = await api.patch(`/standalone_equipment?id=eq.${id}`, updateData);
      
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating standalone equipment:', error);
      throw error;
    }
  },

  async deleteStandaloneEquipment(id: string) {
    try {
      // Get equipment details before deletion for logging
      const equipmentResponse = await api.get(`/standalone_equipment?id=eq.${id}&select=type,tag_number`);
      const equipment = equipmentResponse.data?.[0];
      
      const response = await api.delete(`/standalone_equipment?id=eq.${id}`);
      
      // Log equipment deletion (project_id will be null for standalone equipment)
      if (equipment) {
        await logEquipmentDeleted(
          null, // No project_id for standalone equipment (now allowed in activity_logs)
          id,
          equipment.type,
          equipment.tag_number
        );
      }
      
      return response.data;
    } catch (error) {
      console.error('❌ Error deleting standalone equipment:', error);
      throw error;
    }
  },

  // Create team position
  async createTeamPosition(teamPositionData: any) {
    try {
      const response = await api.post('/equipment_team_positions', teamPositionData);
      // console.log('✅ Team position create API response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating team position:', error);
      throw error;
    }
  },


  // Create document
  async createDocument(documentData: any) {
    try {
      const response = await api.post('/equipment_documents', documentData);
      // console.log('✅ Document create API response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating document:', error);
      throw error;
    }
  },

  // Get documents by equipment ID
  async getDocumentsByEquipment(equipmentId: string) {
    try {
      // console.log(`🔍 Fetching documents for equipment ID: ${equipmentId}`);
      const response = await api.get(`/equipment_documents?equipment_id=eq.${equipmentId}&select=*&order=upload_date.desc`);
      // console.log('✅ Documents fetch API response:', response.data);
      // console.log(`📊 Found ${(response.data as any[])?.length || 0} documents for equipment ${equipmentId}`);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching documents:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      throw error;
    }
  },

  // Get all documents (for debugging)
  async getAllDocuments() {
    try {
      // console.log('🔍 Fetching ALL documents from database...');
      const response = await api.get('/equipment_documents?select=*&order=created_at.desc');
      // console.log('✅ All documents response:', response.data);
      // console.log(`📊 Total documents in database: ${(response.data as any[])?.length || 0}`);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching all documents:', error);
      return [];
    }
  },

  // Project Members API functions
  async getProjectMembers(projectId: string) {
    try {
      // console.log('👥 Fetching project members for project ID:', projectId);
      const response = await api.get(`/project_members?project_id=eq.${projectId}&select=*&order=created_at.desc`);
      // console.log('✅ Project members response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching project members:', error);
      return [];
    }
  },

  async createProjectMember(memberData: any) {
    try {
      // console.log('👥 Creating project member:', memberData);
      const response = await api.post('/project_members', memberData, {
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      });
      // console.log('✅ Project member created successfully');
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating project member:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      throw error;
    }
  },

  async updateProjectMember(memberId: string, memberData: any) {
    try {
      // console.log('👥 Updating project member:', memberId, memberData);
      
      // Remove user_id from update data if it's not provided (to avoid constraint issues)
      const updateData = { ...memberData };
      if (!updateData.user_id) {
        delete updateData.user_id;
      }
      
      const response = await api.patch(`/project_members?id=eq.${memberId}`, updateData, {
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      });
      // console.log('✅ Project member updated successfully');
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating project member:', error);
      throw error;
    }
  },

  async deleteProjectMember(memberId: string) {
    try {
      // console.log('👥 Deleting project member:', memberId);
      const response = await api.delete(`/project_members?id=eq.${memberId}`, {
        headers: {
          'Prefer': 'return=minimal'
        }
      });
      // console.log('✅ Project member deleted successfully');
      return response.data;
    } catch (error: any) {
      console.error('❌ Error deleting project member:', error);
      throw error;
    }
  },

  // Get all unique team members across all projects in the firm
  async getAllFirmTeamMembers(firmId: string) {
    try {
      // First, get all projects for this firm
      const projectsResponse = await api.get(`/projects?firm_id=eq.${firmId}&select=id`);
      const projectIds = (projectsResponse.data as any[]).map(p => p.id);
      
      if (projectIds.length === 0) {
        return [];
      }

      // Get all project members for these projects
      const projectIdsString = projectIds.join(',');
      const membersResponse = await api.get(`/project_members?project_id=in.(${projectIdsString})&select=name,email,phone,role,access_level&order=name.asc`);
      const allMembers = (membersResponse.data as any[]) || [];

      // Group by email to get unique members (take the first occurrence of each email)
      const uniqueMembersMap = new Map<string, any>();
      allMembers.forEach(member => {
        if (member.email && !uniqueMembersMap.has(member.email.toLowerCase())) {
          uniqueMembersMap.set(member.email.toLowerCase(), {
            name: member.name,
            email: member.email,
            phone: member.phone || '',
            role: member.role,
            access_level: member.access_level || member.role
          });
        }
      });

      // Convert map to array
      const uniqueMembers = Array.from(uniqueMembersMap.values());
      return uniqueMembers;
    } catch (error: any) {
      console.error('❌ Error fetching firm team members:', error);
      return [];
    }
  },

  // Import existing documents from storage to database (PERFECT SETUP)
  async importExistingDocuments() {
    try {
      // console.log('🔄 PERFECT: Importing existing documents from storage...');
      
      // List all files in project-documents bucket
      const { data: files, error } = await supabase.storage
        .from('project-documents')
        .list('', {
          limit: 100,
          offset: 0
        });
      
      if (error) {
        console.error('❌ Error listing storage files:', error);
        return [];
      }
      
      // console.log('📁 PERFECT: Found files in storage:', files);
      
      const importedDocs = [];
      
      // Process each file
      for (const file of files || []) {
        if (file.name && !file.name.includes('/')) { // Only root level files
          try {
            // Get public URL
            const { data: urlData } = supabase.storage
              .from('project-documents')
              .getPublicUrl(file.name);
            
            // Try to extract equipment ID from filename or use a default
            const equipmentId = '8d629c78-3805-47fa-90e5-e2955a72b3a1'; // Default to first equipment
            
            const documentData = {
              equipment_id: equipmentId,
              document_name: file.name,
              document_url: urlData.publicUrl,
              document_type: 'application/pdf', // Default type
              file_size: file.metadata?.size || 0,
              uploaded_by: 'system-import',
              upload_date: new Date().toISOString()
            };
            
            // Save to database
            const savedDoc = await this.createDocument(documentData);
            importedDocs.push(savedDoc);
            // console.log('✅ PERFECT: Imported document:', file.name);
            
          } catch (importError) {
            console.error(`❌ Error importing file ${file.name}:`, importError);
          }
        }
      }
      
      // console.log(`✅ PERFECT: Imported ${importedDocs.length} documents from storage`);
      return importedDocs;
      
    } catch (error: any) {
      console.error('❌ PERFECT: Error importing existing documents:', error);
      return [];
    }
  },

  // Upload file to Supabase storage (PERFECT SETUP)
  async uploadFileToStorage(file: File, equipmentId: string, bucket: string = 'project-documents'): Promise<string> {
    try {
      // console.log('📤 PERFECT: Uploading file to Supabase storage:', file.name);
      // console.log('📤 PERFECT: File size:', file.size, 'bytes');
      // console.log('📤 PERFECT: Equipment ID:', equipmentId);
      // console.log('📤 PERFECT: Bucket:', bucket);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 5)}.${fileExt}`;
      const filePath = `equipment-documents/${equipmentId}/${fileName}`;
      
      // console.log('📤 PERFECT: File path:', filePath);
      // console.log('📤 PERFECT: Starting upload to Supabase...');
      
      // Direct upload without timeout
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });
      
      // console.log('📤 REAL: Upload completed');
      // console.log('📤 PERFECT: Upload data:', data);
      // console.log('📤 PERFECT: Upload error:', error);
      
      if (error) {
        console.error('❌ Storage upload error:', error);
        throw new Error(`Storage upload failed: ${error.message}`);
      }
      
      // console.log('📤 PERFECT: Getting public URL...');
      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);
      
      const fileUrl = urlData.publicUrl;
      // console.log('✅ PERFECT: File uploaded to storage:', fileUrl);
      return fileUrl;
    } catch (error: any) {
      console.error('❌ PERFECT: Error uploading file to storage:', error);
      throw error;
    }
  },

  // Delete document
  async deleteDocument(documentId: string) {
    try {
      const response = await api.delete(`/equipment_documents?id=eq.${documentId}`);
      // console.log('✅ Document delete API response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error deleting document:', error);
      throw error;
    }
  },


  // Update progress entry
  async updateProgressEntry(entryId: string, updateData: {
    entry_text?: string,
    entry_type?: string,
    audio_data?: string,
    audio_duration?: number,
    image_url?: string,
    image_description?: string
  }) {
    try {
      // console.log('📝 Updating progress entry:', entryId, updateData);
      const response = await api.patch(`/equipment_progress_entries?id=eq.${entryId}`, updateData);
      // console.log('✅ Progress entry update API response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating progress entry:', error);
      throw error;
    }
  },

  // Delete progress entry
  async deleteProgressEntry(entryId: string) {
    try {
      // console.log('🗑️ Deleting progress entry:', entryId);
      const response = await api.delete(`/equipment_progress_entries?id=eq.${entryId}`);
      // console.log('✅ Progress entry delete API response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error deleting progress entry:', error);
      throw error;
    }
  },

  // Get all progress entries across all projects (for company highlights)
  async getAllProgressEntries(startDate?: string, endDate?: string, projectIds?: string[]) {
    try {
      // Fetch progress entries with equipment and projects
      // Note: Fetching user data separately due to PostgREST FK relationship issue
      let url = `/equipment_progress_entries?select=*,equipment:equipment_id(id,tag_number,type,name,project_id,projects:project_id(id,name))&order=created_at.desc`;
      if (startDate) {
        url += `&created_at=gte.${startDate}`;
      }
      if (endDate) {
        url += `&created_at=lte.${endDate}`;
      }
      // Note: PostgREST doesn't support filtering nested relationships directly
      // Project filtering is handled client-side after fetching
      const response = await api.get(url);
      const entries = Array.isArray(response.data) ? response.data : [];
      
      // Fetch user data separately for entries that have created_by
      const userIds = [...new Set(entries.map((entry: any) => entry.created_by).filter(Boolean))];
      let usersMap: Record<string, any> = {};
      
      if (userIds.length > 0) {
        try {
          const usersResponse = await api.get(`/users?id=in.(${userIds.join(',')})&select=id,full_name,email`);
          const users = Array.isArray(usersResponse.data) ? usersResponse.data : [];
          usersMap = users.reduce((acc: any, user: any) => {
            acc[user.id] = { full_name: user.full_name, email: user.email };
            return acc;
          }, {});
        } catch (userError) {
          console.warn('⚠️ Could not fetch user data:', userError);
        }
      }
      
      // Merge user data into entries
      return entries.map((entry: any) => ({
        ...entry,
        created_by_user: entry.created_by ? usersMap[entry.created_by] || null : null
      }));
    } catch (error: any) {
      console.error('❌ Error fetching all progress entries:', error);
      return [];
    }
  },

  // Get all VDCR documents with approval status (for company highlights)
  async getAllVDCRDocuments(startDate?: string, endDate?: string, projectIds?: string[]) {
    try {
      // Query vdcr_records directly to get status changes (not vdcr_documents)
      // Status changes are tracked in vdcr_records.updated_at
      let url = `/vdcr_records?select=id,project_id,status,updated_at,document_name,equipment_tag_numbers,updated_by,projects:project_id(id,name),updated_by_user:updated_by(full_name,email)&order=updated_at.desc`;
      if (startDate) {
        url += `&updated_at=gte.${startDate}`;
      }
      if (endDate) {
        url += `&updated_at=lte.${endDate}`;
      }
      // Filter by project IDs if provided
      if (projectIds && projectIds.length > 0) {
        const projectIdsString = projectIds.join(',');
        url += `&project_id=in.(${projectIdsString})`;
      }
      const response = await api.get(url);
      // Transform the data to match component expectations
      const records = Array.isArray(response.data) ? response.data : [];
      return records.map((record: any) => ({
        id: record.id,
        document_name: record.document_name || 'Document',
        equipment_ids: record.equipment_tag_numbers?.join(', ') || 'N/A',
        vdcr_records: {
          ...record,
          projects: record.projects
        },
        approved_by: record.updated_by_user?.full_name || record.status || 'Pending',
        created_at: record.updated_at, // Use updated_at as created_at for display
        updated_at: record.updated_at
      }));
    } catch (error: any) {
      console.error('❌ Error fetching all VDCR documents:', error);
      return [];
    }
  },

  // Get all equipment nearing completion (for manufacturing timeline)
  // Note: For timeline, we fetch ALL equipment sorted by days remaining (no date filtering)
  // Uses po_cdd (PO-CDD) field instead of completion_date
  async getAllEquipmentNearingCompletion(startDate?: string, endDate?: string, projectIds?: string[]) {
    try {
      // Fetch all equipment with po_cdd dates (including nulls, we'll filter in component)
      let url = `/equipment?select=id,tag_number,type,name,progress,po_cdd,next_milestone,project_id,projects(id,name)&order=po_cdd.asc.nullsfirst`;
      // Only apply date filters if both are provided (for other use cases)
      // For timeline view, we don't pass dates, so it fetches all equipment
      if (startDate && endDate) {
        url += `&po_cdd=gte.${startDate}&po_cdd=lte.${endDate}`;
      }
      // Filter by project IDs if provided
      if (projectIds && projectIds.length > 0) {
        const projectIdsString = projectIds.join(',');
        url += `&project_id=in.(${projectIdsString})`;
      }
      const response = await api.get(url);
      return response.data || [];
    } catch (error: any) {
      console.error('❌ Error fetching equipment nearing completion:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      return [];
    }
  },

  // Get all equipment activities by project (creation, updates, progress entries)
  async getEquipmentProgressEntriesByProject(projectId: string) {
    try {
      // console.log('📋 Fetching all equipment activities for project:', projectId);
      const response = await api.get(`/equipment?project_id=eq.${projectId}&select=id,tag_number,type,status,progress_entries,created_at,updated_at,created_by,updated_by,created_by_user:created_by(full_name,email),updated_by_user:updated_by(full_name,email)&order=updated_at.desc`);
      // console.log('✅ Equipment data fetched successfully:', response.data);
      
      // Transform equipment data to comprehensive activity format
      const allActivities: any[] = [];
      
      (response.data as any[]).forEach((equipment: any) => {
        // Add equipment creation activity
        allActivities.push({
          id: `equipment-created-${equipment.id}`,
          activity_type: 'equipment_created',
          equipment_id: equipment.id,
          entry_text: `Equipment "${equipment.type}" (${equipment.tag_number}) was created`,
          entry_type: 'creation',
          created_by: equipment.created_by || 'System',
          created_at: equipment.created_at,
          equipment: {
            id: equipment.id,
            tag_number: equipment.tag_number,
            type: equipment.type,
            status: equipment.status
          },
          created_by_user: {
            full_name: equipment.created_by_user?.full_name || 'System',
            email: equipment.created_by_user?.email || ''
          }
        });

        // Add equipment update activity (if updated_at is different from created_at)
        if (equipment.updated_at && equipment.updated_at !== equipment.created_at) {
          allActivities.push({
            id: `equipment-updated-${equipment.id}`,
            activity_type: 'equipment_updated',
            equipment_id: equipment.id,
            entry_text: `Equipment "${equipment.type}" (${equipment.tag_number}) was updated`,
            entry_type: 'update',
            created_by: equipment.updated_by || 'System',
            created_at: equipment.updated_at,
            equipment: {
              id: equipment.id,
              tag_number: equipment.tag_number,
              type: equipment.type,
              status: equipment.status
            },
            created_by_user: {
              full_name: equipment.updated_by_user?.full_name || 'System',
              email: equipment.updated_by_user?.email || ''
            }
          });
        }

        // Add progress entries activities
        if (equipment.progress_entries && Array.isArray(equipment.progress_entries)) {
          equipment.progress_entries.forEach((entry: any) => {
            allActivities.push({
              id: entry.id,
              activity_type: 'progress_entry',
              equipment_id: equipment.id,
              entry_text: entry.comment,
              entry_type: entry.type,
              created_by: entry.uploadedBy,
              created_at: entry.uploadDate,
              equipment: {
                id: equipment.id,
                tag_number: equipment.tag_number,
                type: equipment.type,
                status: equipment.status
              },
              created_by_user: {
                full_name: entry.uploadedBy,
                email: ''
              }
            });
          });
        }
      });
      
      // Sort by created_at descending (newest first)
      allActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      // console.log('✅ All equipment activities transformed successfully:', allActivities);
      return allActivities;
    } catch (error: any) {
      console.error('❌ Error fetching equipment activities:', error);
      return [];
    }
  },

  // Assign manager to project (Firm Admin assigns Project Manager or VDCR Manager)
  async assignManagerToProject(data: {
    user_id: string;
    project_id: string;
    role: 'project_manager' | 'vdcr_manager';
    assigned_by: string;
  }) {
    try {
      // console.log('🔧 Assigning manager to project:', data);
      
      // First, remove any existing assignment for this user+project+role combination
      await api.delete(`/project_members?user_id=eq.${data.user_id}&project_id=eq.${data.project_id}&role=eq.${data.role}`);
      
      // Get user details
      const userResponse = await api.get(`/users?id=eq.${data.user_id}&select=email,full_name`);
      const user = userResponse.data[0];
      
      if (!user) {
        throw new Error('User not found');
      }
      
      // Create new assignment in project_members
      const memberResponse = await api.post('/project_members', {
        user_id: data.user_id,
        project_id: data.project_id,
        name: user.full_name,
        email: user.email,
        role: data.role,
        access_level: data.role,
        status: 'active',
        assigned_by: data.assigned_by
      });

      // console.log('✅ Manager assigned to project successfully:', memberResponse.data);
      return memberResponse.data;
    } catch (error: any) {
      console.error('❌ Error assigning manager to project:', error);
      throw new Error(error.response?.data?.message || 'Failed to assign manager to project');
    }
  },

  // Remove manager from project
  async removeManagerFromProject(data: {
    user_id: string;
    project_id: string;
    role: 'project_manager' | 'vdcr_manager';
  }) {
    try {
      // console.log('🗑️ Removing manager from project:', data);
      
      const response = await api.delete(`/project_members?user_id=eq.${data.user_id}&project_id=eq.${data.project_id}&role=eq.${data.role}`);
      
      // console.log('✅ Manager removed from project successfully');
      return response.data;
    } catch (error: any) {
      console.error('❌ Error removing manager from project:', error);
      throw new Error(error.response?.data?.message || 'Failed to remove manager from project');
    }
  },

  // Get managers assigned to a project
  async getProjectManagers(projectId: string) {
    try {
      // console.log('👥 Fetching project managers for project:', projectId);
      
      const response = await api.get(`/project_members?project_id=eq.${projectId}&role=in.(project_manager,vdcr_manager)&select=*`);
      
      // console.log('✅ Project managers fetched successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching project managers:', error);
      return [];
    }
  },

  // =====================================================
  // VDCR RECORDS API FUNCTIONS
  // =====================================================

  // Create VDCR record
  async createVDCRRecord(vdcrData: any) {
    try {
      // console.log('📋 Creating VDCR record:', vdcrData);
      const response = await api.post('/vdcr_records', vdcrData);
      // console.log('✅ VDCR record created successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating VDCR record:', error);
      throw error;
    }
  },

  // Get VDCR records by project
  async getVDCRRecordsByProject(projectId: string) {
    try {
      // console.log('📋 Fetching VDCR records for project:', projectId);
      const response = await api.get(`/vdcr_records?project_id=eq.${projectId}&select=*,updated_by_user:updated_by(full_name,email)&order=created_at.desc`);
      // console.log('✅ VDCR records fetched successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching VDCR records:', error);
      return [];
    }
  },

  // Get VDCR records by status
  async getVDCRRecordsByStatus(projectId: string, status: string) {
    try {
      // console.log('📋 Fetching VDCR records by status:', { projectId, status });
      const response = await api.get(`/vdcr_records?project_id=eq.${projectId}&status=eq.${status}&select=*&order=created_at.desc`);
      // console.log('✅ VDCR records by status fetched successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching VDCR records by status:', error);
      return [];
    }
  },

  // Update VDCR record
  async updateVDCRRecord(vdcrId: string, updateData: any) {
    try {
      // console.log('📋 Updating VDCR record:', { vdcrId, updateData });
      const response = await api.patch(`/vdcr_records?id=eq.${vdcrId}`, updateData);
      // console.log('✅ VDCR record updated successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating VDCR record:', error);
      throw error;
    }
  },

  // Delete VDCR record
  async deleteVDCRRecord(vdcrId: string) {
    try {
      // console.log('📋 Deleting VDCR record:', vdcrId);
      const response = await api.delete(`/vdcr_records?id=eq.${vdcrId}`);
      // console.log('✅ VDCR record deleted successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error deleting VDCR record:', error);
      throw error;
    }
  },

  // =====================================================
  // VDCR DOCUMENTS API FUNCTIONS
  // =====================================================

  // Create VDCR document
  async createVDCRDocument(documentData: any) {
    try {
      // console.log('📄 Creating VDCR document:', documentData);
      const response = await api.post('/vdcr_documents', documentData);
      // console.log('✅ VDCR document created successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating VDCR document:', error);
      throw error;
    }
  },

  // Get VDCR documents by record ID
  async getVDCRDocumentsByRecord(vdcrRecordId: string) {
    try {
      // console.log('📄 Fetching VDCR documents for record:', vdcrRecordId);
      const response = await api.get(`/vdcr_documents?vdcr_record_id=eq.${vdcrRecordId}&select=*&order=created_at.desc`);
      // console.log('✅ VDCR documents fetched successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching VDCR documents:', error);
      return [];
    }
  },

  // Delete VDCR document
  async deleteVDCRDocument(documentId: string) {
    try {
      // console.log('📄 Deleting VDCR document:', documentId);
      const response = await api.delete(`/vdcr_documents?id=eq.${documentId}`);
      // console.log('✅ VDCR document deleted successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error deleting VDCR document:', error);
      throw error;
    }
  },

  // =====================================================
  // INVITES API FUNCTIONS
  // =====================================================

  // Create invitation record
  async createInvite(inviteData: {
    email: string;
    full_name?: string;
    role: string;
    firm_id: string;
    project_id?: string;
    invited_by: string;
  }) {
    try {
      // console.log('📧 Creating invite record:', inviteData);
      
      // Generate invitation token
      const invitationToken = `invite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Set expiration to 30 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      // Create a simple system user entry first
      let invitedByUserId = inviteData.invited_by;
      // console.log('🔍 Creating system user entry for foreign key constraint...');
      
      try {
        // Create a simple system user entry using REST API
        // console.log('🔍 Creating system user via REST API...');
        const systemUserResponse = await api.post('/users', {
          id: inviteData.invited_by,
          email: 'system@system.com',
          full_name: 'System User',
          role: 'super_admin',
          is_active: true,
          firm_id: null,
          project_id: null,
          assigned_by: null,
          phone: null
        });
        
        // console.log('✅ System user created via REST API:', systemUserResponse.data);
      } catch (error: any) {
        console.log('⚠️ System user creation failed (might already exist):', error.response?.data || error.message);
      }
      
      // console.log('🔍 Using provided user ID for invite:', invitedByUserId);
      
      // console.log('📤 Sending invite data to API:', {
      //   email: inviteData.email,
      //   full_name: inviteData.full_name || null,
      //   role: inviteData.role,
      //   firm_id: inviteData.firm_id,
      //   project_id: inviteData.project_id || null,
      //   invited_by: invitedByUserId,
      //   status: 'pending',
      //   invitation_token: invitationToken,
      //   expires_at: expiresAt.toISOString()
      // });
      
      const response = await api.post('/invites', {
        email: inviteData.email,
        full_name: inviteData.full_name || null,
        role: inviteData.role,
        firm_id: inviteData.firm_id,
        project_id: inviteData.project_id || null,
        invited_by: invitedByUserId,
        status: 'pending',
        invitation_token: invitationToken,
        expires_at: expiresAt.toISOString()
      });
      
      // console.log('✅ Invite created successfully!');
      // console.log('📊 Response status:', response.status);
      // console.log('📊 Response data:', response.data);
      
      // Send email notification for the invite
      try {
        // console.log('📧 Sending email notification for invite...');
        const { sendEmailNotification } = await import('./notifications');
        
        // Get company name from localStorage or use default
        const companyName = localStorage.getItem('companyName') || 'Your Company';
        const dashboardUrl = `${window.location.origin}/signup`;
        
        await sendEmailNotification({
          admin_name: inviteData.full_name || inviteData.email,
          admin_email: inviteData.email,
          company_name: companyName,
          role: inviteData.role,
          dashboard_url: dashboardUrl
        });
        
        // console.log('✅ Email notification sent for invite');
      } catch (emailError) {
        console.error('❌ Error sending email notification for invite:', emailError);
        // Don't throw error here, invite was created successfully
      }
      
      return response.data;
    } catch (error: any) {
      console.error('❌ Error creating invite:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      throw error;
    }
  },

  // Get pending invite by email
  async getInviteByEmail(email: string) {
    try {
      // console.log('🔍 Checking for pending invite:', email);
      
      const response = await api.get(`/invites?email=eq.${email}&status=eq.pending&order=created_at.desc&limit=1`);
      
      if (response.data && (response.data as any[]).length > 0) {
        const invite = response.data[0];
        
        // Check if invite has expired
        const expiresAt = new Date(invite.expires_at);
        const now = new Date();
        
        if (expiresAt < now) {
          // console.log('⚠️ Invite found but expired');
          // Update status to expired
          await this.updateInviteStatus(invite.id, 'expired');
          return null;
        }
        
        // console.log('✅ Valid pending invite found:', invite);
        return invite;
      }
      
      // console.log('ℹ️ No pending invite found for:', email);
      return null;
    } catch (error: any) {
      console.error('❌ Error fetching invite:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      // Return null instead of throwing, so signup can proceed with fallback logic
      return null;
    }
  },

  // Update invite status
  async updateInviteStatus(inviteId: string, status: 'pending' | 'accepted' | 'expired') {
    try {
      // console.log('🔄 Updating invite status:', { inviteId, status });
      
      const response = await api.patch(`/invites?id=eq.${inviteId}`, {
        status: status,
        updated_at: new Date().toISOString()
      });
      
      // console.log('✅ Invite status updated successfully');
      return response.data;
    } catch (error: any) {
      console.error('❌ Error updating invite status:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      throw error;
    }
  },

  // Get all invites for a firm (for future admin dashboard)
  async getInvitesByFirm(firmId: string) {
    try {
      // console.log('📋 Fetching invites for firm:', firmId);
      
      const response = await api.get(`/invites?firm_id=eq.${firmId}&order=created_at.desc`);
      
      // console.log('✅ Invites fetched successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching firm invites:', error);
      return [];
    }
  },

  // Test function to check if invites table exists
  async testInvitesTable() {
    try {
      // console.log('🔍 Testing if invites table exists...');
      
      const response = await api.get('/invites?limit=1');
      
      // console.log('✅ Invites table exists and is accessible');
      // console.log('📊 Test response:', response.data);
      return true;
    } catch (error: any) {
      console.error('❌ Invites table test failed:', error);
      console.error('❌ Error details:', error.response?.data || error.message);
      return false;
    }
  }
};

// =====================================================
// HIERARCHICAL ROLE MANAGEMENT FUNCTIONS
// =====================================================

// Firm Admin assigns Project Manager or VDCR Manager
export const assignProjectRole = async (data: {
  email: string;
  full_name: string;
  role: 'project_manager' | 'vdcr_manager';
  project_id: string;
  assigned_by: string; // Firm admin's user ID
}) => {
  try {
    // console.log('🔧 Assigning project role:', data);
    
    // First create user in users table
    const userResponse = await axios.post(`${SUPABASE_URL}/rest/v1/users`, {
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      project_id: data.project_id,
      assigned_by: data.assigned_by,
      is_active: true
    }, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });

    // console.log('✅ Project role assigned successfully:', userResponse.data);
    return userResponse.data;
  } catch (error: any) {
    console.error('❌ Error assigning project role:', error);
    throw new Error(error.response?.data?.message || 'Failed to assign project role');
  }
};

// Project Manager assigns Editor or Viewer
export const assignTeamRole = async (data: {
  email: string;
  full_name: string;
  role: 'editor' | 'viewer';
  project_id: string;
  assigned_by: string; // Project manager's user ID
}) => {
  try {
    // console.log('👥 Assigning team role:', data);
    
    const userResponse = await axios.post(`${SUPABASE_URL}/rest/v1/users`, {
      email: data.email,
      full_name: data.full_name,
      role: data.role,
      project_id: data.project_id,
      assigned_by: data.assigned_by,
      is_active: true
    }, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });

    // console.log('✅ Team role assigned successfully:', userResponse.data);
    return userResponse.data;
  } catch (error: any) {
    console.error('❌ Error assigning team role:', error);
    throw new Error(error.response?.data?.message || 'Failed to assign team role');
  }
};

// Get users by project
export const getUsersByProject = async (projectId: string) => {
  try {
    // console.log('🔍 Fetching users for project:', projectId);
    
    const response = await axios.get(`${SUPABASE_URL}/rest/v1/users`, {
      params: {
        project_id: `eq.${projectId}`,
        select: 'id,email,full_name,role,assigned_by,created_at'
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    // console.log('✅ Users fetched successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error fetching project users:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch project users');
  }
};

// Get users by firm (excluding project-specific users)
export const getUsersByFirm = async (firmId: string) => {
  try {
    // console.log('🏢 Fetching users for firm:', firmId);
    
    const response = await axios.get(`${SUPABASE_URL}/rest/v1/users`, {
      params: {
        firm_id: `eq.${firmId}`,
        project_id: `is.null`,
        select: 'id,email,full_name,role,assigned_by,created_at'
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    // console.log('✅ Firm users fetched successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error fetching firm users:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch firm users');
  }
};

// Update user role
export const updateUserRole = async (userId: string, newRole: string) => {
  try {
    // console.log('🔄 Updating user role:', { userId, newRole });
    
    const response = await axios.patch(`${SUPABASE_URL}/rest/v1/users`, {
      role: newRole
    }, {
      params: {
        id: `eq.${userId}`
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });

    // console.log('✅ User role updated successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error updating user role:', error);
    throw new Error(error.response?.data?.message || 'Failed to update user role');
  }
};

// Delete user
export const deleteUser = async (userId: string) => {
  try {
    // console.log('🗑️ Deleting user:', userId);
    
    const response = await axios.delete(`${SUPABASE_URL}/rest/v1/users`, {
      params: {
        id: `eq.${userId}`
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    // console.log('✅ User deleted successfully');
    return response.data;
  } catch (error: any) {
    console.error('❌ Error deleting user:', error);
    throw new Error(error.response?.data?.message || 'Failed to delete user');
  }
};

// Categorized Document upload functions
export const uploadUnpricedPODocument = async (projectId: string, documentData: any) => {
  try {
    // console.log('📄 Uploading unpriced PO document for project:', projectId);
    
    // First try to insert into separate table
    try {
      const response = await axios.post(`${SUPABASE_URL}/rest/v1/unpriced_po_documents`, {
        project_id: projectId,
        document_name: documentData.name,
        file_url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        file_size: documentData.size,
        mime_type: documentData.mimeType
      }, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      });

      // console.log('✅ Unpriced PO document uploaded to separate table successfully:', response.data);
      return response.data;
    } catch (tableError: any) {
      // console.log('⚠️ Separate table not available, using JSONB column approach');
      
      // Fallback to JSONB column approach
      const documentLink = {
        id: crypto.randomUUID(),
        name: documentData.name,
        url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        created_at: new Date().toISOString(),
        file_size: documentData.size,
        mime_type: documentData.mimeType
      };
      
      // Get current documents and append new one
      const currentResponse = await axios.get(`${SUPABASE_URL}/rest/v1/projects`, {
        params: {
          id: `eq.${projectId}`,
          select: 'unpriced_po_documents'
        },
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      
      const currentDocs = currentResponse.data[0]?.unpriced_po_documents || [];
      const updatedDocs = [...currentDocs, documentLink];
      
      const updateResponse = await axios.patch(`${SUPABASE_URL}/rest/v1/projects`, {
        unpriced_po_documents: updatedDocs
      }, {
        params: {
          id: `eq.${projectId}`
        },
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      });
      
      // console.log('✅ Unpriced PO document uploaded to JSONB column successfully:', updateResponse.data);
      return [documentLink]; // Return in same format as table approach
    }
  } catch (error: any) {
    console.error('❌ Error uploading unpriced PO document:', error);
    throw new Error(error.response?.data?.message || 'Failed to upload unpriced PO document');
  }
};

export const uploadDesignInputsDocument = async (projectId: string, documentData: any) => {
  try {
    // console.log('📄 Uploading design inputs document for project:', projectId);
    
    // First try to insert into separate table
    try {
      const response = await axios.post(`${SUPABASE_URL}/rest/v1/design_inputs_documents`, {
        project_id: projectId,
        document_name: documentData.name,
        file_url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        file_size: documentData.size,
        mime_type: documentData.mimeType
      }, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      });

      // console.log('✅ Design inputs document uploaded to separate table successfully:', response.data);
      return response.data;
    } catch (tableError: any) {
      // console.log('⚠️ Separate table not available, using JSONB column approach');
      
      // Fallback to JSONB column approach
      const documentLink = {
        id: crypto.randomUUID(),
        name: documentData.name,
        url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        created_at: new Date().toISOString(),
        file_size: documentData.size,
        mime_type: documentData.mimeType
      };
      
      // Get current documents and append new one
      const currentResponse = await axios.get(`${SUPABASE_URL}/rest/v1/projects`, {
        params: {
          id: `eq.${projectId}`,
          select: 'design_inputs_documents'
        },
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      
      const currentDocs = currentResponse.data[0]?.design_inputs_documents || [];
      const updatedDocs = [...currentDocs, documentLink];
      
      const updateResponse = await axios.patch(`${SUPABASE_URL}/rest/v1/projects`, {
        design_inputs_documents: updatedDocs
      }, {
        params: {
          id: `eq.${projectId}`
        },
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      });
      
      // console.log('✅ Design inputs document uploaded to JSONB column successfully:', updateResponse.data);
      return [documentLink]; // Return in same format as table approach
    }
  } catch (error: any) {
    console.error('❌ Error uploading design inputs document:', error);
    throw new Error(error.response?.data?.message || 'Failed to upload design inputs document');
  }
};

export const uploadClientReferenceDocument = async (projectId: string, documentData: any) => {
  try {
    // console.log('📄 Uploading client reference document for project:', projectId);
    
    // First try to insert into separate table
    try {
      const response = await axios.post(`${SUPABASE_URL}/rest/v1/client_reference_documents`, {
        project_id: projectId,
        document_name: documentData.name,
        file_url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        file_size: documentData.size,
        mime_type: documentData.mimeType
      }, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      });

      // console.log('✅ Client reference document uploaded to separate table successfully:', response.data);
      return response.data;
    } catch (tableError: any) {
      console.log('⚠️ Separate table not available, using JSONB column approach');
      
      // Fallback to JSONB column approach
      const documentLink = {
        id: crypto.randomUUID(),
        name: documentData.name,
        url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        created_at: new Date().toISOString(),
        file_size: documentData.size,
        mime_type: documentData.mimeType
      };
      
      // Get current documents and append new one
      const currentResponse = await axios.get(`${SUPABASE_URL}/rest/v1/projects`, {
        params: {
          id: `eq.${projectId}`,
          select: 'client_reference_documents'
        },
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      
      const currentDocs = currentResponse.data[0]?.client_reference_documents || [];
      const updatedDocs = [...currentDocs, documentLink];
      
      const updateResponse = await axios.patch(`${SUPABASE_URL}/rest/v1/projects`, {
        client_reference_documents: updatedDocs
      }, {
        params: {
          id: `eq.${projectId}`
        },
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      });
      
      // console.log('✅ Client reference document uploaded to JSONB column successfully:', updateResponse.data);
      return [documentLink]; // Return in same format as table approach
    }
  } catch (error: any) {
    console.error('❌ Error uploading client reference document:', error);
    throw new Error(error.response?.data?.message || 'Failed to upload client reference document');
  }
};

export const uploadOtherDocument = async (projectId: string, documentData: any) => {
  try {
    // console.log('📄 Uploading other document for project:', projectId);
    
    // First try to insert into separate table
    try {
      const response = await axios.post(`${SUPABASE_URL}/rest/v1/other_documents`, {
        project_id: projectId,
        document_name: documentData.name,
        file_url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        file_size: documentData.size,
        mime_type: documentData.mimeType
      }, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      });

      // console.log('✅ Other document uploaded to separate table successfully:', response.data);
      return response.data;
    } catch (tableError: any) {
      // console.log('⚠️ Separate table not available, using JSONB column approach');
      
      // Fallback to JSONB column approach
      const documentLink = {
        id: crypto.randomUUID(),
        name: documentData.name,
        url: documentData.url,
        uploaded_by: documentData.uploadedBy,
        created_at: new Date().toISOString(),
        file_size: documentData.size,
        mime_type: documentData.mimeType
      };
      
      // Get current documents and append new one
      const currentResponse = await axios.get(`${SUPABASE_URL}/rest/v1/projects`, {
        params: {
          id: `eq.${projectId}`,
          select: 'other_documents'
        },
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });
      
      const currentDocs = currentResponse.data[0]?.other_documents || [];
      const updatedDocs = [...currentDocs, documentLink];
      
      const updateResponse = await axios.patch(`${SUPABASE_URL}/rest/v1/projects`, {
        other_documents: updatedDocs
      }, {
        params: {
          id: `eq.${projectId}`
        },
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      });
      
      // console.log('✅ Other document uploaded to JSONB column successfully:', updateResponse.data);
      return [documentLink]; // Return in same format as table approach
    }
  } catch (error: any) {
    console.error('❌ Error uploading other document:', error);
    throw new Error(error.response?.data?.message || 'Failed to upload other document');
  }
};

export const uploadEquipmentDocument = async (equipmentId: string, documentData: any) => {
  try {
    // console.log('📄 Uploading equipment document for equipment:', equipmentId);
    // console.log('📄 Document data:', documentData);
    
    const requestData = {
      equipment_id: equipmentId,
      document_name: documentData.name,
      document_url: documentData.url,
      document_type: documentData.equipmentType,
      file_size: documentData.size,
      uploaded_by: documentData.uploadedBy || null
    };
    
    // console.log('📄 Request data for equipment_documents table:', requestData);
    // console.log('📄 Request data types:', {
    //   equipment_id: typeof requestData.equipment_id,
    //   document_name: typeof requestData.document_name,
    //   document_url: typeof requestData.document_url,
    //   document_type: typeof requestData.document_type,
    //   file_size: typeof requestData.file_size,
    //   uploaded_by: typeof requestData.uploaded_by
    // });
    
    // Insert into equipment_documents table
    const response = await axios.post(`${SUPABASE_URL}/rest/v1/equipment_documents`, requestData, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });

    // console.log('✅ Equipment document uploaded successfully:', response.data);
    // console.log('✅ Response status:', response.status);
    // console.log('✅ Full response:', response);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error uploading equipment document:', error);
    console.error('❌ Error response:', error.response?.data);
    console.error('❌ Error status:', error.response?.status);
    console.error('❌ Full error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText,
      config: error.config
    });
    throw new Error(error.response?.data?.message || 'Failed to upload equipment document');
  }
};

// Get equipment documents for an equipment
export const getEquipmentDocuments = async (equipmentId: string) => {
  try {
    // console.log('📄 Fetching documents for equipment:', equipmentId);
    
    const response = await axios.get(`${SUPABASE_URL}/rest/v1/equipment_documents`, {
      params: {
        equipment_id: `eq.${equipmentId}`,
        select: '*',
        order: 'created_at.desc'
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    // console.log('📄 Equipment documents fetched:', response.data);
    // console.log('📄 Response status:', response.status);
    // console.log('📄 Number of documents found:', Array.isArray(response.data) ? response.data.length : 0);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error fetching equipment documents:', error);
    console.error('❌ Error response:', error.response?.data);
    console.error('❌ Error status:', error.response?.status);
    return [];
  }
};

// Delete equipment document
export const deleteEquipmentDocument = async (documentId: string) => {
  try {
    // console.log('🗑️ Deleting equipment document:', documentId);
    
    const response = await axios.delete(`${SUPABASE_URL}/rest/v1/equipment_documents`, {
      params: {
        id: `eq.${documentId}`
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    // console.log('✅ Equipment document deleted successfully');
    return response.data;
  } catch (error: any) {
    console.error('❌ Error deleting equipment document:', error);
    throw new Error(error.response?.data?.message || 'Failed to delete equipment document');
  }
};

// Get documents for a project
export const getProjectDocuments = async (projectId: string) => {
  try {
    // console.log('📄 Fetching documents for project:', projectId);
    
    const response = await axios.get(`${SUPABASE_URL}/rest/v1/project_documents`, {
      params: {
        project_id: `eq.${projectId}`,
        select: '*',
        order: 'created_at.desc'
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    // console.log('✅ Documents fetched successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error fetching project documents:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch project documents');
  }
};

// Delete document
export const deleteDocument = async (documentId: string) => {
  try {
    // console.log('🗑️ Deleting document:', documentId);
    
    const response = await axios.delete(`${SUPABASE_URL}/rest/v1/project_documents`, {
      params: {
        id: `eq.${documentId}`
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    // console.log('✅ Document deleted successfully');
    return response.data;
  } catch (error: any) {
    console.error('❌ Error deleting document:', error);
    throw new Error(error.response?.data?.message || 'Failed to delete document');
  }
};

// Get document by ID
export const getDocumentById = async (documentId: string) => {
  try {
    // console.log('📄 Fetching document by ID:', documentId);
    
    const response = await axios.get(`${SUPABASE_URL}/rest/v1/project_documents`, {
      params: {
        id: `eq.${documentId}`,
        select: '*'
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    // console.log('✅ Document fetched successfully:', response.data);
    return response.data[0]; // Return first (and only) document
  } catch (error: any) {
    console.error('❌ Error fetching document:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch document');
  }
};

// Update project document links
export const updateProjectDocumentLinks = async (projectId: string, documentType: string, documentLinks: any[]) => {
  try {
    // console.log('🔄 Updating project document links:', { projectId, documentType, documentLinks });
    
    const updateData: any = {};
    updateData[documentType] = documentLinks;
    
    const response = await axios.patch(`${SUPABASE_URL}/rest/v1/projects`, updateData, {
      params: {
        id: `eq.${projectId}`
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    });

    // console.log('✅ Project document links updated successfully:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ Error updating project document links:', error);
    throw new Error(error.response?.data?.message || 'Failed to update project document links');
  }
};

// Get project document links
export const getProjectDocumentLinks = async (projectId: string) => {
  try {
    // console.log('📄 Fetching project document links for project:', projectId);
    
    const response = await axios.get(`${SUPABASE_URL}/rest/v1/projects`, {
      params: {
        id: `eq.${projectId}`,
        select: 'unpriced_po_documents,design_inputs_documents,client_reference_documents,other_documents'
      },
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    // console.log('✅ Project document links fetched successfully:', response.data);
    return response.data[0]; // Return first (and only) project
  } catch (error: any) {
    console.error('❌ Error fetching project document links:', error);
    throw new Error(error.response?.data?.message || 'Failed to fetch project document links');
  }
};

// Check if equipment_documents table exists
export const checkEquipmentDocumentsTable = async () => {
  try {
    // console.log('🔍 CHECKING: Checking equipment_documents table...');
    const response = await api.get('/equipment_documents?limit=1');
    // console.log('✅ CHECKING: Table exists and accessible:', response.data);
    return true;
  } catch (error: any) {
    console.error('❌ CHECKING: Table check failed:', error);
    console.error('❌ CHECKING: Error details:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    return false;
  }
};

// Create document entry in database
export const createDocument = async (documentData: {
  equipment_id: string;
  document_name: string;
  document_url: string;
  document_type: string;
  file_size: number;
  uploaded_by: string;
}) => {
  try {
    // console.log('📄 PERFECT: Creating document entry in database:', documentData);
    // console.log('📄 PERFECT: Document data:', {
    //   equipment_id: documentData.equipment_id,
    //   document_name: documentData.document_name,
    //   document_url: documentData.document_url,
    //   document_type: documentData.document_type,
    //   file_size: documentData.file_size,
    //   uploaded_by: documentData.uploaded_by,
    //   upload_date: new Date().toISOString()
    // });
    
    const dbStart = Date.now();
    const response = await api.post('/equipment_documents', {
      equipment_id: documentData.equipment_id,
      document_name: documentData.document_name,
      document_url: documentData.document_url,
      document_type: documentData.document_type,
      file_size: documentData.file_size,
      uploaded_by: documentData.uploaded_by,
      upload_date: new Date().toISOString()
    }, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      }
    });
    
    const dbTime = Date.now() - dbStart;
    // console.log('📄 PERFECT: Database insert completed in', dbTime, 'ms');
    // console.log('✅ PERFECT: Document created in database:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('❌ PERFECT: Error creating document:', error);
    console.error('❌ PERFECT: Error details:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    console.error('❌ PERFECT: Full error response:', error.response);
    console.error('❌ PERFECT: Error config:', error.config);
    throw error;
  }
};

export default api;



