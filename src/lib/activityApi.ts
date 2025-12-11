import axios from "axios";

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

// Activity logging API functions
export const activityApi = {
  // Log equipment activity
  async logEquipmentActivity(data: {
    projectId: string | null; // Nullable to support standalone equipment
    equipmentId?: string;
    activityType: string;
    actionDescription: string;
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    metadata?: any;
    createdBy: string;
  }) {
    try {
      // console.log('📝 Logging equipment activity:', data);
      
      const logData = {
        project_id: data.projectId,
        equipment_id: data.equipmentId || null,
        activity_type: data.activityType,
        action_description: data.actionDescription,
        field_name: data.fieldName || null,
        old_value: data.oldValue || null,
        new_value: data.newValue || null,
        metadata: data.metadata || {},
        created_by: data.createdBy
      };

      const response = await api.post('/equipment_activity_logs', logData);
      // console.log('✅ Activity logged successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error logging activity:', error);
      // Don't throw error to prevent breaking the main action
      return null;
    }
  },

  // Get equipment activity logs by project
  async getEquipmentActivityLogs(projectId: string, filters?: {
    equipmentId?: string;
    activityType?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }) {
    try {
      // console.log('📋 Fetching equipment activity logs for project:', projectId);
      
      let query = `/equipment_activity_logs?project_id=eq.${projectId}`;
      
      // Add filters
      if (filters?.equipmentId) {
        query += `&equipment_id=eq.${filters.equipmentId}`;
      }
      if (filters?.activityType) {
        query += `&activity_type=eq.${filters.activityType}`;
      }
      if (filters?.userId) {
        query += `&created_by=eq.${filters.userId}`;
      }
      if (filters?.dateFrom) {
        query += `&created_at=gte.${filters.dateFrom}`;
      }
      if (filters?.dateTo) {
        query += `&created_at=lte.${filters.dateTo}`;
      }
      
      // Add ordering and pagination
      query += `&order=created_at.desc`;
      if (filters?.limit) {
        query += `&limit=${filters.limit}`;
      }
      if (filters?.offset) {
        query += `&offset=${filters.offset}`;
      }
      
      // Add user information
      query += `&select=*,created_by_user:created_by(full_name,email)`;
      
      const response = await api.get(query);
      // console.log('✅ Activity logs fetched successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching activity logs:', error);
      throw error;
    }
  },

  // Get activity logs for specific equipment
  async getEquipmentActivityLogsByEquipment(equipmentId: string, filters?: {
    activityType?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }) {
    try {
      // console.log('📋 Fetching activity logs for equipment:', equipmentId);
      
      let query = `/equipment_activity_logs?equipment_id=eq.${equipmentId}`;
      
      // Add filters
      if (filters?.activityType) {
        query += `&activity_type=eq.${filters.activityType}`;
      }
      if (filters?.userId) {
        query += `&created_by=eq.${filters.userId}`;
      }
      if (filters?.dateFrom) {
        query += `&created_at=gte.${filters.dateFrom}`;
      }
      if (filters?.dateTo) {
        query += `&created_at=lte.${filters.dateTo}`;
      }
      
      // Add ordering and pagination
      query += `&order=created_at.desc`;
      if (filters?.limit) {
        query += `&limit=${filters.limit}`;
      }
      if (filters?.offset) {
        query += `&offset=${filters.offset}`;
      }
      
      // Add user information
      query += `&select=*,created_by_user:created_by(full_name,email)`;
      
      const response = await api.get(query);
      // console.log('✅ Equipment activity logs fetched successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching equipment activity logs:', error);
      throw error;
    }
  },

  // Get activity statistics
  async getActivityStatistics(projectId: string, dateFrom?: string, dateTo?: string) {
    try {
      // console.log('📊 Fetching activity statistics for project:', projectId);
      
      let query = `/equipment_activity_logs?project_id=eq.${projectId}`;
      
      if (dateFrom) {
        query += `&created_at=gte.${dateFrom}`;
      }
      if (dateTo) {
        query += `&created_at=lte.${dateTo}`;
      }
      
      query += `&select=activity_type,created_at,created_by`;
      
      const response = await api.get(query);
      const logs = Array.isArray(response.data) ? response.data : [];
      
      // Calculate statistics
      const stats = {
        totalActivities: logs.length,
        activitiesByType: logs.reduce((acc: any, log: any) => {
          acc[log.activity_type] = (acc[log.activity_type] || 0) + 1;
          return acc;
        }, {}),
        activitiesByUser: logs.reduce((acc: any, log: any) => {
          const userId = log.created_by;
          acc[userId] = (acc[userId] || 0) + 1;
          return acc;
        }, {}),
        recentActivities: logs.slice(0, 10)
      };
      
      // console.log('✅ Activity statistics calculated:', stats);
      return stats;
    } catch (error) {
      console.error('❌ Error fetching activity statistics:', error);
      throw error;
    }
  },

  // ============================================================================
  // STANDALONE EQUIPMENT ACTIVITY LOGS
  // ============================================================================

  // Log standalone equipment activity (separate table)
  async logStandaloneEquipmentActivity(data: {
    equipmentId: string;
    activityType: string;
    actionDescription: string;
    fieldName?: string;
    oldValue?: string;
    newValue?: string;
    metadata?: any;
    createdBy: string;
  }) {
    try {
      // console.log('📝 Logging standalone equipment activity:', data);
      
      const logData = {
        equipment_id: data.equipmentId,
        activity_type: data.activityType,
        action_description: data.actionDescription,
        field_name: data.fieldName || null,
        old_value: data.oldValue || null,
        new_value: data.newValue || null,
        metadata: data.metadata || {},
        created_by: data.createdBy
      };

      const response = await api.post('/standalone_equipment_activity_logs', logData);
      // console.log('✅ Standalone equipment activity logged successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error logging standalone equipment activity:', error);
      // Don't throw error to prevent breaking the main action
      return null;
    }
  },

  // Get activity logs for specific standalone equipment
  async getStandaloneEquipmentActivityLogsByEquipment(equipmentId: string, filters?: {
    activityType?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }) {
    try {
      // console.log('📋 Fetching activity logs for standalone equipment:', equipmentId);
      
      let query = `/standalone_equipment_activity_logs?equipment_id=eq.${equipmentId}`;
      
      // Add filters
      if (filters?.activityType) {
        query += `&activity_type=eq.${filters.activityType}`;
      }
      if (filters?.userId) {
        query += `&created_by=eq.${filters.userId}`;
      }
      if (filters?.dateFrom) {
        query += `&created_at=gte.${filters.dateFrom}`;
      }
      if (filters?.dateTo) {
        query += `&created_at=lte.${filters.dateTo}`;
      }
      
      // Add ordering and pagination
      query += `&order=created_at.desc`;
      if (filters?.limit) {
        query += `&limit=${filters.limit}`;
      }
      if (filters?.offset) {
        query += `&offset=${filters.offset}`;
      }
      
      // Add user information
      query += `&select=*,created_by_user:created_by(full_name,email)`;
      
      const response = await api.get(query);
      // console.log('✅ Standalone equipment activity logs fetched successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Error fetching standalone equipment activity logs:', error);
      throw error;
    }
  }
};

export default activityApi;
