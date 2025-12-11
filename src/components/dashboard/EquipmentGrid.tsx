import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Calendar, User, MapPin, ChevronLeft, ChevronRight, FileText, Users, Settings, TrendingUp, AlertTriangle, ClipboardCheck, Shield, Plus, Edit, Check, X, Camera, Upload, Clock, Building, Trash2, Mic, MicOff, Play, Pause, ChevronDown, Search, ArrowLeft, Target, Wrench, BarChart3, Download, ArrowRight, Image, UserPlus, FileCheck } from "lucide-react";
import AddEquipmentForm from "@/components/forms/AddEquipmentForm";
import AddStandaloneEquipmentFormNew from "@/components/forms/AddStandaloneEquipmentFormNew";
import AddTechnicalSectionModal from "@/components/forms/AddTechnicalSectionModal";
import { fastAPI, getEquipmentDocuments, deleteEquipmentDocument, uploadEquipmentDocument, uploadStandaloneEquipmentDocument, getStandaloneEquipmentDocuments, deleteStandaloneEquipmentDocument } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { updateEquipment } from "@/lib/database";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { logProgressEntryAdded, logProgressEntryUpdated, logProgressEntryDeleted, logDocumentUploaded, logDocumentDeleted, logProgressImageUploaded, logTeamMemberAdded } from "@/lib/activityLogger";
import { sendProjectTeamEmailNotification, getDashboardUrl } from "@/lib/notifications";
import { Equipment, ProgressEntry } from "@/types/equipment";
import { transformEquipmentData } from "@/utils/equipmentTransform";
import axios from "axios";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Performance optimization: Only log in development mode
const isDev = import.meta.env.DEV;
const devLog = (...args: any[]) => {
  if (isDev) console.log(...args);
};
const devError = (...args: any[]) => {
  if (isDev) console.error(...args);
};
const devWarn = (...args: any[]) => {
  if (isDev) console.warn(...args);
};

interface EquipmentGridProps {
  equipment: Equipment[];
  projectName: string;
  projectId: string;
  onBack?: () => void;
  onViewDetails?: () => void;
  onViewVDCR?: () => void;
  onUserAdded?: () => void; // Callback to refresh Settings tab
  onActivityUpdate?: () => void; // Callback to refresh Activity Logs
  onViewingDetailsChange?: (isViewing: boolean) => void; // Callback to notify parent when viewing details
}

const EquipmentGrid = ({ equipment, projectName, projectId, onBack, onViewDetails, onViewVDCR, onUserAdded, onActivityUpdate, onViewingDetailsChange }: EquipmentGridProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [imageIndices, setImageIndices] = useState<Record<string, number>>({});
  const [showAddEquipmentForm, setShowAddEquipmentForm] = useState(false);
  const [showMiniForm, setShowMiniForm] = useState(false);
  const [miniFormData, setMiniFormData] = useState({
    equipmentName: '',
    customEquipmentName: '',
    tagNumber: '',
    jobNumber: '',
    msnNumber: '',
    size: '',
    material: '',
    designCode: ''
  });
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<Equipment>>({});
  const [showImagePreview, setShowImagePreview] = useState<{ url: string, equipmentId: string, currentIndex: number } | null>(null);
  const [currentProgressImageIndex, setCurrentProgressImageIndex] = useState<Record<string, number>>({});
  const [newProgressImage, setNewProgressImage] = useState<File | null>(null);
  const [imageDescription, setImageDescription] = useState('');
  const [selectedPhase, setSelectedPhase] = useState<'all' | 'documentation' | 'manufacturing' | 'testing' | 'dispatched'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Pagination state for equipment cards
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 8;
  const [progressEntries, setProgressEntries] = useState<Record<string, Array<{ id: string, text: string, date: string, type: string }>>>({});
  const [projectMembers, setProjectMembers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserData, setNewUserData] = useState({ name: '', email: '' });
  const [currentProject, setCurrentProject] = useState<any>(null);
  const [newProgressEntry, setNewProgressEntry] = useState('');
  const [newProgressType, setNewProgressType] = useState('general');
  // New progress entry state
  const [editingProgressEntryId, setEditingProgressEntryId] = useState<string | null>(null);
  const [showProgressImageModal, setShowProgressImageModal] = useState<{ url: string, description?: string, uploadedBy?: string, uploadDate?: string } | null>(null);
  const [addingProgressEntryForEquipment, setAddingProgressEntryForEquipment] = useState<string | null>(null);
  const [editingProgressEntryForEquipment, setEditingProgressEntryForEquipment] = useState<string | null>(null);
  
  // Custom progress type state
  const [isAddingCustomProgressType, setIsAddingCustomProgressType] = useState(false);
  const [customProgressTypeName, setCustomProgressTypeName] = useState('');
  const [customProgressTypes, setCustomProgressTypes] = useState<string[]>([]);

  // Equipment details view state
  const [viewingEquipmentId, setViewingEquipmentId] = useState<string | null>(null);
  
  // Tab state for equipment details view
  const [equipmentDetailsTab, setEquipmentDetailsTab] = useState("equipment-details");

  // Equipment Logs and Settings states (for standalone equipment details view)
  const [equipmentSearchQuery, setEquipmentSearchQuery] = useState("");
  const [equipmentProgressEntries, setEquipmentProgressEntries] = useState<any[]>([]);
  const [isLoadingEquipmentLogs, setIsLoadingEquipmentLogs] = useState(false);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  // Store team members for all equipment (for equipment card team tab)
  const [allEquipmentTeamMembers, setAllEquipmentTeamMembers] = useState<Record<string, any[]>>({});
  const [showAddMember, setShowAddMember] = useState(false);
  const [showEditMember, setShowEditMember] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [newMember, setNewMember] = useState({
    name: "",
    email: "",
    phone: "",
    position: "",
    role: "",
    permissions: [] as string[],
    equipmentAssignments: [] as string[],
    dataAccess: [] as string[],
    accessLevel: "viewer"
  });
  const [existingFirmMembers, setExistingFirmMembers] = useState<any[]>([]);
  const [isLoadingExistingMembers, setIsLoadingExistingMembers] = useState(false);
  const [selectedExistingMemberEmail, setSelectedExistingMemberEmail] = useState<string>("");
  const [isExistingMemberMode, setIsExistingMemberMode] = useState(false);

  // Load equipment activity logs for the viewing equipment
  const loadEquipmentActivityLogs = useCallback(async () => {
    if (!viewingEquipmentId || projectId !== 'standalone') return;
    
    try {
      setIsLoadingEquipmentLogs(true);
      const { activityApi } = await import('@/lib/activityApi');
      // Use standalone equipment activity logs API
      const entries = await activityApi.getStandaloneEquipmentActivityLogsByEquipment(viewingEquipmentId);
      setEquipmentProgressEntries(entries as any[]);
    } catch (error) {
      devError('Error loading standalone equipment activity logs:', error);
      setEquipmentProgressEntries([]);
    } finally {
      setIsLoadingEquipmentLogs(false);
    }
  }, [viewingEquipmentId, projectId]);

  // Fetch team members for the viewing equipment
  const fetchEquipmentTeamMembers = useCallback(async () => {
    if (!viewingEquipmentId || projectId !== 'standalone') {
      devLog('⏭️ Skipping fetchEquipmentTeamMembers:', { viewingEquipmentId, projectId });
      return;
    }
    
    // OPTIMIZATION: Check cache first - use cached data immediately if available
    const hasCachedData = allEquipmentTeamMembers[viewingEquipmentId] && allEquipmentTeamMembers[viewingEquipmentId].length > 0;
    if (hasCachedData) {
      devLog('⚡ Using cached team members for equipment:', viewingEquipmentId);
      setTeamMembers(allEquipmentTeamMembers[viewingEquipmentId]);
      setTeamMembersLoading(false);
      // Still fetch in background to ensure data is fresh, but don't show loading
    } else {
      setTeamMembersLoading(true);
    }
    
    try {
      devLog('🔄 Fetching team members for equipment:', viewingEquipmentId);
      // For standalone equipment, get team members from standalone_equipment_team_positions table
      const { DatabaseService } = await import('@/lib/database');
      const teamData = await DatabaseService.getStandaloneTeamPositions(viewingEquipmentId);
      devLog('📥 Raw team data received:', teamData);
      
      const transformedMembers = (teamData as any[]).map((member, index) => ({
        id: member.id || `member-${index}`,
        name: member.person_name || 'Unknown',
        email: member.email || '',
        phone: member.phone || '',
        position: member.position_name || '',
        role: member.role || 'viewer',
        permissions: getPermissionsByRole(member.role || 'viewer'),
        status: 'active',
        avatar: (member.person_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
        lastActive: 'Unknown',
        equipmentAssignments: [viewingEquipmentId],
        dataAccess: getDataAccessByRole(member.role || 'viewer'),
        accessLevel: member.role || 'viewer'
      }));
      
      devLog('✅ Transformed team members:', transformedMembers);
      setTeamMembers(transformedMembers);
      // Also update allEquipmentTeamMembers state for this equipment (for equipment card team tab)
      if (viewingEquipmentId) {
        setAllEquipmentTeamMembers(prev => ({
          ...prev,
          [viewingEquipmentId]: transformedMembers
        }));
      }
      devLog('✅ Team members state updated, count:', transformedMembers.length);
    } catch (error) {
      devError('❌ Error fetching equipment team members:', error);
      // If we have cached data, use it instead of showing empty
      if (hasCachedData) {
        devLog('⚡ Using cached team members due to fetch error');
        setTeamMembers(allEquipmentTeamMembers[viewingEquipmentId]);
      } else {
      setTeamMembers([]);
      }
    } finally {
      setTeamMembersLoading(false);
    }
  }, [viewingEquipmentId, projectId, allEquipmentTeamMembers]);

  // Helper function for permissions
  const getPermissionsByRole = (role: string) => {
    const rolePermissions: Record<string, string[]> = {
      'firm_admin': ['view', 'edit', 'delete', 'manage_team', 'approve_vdcr', 'manage_equipment'],
      'project_manager': ['view', 'edit', 'delete', 'manage_team', 'approve_vdcr', 'manage_equipment'],
      'vdcr_manager': ['view', 'edit', 'approve_vdcr', 'manage_vdcr'],
      'design_engineer': ['view', 'edit', 'manage_equipment'],
      'quality_inspector': ['view', 'comment'],
      'welder': ['view'],
      'editor': ['view', 'edit', 'manage_equipment'],
      'viewer': ['view']
    };
    return rolePermissions[role] || ['view'];
  };

  // Helper function for data access by role
  const getDataAccessByRole = (role: string) => {
    const roleAccess: Record<string, string[]> = {
      'firm_admin': ['Full Company Access', 'Can Edit All Data', 'Manage All Projects'],
      'project_manager': ['Full Equipment Access', 'Can Manage All Equipment', 'Can Approve VDCR', 'Can Manage Team Members', 'Access to All Tabs'],
      'vdcr_manager': ['VDCR Management Access', 'Can Approve VDCR', 'Can View All Equipment', 'Access to VDCR & Equipment Tabs', 'No Access to Settings'],
      'design_engineer': ['Assigned Equipment Only', 'Can Add Progress Images', 'Can Add Progress Entries', 'Access to VDCR & Other Tabs', 'No Access to Settings & Project Details'],
      'quality_inspector': ['Assigned Equipment Only', 'Read-Only Access', 'Cannot Edit Data', 'Access to VDCR & Other Tabs', 'No Access to Settings & Project Details'],
      'welder': ['Assigned Equipment Only', 'Read-Only Access', 'Cannot Edit Data'],
      'editor': ['Assigned Equipment Only', 'Can Add Progress Images', 'Can Add Progress Entries', 'Access to VDCR & Other Tabs', 'No Access to Settings'],
      'viewer': ['Read-Only Access', 'Can View Assigned Equipment', 'Can View Progress & VDCR', 'No Edit Permissions', 'No Access to Settings']
    };
    return roleAccess[role] || ['Read-Only Access'];
  };

  // Fetch existing firm members for dropdown
  const fetchExistingFirmMembers = useCallback(async () => {
    try {
      setIsLoadingExistingMembers(true);
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const firmId = userData.firm_id;
      
      if (!firmId) {
        setExistingFirmMembers([]);
        return;
      }

      const members = await fastAPI.getAllFirmTeamMembers(firmId);
      setExistingFirmMembers(members || []);
    } catch (error) {
      devError('Error fetching existing firm members:', error);
      setExistingFirmMembers([]);
    } finally {
      setIsLoadingExistingMembers(false);
    }
  }, []);

  // Helper functions
  const mapRoleToDisplay = (dbRole: string): string => {
    const roleMap: Record<string, string> = {
      'project_manager': 'Project Manager',
      'vdcr_manager': 'VDCR Manager',
      'editor': 'Editor',
      'viewer': 'Viewer'
    };
    return roleMap[dbRole] || dbRole;
  };

  const getRoleColor = (role: string) => {
    const roleColors: Record<string, string> = {
      'project_manager': 'bg-purple-100 text-purple-800',
      'vdcr_manager': 'bg-teal-100 text-teal-800',
      'editor': 'bg-blue-100 text-blue-800',
      'viewer': 'bg-gray-100 text-gray-800',
      'design_engineer': 'bg-purple-100 text-purple-800',
      'quality_engineer': 'bg-green-100 text-green-800',
      'client_representative': 'bg-orange-100 text-orange-800',
      'firm_admin': 'bg-red-100 text-red-800'
    };
    return roleColors[role] || 'bg-gray-100 text-gray-800';
  };

  const getPermissionLabel = (permission: string) => {
    const labels: Record<string, string> = {
      view: "View",
      edit: "Edit",
      delete: "Delete",
      manage_team: "Manage Team",
      approve_vdcr: "Approve VDCR",
      manage_equipment: "Manage Equipment",
      comment: "Comment"
    };
    return labels[permission] || permission;
  };

  // Load logs and team members when viewing equipment details
  useEffect(() => {
    if (viewingEquipmentId && projectId === 'standalone') {
      loadEquipmentActivityLogs();
      fetchEquipmentTeamMembers();
    }
  }, [viewingEquipmentId, projectId, loadEquipmentActivityLogs, fetchEquipmentTeamMembers]);

  // Fetch existing firm members when add member modal opens
  useEffect(() => {
    if (showAddMember) {
      fetchExistingFirmMembers();
    }
  }, [showAddMember, fetchExistingFirmMembers]);

  const [roles] = useState([
    {
      name: "project_manager",
      displayName: "Project Manager",
      permissions: ["view", "edit", "delete", "manage_team", "approve_vdcr", "manage_equipment"],
      color: "bg-purple-100 text-purple-800"
    },
    {
      name: "vdcr_manager",
      displayName: "VDCR Manager",
      permissions: ["view", "edit", "approve_vdcr", "manage_vdcr"],
      color: "bg-teal-100 text-teal-800"
    },
    {
      name: "editor",
      displayName: "Editor",
      permissions: ["view", "edit", "manage_equipment"],
      color: "bg-blue-100 text-blue-800"
    },
    {
      name: "viewer",
      displayName: "Viewer",
      permissions: ["view"],
      color: "bg-gray-100 text-gray-800"
    }
  ]);

  // Load equipment activity logs for the viewing equipment
  const loadEquipmentProgressEntries = useCallback(async () => {
    if (!viewingEquipmentId || projectId !== 'standalone') return;
    try {
      setIsLoadingEquipmentLogs(true);
      const { activityApi } = await import('@/lib/activityApi');
      // Use standalone equipment activity logs API
      const entries = await activityApi.getStandaloneEquipmentActivityLogsByEquipment(viewingEquipmentId);
      setEquipmentProgressEntries(entries as any[]);
    } catch (error) {
      console.error('Error loading standalone equipment activity logs:', error);
    } finally {
      setIsLoadingEquipmentLogs(false);
    }
  }, [viewingEquipmentId, projectId]);


  // Notify parent when viewing details changes
  useEffect(() => {
    if (onViewingDetailsChange) {
      const isViewing = viewingEquipmentId !== null && projectId === 'standalone';
      onViewingDetailsChange(isViewing);
    }
  }, [viewingEquipmentId, projectId, onViewingDetailsChange]);

  // Load equipment logs when viewing equipment details - OPTIMIZED: Team members already fetched above
  useEffect(() => {
    if (viewingEquipmentId && projectId === 'standalone') {
      if (equipmentDetailsTab === 'equipment-logs') {
        loadEquipmentProgressEntries();
      }
      // Team members are now fetched immediately when viewingEquipmentId changes (see useEffect above)
      // No need to fetch again here - just refresh if needed
      if (equipmentDetailsTab === 'settings' || equipmentDetailsTab === 'team') {
        // Only refresh if we don't have cached data
        if (!allEquipmentTeamMembers[viewingEquipmentId] || allEquipmentTeamMembers[viewingEquipmentId].length === 0) {
          fetchEquipmentTeamMembers();
        }
      }
    }
  }, [viewingEquipmentId, projectId, equipmentDetailsTab, loadEquipmentProgressEntries, fetchEquipmentTeamMembers, allEquipmentTeamMembers]);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingTimer, setRecordingTimer] = useState<NodeJS.Timeout | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  // Image audio recording state
  const [isImageRecording, setIsImageRecording] = useState(false);

  // Custom fields state
  const [customFields, setCustomFields] = useState<Record<string, Array<{ name: string, value: string }>>>({});
  const [newFieldName, setNewFieldName] = useState('');
  
  // Overview tab state
  const [overviewLastUpdateRaw, setOverviewLastUpdateRaw] = useState<Record<string, string>>({});
  const [overviewNextMilestoneDate, setOverviewNextMilestoneDate] = useState<Record<string, string>>({});
  const [newFieldValue, setNewFieldValue] = useState('');
  const [showAddFieldInputs, setShowAddFieldInputs] = useState<Record<string, boolean>>({});
  const [isEditMode, setIsEditMode] = useState<Record<string, boolean>>({});

  // Team custom fields state
  const [teamCustomFields, setTeamCustomFields] = useState<Record<string, Array<{ name: string, value: string }>>>({});
  const [newTeamFieldName, setNewTeamFieldName] = useState('');
  const [newTeamFieldValue, setNewTeamFieldValue] = useState('');
  const [showAddTeamFieldInputs, setShowAddTeamFieldInputs] = useState<Record<string, boolean>>({});
  const [isEditTeamMode, setIsEditTeamMode] = useState<Record<string, boolean>>({});
  const [imageMediaRecorder, setImageMediaRecorder] = useState<MediaRecorder | null>(null);
  const [imageAudioChunks, setImageAudioChunks] = useState<Blob[]>([]);
  const [imageRecordingDuration, setImageRecordingDuration] = useState(0);
  const [imageRecordingTimer, setImageRecordingTimer] = useState<NodeJS.Timeout | null>(null);

  // Custom fields state
  const [newCustomFieldName, setNewCustomFieldName] = useState('');
  const [newCustomFieldValue, setNewCustomFieldValue] = useState('');
  const [editingCustomFieldId, setEditingCustomFieldId] = useState<string | null>(null);
  const [showAddCustomFieldForm, setShowAddCustomFieldForm] = useState<Record<string, boolean>>({});
  const [teamPositions, setTeamPositions] = useState<Record<string, Array<{ id: string, position: string, name: string, email: string, phone: string, role: 'editor' | 'viewer' }>>>({
    // Sample custom team positions - only a few additional members
    "eq1": [
      { id: "t1", position: "Fabricator", name: "Sanjay Kumar", email: "sanjay.kumar@company.com", phone: "9876543210", role: "editor" },
      { id: "t2", position: "Engineer", name: "Neha Patel", email: "neha.patel@company.com", phone: "9876543211", role: "viewer" }
    ],
    "eq2": [
      { id: "t3", position: "Technician", name: "Ramesh Singh", email: "ramesh.singh@company.com", phone: "9876543212", role: "viewer" }
    ],
    "eq3": [
      { id: "t4", position: "Fabricator", name: "Ajay Verma", email: "ajay.verma@company.com", phone: "9876543213", role: "editor" }
    ]
  });
  const [newTeamPosition, setNewTeamPosition] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamEmail, setNewTeamEmail] = useState('');
  const [newTeamPhone, setNewTeamPhone] = useState('');
  const [newTeamRole, setNewTeamRole] = useState<'editor' | 'viewer'>('viewer');
  const [defaultTeamContacts, setDefaultTeamContacts] = useState<Record<string, { email: string, phone: string }>>({});
  
  // Certification title state
  const [allCertificationTitles, setAllCertificationTitles] = useState<string[]>([]);
  const [showNewCertificationInput, setShowNewCertificationInput] = useState<Record<string, boolean>>({});
  const [newCertificationTitle, setNewCertificationTitle] = useState<string>('');

  // Technical sections state
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState(false);
  const [isEditSectionModalOpen, setIsEditSectionModalOpen] = useState(false);
  const [editingSectionName, setEditingSectionName] = useState('');
  const [editingSectionOldName, setEditingSectionOldName] = useState('');
  const [selectedSection, setSelectedSection] = useState<Record<string, string>>({});
  const [technicalSections, setTechnicalSections] = useState<Record<string, Array<{ name: string, customFields: Array<{ name: string, value: string }> }>>>({});
  const [availableTeamMembers, setAvailableTeamMembers] = useState<any[]>([]);
  const [showTeamSuggestions, setShowTeamSuggestions] = useState(false);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string | undefined>(undefined);
  const [selectedWelderId, setSelectedWelderId] = useState<string | undefined>(undefined);
  const [selectedEngineerId, setSelectedEngineerId] = useState<string | undefined>(undefined);
  const [selectedQcInspectorId, setSelectedQcInspectorId] = useState<string | undefined>(undefined);
  const [selectedProjectManagerId, setSelectedProjectManagerId] = useState<string | undefined>(undefined);
  // Helper function to format date-time for display
  const formatDateTimeDisplay = (dateTimeString: string) => {
    try {
      const date = new Date(dateTimeString);
      const formattedDate = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
      const formattedTime = date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true
      });
      return `${formattedDate} at ${formattedTime}`;
    } catch {
      return dateTimeString;
    }
  };

  // Helper function to format date only (no time) for display
  const formatDateOnly = (dateString: string) => {
    try {
      if (!dateString || dateString === '—' || dateString.trim() === '') {
        return '—';
      }
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString; // Return original if invalid
      }
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  // Helper function to format date for display
  const formatDateDisplay = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  // Function to determine if equipment is active
  const isEquipmentActive = (equipment: Equipment): boolean => {
    // Check if there's any activity/progress data
    const hasProgressImages = equipment.progressImages && equipment.progressImages.length > 0;
    const hasProgressEntries = equipment.progressEntries && equipment.progressEntries.length > 0;
    const hasTechnicalSections = equipment.technicalSections && equipment.technicalSections.length > 0;
    const hasCustomFields = equipment.custom_fields && equipment.custom_fields.length > 0;
    const hasTeamCustomFields = equipment.teamCustomFields && equipment.teamCustomFields.length > 0;
    
    // Equipment is active if it has ANY type of activity/data
    return hasProgressImages || hasProgressEntries || hasTechnicalSections || hasCustomFields || hasTeamCustomFields;
  };

  // Transform database fields to frontend fields - using shared utility
  const transformEquipmentDataCallback = useCallback((dbEquipment: any[]): Equipment[] => {
    return transformEquipmentData(dbEquipment);
  }, []); // Memoized with empty dependencies (pure function)

  // OPTIMIZATION: Initialize with equipment immediately to avoid skeleton loader delay
  const [localEquipment, setLocalEquipment] = useState<Equipment[]>(() => {
    if (equipment && equipment.length > 0) {
      return transformEquipmentDataCallback(equipment);
    }
    return [];
  });
  const [imageMetadata, setImageMetadata] = useState<Record<string, Array<{ id: string, description: string, uploadedBy: string, uploadDate: string }>>>({});
  const [isLoadingProgressImages, setIsLoadingProgressImages] = useState(false);
  
  // Performance optimization: Debouncing and request cancellation for refreshEquipmentData
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const refreshAbortControllerRef = useRef<AbortController | null>(null);

  // Load custom progress types from existing entries
  useEffect(() => {
    const standardTypes = ['welding', 'material', 'inspection', 'assembly', 'testing', 'general', 'comment', 'image'];
    const customTypes = new Set<string>();
    
    localEquipment.forEach(equipment => {
      if (equipment.progressEntries) {
        equipment.progressEntries.forEach((entry: any) => {
          const entryType = entry.entry_type || entry.type;
          if (entryType && !standardTypes.includes(entryType)) {
            customTypes.add(entryType);
          }
        });
      }
    });
    
    setCustomProgressTypes(Array.from(customTypes));
  }, [localEquipment]);

  // Collect all certification titles from equipment for suggestions
  useEffect(() => {
    const titles = new Set<string>();
    localEquipment.forEach(eq => {
      if (eq.certificationTitle && eq.certificationTitle.trim() !== '') {
        titles.add(eq.certificationTitle.trim());
      }
    });
    setAllCertificationTitles(Array.from(titles).sort());
  }, [localEquipment]);

  // Initialize date fields and notes when entering edit mode or when equipment data is refreshed
  useEffect(() => {
    if (editingEquipmentId) {
      const equipment = localEquipment.find(eq => eq.id === editingEquipmentId);
      if (equipment) {
        // Initialize Last Updated On (date only)
        // For standalone equipment, prioritize last_update (DATE column) over updated_at (timestamp)
        // last_update is already in YYYY-MM-DD format from the database
        let dateOnly = '';
        
        // First priority: last_update field (raw DATE from database)
        if ((equipment as any).last_update) {
          // Use last_update directly if available (already in YYYY-MM-DD format)
          const rawDate = String((equipment as any).last_update);
          dateOnly = rawDate.split('T')[0].split(' ')[0]; // Handle both datetime and date strings
          devLog('📅 useEffect - Using last_update:', dateOnly, 'from raw:', rawDate);
        } 
        // Second priority: updated_at timestamp
        else if (equipment.updated_at) {
          try {
            const updatedDate = new Date(equipment.updated_at);
            if (!isNaN(updatedDate.getTime())) {
              const year = updatedDate.getFullYear();
              const month = String(updatedDate.getMonth() + 1).padStart(2, '0');
              const day = String(updatedDate.getDate()).padStart(2, '0');
              dateOnly = `${year}-${month}-${day}`;
              devLog('📅 useEffect - Using updated_at:', dateOnly);
            }
          } catch (error) {
            devError('Error parsing updated_at in useEffect:', error);
          }
        } 
        // Third priority: lastUpdate formatted string
        else if (equipment.lastUpdate) {
          try {
            const parsedDate = new Date(equipment.lastUpdate);
            if (!isNaN(parsedDate.getTime())) {
              const year = parsedDate.getFullYear();
              const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
              const day = String(parsedDate.getDate()).padStart(2, '0');
              dateOnly = `${year}-${month}-${day}`;
              devLog('📅 useEffect - Using lastUpdate:', dateOnly);
            }
          } catch (error) {
            devError('Error parsing lastUpdate in useEffect:', error);
          }
        }
        
        // Always set the date if we found one (even if it matches current value, to ensure it's set)
        // This ensures the date picker shows the saved value when entering edit mode
        if (dateOnly) {
          devLog('📅 useEffect - Setting overviewLastUpdateRaw for', editingEquipmentId, ':', dateOnly);
          setOverviewLastUpdateRaw(prev => {
            const currentValue = prev[editingEquipmentId];
            // Always update to ensure the date is set (even if it's the same)
            // This is important when entering edit mode for the first time
            if (currentValue !== dateOnly) {
              devLog('📅 useEffect - Updating date from', currentValue || '(empty)', 'to', dateOnly);
            } else {
              devLog('📅 useEffect - Date already set correctly:', dateOnly);
            }
            return { ...prev, [editingEquipmentId]: dateOnly };
          });
        } else {
          // If no date found, only clear if there's a value (don't create unnecessary state updates)
          setOverviewLastUpdateRaw(prev => {
            if (prev[editingEquipmentId]) {
              devLog('📅 useEffect - Clearing date for', editingEquipmentId, '(no date found in equipment)');
              const updated = { ...prev };
              delete updated[editingEquipmentId];
              return updated;
            }
            return prev;
          });
        }

        // Initialize Next Milestone Date
        const nextMilestoneDateValue = equipment.nextMilestoneDate || (equipment as any).next_milestone_date;
        if (nextMilestoneDateValue && nextMilestoneDateValue !== 'To be scheduled' && nextMilestoneDateValue !== 'Not specified') {
          try {
            const milestoneDate = new Date(nextMilestoneDateValue);
            if (!isNaN(milestoneDate.getTime())) {
              const year = milestoneDate.getFullYear();
              const month = String(milestoneDate.getMonth() + 1).padStart(2, '0');
              const day = String(milestoneDate.getDate()).padStart(2, '0');
              const dateLocal = `${year}-${month}-${day}`;
              setOverviewNextMilestoneDate(prev => {
                if (prev[editingEquipmentId] !== dateLocal) {
                  return { ...prev, [editingEquipmentId]: dateLocal };
                }
                return prev;
              });
            }
          } catch (error) {
            devError('Error parsing nextMilestoneDate in useEffect:', error);
          }
        }

        // Initialize Notes field
        const notesValue = equipment.notes;
        const notesString = (notesValue !== null && notesValue !== undefined) ? String(notesValue) : '';
        setEditFormData(prev => {
          // Only update if the value is different
          if (prev.notes !== notesString) {
            // console.log('🔧 useEffect: Setting notes in editFormData:', notesString);
            return { ...prev, notes: notesString };
          }
          return prev;
        });
      }
    }
  }, [editingEquipmentId, localEquipment]);

  // Load documents for all equipment
  const loadDocumentsForEquipment = async (equipmentList: Equipment[]) => {
    try {

      // First, import existing documents from storage
      try {
        await fastAPI.importExistingDocuments();
      } catch (error) {
        devError('❌ Error importing existing documents:', error);
      }

      const documentsMap: Record<string, any[]> = {};

      for (const eq of equipmentList) {
        try {
          // Use correct function based on equipment type
          const docs = projectId === 'standalone'
            ? await getStandaloneEquipmentDocuments(eq.id)
            : await fastAPI.getDocumentsByEquipment(eq.id);
          documentsMap[eq.id] = Array.isArray(docs) ? docs : [];
        } catch (error) {
          devError(`❌ Error loading documents for equipment ${eq.id}:`, error);
          documentsMap[eq.id] = [];
        }
      }

      setDocuments(documentsMap);
    } catch (error) {
      devError('❌ Error loading documents:', error);
    }
  };

  // Update local equipment when equipment prop changes
  useEffect(() => {
    if (equipment && equipment.length > 0) {
      // PERFORMANCE: Console logs commented out - uncomment if needed for debugging
      // console.log('🔄 Equipment data received:', equipment);
      const transformedEquipment = transformEquipmentDataCallback(equipment);
      
      // Post-process: For standalone equipment, ensure status is 'active' (not 'pending')
      // This handles both new equipment (which should already be 'active') and old equipment
      if (projectId === 'standalone') {
        transformedEquipment.forEach((eq: Equipment) => {
          if (eq.status === 'pending' || !eq.status) {
            eq.status = 'active';
          }
        });
      }
      
      // console.log('🔄 Transformed equipment:', transformedEquipment);
      setLocalEquipment(transformedEquipment);

      // OPTIMIZATION: Pre-fetch team members for all standalone equipment in background
      // This ensures team members are available immediately when viewing equipment cards
      if (projectId === 'standalone' && transformedEquipment.length > 0) {
        devLog('🔄 Pre-fetching team members for all equipment in background...');
        // Use Promise.allSettled to fetch all in parallel without blocking
        Promise.allSettled(
          transformedEquipment.map(async (eq: Equipment) => {
            // Only fetch if not already cached
            if (!allEquipmentTeamMembers[eq.id] || allEquipmentTeamMembers[eq.id].length === 0) {
              try {
                const { DatabaseService } = await import('@/lib/database');
                const teamData = await DatabaseService.getStandaloneTeamPositions(eq.id);
                
                if (teamData && teamData.length > 0) {
                  const transformedMembers = (teamData as any[]).map((member, index) => ({
                    id: member.id || `member-${index}`,
                    name: member.person_name || 'Unknown',
                    email: member.email || '',
                    phone: member.phone || '',
                    position: member.position_name || '',
                    role: member.role || 'viewer',
                    permissions: getPermissionsByRole(member.role || 'viewer'),
                    status: 'active',
                    avatar: (member.person_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
                    lastActive: 'Unknown',
                    equipmentAssignments: [eq.id],
                    dataAccess: getDataAccessByRole(member.role || 'viewer'),
                    accessLevel: member.role || 'viewer'
                  }));
                  
                  setAllEquipmentTeamMembers(prev => ({
                    ...prev,
                    [eq.id]: transformedMembers
                  }));
                  devLog('✅ Pre-fetched team members for equipment:', eq.id, 'count:', transformedMembers.length);
                }
              } catch (error) {
                devError('❌ Error pre-fetching team members for equipment', eq.id, '(non-fatal):', error);
              }
            }
          })
        ).then(() => {
          devLog('✅ Finished pre-fetching team members for all equipment');
        });
      }

      // Initialize technical sections for each equipment
      const initialTechnicalSections: Record<string, Array<{ name: string, customFields: Array<{ name: string, value: string }> }>> = {};
      const initialSelectedSections: Record<string, string> = {};

      transformedEquipment.forEach((item) => {
        initialTechnicalSections[item.id] = item.technicalSections || [];
        initialSelectedSections[item.id] = '';
      });

      setTechnicalSections(initialTechnicalSections);
      setSelectedSection(initialSelectedSections);

      // Initialize custom fields for each equipment
      const initialCustomFields: Record<string, Array<{ name: string, value: string }>> = {};
      transformedEquipment.forEach((item) => {
        // console.log('Equipment:', item.id, 'Custom Fields:', item.customFields);
        initialCustomFields[item.id] = item.customFields || [];
      });
      // console.log('Initial Custom Fields:', initialCustomFields);
      setCustomFields(initialCustomFields);

      // Initialize team custom fields for each equipment
      const initialTeamCustomFields: Record<string, Array<{ name: string, value: string }>> = {};
      transformedEquipment.forEach((item) => {
        // console.log('Equipment:', item.id, 'Team Custom Fields:', item.teamCustomFields);
        initialTeamCustomFields[item.id] = item.teamCustomFields || [];
      });
      // console.log('Initial Team Custom Fields:', initialTeamCustomFields);
      setTeamCustomFields(initialTeamCustomFields);

      // Debug: Check all documents in database first
      const debugDocuments = async () => {
        try {
          const allDocs = await fastAPI.getAllDocuments();
        } catch (error) {
          console.error('❌ DEBUG: Error fetching all documents:', error);
        }
      };
      debugDocuments();

      // Load documents for all equipment
      loadDocumentsForEquipment(transformedEquipment);

      // Load project members for team assignment
      loadProjectMembers();
    }
  }, [equipment, projectId]);

  // Load project members for team assignment
  const loadProjectMembers = async () => {
    try {
      const members = await fastAPI.getProjectMembers(projectId);
      setProjectMembers(Array.isArray(members) ? members : []);
    } catch (error) {
      console.error('❌ Error loading project members:', error);
      setProjectMembers([]);
    }
  };

  // Listen for team member changes from Settings tab
  useEffect(() => {
    const handleTeamMemberChange = () => {
      // console.log('🔄 EQUIPMENT GRID: Team member change detected, refreshing project members...');
      loadProjectMembers();
    };

    // Listen for team member changes
    window.addEventListener('teamMemberCreated', handleTeamMemberChange);
    window.addEventListener('teamMemberUpdated', handleTeamMemberChange);
    window.addEventListener('teamMemberDeleted', handleTeamMemberChange);

    return () => {
      window.removeEventListener('teamMemberCreated', handleTeamMemberChange);
      window.removeEventListener('teamMemberUpdated', handleTeamMemberChange);
      window.removeEventListener('teamMemberDeleted', handleTeamMemberChange);
    };
  }, [projectId]);

  // Auto-populate engineer field when project members change
  useEffect(() => {
    if (projectMembers.length > 0 && localEquipment.length > 0) {

      const engineerMembers = projectMembers.filter(member =>
        member.position && member.position.toLowerCase().includes('engineer')
      );

      if (engineerMembers.length > 0) {

        setLocalEquipment(prevEquipment =>
          prevEquipment.map(equipment => {
            const assignedEngineer = engineerMembers.find(eng => {
              if (!eng.equipment_assignments) return false;

              // Check for "All Equipment" assignment
              if (eng.equipment_assignments.includes("All Equipment")) {
                return true;
              }

              // Check for specific equipment name match
              if (equipment.name && eng.equipment_assignments.includes(equipment.name)) {
                return true;
              }

              // Check for equipment type match
              if (equipment.type && eng.equipment_assignments.includes(equipment.type)) {
                return true;
              }

              return false;
            });

            if (assignedEngineer) {
              return {
                ...equipment,
                engineer: assignedEngineer.name
              };
            }
            return equipment;
          })
        );
      }
    }
  }, [projectMembers, localEquipment.length]);

  // Auto-remove team members when they're deleted from Settings
  useEffect(() => {
    if (projectMembers.length > 0 && localEquipment.length > 0) {
      // console.log('🔄 Checking for removed project members...');

      setLocalEquipment(prevEquipment =>
        prevEquipment.map(equipment => {
          let updatedEquipment = { ...equipment };

          // Check if supervisor is still in project members
          if (equipment.supervisor) {
            const supervisorExists = projectMembers.find(member =>
              member.name === equipment.supervisor
            );
            if (!supervisorExists) {
              // console.log('❌ Supervisor removed from project:', equipment.supervisor);
              updatedEquipment.supervisor = '';
              updatedEquipment.supervisorEmail = '';
              updatedEquipment.supervisorPhone = '';
            }
          }

          // Check if welder is still in project members
          if (equipment.welder) {
            const welderExists = projectMembers.find(member =>
              member.name === equipment.welder
            );
            if (!welderExists) {
              // console.log('❌ Welder removed from project:', equipment.welder);
              updatedEquipment.welder = '';
              updatedEquipment.welderEmail = '';
              updatedEquipment.welderPhone = '';
            }
          }

          // Check if engineer is still in project members
          if (equipment.engineer) {
            const engineerExists = projectMembers.find(member =>
              member.name === equipment.engineer
            );
            if (!engineerExists) {
              // console.log('❌ Engineer removed from project:', equipment.engineer);
              updatedEquipment.engineer = '';
            }
          }

          // Check if QC Inspector is still in project members
          if (equipment.qcInspector) {
            const qcExists = projectMembers.find(member =>
              member.name === equipment.qcInspector
            );
            if (!qcExists) {
              // console.log('❌ QC Inspector removed from project:', equipment.qcInspector);
              updatedEquipment.qcInspector = '';
              updatedEquipment.qcInspectorEmail = '';
              updatedEquipment.qcInspectorPhone = '';
            }
          }

          // Check if Project Manager is still in project members
          if (equipment.projectManager) {
            const pmExists = projectMembers.find(member =>
              member.name === equipment.projectManager
            );
            if (!pmExists) {
              // console.log('❌ Project Manager removed from project:', equipment.projectManager);
              updatedEquipment.projectManager = '';
              updatedEquipment.projectManagerEmail = '';
              updatedEquipment.projectManagerPhone = '';
            }
          }

          return updatedEquipment;
        })
      );
    }
  }, [projectMembers]);

  // Initialize technical sections for each equipment
  useEffect(() => {
    if (localEquipment.length > 0) {
      const newTechnicalSections: Record<string, Array<{ name: string, customFields: Array<{ name: string, value: string }> }>> = {};
      const newSelectedSections: Record<string, string> = {};

      localEquipment.forEach(item => {
        if (!technicalSections[item.id]) {
          const defaultSections: Array<{ name: string, customFields: Array<{ name: string, value: string }> }> = item.technicalSections || [];

          newTechnicalSections[item.id] = defaultSections;
          newSelectedSections[item.id] = '';
        }
      });

      if (Object.keys(newTechnicalSections).length > 0) {
        setTechnicalSections(prev => ({ ...prev, ...newTechnicalSections }));
        setSelectedSection(prev => ({ ...prev, ...newSelectedSections }));
      }
    }
  }, [localEquipment]);

  // Fetch available team members for suggestions
  const fetchAvailableTeamMembers = async () => {
    try {
      const currentUserRole = localStorage.getItem('userRole');
      const currentUserFirmId = localStorage.getItem('firmId');

      let members = [];

      if (currentUserRole === 'super_admin') {
        const users = await fastAPI.getUsers();
        members = Array.isArray(users) ? users : [];
      } else if (currentUserRole === 'firm_admin' && currentUserFirmId) {
        const firmMembers = await fastAPI.getTeamMembersByFirm(currentUserFirmId);
        members = Array.isArray(firmMembers) ? firmMembers : [];
      } else if (currentUserRole === 'project_manager' && projectId) {
        const projectMembers = await fastAPI.getTeamMembersByProject(projectId);
        members = Array.isArray(projectMembers) ? projectMembers : [];
      }

      // console.log('👥 Available team members fetched:', members);
      setAvailableTeamMembers(members);
    } catch (error) {
      console.error('❌ Error fetching team members for suggestions:', error);
    }
  };

  // Fetch project-specific users for team custom fields dropdown
  const fetchProjectUsers = async () => {
    try {
      // console.log('👥 Fetching project users for team custom fields...', projectId);
      const users = await fastAPI.getProjectMembers(projectId);
      // console.log('👥 Project users fetched:', users);
      setAllUsers(Array.isArray(users) ? users : []);
    } catch (error) {
      console.error('❌ Error fetching project users:', error);
    }
  };

  // Handle add new user option
  const handleAddNewUser = (value: string) => {
    if (value === 'add_new_user') {
      setShowAddUserModal(true);
      setNewUserData({ name: '', email: '' });
    } else {
      setNewTeamFieldValue(value);
    }
  };

  // Handle add new user option in edit mode
  const handleEditAddNewUser = (value: string, fieldIndex: number, teamFields: any[]) => {
    if (value === 'add_new_user') {
      setShowAddUserModal(true);
      setNewUserData({ name: '', email: '' });
    } else {
      const updatedFields = [...teamFields];
      updatedFields[fieldIndex] = { ...updatedFields[fieldIndex], value: value };

      setTeamCustomFields(prev => ({
        ...prev,
        [editingEquipmentId!]: updatedFields
      }));

      // w to database immediately
      updateEquipment(editingEquipmentId!, {
        team_custom_fields: updatedFields
      }).then(() => {
        refreshEquipmentData();
      }).catch((error) => {
        console.error('Error saving team field value change:', error);
      });
    }
  };

  // Load team members when component mounts
  useEffect(() => {
    fetchAvailableTeamMembers();
    fetchProjectUsers();
    fetchCurrentProject();
  }, [projectId]);

  // Fetch current project data
  const fetchCurrentProject = async () => {
    try {
      // console.log('🏢 Fetching current project data...', projectId);
      const project = await fastAPI.getProjectById(projectId);
      // console.log('🏢 Current project fetched:', project);
      setCurrentProject(project[0] || null);
    } catch (error) {
      console.error('❌ Error fetching current project:', error);
    }
  };

  // Auto-fill dropdowns when team members are loaded and equipment is being edited
  useEffect(() => {
    if (editingEquipmentId && availableTeamMembers.length > 0) {
      const equipment = localEquipment.find(eq => eq.id === editingEquipmentId);
      if (equipment) {
        // console.log('🔄 Auto-filling dropdowns for equipment:', equipment.id);

        // Set selected IDs for dropdowns based on existing data
        if (equipment.supervisor) {
          const supervisorMember = projectMembers.find(member => member.name === equipment.supervisor);
          if (supervisorMember) {
            // console.log('👤 Found supervisor member:', supervisorMember);
            setSelectedSupervisorId(supervisorMember.id);
          }
        }
        if (equipment.welder) {
          const welderMember = projectMembers.find(member => member.name === equipment.welder);
          if (welderMember) {
            // console.log('👤 Found welder member:', welderMember);
            setSelectedWelderId(welderMember.id);
          }
        }
        if (equipment.engineer) {
          const engineerMember = projectMembers.find(member => member.name === equipment.engineer);
          if (engineerMember) {
            // console.log('👤 Found engineer member:', engineerMember);
            setSelectedEngineerId(engineerMember.id);
          }
        }
        if (equipment.qcInspector) {
          const qcMember = projectMembers.find(member => member.name === equipment.qcInspector);
          if (qcMember) {
            // console.log('👤 Found QC Inspector member:', qcMember);
            setSelectedQcInspectorId(qcMember.id);
          }
        }
        if (equipment.projectManager) {
          const pmMember = projectMembers.find(member => member.name === equipment.projectManager);
          if (pmMember) {
            // console.log('👤 Found Project Manager member:', pmMember);
            setSelectedProjectManagerId(pmMember.id);
          }
        }
      }
    }
  }, [editingEquipmentId, projectMembers, localEquipment]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showTeamSuggestions) {
        setShowTeamSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTeamSuggestions]);

  // Select team member from suggestions
  const selectTeamMember = (member: any) => {
    // console.log('👤 Selected team member:', member);
    setNewTeamName(member.full_name);
    setNewTeamEmail(member.email);
    setNewTeamPhone(member.phone || '');
    setShowTeamSuggestions(false);
    // console.log('✅ Auto-filled fields:', {
    //   name: member.full_name,
    //   email: member.email,
    //   phone: member.phone || ''
    // });
  };

  // Function to refresh equipment data from database (memoized with useCallback)
  // PERFORMANCE: Added debouncing and request cancellation to prevent race conditions
  const refreshEquipmentData = useCallback(async (immediate: boolean = false) => {
    // Cancel any pending refresh
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
    
    // Cancel any in-flight request
    if (refreshAbortControllerRef.current) {
      refreshAbortControllerRef.current.abort();
    }

    const performRefresh = async () => {
      // Create new abort controller for this request
      const abortController = new AbortController();
      refreshAbortControllerRef.current = abortController;

      try {
        devLog('🔄 refreshEquipmentData: Starting refresh for project:', projectId);
        
        // Set loading state for progress images
        setIsLoadingProgressImages(true);
        
      // Check if this is standalone equipment
      const freshEquipment = projectId === 'standalone' 
        ? await fastAPI.getStandaloneEquipment() 
        : await fastAPI.getEquipmentByProject(projectId);
        
        // Check if request was aborted
        if (abortController.signal.aborted) {
          devLog('⏹️ refreshEquipmentData: Request aborted');
          return;
        }
        
        devLog('🔄 refreshEquipmentData: Fresh equipment data received, type:', typeof freshEquipment, 'isArray:', Array.isArray(freshEquipment));

      // Ensure freshEquipment is an array
      const equipmentArray = Array.isArray(freshEquipment) ? freshEquipment : [];
        devLog('🔄 refreshEquipmentData: Equipment array length:', equipmentArray.length);
      const transformedEquipment = transformEquipmentDataCallback(equipmentArray);
        devLog('🔄 refreshEquipmentData: Transformed equipment count:', transformedEquipment.length);
        
        // Check again if request was aborted before updating state
        if (abortController.signal.aborted) {
          devLog('⏹️ refreshEquipmentData: Request aborted before state update');
          return;
        }
      
      // Post-process: For standalone equipment, ensure status is 'active' (not 'pending')
      // This handles both new equipment (which should already be 'active') and old equipment
      if (projectId === 'standalone') {
        transformedEquipment.forEach((eq: Equipment) => {
          if (eq.status === 'pending' || !eq.status) {
            eq.status = 'active';
          }
        });
      }

        // Update the local equipment state - THIS IS CRITICAL FOR UI UPDATE
        devLog('🔄 refreshEquipmentData: Updating localEquipment state with', transformedEquipment.length, 'items');
        
        // Debug: Log progress images for first equipment item
        if (transformedEquipment.length > 0) {
          const firstEq = transformedEquipment[0];
          devLog('🔄 refreshEquipmentData: First equipment progress images:', firstEq.progressImages?.length || 0, 'images');
        }

      setLocalEquipment(transformedEquipment);
        devLog('✅ refreshEquipmentData: localEquipment state updated');

      // Update custom fields state with fresh data
      const updatedCustomFields: Record<string, Array<{ name: string, value: string }>> = {};
      transformedEquipment.forEach((item) => {
        // console.log('🔄 Refreshing custom fields for equipment:', item.id, 'Fields:', item.customFields);
        updatedCustomFields[item.id] = item.customFields || [];
      });
      // console.log('🔄 Updated Custom Fields:', updatedCustomFields);
      setCustomFields(updatedCustomFields);

      // Update technical sections state with fresh data
      const updatedTechnicalSections: Record<string, Array<{ name: string, customFields: Array<{ name: string, value: string }> }>> = {};
      transformedEquipment.forEach((item) => {
        // console.log('🔄 Refreshing technical sections for equipment:', item.id, 'Sections:', item.technicalSections);
        // console.log('🔄 Raw technical_sections from DB:', item.technicalSections);
        // console.log('🔄 Type of technicalSections:', typeof item.technicalSections);
        // console.log('🔄 Length of technicalSections:', item.technicalSections?.length);
        // console.log('🔄 Detailed technical_sections:', JSON.stringify(item.technicalSections, null, 2));
        updatedTechnicalSections[item.id] = item.technicalSections || [];
      });
      // console.log('🔄 Updated Technical Sections:', updatedTechnicalSections);
      // console.log('🔄 Updated Technical Sections JSON:', JSON.stringify(updatedTechnicalSections, null, 2));
      setTechnicalSections(updatedTechnicalSections);

      // Update selected sections state with fresh data
      const updatedSelectedSections: Record<string, string> = {};
      transformedEquipment.forEach((item) => {
        if (item.technicalSections && item.technicalSections.length > 0) {
          updatedSelectedSections[item.id] = item.technicalSections[0].name;
        }
      });
      // console.log('🔄 Updated Selected Sections:', updatedSelectedSections);
      setSelectedSection(updatedSelectedSections);

      // Update team custom fields state with fresh data
      const updatedTeamCustomFields: Record<string, Array<{ name: string, value: string }>> = {};
      transformedEquipment.forEach((item) => {
        // console.log('🔄 Refreshing team custom fields for equipment:', item.id, 'Fields:', item.teamCustomFields);
        updatedTeamCustomFields[item.id] = item.teamCustomFields || [];
      });
      // console.log('🔄 Updated Team Custom Fields:', updatedTeamCustomFields);
      setTeamCustomFields(updatedTeamCustomFields);

      devLog('✅ refreshEquipmentData: Completed successfully');
      
      // Clear loading state for progress images
      setIsLoadingProgressImages(false);
      
      // Clear abort controller reference
      if (refreshAbortControllerRef.current === abortController) {
        refreshAbortControllerRef.current = null;
      }

      } catch (error: any) {
        // Don't log aborted requests as errors
        if (error?.name !== 'AbortError' && !abortController.signal.aborted) {
          devError('❌ Error refreshing equipment data:', error);
        }
        // Clear loading state on error
        setIsLoadingProgressImages(false);
        // Clear abort controller reference on error
        if (refreshAbortControllerRef.current === abortController) {
          refreshAbortControllerRef.current = null;
        }
      }
    };

    // Debounce: Wait 300ms before refreshing (unless immediate is true)
    // This prevents multiple rapid calls from causing race conditions
    if (immediate) {
      performRefresh();
    } else {
      refreshTimeoutRef.current = setTimeout(() => {
        performRefresh();
        refreshTimeoutRef.current = null;
      }, 300);
    }
  }, [projectId, transformEquipmentDataCallback]); // Memoized with projectId dependency

  // CRITICAL FIX: Refresh equipment data on mount to ensure progress images are loaded
  // The initial equipment prop might be stale and missing progress images
  // This must be AFTER refreshEquipmentData is defined
  useEffect(() => {
    // Refresh equipment data immediately on mount to fetch latest progress images
    refreshEquipmentData(true);
  }, [projectId, refreshEquipmentData]);
  
  // Reset pagination to page 1 when filters change or when switching between project and standalone
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedPhase, searchQuery, projectId]);

  const [documents, setDocuments] = useState<Record<string, Array<{ id: string, file?: File, name: string, uploadedBy: string, uploadDate: string, document_url?: string, document_name?: string }>>>({});
  const [newDocumentName, setNewDocumentName] = useState('');
  const [documentPreview, setDocumentPreview] = useState<{ file: File, name: string } | null>(null);
  const [documentUrlModal, setDocumentUrlModal] = useState<{ url: string, name: string, uploadedBy?: string, uploadDate?: string } | null>(null);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [documentsLoading, setDocumentsLoading] = useState<Record<string, boolean>>({});

  // Fetch equipment documents from database
  const fetchEquipmentDocuments = async (equipmentId: string) => {
    try {
      // console.log('📄 Fetching documents for equipment:', equipmentId);
      setDocumentsLoading(prev => ({ ...prev, [equipmentId]: true }));

      // Use appropriate API based on whether it's standalone or project equipment
      const equipmentDocs = projectId === 'standalone' 
        ? await getStandaloneEquipmentDocuments(equipmentId)
        : await getEquipmentDocuments(equipmentId);

      if (equipmentDocs && Array.isArray(equipmentDocs) && equipmentDocs.length > 0) {
        // console.log('📄 Found equipment documents:', equipmentDocs);

        // Transform database documents to match our state format
        const transformedDocs = Array.isArray(equipmentDocs) ? equipmentDocs.map((doc: any) => ({
          id: doc.id,
          name: doc.document_name,
          document_name: doc.document_name,
          document_url: doc.document_url,
          uploadedBy: doc.uploaded_by || 'Unknown',
          uploadDate: doc.upload_date || doc.created_at,
          document_type: doc.document_type || 'Equipment Document'
        })) : [];

        setDocuments(prev => ({
          ...prev,
          [equipmentId]: transformedDocs
        }));
      } else {
        // console.log('📄 No documents found for equipment:', equipmentId);
        setDocuments(prev => ({
          ...prev,
          [equipmentId]: []
        }));
      }
    } catch (error) {
      console.error('❌ Error fetching equipment documents:', error);
      setDocuments(prev => ({
        ...prev,
        [equipmentId]: []
      }));
    } finally {
      setDocumentsLoading(prev => ({ ...prev, [equipmentId]: false }));
    }
  };

  // Fetch documents for all equipment when component mounts
  useEffect(() => {
    if (equipment && equipment.length > 0) {
      // console.log('📄 Fetching documents for all equipment...');
      equipment.forEach((item) => {
        fetchEquipmentDocuments(item.id);
      });
    }
  }, [equipment]);

  // Fetch documents when viewing equipment details
  useEffect(() => {
    if (viewingEquipmentId && projectId === 'standalone') {
      fetchEquipmentDocuments(viewingEquipmentId);
    }
  }, [viewingEquipmentId, projectId]);

  // Function to handle docs tab click and fetch documents
  const handleDocsTabClick = (equipmentId: string) => {
    // console.log('📄 Docs tab clicked for equipment:', equipmentId);
    // Fetch documents if not already loaded
    if (!documents[equipmentId] || documents[equipmentId].length === 0) {
      fetchEquipmentDocuments(equipmentId);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border border-green-200';
      case 'delayed':
        return 'bg-red-100 text-red-800 border border-red-200';
      case 'on-track':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'nearing-completion':
        return 'bg-orange-100 text-orange-800 border border-orange-200';
      case 'pending':
        return 'bg-gray-100 text-gray-800 border border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const getDisplayStatus = (equipment: Equipment) => {
    if (equipment.status === 'completed') return 'completed';
    if (equipment.status === 'delayed') return 'delayed';
    if (equipment.status === 'pending') return 'pending';

    if (equipment.poCdd !== 'To be scheduled') {
      try {
        const poCddDate = new Date(equipment.poCdd);
        const today = new Date();
        const timeDiff = poCddDate.getTime() - today.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

        if (daysDiff <= 21 && daysDiff > 0) {
          return 'nearing-completion';
        }
      } catch (error) {
        console.log('Error parsing PO-CDD date:', error);
      }
    }

    return 'on-track';
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'delayed':
        return 'Delayed';
      case 'on-track':
        return 'On Track';
      case 'nearing-completion':
        return 'Nearing Completion';
      case 'pending':
        return 'Pending';
      default:
        return 'On Track';
    }
  };

  const getRemainingDays = (poCdd: string) => {
    if (!poCdd || poCdd === 'To be scheduled') {
      return null;
    }

    try {
      const poCddDate = new Date(poCdd);
      const today = new Date();
      const timeDiff = poCddDate.getTime() - today.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

      if (daysDiff < 0) {
        return `${Math.abs(daysDiff)} days overdue`;
      } else if (daysDiff === 0) {
        return 'Due today';
      } else if (daysDiff === 1) {
        return 'Due tomorrow';
      } else {
        return `${daysDiff} days remaining`;
      }
    } catch (error) {
      // console.log('Error parsing PO-CDD date:', error);
      return null;
    }
  };

  const handleEditEquipment = (equipment: Equipment) => {
    setEditingEquipmentId(equipment.id);
    // PERFORMANCE: Console logs commented out for production
    // Debug: Log equipment data to see what we're working with
    // console.log('🔧 handleEditEquipment - Equipment data:', {
    //   id: equipment.id,
    //   updated_at: equipment.updated_at,
    //   nextMilestoneDate: equipment.nextMilestoneDate,
    //   notes: equipment.notes,
    //   notesType: typeof equipment.notes,
    //   notesValue: equipment.notes,
    //   certificationTitle: equipment.certificationTitle,
    //   fullEquipment: equipment
    // });
    const formData = {
      name: equipment.name || '',
      type: equipment.type || '',
      location: equipment.location || '',
      supervisor: equipment.supervisor || '',
      nextMilestone: equipment.nextMilestone || '',
      nextMilestoneDate: equipment.nextMilestoneDate || '',
      size: equipment.size || '',
      weight: equipment.weight || '',
      designCode: equipment.designCode || '',
      material: equipment.material || '',
      workingPressure: equipment.workingPressure || '',
      designTemp: equipment.designTemp || '',
      welder: equipment.welder || '',
      qcInspector: equipment.qcInspector || '',
      projectManager: equipment.projectManager || '',
      poCdd: equipment.poCdd || '',
      completionDate: equipment.completionDate || '',
      status: equipment.status || 'on-track',
      customFields: equipment.customFields || [],
      certificationTitle: equipment.certificationTitle || '',
      notes: (equipment.notes !== null && equipment.notes !== undefined) ? String(equipment.notes) : ''
    };
    // PERFORMANCE: Console logs commented out for production
    // console.log('🔧 Setting editFormData:', formData);
    // console.log('🔧 Notes in formData:', formData.notes);
    // console.log('🔧 Notes type:', typeof formData.notes);
    // console.log('🔧 equipment.customFields:', equipment.customFields);

    // Reset progress entry form fields for new entries
    setNewProgressType('general');
    setNewProgressEntry('');
    setNewProgressImage(null);
    setImageDescription('');
    setEditingProgressEntryId(null);
    setIsAddingCustomProgressType(false);
    setCustomProgressTypeName('');
    // Reset audio recording state
    setAudioChunks([]);
    setRecordingDuration(0);
    setIsRecording(false);
    // Reset image audio recording state
    setImageAudioChunks([]);
    setImageRecordingDuration(0);
    setIsImageRecording(false);
    setEditFormData(formData);

    // Initialize overview state variables for date inputs
    // For standalone equipment, prioritize last_update (DATE column) over updated_at (timestamp)
    // last_update is already in YYYY-MM-DD format from the database
    console.log('🔧 handleEditEquipment - Initializing date for equipment:', {
      id: equipment.id,
      last_update: (equipment as any).last_update,
      updated_at: equipment.updated_at,
      lastUpdate: equipment.lastUpdate,
      equipmentKeys: Object.keys(equipment)
    });
    
    let dateOnly = '';
    // First priority: last_update field (raw DATE from database)
    if ((equipment as any).last_update) {
      // Use last_update directly if available (already in YYYY-MM-DD format)
      const rawDate = String((equipment as any).last_update);
      dateOnly = rawDate.split('T')[0].split(' ')[0]; // Handle both datetime and date strings
      console.log('✅ Using last_update:', dateOnly, 'from raw:', rawDate);
    } 
    // Second priority: updated_at timestamp
    else if (equipment.updated_at) {
      try {
        const updatedDate = new Date(equipment.updated_at);
        if (!isNaN(updatedDate.getTime())) {
          const year = updatedDate.getFullYear();
          const month = String(updatedDate.getMonth() + 1).padStart(2, '0');
          const day = String(updatedDate.getDate()).padStart(2, '0');
          dateOnly = `${year}-${month}-${day}`;
          console.log('✅ Using updated_at:', dateOnly);
        }
      } catch (error) {
        console.error('Error parsing updated_at:', error, 'Value:', equipment.updated_at);
      }
    } 
    // Third priority: lastUpdate formatted string
    else if (equipment.lastUpdate) {
      try {
        const parsedDate = new Date(equipment.lastUpdate);
        if (!isNaN(parsedDate.getTime())) {
          const year = parsedDate.getFullYear();
          const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
          const day = String(parsedDate.getDate()).padStart(2, '0');
          dateOnly = `${year}-${month}-${day}`;
          console.log('✅ Using lastUpdate:', dateOnly);
        }
      } catch (error) {
        console.error('Error parsing lastUpdate:', error, 'Value:', equipment.lastUpdate);
      }
    }
    
    // Always set the date if we found one, or clear it if we didn't
    if (dateOnly) {
      console.log('📅 handleEditEquipment - Setting overviewLastUpdateRaw for', equipment.id, ':', dateOnly);
      setOverviewLastUpdateRaw(prev => {
        // Force update to ensure the date is set
        return { ...prev, [equipment.id]: dateOnly };
      });
    } else {
      console.warn('⚠️ handleEditEquipment - No date value found for equipment:', equipment.id);
      // Clear any existing value to show empty picker
      setOverviewLastUpdateRaw(prev => {
        const updated = { ...prev };
        delete updated[equipment.id];
        return updated;
      });
    }

    // Convert nextMilestoneDate to date format (YYYY-MM-DD)
    // Try multiple possible field names
    const nextMilestoneDateValue = equipment.nextMilestoneDate || (equipment as any).next_milestone_date;
    if (nextMilestoneDateValue && nextMilestoneDateValue !== 'To be scheduled' && nextMilestoneDateValue !== 'Not specified') {
      try {
        const milestoneDate = new Date(nextMilestoneDateValue);
        if (!isNaN(milestoneDate.getTime())) {
          const year = milestoneDate.getFullYear();
          const month = String(milestoneDate.getMonth() + 1).padStart(2, '0');
          const day = String(milestoneDate.getDate()).padStart(2, '0');
          const dateLocal = `${year}-${month}-${day}`;
          setOverviewNextMilestoneDate(prev => ({ ...prev, [equipment.id]: dateLocal }));
        }
      } catch (error) {
        console.error('Error parsing nextMilestoneDate:', error, 'Value:', nextMilestoneDateValue);
      }
    }

    // Fetch documents for this equipment when entering edit mode
    // console.log('📄 Fetching documents for equipment in edit mode:', equipment.id);
    fetchEquipmentDocuments(equipment.id);
  };

  const handleMarkComplete = async (equipment: Equipment) => {
    if (window.confirm(`Mark ${equipment.type} ${equipment.tagNumber} as completed and dispatched?`)) {
      setLoadingStates(prev => ({ ...prev, [`complete-${equipment.id}`]: true }));

      try {
        // console.log('✅ Marking equipment as completed:', equipment.id);

        // Prepare completion data with proper field mapping
        const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const completionData: any = {
          status: 'completed',
          progress_phase: 'dispatched',
          progress: 100,
          completion_date: todayDate // Set dispatch date to today
        };

        // Call backend API to update equipment status
        if (projectId === 'standalone') {
          await fastAPI.updateStandaloneEquipment(equipment.id, completionData);
        } else {
          await fastAPI.updateEquipment(equipment.id, completionData);
        }

        // Update the local equipment data
        const dispatchDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        setLocalEquipment(prev => prev.map(eq =>
          eq.id === equipment.id
            ? {
              ...eq,
              status: 'completed' as const,
              progressPhase: 'dispatched' as const,
              progress: 100,
              completionDate: dispatchDate, // Set dispatch date to today
              lastUpdate: dispatchDate, // Store as date only (YYYY-MM-DD)
              poCdd: new Date().toLocaleDateString()
            }
            : eq
        ));


        // Refresh equipment data from database
        await refreshEquipmentData();

        toast({
          title: "Equipment Completed",
          description: `${equipment.type} ${equipment.tagNumber} marked as completed and dispatched!`,
          variant: "default"
        });
      } catch (error) {
        console.error('❌ Error marking equipment as complete:', error);
        toast({
          title: "Error",
          description: "Failed to mark equipment as complete. Please try again.",
          variant: "destructive"
        });
      } finally {
        setLoadingStates(prev => ({ ...prev, [`complete-${equipment.id}`]: false }));
      }
    }
  };

  const handleProgressPhaseChange = async (equipmentId: string, newPhase: 'documentation' | 'manufacturing' | 'testing' | 'dispatched') => {
    setLoadingStates(prev => ({ ...prev, [`phase-${equipmentId}`]: true }));

    try {
      // Update progress based on phase
      let newProgress = 0;
      switch (newPhase) {
        case 'documentation':
          newProgress = 25;
          break;
        case 'manufacturing':
          newProgress = 50;
          break;
        case 'testing':
          newProgress = 75;
          break;
        case 'dispatched':
          newProgress = 100;
          break;
      }

      // Prepare phase change data with proper field mapping
      const phaseData: any = {
        progress_phase: newPhase,
        progress: newProgress
      };

      // If marking as dispatched, set completion_date to today's date (YYYY-MM-DD format)
      if (newPhase === 'dispatched') {
        const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        phaseData.completion_date = todayDate;
      }

      // Call backend API to update equipment phase
      // console.log('🔄 Sending phase data to API:', phaseData);
      if (projectId === 'standalone') {
        await fastAPI.updateStandaloneEquipment(equipmentId, phaseData);
      } else {
        await fastAPI.updateEquipment(equipmentId, phaseData);
      }

      // Update local state
      setLocalEquipment(prev => prev.map(eq =>
        eq.id === equipmentId
          ? {
            ...eq,
            progressPhase: newPhase,
            progress: newProgress,
            lastUpdate: new Date().toLocaleString(),
            // If dispatched, set completionDate to today
            ...(newPhase === 'dispatched' ? { completionDate: new Date().toISOString().split('T')[0] } : {})
          }
          : eq
      ));

      // console.log(`✅ Equipment ${equipmentId} moved to ${newPhase} phase with ${newProgress}% progress`);

      // Refresh activity logs if callback provided
      if (onActivityUpdate) {
        onActivityUpdate();
      }

      // Refresh equipment data from database (immediate for phase changes)
      await refreshEquipmentData(true);
    } catch (error) {
      console.error('❌ Error updating equipment phase:', error);
      toast({
        title: "Error",
        description: "Failed to update equipment phase. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [`phase-${equipmentId}`]: false }));
    }
  };

  const handleDeleteEquipment = async (equipment: Equipment) => {
    if (window.confirm(`Are you sure you want to delete ${equipment.type} ${equipment.tagNumber}? This action cannot be undone.`)) {
      setLoadingStates(prev => ({ ...prev, [`delete-${equipment.id}`]: true }));

      try {
        // console.log('🗑️ Deleting equipment:', equipment.id);

        // Call backend API to delete equipment
          await fastAPI.deleteEquipment(equipment.id);

        // Remove the equipment from the local array
        setLocalEquipment(prev => prev.filter(eq => eq.id !== equipment.id));

        // Also remove any associated metadata
        setImageMetadata(prev => {
          const newMetadata = { ...prev };
          delete newMetadata[equipment.id];
          return newMetadata;
        });

        setProgressEntries(prev => {
          const newProgress = { ...prev };
          delete newProgress[equipment.id];
          return newProgress;
        });

        setTeamPositions(prev => {
          const newTeam = { ...prev };
          delete newTeam[equipment.id];
          return newTeam;
        });

        setDocuments(prev => {
          const newDocs = { ...prev };
          delete newDocs[equipment.id];
          return newDocs;
        });


        // Refresh equipment data from database
        await refreshEquipmentData();

        toast({
          title: "Equipment Deleted",
          description: `${equipment.type} ${equipment.tagNumber} deleted successfully!`,
          variant: "default"
        });
      } catch (error) {
        console.error('❌ Error deleting equipment:', error);
        toast({
          title: "Error",
          description: "Failed to delete equipment. Please try again.",
          variant: "destructive"
        });
      } finally {
        setLoadingStates(prev => ({ ...prev, [`delete-${equipment.id}`]: false }));
      }
    }
  };

  // for updating equipment part -starting 
  const handleSaveEquipment = async () => {
    if (!editingEquipmentId) return;

    setLoadingStates(prev => ({ ...prev, [`save-${editingEquipmentId}`]: true }));

    try {
      // Save progress image if uploaded (description is REQUIRED)
      if (newProgressImage && imageDescription?.trim()) {
        // console.log('📸 Saving progress image with equipment data...');

        // Convert image to base64 for storage
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64Image = e.target?.result as string;

          // Create a data URL for immediate display
          const imageUrl = URL.createObjectURL(newProgressImage);

          // Update local state immediately for UI
          setLocalEquipment(prev => prev.map(eq =>
            eq.id === editingEquipmentId
              ? { ...eq, progressImages: [...(eq.progressImages || []), imageUrl] }
              : eq
          ));

          // Description is required and validated above
          const finalDescription = imageDescription.trim();

          // Store the image metadata
          const imageMetadata = {
            id: `img-${Date.now()}`,
            description: finalDescription,
              uploadedBy: (user as any)?.full_name || user?.email || localStorage.getItem('userName') || 'Unknown User',
            uploadDate: new Date().toISOString()
          };

          setImageMetadata(prev => ({
            ...prev,
            [editingEquipmentId]: [...(prev[editingEquipmentId] || []), imageMetadata]
          }));

          // Save progress image to database with base64 data
          const progressImageData = {
            equipment_id: editingEquipmentId,
            image_url: base64Image, // Store base64 instead of blob URL
            description: finalDescription,
            audio_data: imageAudioChunks.length > 0 ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(imageAudioChunks[0]);
            }) : null,
            audio_duration: imageRecordingDuration,
              uploaded_by: (user as any)?.full_name || user?.email || localStorage.getItem('userName') || 'Unknown User', // Use actual user name
            upload_date: new Date().toISOString()
          };

          try {
            // Check if this is standalone equipment
            if (projectId === 'standalone') {
              await fastAPI.createStandaloneProgressImage(progressImageData);
            } else {
              await fastAPI.createProgressImage(progressImageData);
            }
            // console.log('✅ Progress image saved to database');
            
            // Get equipment info for logging
            const currentEquipment = localEquipment.find(eq => eq.id === editingEquipmentId);
            if (currentEquipment) {
              // Log progress image upload activity
              try {
                await logProgressImageUploaded(
                  projectId,
                  editingEquipmentId,
                  currentEquipment.type || 'Equipment',
                  currentEquipment.tagNumber || 'Unknown',
                  finalDescription || undefined
                );
                // console.log('✅ Activity logged: Progress image uploaded');
                
                // Refresh activity logs if callback provided
                if (onActivityUpdate) {
                  onActivityUpdate();
                }
              } catch (logError) {
                console.error('⚠️ Error logging progress image activity (non-fatal):', logError);
              }
            }
            
            toast({ title: 'Success', description: 'Progress image uploaded successfully!' });
          } catch (error) {
            console.error('❌ Error saving progress image to database:', error);
            toast({ title: 'Error', description: 'Failed to save progress image. Please try again.', variant: 'destructive' });
          }
        };

        reader.readAsDataURL(newProgressImage);

        // Clear progress image state after successful upload
        setNewProgressImage(null);
        setImageDescription('');

        // Refresh equipment data to show the new progress image (immediate for image uploads)
        await refreshEquipmentData(true);
      } else if (newProgressImage && !imageDescription?.trim()) {
        // Show error if image is selected but description is missing
        toast({ 
          title: 'Description Required', 
          description: 'Please add a description for the progress image before saving.', 
          variant: 'destructive' 
        });
      }
      // console.log('💾 Saving equipment updates:', editFormData);
      // console.log('💾 editFormData.customFields:', editFormData.customFields);
      // console.log('💾 technicalSections[editingEquipmentId]:', technicalSections[editingEquipmentId]);

      // Prepare equipment data for API call with proper field mapping
      // Only include fields that exist in the database schema
      const equipmentData: any = {
        // Map frontend fields to backend fields (using exact database column names)
        type: editFormData.type,
        tag_number: editFormData.tagNumber,
        name: editFormData.name,
        po_cdd: editFormData.poCdd,
        location: editFormData.location,
        next_milestone: editFormData.nextMilestone,
        next_milestone_date: editFormData.nextMilestoneDate,
        // notes will be set explicitly below if editFormData.notes is defined
        is_basic_info: false,
        // User tracking fields
        updated_by: user?.id, // Add current user as updater
        // Technical specifications
        size: editFormData.size,
        material: editFormData.material,
        design_code: editFormData.designCode,
        // Include custom fields from state
        custom_fields: customFields[editingEquipmentId] || [],
        // Include technical sections from state
        technical_sections: technicalSections[editingEquipmentId] || [],
        // Include team custom fields from state
        team_custom_fields: teamCustomFields[editingEquipmentId] || []
      };

      // Add lastUpdate if it was modified (from date input)
      // The database column is DATE type (date only, no time), so send YYYY-MM-DD format
      // Always check overviewLastUpdateRaw first as it's the source of truth for the date input
      const lastUpdateValue = overviewLastUpdateRaw[editingEquipmentId];
      if (lastUpdateValue && lastUpdateValue.trim() !== '') {
        // Extract just the date part (YYYY-MM-DD) if it includes time
        const dateOnly = lastUpdateValue.split('T')[0];
        if (dateOnly && dateOnly.trim() !== '') {
          equipmentData.last_update = dateOnly;
          console.log('💾 Saving last_update:', dateOnly);
        }
      } else if (editFormData.lastUpdate && editFormData.lastUpdate.trim() !== '') {
        // Fallback to editFormData.lastUpdate if overviewLastUpdateRaw is not set
        // Extract just the date part if it's a formatted string
        const dateValue = editFormData.lastUpdate;
        try {
          const parsedDate = new Date(dateValue);
          if (!isNaN(parsedDate.getTime())) {
            const year = parsedDate.getFullYear();
            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const day = String(parsedDate.getDate()).padStart(2, '0');
            equipmentData.last_update = `${year}-${month}-${day}`;
            console.log('💾 Saving last_update (from editFormData):', equipmentData.last_update);
          } else {
            // If it's already in YYYY-MM-DD format, use it directly
            equipmentData.last_update = dateValue.split('T')[0];
          }
        } catch {
          // If parsing fails, try to extract date part
          equipmentData.last_update = dateValue.split('T')[0];
        }
      }

      // Add certification title
      if (editFormData.certificationTitle !== undefined) {
        equipmentData.certification_title = editFormData.certificationTitle || null;
      }

      // Only include team member fields if they have actual values (not empty/undefined)
      // This prevents logging "Not set → Not set" when user didn't modify these fields
      if (editFormData.supervisor && editFormData.supervisor.trim() !== '') {
        equipmentData.supervisor = editFormData.supervisor.trim();
      }
      if (editFormData.welder && editFormData.welder.trim() !== '') {
        equipmentData.welder = editFormData.welder.trim();
      }
      if (editFormData.qcInspector && editFormData.qcInspector.trim() !== '') {
        equipmentData.qc_inspector = editFormData.qcInspector.trim();
      }
      if (editFormData.projectManager && editFormData.projectManager.trim() !== '') {
        equipmentData.project_manager = editFormData.projectManager.trim();
      }

      // Always include notes field if we're in edit mode (even if empty string)
      // This ensures the field is updated in the database
      if (editFormData.notes !== undefined) {
        equipmentData.notes = String(editFormData.notes || '');
      }

      // Remove undefined values
      Object.keys(equipmentData).forEach(key => {
        if (equipmentData[key] === undefined) {
          delete equipmentData[key];
        }
      });

      // CRITICAL FIX: Before saving, fetch current equipment data to ensure we don't overwrite technical sections
      // This prevents data loss when technical sections were added from a different device/session
      let currentEquipmentData: any = null;
      try {
        if (projectId === 'standalone') {
          const currentResponse = await fastAPI.getStandaloneEquipment();
          currentEquipmentData = currentResponse.find((eq: any) => eq.id === editingEquipmentId);
        } else {
          const currentResponse = await fastAPI.getEquipmentByProject(projectId);
          currentEquipmentData = currentResponse.find((eq: any) => eq.id === editingEquipmentId);
        }
      } catch (error) {
        devError('⚠️ Error fetching current equipment data before save (non-fatal):', error);
      }
      
      // Merge technical sections: Keep existing sections from database, add/update from local state
      if (currentEquipmentData && currentEquipmentData.technical_sections) {
        const existingSections = Array.isArray(currentEquipmentData.technical_sections) 
          ? currentEquipmentData.technical_sections 
          : [];
        const localSections = technicalSections[editingEquipmentId] || [];
        
        // Create a map of existing sections by name for quick lookup
        const existingSectionsMap = new Map(
          existingSections.map((section: any) => [section.name, section])
        );
        
        // Update or add sections from local state
        localSections.forEach((localSection: any) => {
          existingSectionsMap.set(localSection.name, localSection);
        });
        
        // Convert map back to array
        equipmentData.technical_sections = Array.from(existingSectionsMap.values());
        
        devLog('🔧 Merged technical sections:', {
          existing: existingSections.length,
          local: localSections.length,
          merged: equipmentData.technical_sections.length
        });
      } else {
        // If we couldn't fetch current data, use local state (fallback)
        equipmentData.technical_sections = technicalSections[editingEquipmentId] || [];
        devWarn('⚠️ Using local technical sections only (could not fetch current data)');
      }

      // Call backend API to update equipment
      // console.log('🔧 Sending equipment data to API:', equipmentData);
      // console.log('🔧 Custom fields in data:', equipmentData.custom_fields);
      // console.log('🔧 Technical sections in data:', equipmentData.technical_sections);
      // Check if this is standalone equipment
      if (projectId === 'standalone') {
        await fastAPI.updateStandaloneEquipment(editingEquipmentId, equipmentData, user?.id);
      } else {
        await fastAPI.updateEquipment(editingEquipmentId, equipmentData, user?.id);
      }
      
      // Refresh activity logs if callback provided
      if (onActivityUpdate) {
        onActivityUpdate();
      }
      
      // Refresh equipment data from database to ensure consistency (immediate for save operations)
      await refreshEquipmentData(true);

      // Preserve the saved date in overviewLastUpdateRaw so it displays correctly
      // The date was saved as last_update, so we keep it in state for display
      const savedDate = lastUpdateValue ? lastUpdateValue.split('T')[0] : 
                       (equipmentData.last_update ? equipmentData.last_update.split('T')[0] : null);
      if (savedDate) {
        setOverviewLastUpdateRaw(prev => ({ ...prev, [editingEquipmentId]: savedDate }));
      }

      // Reset edit mode
      setEditingEquipmentId(null);
      setEditFormData({});
      
      // Clear custom field inputs
      setNewFieldName('');
      setNewFieldValue('');
      setShowAddFieldInputs({});

      toast({
        title: "Success",
        description: "Equipment updated successfully!",
        variant: "default"
      });
    } catch (error: any) {
      console.error('❌ Error updating equipment:', error);
      
      // Handle uniqueness validation errors with clear messages
      const errorMessage = error?.message || 'Failed to update equipment. Please try again.';
      
      if (errorMessage.includes('already exists') || errorMessage.includes('unique')) {
        toast({
          title: "Validation Error",
          description: errorMessage,
          variant: "destructive",
          duration: 5000
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
    } finally {
      setLoadingStates(prev => ({ ...prev, [`save-${editingEquipmentId}`]: false }));
    }
  };

  // Add this function to actually update the equipment array
  const updateEquipmentData = (equipmentId: string, updates: Partial<Equipment>) => {
    // This would typically update the parent state
    // For now, we'll just log the update
    // console.log(`Updating equipment ${equipmentId}:`, updates);

    // In a real implementation, you would call a prop function like:
    // onEquipmentUpdate(equipmentId, updates);
  };

  const handleAddNewEquipment = () => {
    // Open the proper AddEquipmentForm modal instead of using the old method
    setShowAddEquipmentForm(true);
  };

  const addProgressEntry = async (equipmentId: string) => {
    if (!newProgressEntry?.trim()) {
      toast({ title: 'Notice', description: 'Please enter a comment for the progress entry' });
      return;
    }

    // console.log('🚀 Starting addProgressEntry for equipment:', equipmentId);
    // console.log('📝 Current form data:', {
    //   type: newProgressType,
    //   comment: newProgressEntry,
    //   hasImage: !!newProgressImage,
    //   description: imageDescription,
    //   editingId: editingProgressEntryId
    // });

    let imageBase64 = '';
    if (newProgressImage) {
      try {
        // Check if newProgressImage is already a base64 string (from existing image) or a File object (new upload)
        if (typeof newProgressImage === 'string') {
          // It's already a base64 string (existing image)
          imageBase64 = newProgressImage;
          // console.log('🖼️ Using existing base64 image, length:', imageBase64.length);
        } else {
          // It's a File object (new upload), convert to base64
          imageBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              resolve(e.target?.result as string);
            };
            reader.onerror = reject;
            reader.readAsDataURL(newProgressImage);
          });
          // console.log('🖼️ New image converted to base64, length:', imageBase64.length);
        }
      } catch (error) {
        console.error('❌ Error converting image:', error);
        toast({ title: 'Error', description: 'Error processing image', variant: 'destructive' });
        return;
      }
    }

    // Process audio data
    let audioBase64 = '';
    let audioDuration = 0;
    if (audioChunks.length > 0) {
      try {
        const audioBlob = audioChunks[0];
        audioBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve(e.target?.result as string);
          };
          reader.onerror = reject;
          reader.readAsDataURL(audioBlob);
        });
        audioDuration = recordingDuration;
        // console.log('🎵 Audio converted to base64, length:', audioBase64.length, 'duration:', audioDuration);
      } catch (error) {
        console.error('❌ Error converting audio:', error);
        toast({ title: 'Error', description: 'Error processing audio', variant: 'destructive' });
        return;
      }
    }

    // Find the equipment in localEquipment
    const currentEquipment = localEquipment.find(eq => eq.id === equipmentId);
    if (!currentEquipment) {
      console.error('❌ Equipment not found:', equipmentId);
      toast({ title: 'Error', description: 'Equipment not found', variant: 'destructive' });
      return;
    }

    // console.log('🔍 Found equipment:', currentEquipment.name || currentEquipment.type);
    // console.log('📋 Current progress entries:', currentEquipment.progressEntries?.length || 0);

    let newProgressEntries;
    let newEntry: ProgressEntry | null = null;

    if (editingProgressEntryId) {
      // Update existing entry
      // console.log('🔄 Updating existing entry:', editingProgressEntryId);
      newProgressEntries = (currentEquipment.progressEntries || []).map(entry =>
        entry.id === editingProgressEntryId
          ? {
              ...entry,
              type: newProgressType,
              entry_type: newProgressType,
              comment: newProgressEntry,
              entry_text: newProgressEntry,
              // Preserve existing image if no new image uploaded, otherwise use new image
              image: imageBase64 ? imageBase64 : (entry.image || (entry as any).image_url),
              image_url: imageBase64 ? imageBase64 : (entry.image || (entry as any).image_url),
              imageDescription: imageDescription,
              image_description: imageDescription,
              // Preserve existing audio if no new audio recorded, otherwise use new audio
              audio: audioBase64 ? audioBase64 : (entry.audio || (entry as any).audio_data),
              audio_data: audioBase64 ? audioBase64 : (entry.audio || (entry as any).audio_data),
              audioDuration: audioBase64 ? audioDuration : (entry.audioDuration || (entry as any).audio_duration || 0),
              audio_duration: audioBase64 ? audioDuration : (entry.audioDuration || (entry as any).audio_duration || 0),
              uploadDate: new Date().toISOString()
            }
          : entry
      );
    } else {
      // Add new entry
      // console.log('➕ Creating new entry');
      newEntry = {
        id: `progress-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: newProgressType,
        comment: newProgressEntry,
        image: imageBase64,
        imageDescription: imageDescription,
        audio: audioBase64,
        audioDuration: audioDuration,
        uploadedBy: localStorage.getItem('userName') || 'Unknown',
        uploadDate: new Date().toISOString()
      };

      // console.log('📝 New entry created:', newEntry);
      newProgressEntries = [...(currentEquipment.progressEntries || []), newEntry];
    }

    // console.log('📋 Final progress entries array:', newProgressEntries);
    // console.log('📊 Total entries:', newProgressEntries.length);

    // Update local state first
    setLocalEquipment(prev => {
      const updated = prev.map(eq =>
        eq.id === equipmentId
          ? { ...eq, progressEntries: newProgressEntries }
          : eq
      );
      // console.log('🔄 Updated localEquipment state');
      return updated;
    });

    // Update database - save to equipment_progress_entries table
    try {
      // console.log('💾 Saving progress entry to database...');
      
      if (!editingProgressEntryId) {
        // Create new progress entry - use appropriate table based on equipment type
        const entryData = {
          equipment_id: equipmentId,
          entry_text: newProgressEntry,
          entry_type: newProgressType,
          audio_data: audioBase64,
          audio_duration: audioDuration,
          image_url: imageBase64,
          image_description: imageDescription,
          created_by: user?.id
        };
        
        const createdEntry = projectId === 'standalone'
          ? await fastAPI.createStandaloneProgressEntry(entryData)
          : await fastAPI.createProgressEntry(entryData);
        // console.log('✅ Progress entry created in database:', createdEntry);
        
        // Log activity - Progress Entry Added
        try {
          await logProgressEntryAdded(
            projectId,
            equipmentId,
            currentEquipment.type || 'Equipment',
            currentEquipment.tagNumber || 'Unknown',
            newProgressType,
            newProgressEntry
          );
          // console.log('✅ Activity logged: Progress entry added');
          
          // Refresh activity logs if callback provided
          if (onActivityUpdate) {
            onActivityUpdate();
          }
        } catch (logError) {
          console.error('⚠️ Error logging activity (non-fatal):', logError);
        }
        
        // Update the local entry with the real database ID
        if (createdEntry && createdEntry[0] && createdEntry[0].id && newEntry) {
          const realId = createdEntry[0].id;
          // console.log('🔄 Updating local entry with real database ID:', realId);
          
          // Update the local entry with the real ID
          setLocalEquipment(prev => {
            return prev.map(eq => {
              if (eq.id === equipmentId) {
                const updatedEntries = eq.progressEntries.map(entry => {
                  if (entry.id === newEntry!.id) {
                    return { ...entry, id: realId };
                  }
                  return entry;
                });
                return { ...eq, progressEntries: updatedEntries };
              }
              return eq;
            });
          });
        }
      } else {
        // Update existing progress entry - use appropriate table based on equipment type
        const updateData = {
          entry_text: newProgressEntry,
          entry_type: newProgressType,
          audio_data: audioBase64,
          audio_duration: audioDuration,
          image_url: imageBase64,
          image_description: imageDescription
        };
        
        if (projectId === 'standalone') {
          await fastAPI.updateStandaloneProgressEntry(editingProgressEntryId, updateData);
        } else {
          await fastAPI.updateProgressEntry(editingProgressEntryId, updateData);
        }
        // console.log('✅ Progress entry updated in database');
        
        // Log activity - Progress Entry Updated
        try {
          await logProgressEntryUpdated(
            projectId,
            equipmentId,
            currentEquipment.type || 'Equipment',
            currentEquipment.tagNumber || 'Unknown',
            newProgressType,
            newProgressEntry,
            !!audioBase64, // hasAudio
            !!imageBase64  // hasImage
          );
          // console.log('✅ Activity logged: Progress entry updated');
          
          // Refresh activity logs if callback provided
          if (onActivityUpdate) {
            onActivityUpdate();
          }
        } catch (logError) {
          console.error('⚠️ Error logging activity (non-fatal):', logError);
        }
      }

      // Reset form
      setNewProgressEntry('');
      setNewProgressType('general');
      setNewProgressImage(null);
      setImageDescription('');
      setEditingProgressEntryId(null);
      setAddingProgressEntryForEquipment(null);
      setEditingProgressEntryForEquipment(null);
      setIsAddingCustomProgressType(false);
      setCustomProgressTypeName('');
      // Reset audio recording state
      setAudioChunks([]);
      setRecordingDuration(0);
      setIsRecording(false);
      // Reset image audio recording state
      setImageAudioChunks([]);
      setImageRecordingDuration(0);
      setIsImageRecording(false);

      if (editingProgressEntryId) {
        toast({ title: 'Success', description: 'Progress entry updated successfully!' });
      } else {
        toast({ title: 'Success', description: 'Progress entry added successfully!' });
      }

      // Dispatch event to refresh equipment activity logs
      window.dispatchEvent(new CustomEvent('equipmentChanged', { detail: { equipmentId, action: editingProgressEntryId ? 'update' : 'add' } }));

    } catch (error) {
      console.error('❌ Database error:', error);
      toast({ title: 'Error', description: 'Error saving to database. Please try again.', variant: 'destructive' });

      // Revert local state on error
      setLocalEquipment(prev => prev.map(eq =>
        eq.id === equipmentId
          ? { ...eq, progressEntries: currentEquipment.progressEntries }
          : eq
      ));
    }
  };

  const removeProgressEntry = (equipmentId: string, entryId: string) => {
    setProgressEntries(prev => ({
      ...prev,
      [equipmentId]: prev[equipmentId]?.filter(entry => entry.id !== entryId) || []
    }));
  };

  const editProgressEntry = (equipmentId: string, entryId: string) => {
    // console.log('✏️ Edit progress entry clicked:', entryId, 'for equipment:', equipmentId);

    const targetEquipment = localEquipment.find(eq => eq.id === equipmentId);
    if (!targetEquipment) {
      console.error('❌ Equipment not found for editing');
      toast({ title: 'Error', description: 'Equipment not found', variant: 'destructive' });
      return;
    }

    const entry = targetEquipment.progressEntries?.find(entry => entry.id === entryId);
    if (!entry) {
      console.error('❌ Progress entry not found:', entryId);
      toast({ title: 'Error', description: 'Progress entry not found', variant: 'destructive' });
      return;
    }

    // console.log('📝 Found entry to edit:', entry);

    // Switch to edit mode for this equipment's progress entry only
    setEditingProgressEntryForEquipment(equipmentId);

    // Auto-fill the form with existing entry data
    setEditingProgressEntryId(entryId);
    setNewProgressType((entry as any).entry_type || entry.type || 'general');
    setNewProgressEntry((entry as any).entry_text || entry.comment || '');
    setImageDescription((entry as any).image_description || entry.imageDescription || '');
    
    // Preload existing image
    const existingImageUrl = (entry as any).image_url || entry.image;
    if (existingImageUrl) {
      // If it's already a base64 string or URL, use it directly
      // The form handles both File objects and string URLs
      setNewProgressImage(existingImageUrl as any);
      // console.log('🖼️ Preloaded existing image');
    } else {
      setNewProgressImage(null);
    }

    // Preload existing audio
    const existingAudio = (entry as any).audio_data || entry.audio;
    const existingAudioDuration = (entry as any).audio_duration || entry.audioDuration || 0;
    
    if (existingAudio) {
      try {
        // Convert base64 audio back to Blob
        const base64Data = existingAudio.split(',')[1] || existingAudio; // Remove data URL prefix if present
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlob = new Blob([bytes], { type: 'audio/webm' });
        
        // Set audio chunks and duration
        setAudioChunks([audioBlob]);
        setRecordingDuration(existingAudioDuration);
        // console.log('🔊 Preloaded existing audio, duration:', existingAudioDuration);
      } catch (error) {
        console.error('❌ Error loading existing audio:', error);
        // If loading fails, just reset audio
        setAudioChunks([]);
        setRecordingDuration(0);
      }
    } else {
      // No existing audio, reset
      setAudioChunks([]);
      setRecordingDuration(0);
    }

    // console.log('🔄 Form auto-filled with entry data:', {
    //   type: (entry as any).entry_type || entry.type,
    //   comment: (entry as any).entry_text || entry.comment,
    //   description: (entry as any).image_description || entry.imageDescription,
    //   hasImage: !!existingImageUrl,
    //   hasAudio: !!existingAudio,
    //   audioDuration: existingAudioDuration
    // });
  };

  const deleteProgressEntry = async (equipmentId: string, entryId: string) => {
    // console.log('🗑️ Deleting progress entry:', entryId, 'from equipment:', equipmentId);

    const currentEquipment = localEquipment.find(eq => eq.id === equipmentId);
    if (!currentEquipment) {
      console.error('❌ Equipment not found for deletion');
      toast({ title: 'Error', description: 'Equipment not found', variant: 'destructive' });
      return;
    }

    // Get entry data before deletion for logging
    const entryToDelete = (currentEquipment.progressEntries || []).find(entry => entry.id === entryId);
    const entryType = entryToDelete ? ((entryToDelete as any).entry_type || entryToDelete.type || 'general') : 'general';
    const entryText = entryToDelete ? ((entryToDelete as any).entry_text || entryToDelete.comment || '') : '';

    const updatedProgressEntries = (currentEquipment.progressEntries || []).filter(entry => entry.id !== entryId);
    // console.log('📋 Progress entries after deletion:', updatedProgressEntries.length);

    // Update local state first
    setLocalEquipment(prev => prev.map(eq =>
      eq.id === equipmentId
        ? { ...eq, progressEntries: updatedProgressEntries }
        : eq
    ));

    // Update database - use appropriate table based on equipment type
    try {
      // console.log('🔄 Deleting progress entry from database...');
      const result = projectId === 'standalone'
        ? await fastAPI.deleteStandaloneProgressEntry(entryId)
        : await fastAPI.deleteProgressEntry(entryId);
      // console.log('✅ Progress entry deleted successfully:', result);

      // Log activity - Progress Entry Deleted
      try {
        await logProgressEntryDeleted(
          projectId,
          equipmentId,
          currentEquipment.type || 'Equipment',
          currentEquipment.tagNumber || 'Unknown',
          entryType,
          entryText
        );
        // console.log('✅ Activity logged: Progress entry deleted');
        
        // Refresh activity logs if callback provided
        if (onActivityUpdate) {
          onActivityUpdate();
        }
      } catch (logError) {
        console.error('⚠️ Error logging activity (non-fatal):', logError);
      }

      // Show success message
      toast({
        title: "Success",
        description: "Progress entry deleted successfully!",
        variant: "default"
      });
    } catch (error: any) {
      console.error('❌ Error deleting progress entry:', error);

      // Check if it's a timeout error
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        // console.log('⏰ Request timed out, but local state updated');
        // Don't revert local state for timeout - user sees the change
        toast({
          title: "Warning",
          description: "Entry deleted locally. Please refresh if needed.",
          variant: "default"
        });
      } else {
        console.error('❌ Error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        });

        // Revert local state on error
        setLocalEquipment(prev => prev.map(eq =>
          eq.id === equipmentId
            ? { ...eq, progressEntries: currentEquipment.progressEntries }
            : eq
        ));

        // Show error message
        toast({
          title: "Error",
          description: "Failed to delete progress entry. Please try again.",
          variant: "destructive"
        });
      }
    }
  };

  const addTeamPosition = async (equipmentId: string) => {
    if (!newTeamPosition?.trim() || !newTeamName?.trim()) return;

    try {
      // console.log('👥 Adding team member to project_members table...');

      // Create member data for project_members table
        const memberData = {
          project_id: projectId,
          name: newTeamName?.trim(),
          email: newTeamEmail?.trim() || null,
          phone: newTeamPhone?.trim() || null,
          position: newTeamPosition?.trim(),
          role: newTeamRole,
          permissions: ['view', 'edit'],
          status: 'active',
          equipment_assignments: [equipmentId], // Assign to this equipment
          data_access: ['equipment', 'documents', 'progress'],
          access_level: newTeamRole
        };

      // Save to project_members table
        const createdMember = await fastAPI.createProjectMember(memberData);
        // console.log('✅ Team member created in project_members table:', createdMember);

      // Get equipment info for logging
      const currentEquipment = localEquipment.find(eq => eq.id === equipmentId);
      if (currentEquipment) {
        // Log team member addition activity
        try {
          // console.log('📝 Logging team member addition activity...', {
          //   projectId,
          //   equipmentId,
          //   equipmentType: currentEquipment.type || 'Equipment',
          //   tagNumber: currentEquipment.tagNumber || 'Unknown',
          //   memberName: newTeamName?.trim() || 'Unknown',
          //   role: newTeamPosition?.trim() || newTeamRole || 'viewer'
          // });
          
          await logTeamMemberAdded(
            projectId,
            equipmentId,
            currentEquipment.type || 'Equipment',
            currentEquipment.tagNumber || 'Unknown',
            newTeamName?.trim() || 'Unknown',
            newTeamPosition?.trim() || newTeamRole || 'viewer'
          );
          // console.log('✅ Activity logged: Team member added');
          
          // Refresh activity logs if callback provided
          if (onActivityUpdate) {
            // console.log('🔄 Refreshing activity logs via callback...');
            onActivityUpdate();
          }
        } catch (logError) {
          console.error('⚠️ Error logging team member addition activity (non-fatal):', logError);
        }
      } else {
        console.warn(`⚠️ Equipment ${equipmentId} not found in localEquipment for logging team member addition`);
      }

      // 🆕 Create invite for the new team member
      if (newTeamEmail && newTeamEmail?.trim()) {
        try {
          const firmId = localStorage.getItem('firmId');
          const currentUserId = user?.id || localStorage.getItem('userId');

          // console.log('📧 Creating invite for equipment team member...');
          await fastAPI.createInvite({
            email: newTeamEmail?.trim(),
            full_name: newTeamName?.trim(),
            role: newTeamRole,
            firm_id: firmId || '',
            project_id: projectId,
            invited_by: currentUserId || 'system'
          });
          // console.log('✅ Invite created for equipment team member');
        } catch (inviteError) {
          console.error('❌ Error creating invite (member still created):', inviteError);
        }
      }

      // Show success message
      toast({
        title: "Success",
        description: "Team member added successfully to project",
      });

      // Refresh project members list
      await loadProjectMembers();

      // Notify parent component to refresh Settings tab
      if (onUserAdded) {
        // console.log('🔄 Calling onUserAdded callback to refresh Settings tab...');
        onUserAdded();
      } else {
        console.log('⚠️ onUserAdded callback not provided');
      }

      // Clear form
      setNewTeamPosition('');
      setNewTeamName('');
      setNewTeamEmail('');
      setNewTeamPhone('');
      setNewTeamRole('viewer');

      // Close the form
      setShowAddCustomFieldForm(prev => ({
        ...prev,
        [`team-${equipmentId}`]: false
      }));

      toast({ title: 'Success', description: 'Team member added successfully! Check Settings tab to see the new member.' });

    } catch (error) {
      console.error('❌ Error creating team member:', error);
      toast({ title: 'Error', description: 'Error creating team member. Please try again.', variant: 'destructive' });
    }
  };

  const removeTeamPosition = (equipmentId: string, positionId: string) => {
      setTeamPositions(prev => ({
        ...prev,
        [equipmentId]: prev[equipmentId]?.filter(pos => pos.id !== positionId) || []
      }));
  };

  // Custom fields functions
  const addCustomField = (equipmentId: string) => {
    if (!newCustomFieldName?.trim() || !newCustomFieldValue?.trim()) {
      toast({ title: 'Notice', description: 'Please enter both field name and value' });
      return;
    }

    const newField = {
      id: `custom_${Date.now()}`,
      name: newCustomFieldName?.trim(),
      value: newCustomFieldValue?.trim()
    };

    // console.log('🔧 Adding custom field:', newField);

    // Update editFormData directly
    setEditFormData(prev => {
      const currentCustomFields = prev.customFields || [];
      const updatedCustomFields = [...currentCustomFields, newField];
      const newData = {
        ...prev,
        customFields: updatedCustomFields
      };
      // console.log('🔧 Updated editFormData:', newData);
      return newData;
    });

    // Clear form
    setNewCustomFieldName('');
    setNewCustomFieldValue('');
  };

  const updateCustomField = (equipmentId: string, fieldId: string, newValue: string) => {
    // Update editFormData directly
    setEditFormData(prev => {
      const updatedCustomFields = prev.customFields?.map(field =>
        field.id === fieldId ? { ...field, value: newValue } : field
      ) || [];
      return {
        ...prev,
        customFields: updatedCustomFields
      };
    });
  };

  const deleteCustomField = (equipmentId: string, fieldId: string) => {
    // Update editFormData directly
    setEditFormData(prev => {
      const updatedCustomFields = prev.customFields?.filter(field => field.id !== fieldId) || [];
      return {
        ...prev,
        customFields: updatedCustomFields
      };
    });
  };

  const handleCancelEdit = () => {
    setEditingEquipmentId(null);
    setEditFormData({});
    // Reset selected IDs
    setSelectedSupervisorId(undefined);
    setSelectedWelderId(undefined);
    setSelectedQcInspectorId(undefined);
    setSelectedProjectManagerId(undefined);
    // Reset progress entry form fields
    setNewProgressType('general');
    setNewProgressEntry('');
    setNewProgressImage(null);
    setImageDescription('');
    setEditingProgressEntryId(null);
    setIsAddingCustomProgressType(false);
    setCustomProgressTypeName('');
    // Reset audio recording state
    setAudioChunks([]);
    setRecordingDuration(0);
    setIsRecording(false);
    // Reset image audio recording state
    setImageAudioChunks([]);
    setImageRecordingDuration(0);
    setIsImageRecording(false);
  };

  const handleAddSection = async (sectionName: string) => {
    if (!editingEquipmentId) return;

    const newSection = {
      name: sectionName,
      customFields: []
    };

    // Update local state
    setTechnicalSections(prev => ({
      ...prev,
      [editingEquipmentId]: [...(prev[editingEquipmentId] || []), newSection]
    }));

    setSelectedSection(prev => ({
      ...prev,
      [editingEquipmentId]: sectionName
    }));

    // Save to database
    try {
      const currentSections = technicalSections[editingEquipmentId] || [];
      const updatedSections = [...currentSections, newSection];

      // console.log('💾 Saving new section to database:', editingEquipmentId, sectionName);
      await updateEquipment(editingEquipmentId, {
        technical_sections: updatedSections
      });
      // console.log('✅ Section saved successfully');

      toast({
        title: "Success",
        description: "Technical section added successfully",
      });
    } catch (error) {
      console.error('Error saving section:', error);
      toast({
        title: "Error",
        description: "Failed to save technical section",
        variant: "destructive",
      });
    }
  };

  const handleEditSection = async (newSectionName: string) => {
    if (!editingEquipmentId || !editingSectionOldName) return;

    // console.log('🔄 handleEditSection: Starting section name update:', editingSectionOldName, '->', newSectionName);

    // Update local state
    setTechnicalSections(prev => ({
      ...prev,
      [editingEquipmentId]: (prev[editingEquipmentId] || []).map(section =>
        section.name === editingSectionOldName
          ? { ...section, name: newSectionName }
          : section
      )
    }));

    // Update selected section if it was the edited one
    if (selectedSection[editingEquipmentId] === editingSectionOldName) {
      setSelectedSection(prev => ({
        ...prev,
        [editingEquipmentId]: newSectionName
      }));
    }

    // Save to database
    try {
      const updatedSections = (technicalSections[editingEquipmentId] || []).map(section =>
        section.name === editingSectionOldName
          ? { ...section, name: newSectionName }
          : section
      );

      // console.log('💾 Updating section name in database:', editingEquipmentId, editingSectionOldName, '->', newSectionName);
      await updateEquipment(editingEquipmentId, {
        technical_sections: updatedSections
      });
      // console.log('✅ Section name updated successfully');

      // Refresh equipment data to ensure consistency
      // console.log('🔄 Calling refreshEquipmentData after section name update');
      await refreshEquipmentData();
      // console.log('✅ refreshEquipmentData completed');

      toast({
        title: "Success",
        description: "Section name updated successfully",
      });

      // console.log('✅ handleEditSection: Section name update completed successfully');
    } catch (error) {
      console.error('❌ handleEditSection: Error updating section name:', error);
      toast({
        title: "Error",
        description: "Failed to update section name",
        variant: "destructive",
      });
    }

    // Close modal and reset state
    setIsEditSectionModalOpen(false);
    setEditingSectionName('');
    setEditingSectionOldName('');
  };

  const handleDeleteSection = async (sectionName: string) => {
    if (!editingEquipmentId || !sectionName) return;

    // console.log('🔄 handleDeleteSection: Starting section deletion:', sectionName);
    // console.log('📊 Current technicalSections before deletion:', technicalSections[editingEquipmentId]);

    // Update local state - remove the section
    const updatedSections = (technicalSections[editingEquipmentId] || []).filter(section =>
      section.name !== sectionName
    );

    // console.log('📊 Updated sections after filtering:', updatedSections);

    setTechnicalSections(prev => ({
      ...prev,
      [editingEquipmentId]: updatedSections
    }));

    // Clear selected section if it was the deleted one
    if (selectedSection[editingEquipmentId] === sectionName) {
      setSelectedSection(prev => ({
        ...prev,
        [editingEquipmentId]: ''
      }));
    }

    try {
      // Update in database - use the already filtered sections
      // console.log('💾 Deleting section in database:', editingEquipmentId, sectionName);
      // console.log('📊 Sections to save to database:', updatedSections);

      await updateEquipment(editingEquipmentId, {
        technical_sections: updatedSections
      });
      // console.log('✅ Section deleted successfully from database');

      // Refresh equipment data to ensure consistency
      // console.log('🔄 Calling refreshEquipmentData after section deletion');
      await refreshEquipmentData();
      // console.log('✅ refreshEquipmentData completed');

      toast({
        title: "Success",
        description: "Section deleted successfully",
      });

      // console.log('✅ handleDeleteSection: Section deletion completed successfully');
    } catch (error) {
      console.error('❌ handleDeleteSection: Error deleting section:', error);
      toast({
        title: "Error",
        description: "Failed to delete section",
        variant: "destructive",
      });
    }

    // Close modal and reset state
    setIsEditSectionModalOpen(false);
    setEditingSectionName('');
    setEditingSectionOldName('');
  };

  const handleImageUpload = (file: File) => {
    setNewProgressImage(file);
  };

  // Audio recording functions
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const audioBase64 = reader.result as string;
          // Store the audio data temporarily
          setAudioChunks([audioBlob]);
          // You can add this to progress entry later
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      setMediaRecorder(recorder);
      setAudioChunks([]);
      setRecordingDuration(0);
      
      // Use timeslice to capture data more frequently (every 100ms) to avoid missing start/end
      recorder.start(100);
      setIsRecording(true);

      // Start timer - slightly offset to account for recorder initialization
      setTimeout(() => {
        const timer = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
        setRecordingTimer(timer);
      }, 50);

    } catch (error) {
      console.error('Error starting audio recording:', error);
      toast({
        title: "Recording Error",
        description: "Could not start audio recording. Please check microphone permissions.",
        variant: "destructive"
      });
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (recordingTimer) {
        clearInterval(recordingTimer);
        setRecordingTimer(null);
      }
    }
  };

  const playAudio = (audioBase64: string, entryId: string) => {
    if (playingAudioId === entryId) {
      setPlayingAudioId(null);
      return;
    }

    setPlayingAudioId(entryId);
    const audio = new Audio(audioBase64);
    audio.onended = () => setPlayingAudioId(null);
    audio.play();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Image audio recording functions
  const startImageAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        setImageAudioChunks([audioBlob]);
        stream.getTracks().forEach(track => track.stop());
      };

      setImageMediaRecorder(recorder);
      setImageAudioChunks([]);
      setImageRecordingDuration(0);
      
      // Use timeslice to capture data more frequently (every 100ms) to avoid missing start/end
      recorder.start(100);
      setIsImageRecording(true);

      // Start timer - slightly offset to account for recorder initialization
      setTimeout(() => {
        const timer = setInterval(() => {
          setImageRecordingDuration(prev => prev + 1);
        }, 1000);
        setImageRecordingTimer(timer);
      }, 50);

    } catch (error) {
      console.error('Error starting image audio recording:', error);
      toast({
        title: "Recording Error",
        description: "Could not start audio recording. Please check microphone permissions.",
        variant: "destructive"
      });
    }
  };

  const stopImageAudioRecording = () => {
    if (imageMediaRecorder && isImageRecording) {
      imageMediaRecorder.stop();
      setIsImageRecording(false);
      if (imageRecordingTimer) {
        clearInterval(imageRecordingTimer);
        setImageRecordingTimer(null);
      }
    }
  };

  const playImageAudio = (audioBase64: string) => {
    const audio = new Audio(audioBase64);
    audio.play();
  };

  const removeImageAudio = () => {
    setImageAudioChunks([]);
    setImageRecordingDuration(0);
  };

  const handleDocumentUpload = async (equipmentId: string, files: File[]) => {
    try {
      // console.log('🚀 MANUAL: Starting document upload for equipment:', equipmentId);
      // console.log('🚀 MANUAL: Files to upload:', files);

      // Get user data
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const user = userData;

      // Upload files to storage and database
      for (const file of files) {
        try {
          // console.log('🚀 MANUAL: Processing file:', file.name);
          // console.log('🚀 MANUAL: File size:', file.size, 'bytes');
          // console.log('🚀 MANUAL: File type:', file.type);

          // Upload to Supabase storage - use different paths for standalone vs project equipment
          const isStandalone = projectId === 'standalone';
          const filePath = isStandalone 
            ? `standalone-equipment/${equipmentId}/${Date.now()}_${file.name}`
            : `equipment/${equipmentId}/${Date.now()}_${file.name}`;
          const storageBucket = isStandalone ? 'standalone-equipment-documents' : 'project-documents';
          
          // console.log('🚀 MANUAL: Uploading to storage path:', filePath);
          // console.log('🚀 MANUAL: Storage bucket:', storageBucket);
          // console.log('🚀 MANUAL: Is standalone:', isStandalone);

          // Use service role for storage upload to bypass RLS
          const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtbWFvc21rZ3drYW1mamhjeGlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNzU4NywiZXhwIjoyMDcyMjAzNTg3fQ.PVg3nnfYEBnqpceBXJjnZJIc9lwjmW1G7Lo2U7t0ehk';

          const formData = new FormData();
          formData.append('file', file);

          const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/${storageBucket}/${filePath}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey
            },
            body: formData
          });

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            console.error('❌ MANUAL: Storage upload failed:', uploadResponse.status, errorText);
            throw new Error(`Storage upload failed: ${uploadResponse.status} ${errorText}`);
          }

          // console.log('🚀 MANUAL: Storage upload successful:', uploadResponse.status);

          // Get public URL
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${storageBucket}/${filePath}`;
          // console.log('🚀 MANUAL: Got public URL:', publicUrl);

          // Create document entry in database
          const documentData = {
            name: file.name,
            url: publicUrl,
            uploadedBy: user.id || 'current-user',
            size: file.size,
            mimeType: file.type,
            equipmentType: 'Manual Upload',
            equipmentTagNumber: 'Manual'
          };

          // console.log('🚀 MANUAL: Creating document entry:', documentData);
          // Use correct upload function based on equipment type
          const uploadedDoc = isStandalone 
            ? await uploadStandaloneEquipmentDocument(equipmentId, documentData)
            : await uploadEquipmentDocument(equipmentId, documentData);
          // console.log('🚀 MANUAL: Document created:', uploadedDoc);

          // Get equipment info for logging
          const currentEquipment = localEquipment.find(eq => eq.id === equipmentId);
          if (currentEquipment) {
            // Log document upload activity
            try {
              await logDocumentUploaded(
                projectId,
                equipmentId,
                currentEquipment.type || 'Equipment',
                currentEquipment.tagNumber || 'Unknown',
                documentData.equipmentType || 'Manual Upload',
                documentData.name
              );
              // console.log('✅ Activity logged: Document uploaded');
              
              // Refresh activity logs if callback provided
              if (onActivityUpdate) {
                onActivityUpdate();
              }
            } catch (logError) {
              console.error('⚠️ Error logging document activity (non-fatal):', logError);
            }
          }

          // Immediately update local state with new document
          const newDocument = {
            id: (uploadedDoc as any)?.id || (uploadedDoc as any)?.[0]?.id || Date.now().toString(),
            name: documentData.name,
            document_name: documentData.name,
            document_url: documentData.url,
            uploadedBy: documentData.uploadedBy,
            uploadDate: new Date().toISOString()
          };

          // console.log('🚀 MANUAL: Adding new document to state:', newDocument);
          setDocuments(prev => {
            const currentDocs = prev[equipmentId] || [];
            const updatedDocs = [...currentDocs, newDocument];
            // console.log('🚀 MANUAL: Updated documents array:', updatedDocs);
            return {
              ...prev,
              [equipmentId]: updatedDocs
            };
          });

          // console.log('🚀 MANUAL: Local state updated with new document');

          // Force immediate UI refresh
          setTimeout(() => {
            // console.log('🚀 MANUAL: Immediate UI refresh...');
            setDocuments(prev => ({ ...prev }));
          }, 50);

        } catch (fileError: any) {
          console.error(`❌ MANUAL: Error uploading document ${file.name}:`, fileError);
          console.error(`❌ MANUAL: Error details:`, {
            message: fileError.message,
            response: fileError.response?.data,
            status: fileError.response?.status
          });
          throw fileError;
        }
      }

      // Force reload documents from database
      try {
        // console.log('🚀 MANUAL: Force reloading documents...');
        await fetchEquipmentDocuments(equipmentId);
        // console.log('🚀 MANUAL: Documents reloaded successfully');

        // Force UI refresh multiple times
        setTimeout(() => {
          // console.log('🚀 MANUAL: Forcing UI refresh with timeout...');
          setDocuments(prev => ({ ...prev }));
          // console.log('🚀 MANUAL: UI refresh triggered');
        }, 100);

        setTimeout(() => {
          console.log('🚀 MANUAL: Second UI refresh...');
          setDocuments(prev => ({ ...prev }));
          console.log('🚀 MANUAL: Second UI refresh triggered');
        }, 500);

      } catch (reloadError) {
        console.error('❌ MANUAL: Error reloading documents:', reloadError);
      }

      toast({ title: 'Success', description: 'MANUAL: Documents uploaded successfully!' });

    } catch (error: any) {
      console.error('❌ MANUAL: Error uploading documents:', error);
      console.error('❌ MANUAL: Full error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      let errorMessage = 'Failed to upload documents. Please try again.';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({ title: 'Error', description: `MANUAL: ${errorMessage}`, variant: 'destructive' });
    }
  };

  const handleDocumentNameChange = (equipmentId: string, documentId: string, newName: string) => {
    setDocuments(prev => ({
      ...prev,
      [equipmentId]: prev[equipmentId]?.map(doc =>
        doc.id === documentId ? { ...doc, name: newName } : doc
      ) || []
    }));
  };

  const handleDeleteDocument = async (equipmentId: string, documentId: string) => {
    if (confirm('Are you sure you want to delete this document?')) {
      try {
        // Get document info before deleting for logging
        const currentEquipment = localEquipment.find(eq => eq.id === equipmentId);
        const isStandalone = projectId === 'standalone';
        
        // Use correct function based on equipment type
        const documentsResponse = isStandalone
          ? await getStandaloneEquipmentDocuments(equipmentId)
          : await getEquipmentDocuments(equipmentId);
        const documents = Array.isArray(documentsResponse) ? documentsResponse : [];
        const documentToDelete = documents.find((doc: any) => doc.id === documentId);
        
        // console.log('🗑️ Deleting document:', documentId);
        // Use correct delete function based on equipment type
        if (isStandalone) {
          await deleteStandaloneEquipmentDocument(documentId);
        } else {
        await deleteEquipmentDocument(documentId);
        }

        // Log document deletion activity
        if (currentEquipment && documentToDelete) {
          try {
            await logDocumentDeleted(
              projectId,
              equipmentId,
              currentEquipment.type || 'Equipment',
              currentEquipment.tagNumber || 'Unknown',
              documentToDelete.document_type || 'Document',
              documentToDelete.document_name || documentToDelete.name || 'Unknown'
            );
            // console.log('✅ Activity logged: Document deleted');
            
            // Refresh activity logs if callback provided
            if (onActivityUpdate) {
              onActivityUpdate();
            }
          } catch (logError) {
            console.error('⚠️ Error logging document deletion activity (non-fatal):', logError);
          }
        }

        // Reload documents from database
        await fetchEquipmentDocuments(equipmentId);

        // console.log('✅ Document deleted successfully');
        toast({ title: 'Success', description: 'Document deleted successfully!' });
      } catch (error) {
        console.error('❌ Error deleting document:', error);
        toast({ title: 'Error', description: 'Failed to delete document. Please try again.', variant: 'destructive' });
      }
    }
  };

  const handleOpenDocument = (document: any) => {
    // Handle both file objects and database documents
    if (document.file) {
      // Local file object
      setDocumentPreview(document);
    } else if (document.document_url) {
      // Database document - open in modal
      setDocumentUrlModal({
        url: document.document_url,
        name: document.document_name || document.name,
        uploadedBy: document.uploadedBy,
        uploadDate: document.uploadDate
      });
    } else {
      console.error('❌ Invalid document object:', document);
    }
  };

  const handleMiniFormSubmit = async () => {
    if (!miniFormData.equipmentName || !miniFormData.tagNumber || !miniFormData.jobNumber || !miniFormData.msnNumber) {
      toast({
        title: "Error",
        description: "Please fill all required fields (Equipment Name, Tag Number, Job Number, and MSN Number)",
        variant: "destructive"
      });
      return;
    }

    // If custom equipment is selected, check if custom name is provided
    if (miniFormData.equipmentName === 'Custom' && !miniFormData.customEquipmentName) {
      toast({
        title: "Error",
        description: "Please enter a custom equipment name",
        variant: "destructive"
      });
      return;
    }

    try {
      // Create basic equipment data from mini form
      const equipmentType = miniFormData.equipmentName === 'Custom' 
        ? miniFormData.customEquipmentName 
        : miniFormData.equipmentName;
        
      const newEquipment = {
        name: equipmentType, // Use equipment type as the name for display
        type: equipmentType,
        tagNumber: miniFormData.tagNumber,
        jobNumber: miniFormData.jobNumber,
        manufacturingSerial: miniFormData.msnNumber,
        size: miniFormData.size,
        material: miniFormData.material,
        designCode: miniFormData.designCode,
        projectId: projectId,
        status: 'design',
        priority: 'medium'
      };

      await handleAddEquipment(newEquipment);
      
      // Only reset form and show success if no error was thrown
      // (handleAddEquipment will show its own success/error toast)
      setMiniFormData({ 
        equipmentName: '', 
        customEquipmentName: '', 
        tagNumber: '', 
        jobNumber: '', 
        msnNumber: '',
        size: '',
        material: '',
        designCode: ''
      });
      setShowMiniForm(false);
      
    } catch (error: any) {
      console.error('Error adding equipment:', error);
      // handleAddEquipment already shows the error toast, but if it somehow doesn't,
      // show a fallback error message
      const errorMessage = error?.message || 'Failed to add equipment';
      if (errorMessage.includes('already exists') || errorMessage.includes('unique')) {
        toast({
          title: 'Validation Error',
          description: errorMessage,
          variant: 'destructive',
          duration: 5000
        });
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive"
        });
      }
    }
  };

  const handleAddStandaloneEquipment = async (formData: any) => {
    try {
      const { equipmentDetails, equipmentManagerContacts, ...baseFormData } = formData;
      const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtbWFvc21rZ3drYW1mamhjeGlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNzU4NywiZXhwIjoyMDcyMjAzNTg3fQ.PVg3nnfYEBnqpceBXJjnZJIc9lwjmW1G7Lo2U7t0ehk';
      const createdEquipmentIds: string[] = [];

      // Process each equipment unit from equipmentDetails
      if (equipmentDetails && Object.keys(equipmentDetails).length > 0) {
        for (const [equipmentType, equipmentUnits] of Object.entries(equipmentDetails)) {
          const units = equipmentUnits as Array<{
            id: string;
            tagNumber: string;
            jobNumber: string;
            manufacturingSerial: string;
            size: string;
            material: string;
            designCode: string;
            documents: File[];
          }>;

          for (const unit of units) {
            // Prepare equipment data with all form fields
            const equipmentData: any = {
              type: equipmentType,
              tag_number: unit.tagNumber || '',
              name: equipmentType,
              job_number: unit.jobNumber || '',
              manufacturing_serial: unit.manufacturingSerial || '',
              // Step 1: Equipment Information
              size: unit.size || baseFormData.size || '',
              material: unit.material || baseFormData.material || '',
              design_code: unit.designCode || baseFormData.designCode || '',
              // Step 2: Basic Information
              client_name: baseFormData.clientName || '',
              plant_location: baseFormData.plantLocation || '',
              po_number: baseFormData.poNumber || '',
              sales_order_date: baseFormData.salesOrderDate || '',
              completion_date: baseFormData.completionDate || '',
              client_industry: baseFormData.clientIndustry || '',
              equipment_manager: baseFormData.equipmentManager || '',
              consultant: baseFormData.consultant || '',
              tpi_agency: baseFormData.tpiAgency || '',
              client_focal_point: baseFormData.clientFocalPoint || '',
              // Step 3: Scope & Documents
              services_included: baseFormData.servicesIncluded || {},
              scope_description: baseFormData.scopeDescription || '',
              kickoff_meeting_notes: baseFormData.kickoffMeetingNotes || '',
              special_production_notes: baseFormData.specialProductionNotes || '',
              // Default values
              status: 'active',
              progress: 0,
              progress_phase: 'documentation',
              location: baseFormData.plantLocation || 'Not Assigned',
              next_milestone: 'Initial Setup',
              priority: 'medium',
              is_basic_info: false,
              progress_images: [],
              po_cdd: baseFormData.poNumber || 'To be scheduled',
              // Store additional data in custom_fields
              custom_fields: [
                { name: 'Client Name', value: baseFormData.clientName || '' },
                { name: 'Plant Location', value: baseFormData.plantLocation || '' },
                { name: 'PO Number', value: baseFormData.poNumber || '' },
                { name: 'Sales Order Date', value: baseFormData.salesOrderDate || '' },
                { name: 'Completion Date', value: baseFormData.completionDate || '' },
                { name: 'Client Industry', value: baseFormData.clientIndustry || '' },
                { name: 'Equipment Manager', value: baseFormData.equipmentManager || '' },
                { name: 'Consultant', value: baseFormData.consultant || '' },
                { name: 'TPI Agency', value: baseFormData.tpiAgency || '' },
                { name: 'Client Focal Point', value: baseFormData.clientFocalPoint || '' },
                { name: 'Scope Description', value: baseFormData.scopeDescription || '' },
                { name: 'Kickoff Meeting Notes', value: baseFormData.kickoffMeetingNotes || '' },
                { name: 'Special Production Notes', value: baseFormData.specialProductionNotes || '' }
              ]
            };

            // Remove undefined values and project-specific fields that don't exist in standalone_equipment table
            const invalidFields = ['project_manager', 'supervisor', 'welder', 'qc_inspector', 'project_id', 'firm_id'];
            Object.keys(equipmentData).forEach(key => {
              if (equipmentData[key] === undefined || invalidFields.includes(key)) {
                delete equipmentData[key];
              }
            });

            // Create the equipment
            const createdEquipmentResponse = await fastAPI.createStandaloneEquipment(equipmentData);
            const createdEquipment = Array.isArray(createdEquipmentResponse) ? createdEquipmentResponse[0] : createdEquipmentResponse;
            const equipmentId = createdEquipment?.id;
            
            if (equipmentId) {
              createdEquipmentIds.push(equipmentId);
            }

            // Upload equipment documents if any
            if (equipmentId && unit.documents && unit.documents.length > 0) {
              console.log(`📄 Uploading ${unit.documents.length} equipment document(s) for equipment: ${equipmentType} - ${unit.tagNumber}`);
              
              for (let i = 0; i < unit.documents.length; i++) {
                const file = unit.documents[i];
                try {
                  // Upload file to Supabase Storage with proper folder structure
                  // Path: standalone-equipment/{equipment_id}/{file_name}
                  const fileName = `standalone-equipment/${equipmentId}/${Date.now()}_${file.name}`;
                  
                  // Create FormData
                  const formDataUpload = new FormData();
                  formDataUpload.append('file', file);
                  
                  // Upload to standalone-equipment-documents bucket
                  const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtbWFvc21rZ3drYW1mamhjeGlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNzU4NywiZXhwIjoyMDcyMjAzNTg3fQ.PVg3nnfYEBnqpceBXJjnZJIc9lwjmW1G7Lo2U7t0ehk';
                  
                  const uploadResponse = await axios.post(
                    `${SUPABASE_URL}/storage/v1/object/standalone-equipment-documents/${fileName}`,
                    formDataUpload,
                    {
                      headers: {
                        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                        'apikey': SERVICE_ROLE_KEY,
                        'Content-Type': 'multipart/form-data'
                      }
                    }
                  );
                  
                  if (uploadResponse.status === 200) {
                    // Get public URL
                    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/standalone-equipment-documents/${fileName}`;
                    
                    // Create document record in database
                    const documentData = {
                      name: file.name,
                      url: publicUrl,
                      uploadedBy: user?.id || null,
                      size: file.size,
                      mimeType: file.type,
                      equipmentType: 'Equipment Document'
                    };
                    
                    await uploadStandaloneEquipmentDocument(equipmentId, documentData);
                    console.log(`✅ Equipment document ${i + 1} uploaded successfully: ${file.name}`);
                  } else {
                    console.error(`❌ Failed to upload equipment document ${i + 1}:`, uploadResponse.status);
                  }
                } catch (docError: any) {
                  console.error(`❌ Error uploading equipment document ${i + 1} (${file.name}):`, docError);
                  // Continue with other documents even if one fails
                }
              }
            }

          }
        }
      }

      // Upload Core Documents (Unpriced PO, Design Inputs, Client Reference, Other Documents)
      // Upload these documents to all created equipment items
      if (createdEquipmentIds.length > 0 && baseFormData) {
        // Helper function to upload a single document to a specific equipment
        const uploadCoreDocument = async (file: File, documentType: string, equipmentId: string) => {
          try {
            const fileName = `standalone-equipment/${equipmentId}/Core Documents/${documentType}/${Date.now()}_${file.name}`;
            
            const formDataUpload = new FormData();
            formDataUpload.append('file', file);
            
            const uploadResponse = await axios.post(
              `${SUPABASE_URL}/storage/v1/object/standalone-equipment-documents/${fileName}`,
              formDataUpload,
              {
                headers: {
                  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                  'apikey': SERVICE_ROLE_KEY,
                  'Content-Type': 'multipart/form-data'
                }
              }
            );
            
            if (uploadResponse.status === 200) {
              const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/standalone-equipment-documents/${fileName}`;
              
              const documentData = {
                name: file.name,
                url: publicUrl,
                uploadedBy: user?.id || null,
                size: file.size,
                mimeType: file.type,
                equipmentType: documentType
              };
              
              await uploadStandaloneEquipmentDocument(equipmentId, documentData);
              console.log(`✅ ${documentType} uploaded successfully for equipment ${equipmentId}: ${file.name}`);
              return true;
            } else {
              console.error(`❌ Failed to upload ${documentType} for equipment ${equipmentId}:`, uploadResponse.status);
              return false;
            }
          } catch (error: any) {
            console.error(`❌ Error uploading ${documentType} (${file.name}) for equipment ${equipmentId}:`, error);
            return false;
          }
        };

        // Upload core documents to all created equipment items
        for (const equipmentId of createdEquipmentIds) {
          // Upload Unpriced PO File
          if (baseFormData.unpricedPOFile) {
            await uploadCoreDocument(baseFormData.unpricedPOFile, 'Unpriced PO File', equipmentId);
          }

          // Upload Design Inputs/PID
          if (baseFormData.designInputsPID) {
            await uploadCoreDocument(baseFormData.designInputsPID, 'Design Inputs PID', equipmentId);
          }

          // Upload Client Reference Document
          if (baseFormData.clientReferenceDoc) {
            await uploadCoreDocument(baseFormData.clientReferenceDoc, 'Client Reference Doc', equipmentId);
          }

          // Upload Other Documents (multiple files)
          if (baseFormData.otherDocuments && Array.isArray(baseFormData.otherDocuments) && baseFormData.otherDocuments.length > 0) {
            for (const file of baseFormData.otherDocuments) {
              await uploadCoreDocument(file, 'Other Documents', equipmentId);
            }
          }
        }
      }

      // Add Equipment Manager to standalone_equipment_team_positions table for all created equipment
      if (baseFormData.equipmentManager && baseFormData.equipmentManager.trim() !== '' && createdEquipmentIds.length > 0) {
        try {
          // Get equipment manager contact info if available
          const equipmentManagerName = baseFormData.equipmentManager;
          
          // 🆕 Priority: Use contact details from form if available, otherwise generate email
          let equipmentManagerEmail = '';
          let equipmentManagerPhone = '';
          let equipmentManagerRole: 'editor' | 'viewer' = 'editor'; // Default to editor
          
          if (equipmentManagerContacts && equipmentManagerContacts[equipmentManagerName]) {
            // Use email and phone from form
            equipmentManagerEmail = equipmentManagerContacts[equipmentManagerName].email || '';
            equipmentManagerPhone = equipmentManagerContacts[equipmentManagerName].phone || '';
            
            // 🆕 Get role from contacts if available (should be 'project_manager' for Equipment Managers)
            // For database storage, project_manager maps to 'editor' role in standalone_equipment_team_positions
            // But we'll store it as 'editor' since the table only accepts 'editor' or 'viewer'
            // The actual role (project_manager) will be fetched from user record when displaying
            if (equipmentManagerContacts[equipmentManagerName].role === 'project_manager') {
              equipmentManagerRole = 'editor'; // Project Manager has editor-level access
            }
          }
          
          // 🆕 Try to fetch role from existing user record if email is available
          if (equipmentManagerEmail) {
            try {
              const firmId = localStorage.getItem('firmId');
              if (firmId) {
                const allMembers = await fastAPI.getAllFirmTeamMembers(firmId);
                const existingMember = allMembers.find((m: any) => 
                  m.email?.toLowerCase() === equipmentManagerEmail.toLowerCase()
                );
                if (existingMember) {
                  // If they're a project_manager, they should have editor access
                  if (existingMember.role === 'project_manager' || existingMember.access_level === 'project_manager') {
                    equipmentManagerRole = 'editor';
                  } else if (existingMember.role === 'vdcr_manager' || existingMember.access_level === 'vdcr_manager') {
                    equipmentManagerRole = 'editor';
                  } else if (existingMember.role === 'editor' || existingMember.access_level === 'editor') {
                    equipmentManagerRole = 'editor';
                  } else {
                    equipmentManagerRole = 'viewer';
                  }
                }
              }
            } catch (error) {
              console.error('Error fetching user role (non-fatal):', error);
              // Continue with default role
            }
          }
          
          // Fallback: Generate email if not provided in form
          if (!equipmentManagerEmail || equipmentManagerEmail.trim() === '') {
            equipmentManagerEmail = equipmentManagerName.includes('@') 
              ? equipmentManagerName 
              : `${equipmentManagerName.replace(/\s+/g, '.').toLowerCase()}@company.com`;
          }
          
          // Ensure email is valid
          if (!equipmentManagerEmail || !equipmentManagerEmail.includes('@')) {
            equipmentManagerEmail = `${equipmentManagerName.replace(/\s+/g, '.').toLowerCase()}@company.com`;
          }
          
          // Add equipment manager to each created equipment
          for (const equipmentId of createdEquipmentIds) {
            const teamPositionData = {
              equipment_id: equipmentId,
              position_name: 'Equipment Manager',
              person_name: equipmentManagerName,
              email: equipmentManagerEmail,
              phone: equipmentManagerPhone,
              role: equipmentManagerRole, // Use determined role (editor for project managers)
              assigned_by: user?.id || null
            };
            
            console.log('👥 Adding Equipment Manager to standalone equipment:', { equipmentId, data: teamPositionData });
            
            // Use REST API directly to avoid hanging issues with Supabase client
            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
            const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
            
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            try {
              const response = await fetch(
                `${SUPABASE_URL}/rest/v1/standalone_equipment_team_positions`,
                {
                  method: 'POST',
                  headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                  },
                  body: JSON.stringify(teamPositionData),
                  signal: controller.signal
                }
              );
              
              clearTimeout(timeoutId);
              
              if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Error creating standalone team position:', response.status, errorText);
                throw new Error(`Failed to add equipment manager: ${response.status} ${errorText}`);
              }
              
              const createdData = await response.json();
              console.log('✅ Equipment Manager added to standalone equipment team:', equipmentManagerName, createdData);
            } catch (fetchError: any) {
              clearTimeout(timeoutId);
              if (fetchError.name === 'AbortError') {
                console.error('❌ Timeout creating standalone team position (non-fatal)');
                // Don't throw - equipment was created successfully, team member addition timed out
              } else {
                console.error('❌ Error creating standalone team position (non-fatal):', fetchError);
                // Don't throw - equipment was created successfully, team member addition failed
              }
            }
            
            // 🆕 Determine actual role from user record (project_manager) vs stored role (editor)
            // The stored role in DB is 'editor' but actual role is 'project_manager'
            const actualRole = equipmentManagerContacts[equipmentManagerName]?.role === 'project_manager' 
              ? 'project_manager' 
              : equipmentManagerRole;
            
            // Try to fetch actual role from user record if email is available
            let finalRole = actualRole;
            if (equipmentManagerEmail) {
              try {
                const firmId = localStorage.getItem('firmId');
                if (firmId) {
                  const allMembers = await fastAPI.getAllFirmTeamMembers(firmId);
                  const existingMember = allMembers.find((m: any) => 
                    m.email?.toLowerCase() === equipmentManagerEmail.toLowerCase()
                  );
                  if (existingMember) {
                    finalRole = existingMember.role || existingMember.access_level || actualRole;
                  }
                }
              } catch (error) {
                console.error('Error fetching user role (non-fatal):', error);
              }
            }
            
            const transformedMember = {
              id: teamPositionData.equipment_id + '-temp', // Temporary ID, will be updated on refresh
              name: equipmentManagerName,
              email: equipmentManagerEmail,
              phone: equipmentManagerPhone,
              position: 'Equipment Manager', // Position is dynamic
              role: finalRole, // Store actual role (project_manager) for display
              permissions: getPermissionsByRole(finalRole), // Get permissions based on actual role
              status: 'active',
              avatar: equipmentManagerName.split(' ').map((n: string) => n[0]).join('').toUpperCase(),
              lastActive: 'Unknown',
              equipmentAssignments: [equipmentId],
              dataAccess: getDataAccessByRole(finalRole), // Get data access based on actual role
              accessLevel: finalRole // Store actual role as access level
            };
            
            setAllEquipmentTeamMembers(prev => ({
              ...prev,
              [equipmentId]: [...(prev[equipmentId] || []), transformedMember]
            }));
          }
          
          // Update allEquipmentTeamMembers for ALL newly created equipment (for equipment card team tab)
          // This ensures team members show up in the equipment card even if not viewing that equipment
          for (const equipmentId of createdEquipmentIds) {
            if (allEquipmentTeamMembers[equipmentId] && allEquipmentTeamMembers[equipmentId].length > 0) {
              console.log('✅ Team members already in state for equipment:', equipmentId);
            } else {
              // Fetch team members for this equipment to populate allEquipmentTeamMembers
              try {
                console.log('🔄 Fetching team members for equipment card:', equipmentId);
                const { DatabaseService } = await import('@/lib/database');
                const teamData = await DatabaseService.getStandaloneTeamPositions(equipmentId);
                
                if (teamData && teamData.length > 0) {
                  // 🆕 Fetch actual user roles from company
                  let userRolesMap: Record<string, string> = {};
                  try {
                    const firmId = localStorage.getItem('firmId');
                    if (firmId) {
                      const allMembers = await fastAPI.getAllFirmTeamMembers(firmId);
                      allMembers.forEach((m: any) => {
                        if (m.email) {
                          userRolesMap[m.email.toLowerCase()] = m.role || m.access_level || 'viewer';
                        }
                      });
                    }
                  } catch (error) {
                    console.error('Error fetching user roles (non-fatal):', error);
                  }
                  
                  const transformedMembers = (teamData as any[]).map((member, index) => {
                    // 🆕 Get actual role from user record if available
                    const memberEmail = (member.email || '').toLowerCase();
                    const actualRole = userRolesMap[memberEmail] || member.role || 'viewer';
                    
                    return {
                      id: member.id || `member-${index}`,
                      name: member.person_name || 'Unknown',
                      email: member.email || '',
                      phone: member.phone || '',
                      position: member.position_name || '', // Position is dynamic
                      role: actualRole, // Role is from user record
                      permissions: getPermissionsByRole(actualRole),
                      status: 'active',
                      avatar: (member.person_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
                      lastActive: 'Unknown',
                      equipmentAssignments: [equipmentId],
                      dataAccess: getDataAccessByRole(actualRole),
                      accessLevel: actualRole
                    };
                  });
                  
                  setAllEquipmentTeamMembers(prev => ({
                    ...prev,
                    [equipmentId]: transformedMembers
                  }));
                  console.log('✅ Team members added to allEquipmentTeamMembers for equipment:', equipmentId);
                }
              } catch (fetchError) {
                console.error('❌ Error fetching team members for equipment card (non-fatal):', fetchError);
              }
            }
          }
          
          // If we're viewing one of the newly created equipment, refresh team members for settings tab
          if (viewingEquipmentId && createdEquipmentIds.includes(viewingEquipmentId)) {
            try {
              console.log('🔄 Refreshing team members for viewed equipment (settings tab)...');
              await fetchEquipmentTeamMembers();
            } catch (fetchError) {
              console.error('❌ Error fetching team members (non-fatal):', fetchError);
              // Don't throw - this is just a refresh
            }
          }
          
          // Notify parent component to refresh Settings tab (similar to project add form)
          if (onUserAdded) {
            try {
              console.log('🔄 Calling onUserAdded callback to refresh Settings tab...');
              onUserAdded();
            } catch (callbackError) {
              console.error('❌ Error in onUserAdded callback (non-fatal):', callbackError);
              // Don't throw - this is just a refresh callback
            }
          }
        } catch (teamError: any) {
          console.error('❌ Error adding Equipment Manager to team (equipment still created):', teamError);
          // Don't throw error - equipment was created successfully, team member addition failed
        }
      }

      // Refresh equipment data - CRITICAL: Must complete to show new equipment on frontend
      // Add a small delay to ensure database transaction is committed
      console.log('⏳ Waiting 500ms for database transaction to commit...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      try {
        console.log('🔄 Refreshing equipment data to show new equipment on frontend...');
      await refreshEquipmentData();
        console.log('✅ Equipment data refreshed - new equipment should now be visible');
        
        // After equipment data is refreshed, fetch team members for all newly created equipment
        // This ensures team members show up in equipment cards and settings tab
        if (createdEquipmentIds.length > 0) {
          console.log('🔄 Fetching team members for all newly created equipment...');
          for (const equipmentId of createdEquipmentIds) {
            try {
              const { DatabaseService } = await import('@/lib/database');
              const teamData = await DatabaseService.getStandaloneTeamPositions(equipmentId);
              
              if (teamData && teamData.length > 0) {
                const transformedMembers = (teamData as any[]).map((member, index) => ({
                  id: member.id || `member-${index}`,
                  name: member.person_name || 'Unknown',
                  email: member.email || '',
                  phone: member.phone || '',
                  position: member.position_name || '',
                  role: member.role || 'viewer',
                  permissions: getPermissionsByRole(member.role || 'viewer'),
                  status: 'active',
                  avatar: (member.person_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
                  lastActive: 'Unknown',
                  equipmentAssignments: [equipmentId],
                  dataAccess: getDataAccessByRole(member.role || 'viewer'),
                  accessLevel: member.role || 'viewer'
                }));
                
                setAllEquipmentTeamMembers(prev => ({
                  ...prev,
                  [equipmentId]: transformedMembers
                }));
                console.log('✅ Team members fetched and added to state for equipment:', equipmentId);
                
                // If we're viewing this equipment, also update teamMembers for settings tab
                if (viewingEquipmentId === equipmentId) {
                  setTeamMembers(transformedMembers);
                  setTeamMembersLoading(false);
                  console.log('✅ Team members updated for settings tab');
                }
              }
            } catch (teamFetchError) {
              console.error('❌ Error fetching team members for equipment', equipmentId, '(non-fatal):', teamFetchError);
            }
          }
        }
        
        // Force a re-render by updating state again (in case React didn't detect the change)
        console.log('🔄 Forcing UI update...');
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (refreshError) {
        console.error('❌ Error refreshing equipment data:', refreshError);
        // Try one more time after a longer delay
        try {
          console.log('🔄 Retrying equipment data refresh after 2 seconds...');
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
          await refreshEquipmentData();
          console.log('✅ Equipment data refreshed on retry');
        } catch (retryError) {
          console.error('❌ Retry also failed, but equipment was created successfully:', retryError);
          console.error('⚠️ You may need to manually refresh the page to see the new equipment');
          // Don't throw - equipment was created successfully, just refresh failed
        }
      }

      // 🆕 Send email invitation to Equipment Manager (only for standalone equipment)
      if (baseFormData.equipmentManager && equipmentManagerContacts) {
        const equipmentManagerName = baseFormData.equipmentManager;
        const equipmentManagerContact = equipmentManagerContacts[equipmentManagerName];
        
        if (equipmentManagerContact && equipmentManagerContact.email && equipmentManagerContact.email.trim()) {
          try {
            const firmId = localStorage.getItem('firmId');
            const currentUserId = user?.id || localStorage.getItem('userId');
            const companyName = localStorage.getItem('companyName') || 'Your Company';
            
            // Get equipment name for email (use first created equipment or form data)
            const equipmentName = createdEquipmentIds.length > 0 
              ? `Equipment ${createdEquipmentIds[0]}` 
              : (baseFormData.equipmentType || 'Standalone Equipment');
            
            // Send email notification
            const emailResult = await sendProjectTeamEmailNotification({
              project_name: equipmentName,
              team_member_name: equipmentManagerName,
              team_member_email: equipmentManagerContact.email.trim(),
              role: 'Equipment Manager',
              company_name: companyName,
              dashboard_url: getDashboardUrl('editor'),
              equipment_name: equipmentName
            });
            
            if (emailResult.success) {
              console.log('✅ Email invitation sent to Equipment Manager');
            } else {
              console.log('⚠️ Email invitation failed:', emailResult.message);
            }
          } catch (emailError) {
            console.error('❌ Error sending email invitation (non-fatal):', emailError);
            // Don't fail the whole operation if email fails
          }
          
          // 🆕 Create invite for Equipment Manager
          try {
            await fastAPI.createInvite({
              email: equipmentManagerContact.email.trim(),
              full_name: equipmentManagerName,
              role: 'editor', // Equipment Manager gets editor role
              firm_id: firmId || '',
              project_id: null, // No project_id for standalone equipment
              invited_by: currentUserId || 'system'
            });
            console.log('✅ Invite created for Equipment Manager');
          } catch (inviteError) {
            console.error('❌ Error creating invite (equipment still created):', inviteError);
            // Don't fail the whole operation if invite creation fails
          }
        }
      }
      
      console.log('✅ All operations completed, closing form and showing success message');
      
      // Close form and show success - do this synchronously to ensure it happens
      setShowAddEquipmentForm(false);
      console.log('✅ Form closed');

      // Show success toast
      toast({ 
        title: 'Success', 
        description: 'Standalone equipment added successfully!' 
      });
      console.log('✅ Success toast shown');
      
      // Function completed successfully
      return;
    } catch (error: any) {
      console.error('❌ Error creating standalone equipment:', error);
      console.error('❌ Error stack:', error?.stack);
      const errorMessage = error?.message || 'Failed to add equipment. Please try again.';
      
      // Close form even on error
      setShowAddEquipmentForm(false);
      
      if (errorMessage.includes('already exists') || errorMessage.includes('unique') || errorMessage.includes('Cannot create')) {
        toast({ 
          title: 'Validation Error', 
          description: errorMessage,
          variant: 'destructive',
          duration: 5000
        });
      } else {
        toast({ 
          title: 'Error', 
          description: errorMessage,
          variant: 'destructive' 
        });
      }
      
      // Re-throw error so form can catch it and stop "Creating..." state
      throw error;
    }
  };

  const handleAddEquipment = async (newEquipment: any) => {
    // console.log('New equipment added:', newEquipment);

    try {
      // Note: Global uniqueness check is now handled in the API (fastAPI.createEquipment)
      // This ensures uniqueness across ALL projects, not just current project

      // Map field names - AddEquipmentForm uses serialNumber, mini form uses manufacturingSerial
      const tagNumber = newEquipment.tagNumber || '';
      const jobNumber = newEquipment.jobNumber || '';
      const manufacturingSerial = newEquipment.manufacturingSerial || newEquipment.serialNumber || '';

      // Check if this is standalone equipment
      const isStandalone = projectId === 'standalone';

      // Prepare equipment data for API call with proper field mapping
      const equipmentData: any = {
        type: newEquipment.type,
        tag_number: tagNumber,
        name: newEquipment.name,
        job_number: jobNumber,
        manufacturing_serial: manufacturingSerial,
        po_cdd: 'To be scheduled',
        // Standalone equipment should be 'active' when created, project equipment should be 'pending'
        status: isStandalone ? 'active' : 'pending',
        progress: 0,
        progress_phase: 'documentation',
        location: 'Not Assigned',
        supervisor: '',
        next_milestone: 'Initial Setup',
        priority: newEquipment.priority || 'medium',
        is_basic_info: true,
        welder: '',
        qc_inspector: '',
        project_manager: '',
        // Initialize progress images as empty array
        progress_images: [],
        // Technical specifications - store in dedicated columns
        size: newEquipment.size || '',
        material: newEquipment.material || '',
        design_code: newEquipment.designCode || '',
        // Store other technical specifications in custom_fields JSONB
        custom_fields: [
          { name: 'Dimensions', value: newEquipment.dimensions || '' },
          { name: 'Weight', value: newEquipment.weight || '' },
          { name: 'Pressure', value: newEquipment.pressure || '' },
          { name: 'Temperature', value: newEquipment.temperature || '' },
          { name: 'Capacity', value: newEquipment.capacity || '' },
          { name: 'Manufacturer', value: newEquipment.manufacturer || '' },
          { name: 'Model Number', value: newEquipment.modelNumber || '' },
          { name: 'Country of Origin', value: newEquipment.countryOfOrigin || '' }
        ]
      };

      // Only add project_id for non-standalone equipment
      if (!isStandalone) {
        equipmentData.project_id = projectId;
      }

      // Remove undefined values
      Object.keys(equipmentData).forEach(key => {
        if (equipmentData[key] === undefined) {
          delete equipmentData[key];
        }
      });

      // console.log('🔧 Creating equipment with data:', equipmentData);
      // console.log('🔍 Unique identifiers being validated:', {
      //   tag_number: tagNumber,
      //   job_number: jobNumber,
      //   manufacturing_serial: manufacturingSerial
      // });

      // Call appropriate API based on equipment type
      // Standalone equipment uses createStandaloneEquipment, project equipment uses createEquipment
      const createdEquipment = isStandalone 
        ? await fastAPI.createStandaloneEquipment(equipmentData)
        : await fastAPI.createEquipment(equipmentData);
      // console.log('✅ Equipment created successfully:', createdEquipment);

      // Refresh equipment data from database to ensure consistency
      await refreshEquipmentData();

      setShowAddEquipmentForm(false);

      toast({ title: 'Success', description: `${newEquipment.type} ${newEquipment.tagNumber} added successfully!` });

    } catch (error: any) {
      console.error('❌ Error creating equipment:', error);
      
      // Don't close the form if there's an error - let user correct it
      // setShowAddEquipmentForm(false); // Removed - keep form open on error
      
      // Handle uniqueness validation errors with clear messages
      const errorMessage = error?.message || 'Failed to add equipment. Please try again.';
      
      if (errorMessage.includes('already exists') || errorMessage.includes('unique') || errorMessage.includes('Cannot create')) {
        toast({ 
          title: 'Validation Error', 
          description: errorMessage,
          variant: 'destructive',
          duration: 5000
        });
      } else {
        toast({ 
          title: 'Error', 
          description: errorMessage,
          variant: 'destructive' 
        });
      }
      
      // Re-throw error so calling function knows it failed
      throw error;
    }
  };

  const totalEquipment = localEquipment.length;

  // Categorize equipment based on completion level
  // Categorize equipment based on completion level (memoized to prevent infinite loops)
  const equipmentCategories = useMemo(() => {
    return localEquipment.map(equipment => {
      // Check if equipment has substantial data beyond basic info
      const hasPO = equipment.poCdd && equipment.poCdd !== 'To be scheduled';
      const hasTechnical = equipment.size || equipment.weight || equipment.designCode || equipment.material || equipment.workingPressure || equipment.designTemp;
      const hasTeam = equipment.supervisor || equipment.welder || equipment.qcInspector || equipment.projectManager;
      const hasProgress = equipment.images && equipment.images.length > 0;
      const hasDocuments = equipment.documents && equipment.documents.length > 0;

      // Complete: Has PO-CDD, technical specs, team assignments, and progress
      if (hasPO && hasTechnical && hasTeam && (hasProgress || hasDocuments)) {
        return 'complete';
      }

      // Partial: Has some data but not complete
      if (hasPO || hasTechnical || hasTeam || hasProgress || hasDocuments) {
        return 'partial';
      }

      // Basic: Only basic identification info
      return 'basic';
    });
  }, [localEquipment]);

  // Memoize equipment counts to avoid recalculating on every render
  const { completeEquipment, partialEquipment, basicInfoEquipment } = useMemo(() => ({
    completeEquipment: equipmentCategories.filter(cat => cat === 'complete').length,
    partialEquipment: equipmentCategories.filter(cat => cat === 'partial').length,
    basicInfoEquipment: equipmentCategories.filter(cat => cat === 'basic').length
  }), [equipmentCategories]);

  // Get the equipment being viewed
  const viewingEquipment = viewingEquipmentId ? localEquipment.find(eq => eq.id === viewingEquipmentId) : null;


  // Export equipment logs to Excel
  const exportEquipmentLogsToExcel = () => {
    const entries = equipmentProgressEntries || [];
    const equipmentData = entries.map((entry: any, index: number) => {
      const formatDate = (dateString: string) => {
        if (!dateString) return 'Unknown';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
      };

      const getTimeAgo = (dateString: string) => {
        if (!dateString) return 'Unknown';
        const days = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
        if (days === 0) return 'Today';
        if (days === 1) return '1 day ago';
        return `${days} days ago`;
      };

      return {
        'Activity Type': entry.activity_type || 'Activity',
        'Equipment': entry.metadata?.tagNumber || entry.metadata?.tag_number || 'Unknown',
        'Description': entry.action_description || '',
        'Updated': formatDate(entry.created_at),
        'Time Ago': getTimeAgo(entry.created_at),
        'Updated By': entry.created_by_user?.full_name || entry.created_by || 'Unknown User'
      };
    });

    // Convert to CSV
    const headers = Object.keys(equipmentData[0] || {});
    const csvContent = [
      headers.join(','),
      ...equipmentData.map((row: any) => headers.map(header => `"${String(row[header] || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Equipment_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Team member management functions
  const handleCloseAddMember = () => {
    setShowAddMember(false);
    setNewMember({ name: "", email: "", phone: "", position: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
    setSelectedExistingMemberEmail("");
    setIsExistingMemberMode(false);
  };

  const handleExistingMemberSelect = (email: string) => {
    if (email === "" || email === "new") {
      setIsExistingMemberMode(false);
      setSelectedExistingMemberEmail("");
      setNewMember({
        name: "",
        email: "",
        phone: "",
        position: "",
        role: "",
        permissions: [],
        equipmentAssignments: [],
        dataAccess: [],
        accessLevel: "viewer"
      });
    } else {
      const member = existingFirmMembers.find(m => m.email === email);
      if (member) {
        setIsExistingMemberMode(true);
        setSelectedExistingMemberEmail(email);
        const roleObj = roles.find(r => r.name === (member.role || member.access_level || 'viewer'));
        setNewMember({
          name: member.name || "",
          email: member.email || "",
          phone: member.phone || "",
          position: "",
          role: mapRoleToDisplay(member.role || member.access_level || 'viewer'),
          permissions: roleObj ? roleObj.permissions : getPermissionsByRole(member.role || 'viewer'),
          equipmentAssignments: [viewingEquipmentId || ""].filter(Boolean),
          dataAccess: member.data_access || [],
          accessLevel: member.access_level || 'viewer'
        });
      }
    }
  };

  const addTeamMember = async () => {
    console.log('addTeamMember called', { 
      newMember, 
      viewingEquipmentId,
      allFieldsValid: !!(newMember.name && newMember.email && newMember.position && newMember.role && viewingEquipmentId)
    });
    
    if (!newMember.name || !newMember.email || !newMember.position || !newMember.role || !viewingEquipmentId) {
      console.error('Missing required fields:', {
        name: !!newMember.name,
        email: !!newMember.email,
        position: !!newMember.position,
        role: !!newMember.role,
        viewingEquipmentId: !!viewingEquipmentId
      });
      toast({ 
        title: 'Validation Error', 
        description: 'Please fill in all required fields.', 
        variant: 'destructive' 
      });
      return;
    }
    
    try {
        const role = roles.find(r => r.name === newMember.role);
        
        const roleMapping: Record<string, string> = {
          'Project Manager': 'project_manager', 
          'VDCR Manager': 'vdcr_manager', 
          'Editor': 'editor',
          'Viewer': 'viewer'
        };
        
        // 🆕 Check if this is an existing team member - preserve their role from user record
        let dbRole = roleMapping[newMember.role] || 'viewer';
        let actualUserRole = dbRole;
        
        try {
          const firmId = localStorage.getItem('firmId');
          if (firmId && newMember.email) {
            const allMembers = await fastAPI.getAllFirmTeamMembers(firmId);
            const existingMember = allMembers.find((m: any) => 
              m.email?.toLowerCase() === newMember.email.toLowerCase()
            );
            
            if (existingMember) {
              // 🆕 Preserve existing user's role from their user record
              actualUserRole = existingMember.role || existingMember.access_level || dbRole;
              console.log('✅ Found existing member, preserving role:', actualUserRole);
            }
          }
        } catch (error) {
          console.error('Error checking existing member (non-fatal):', error);
          // Continue with selected role
        }
        
        // For standalone equipment, we'll create equipment team members
        // This assumes there's an equipment_members table or we use team_positions
        const memberData = {
          equipment_id: viewingEquipmentId,
          name: newMember.name,
          email: newMember.email,
          phone: newMember.phone || "",
          position: newMember.position,
          role: actualUserRole, // Use actual role from user record
          status: "active",
          permissions: getPermissionsByRole(actualUserRole), // Get permissions based on actual role
          equipment_assignments: [viewingEquipmentId],
          data_access: getDataAccessByRole(actualUserRole), // Get data access based on actual role
          access_level: actualUserRole, // Use actual role
          avatar: newMember.name.split(' ').map(n => n[0]).join('').toUpperCase(),
          last_active: new Date().toISOString()
        };

        // 🚨 ONLY FOR STANDALONE EQUIPMENT - Do not touch project equipment!
        if (projectId === 'standalone') {
        // For standalone equipment, use standalone_equipment_team_positions table
          // 🆕 Map actual role to database role (table only accepts 'editor' or 'viewer')
          // But we'll store the actual role info separately if needed
          const dbStoredRole: 'editor' | 'viewer' = 
            (actualUserRole === 'project_manager' || actualUserRole === 'vdcr_manager' || actualUserRole === 'editor') 
              ? 'editor' 
              : 'viewer';
          
        const teamPositionData = {
          equipment_id: viewingEquipmentId,
            position_name: newMember.position, // Dynamic position (Equipment Manager, Supervisor, etc.)
          person_name: newMember.name,
          email: newMember.email,
          phone: newMember.phone || "",
            role: dbStoredRole // Store as editor/viewer for DB, but actual role is in user record
        };

        console.log('📤 Creating standalone team position with data:', teamPositionData);
          console.log('🔍 Equipment ID being used:', viewingEquipmentId);
          console.log('🔍 Equipment ID type:', typeof viewingEquipmentId);
        const result = await fastAPI.createStandaloneTeamPosition(teamPositionData);
        console.log('✅ Team position created successfully:', result);
        } else {
          // For project equipment, use the existing project team member logic (DO NOT MODIFY)
          // This section should remain untouched for projects
          console.log('⏭️ Skipping standalone team position creation - this is project equipment');
        }
        
        // 🆕 Send email invitation to the new team member (only for standalone equipment)
        if (projectId === 'standalone' && newMember.email && newMember.email.trim()) {
          // Get company name and IDs from localStorage or user data
          const firmId = localStorage.getItem('firmId');
          const currentUserId = user?.id || localStorage.getItem('userId');
          const companyName = localStorage.getItem('companyName') || 'Your Company';
          
          // Get equipment name for email
          const equipmentName = viewingEquipment?.name || viewingEquipment?.type || 'Standalone Equipment';
          
          // 🆕 Create invite for the new team member FIRST (before sending email)
          try {
            console.log('📧 Creating invite for standalone equipment team member...');
            await fastAPI.createInvite({
              email: newMember.email.trim(),
              full_name: newMember.name,
              role: dbRole,
              firm_id: firmId || '',
              project_id: null, // No project_id for standalone equipment
              invited_by: currentUserId || 'system'
            });
            console.log('✅ Invite created for standalone equipment team member');
          } catch (inviteError) {
            console.error('❌ Error creating invite (member still created):', inviteError);
            // Don't fail the whole operation if invite creation fails
          }
          
          // Send email notification AFTER invite is created
          try {
            console.log('📧 Sending email invitation to:', newMember.email.trim());
            const emailResult = await sendProjectTeamEmailNotification({
              project_name: equipmentName,
              team_member_name: newMember.name,
              team_member_email: newMember.email.trim(),
              role: newMember.role || dbRole,
              company_name: companyName,
              dashboard_url: getDashboardUrl(dbRole),
              equipment_name: equipmentName
            });
            
            if (emailResult.success) {
              console.log('✅ Email invitation sent successfully');
            } else {
              console.log('⚠️ Email invitation failed:', emailResult.message);
            }
          } catch (emailError) {
            console.error('❌ Error sending email invitation (non-fatal):', emailError);
            // Don't fail the whole operation if email fails
          }
        }
        
        // Small delay to ensure database is updated
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Log activity (only for standalone equipment)
        if (projectId === 'standalone' && viewingEquipmentId && viewingEquipment) {
          try {
            await logTeamMemberAdded(
              null, // No project_id for standalone
              viewingEquipmentId, // equipmentId as string, not array
              viewingEquipment.type || 'Equipment', // equipmentType
              viewingEquipment.tagNumber || 'Unknown', // tagNumber
              newMember.name, // memberName
              newMember.position || newMember.role || 'viewer' // role
            );
            console.log('✅ Activity logged successfully');
          } catch (logError) {
            console.error('⚠️ Error logging activity (non-fatal):', logError);
            // Don't fail the whole operation if logging fails
          }
        }

        // Only refresh team members for standalone equipment
        if (projectId === 'standalone') {
        console.log('🔄 Refreshing team members list...');
        await fetchEquipmentTeamMembers();
        console.log('✅ Team members list refreshed');
        }
        
        // Double-check: fetch again after a short delay to ensure we have the latest data
        setTimeout(async () => {
          console.log('🔄 Second refresh of team members list...');
          await fetchEquipmentTeamMembers();
        }, 1000);
        
        if (onActivityUpdate) {
          onActivityUpdate();
        }
        
        setNewMember({ name: "", email: "", phone: "", position: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
        setShowAddMember(false);
        setSelectedExistingMemberEmail("");
        setIsExistingMemberMode(false);
        
        console.log('✅ Showing success toast');
        toast({ title: 'Success', description: 'Team member added successfully!' });
      } catch (error: any) {
        console.error('❌ Error adding team member:', error);
        console.error('❌ Error details:', {
          message: error?.message,
          response: error?.response?.data,
          status: error?.response?.status,
          stack: error?.stack
        });
        toast({ 
          title: 'Error', 
          description: error?.response?.data?.message || error?.message || 'Error adding team member. Please try again.', 
          variant: 'destructive' 
        });
      }
  };

  const editTeamMember = (member: any) => {
    setSelectedMember(member);
    
    const roleDisplayMapping: Record<string, string> = {
      'project_manager': 'Project Manager',
      'vdcr_manager': 'VDCR Manager', 
      'editor': 'Editor',
      'viewer': 'Viewer'
    };
    
    const displayRole = roleDisplayMapping[member.role] || 'Viewer';
    
    setNewMember({
      name: member.name || "",
      email: member.email || "",
      phone: member.phone || "",
      position: member.position || "",
      role: displayRole,
      permissions: member.permissions || [],
      equipmentAssignments: member.equipmentAssignments || member.equipment_assignments || [viewingEquipmentId || ""].filter(Boolean),
      dataAccess: member.dataAccess || member.data_access || [],
      accessLevel: member.accessLevel || member.access_level || "viewer"
    });
    
    setShowEditMember(true);
  };

  const updateTeamMember = async () => {
    console.log('🔄 updateTeamMember called', { 
      selectedMember: selectedMember?.id, 
      newMember: { name: newMember.name, email: newMember.email, role: newMember.role },
      viewingEquipmentId,
      projectId
    });
    
    if (!selectedMember) {
      console.error('❌ No selected member');
      toast({ title: 'Error', description: 'No member selected for editing.', variant: 'destructive' });
      return;
    }
    
    if (!newMember.name || !newMember.email || !newMember.role) {
      console.error('❌ Missing required fields:', { name: !!newMember.name, email: !!newMember.email, role: !!newMember.role });
      toast({ title: 'Error', description: 'Please fill in all required fields.', variant: 'destructive' });
      return;
    }
    
    if (!viewingEquipmentId) {
      console.error('❌ No viewing equipment ID');
      toast({ title: 'Error', description: 'Equipment ID is missing.', variant: 'destructive' });
      return;
    }
    
      try {
        const role = roles.find(r => r.name === newMember.role);
        
        const roleMapping: Record<string, string> = {
          'Project Manager': 'project_manager',
          'VDCR Manager': 'vdcr_manager', 
          'Editor': 'editor',
          'Viewer': 'viewer'
        };
        
        const dbRole = roleMapping[newMember.role] || 'viewer';
      console.log('🔍 Role mapping:', { displayRole: newMember.role, dbRole });
      
      // For standalone equipment, update standalone_equipment_team_positions table
      if (projectId === 'standalone' && selectedMember.id) {
        const equipmentRole: 'editor' | 'viewer' = (dbRole === 'project_manager' || dbRole === 'vdcr_manager' || dbRole === 'editor') ? 'editor' : 'viewer';
        const teamPositionData = {
          position_name: newMember.position,
          person_name: newMember.name,
          email: newMember.email,
          phone: newMember.phone || "",
          role: equipmentRole,
          updated_at: new Date().toISOString()
        };
        
        console.log('📤 Updating standalone team position:', { id: selectedMember.id, data: teamPositionData });
        
        // Use REST API directly to avoid hanging issues
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/standalone_equipment_team_positions?id=eq.${selectedMember.id}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(teamPositionData)
          }
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Error updating standalone team position:', response.status, errorText);
          throw new Error(`Failed to update team member: ${response.status} ${errorText}`);
        }
        
        const updatedData = await response.json();
        console.log('✅ Standalone team position updated successfully:', updatedData);
        console.log('✅ Updated data type:', Array.isArray(updatedData) ? 'array' : typeof updatedData);
        console.log('✅ Updated data length:', Array.isArray(updatedData) ? updatedData.length : 'N/A');
      } else {
        // For project equipment, use the existing update logic
        const memberData = {
          name: newMember.name,
          email: newMember.email,
          phone: newMember.phone || "",
          position: newMember.position || "",
          role: dbRole,
          permissions: role ? role.permissions : selectedMember.permissions,
          equipment_assignments: newMember.equipmentAssignments || [viewingEquipmentId].filter(Boolean),
          data_access: newMember.dataAccess || selectedMember.dataAccess || [],
          access_level: newMember.accessLevel || selectedMember.accessLevel || "viewer",
          avatar: newMember.name.split(' ').map(n => n[0]).join('').toUpperCase(),
          updated_at: new Date().toISOString()
        };

        // Update in project_members table (existing logic)
        await fastAPI.updateProjectMember(selectedMember.id, memberData);
      }
      
      console.log('🔄 Refreshing team members list after update...');
        await fetchEquipmentTeamMembers();
      console.log('✅ Team members list refreshed');
        
      console.log('🔄 Closing edit modal and resetting form...');
        setShowEditMember(false);
        setSelectedMember(null);
        setNewMember({ name: "", email: "", phone: "", position: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
        
      console.log('✅ Showing success toast');
        toast({ title: 'Success', description: 'Team member updated successfully!' });
      } catch (error) {
      console.error('❌ Error updating team member:', error);
        toast({ title: 'Error', description: 'Error updating team member. Please try again.', variant: 'destructive' });
    }
  };

  const removeTeamMember = async (memberId: string) => {
    if (window.confirm("Are you sure you want to remove this team member?")) {
      try {
        console.log('🗑️ Removing team member:', memberId);
        
        // For standalone equipment, delete from standalone_equipment_team_positions table
        if (projectId === 'standalone' && memberId) {
          console.log('🗑️ Deleting from standalone_equipment_team_positions table');
          
          // Use REST API directly to avoid hanging issues with Supabase client
          const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
          const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
          
          // Add timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          try {
            const response = await fetch(
              `${SUPABASE_URL}/rest/v1/standalone_equipment_team_positions?id=eq.${memberId}`,
              {
                method: 'DELETE',
                headers: {
                  'apikey': SUPABASE_ANON_KEY,
                  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=representation'
                },
                signal: controller.signal
              }
            );
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error('❌ Error deleting standalone team position:', response.status, errorText);
              throw new Error(`Failed to remove team member: ${response.status} ${errorText}`);
            }
            
            const deletedData = await response.json();
            console.log('✅ Team member removed successfully:', deletedData);
          } catch (fetchError: any) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
              console.error('❌ Timeout removing team member');
              throw new Error('Request timed out. Please try again.');
            }
            throw fetchError;
          }
        } else if (memberId) {
          // For project equipment, use the existing delete logic
          console.log('🗑️ Deleting from project_members table');
          await fastAPI.deleteProjectMember(memberId);
        }
        
        console.log('🔄 Refreshing team members list...');
        await fetchEquipmentTeamMembers();
        console.log('✅ Team members list refreshed');
        
        toast({ title: 'Success', description: 'Team member removed successfully!' });
      } catch (error: any) {
        console.error('❌ Error removing team member:', error);
        const errorMessage = error?.message || 'Error removing team member. Please try again.';
        toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
      }
    }
  };

  // If viewing equipment details (standalone only), show details view
  if (viewingEquipmentId && viewingEquipment && projectId === 'standalone') {
  return (
    <>
      <div className="min-h-screen bg-gray-50 py-2 sm:py-8">
        <div className="container mx-auto px-1">
          {/* Header with Back Button */}
          <div className="mb-4 sm:mb-6">
            <Button
              onClick={() => setViewingEquipmentId(null)}
              variant="outline"
              className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-semibold text-gray-700 hover:text-white hover:bg-gradient-to-r hover:from-blue-500 hover:to-blue-600 border-2 border-gray-300 hover:border-blue-600 transition-all duration-300 rounded-xl shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              <ArrowLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
              Back to Equipment
            </Button>
          </div>

          {/* Main Overview Card - Common for All Tabs */}
          <div className="mb-4 sm:mb-6 bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 rounded-2xl p-4 sm:p-6 lg:p-8 border border-purple-100 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
                <Wrench size={20} className="text-white sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl sm:text-2xl lg:text-4xl font-bold bg-gradient-to-r from-purple-600 to-purple-600 bg-clip-text text-transparent mb-1 sm:mb-2 break-words">
                  Standalone Equipment Details
                </h1>
                <p className="text-sm sm:text-base lg:text-xl text-gray-600 font-medium break-words">
                  {viewingEquipment.type || viewingEquipment.name || 'Equipment'} - Equipment Management & Tracking
                </p>
              </div>
            </div>
            
            {/* Quick Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
              <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-purple-600 mb-1">Equipment Status</p>
                    <div className="flex items-center gap-2">
                      <div className="text-lg sm:text-xl lg:text-2xl font-bold text-purple-800 capitalize truncate">{viewingEquipment.status || 'Active'}</div>
                    </div>
                  </div>
                  <Target size={20} className="text-purple-500 flex-shrink-0 sm:w-6 sm:h-6" />
                </div>
              </div>
              
              <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-green-600 mb-1">Progress Phase</p>
                    <div className="text-lg sm:text-xl lg:text-2xl font-bold text-green-800 capitalize">
                      {viewingEquipment.progressPhase || 'Not Started'}
                    </div>
                  </div>
                  <BarChart3 size={20} className="text-green-500 flex-shrink-0 sm:w-6 sm:h-6" />
                </div>
              </div>
              
              <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-blue-600 mb-1">Tag Number</p>
                    <div className="text-lg sm:text-xl lg:text-2xl font-bold text-blue-800 truncate">{viewingEquipment.tagNumber || 'N/A'}</div>
                  </div>
                  <FileText size={20} className="text-blue-500 flex-shrink-0 sm:w-6 sm:h-6" />
                </div>
              </div>
              
              <div className="bg-white/70 backdrop-blur-sm rounded-xl p-3 sm:p-4 border border-white/50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-orange-600 mb-1">Location</p>
                    <div className="text-lg sm:text-xl lg:text-2xl font-bold text-orange-800 truncate">{viewingEquipment.location || 'TBD'}</div>
                  </div>
                  <MapPin size={20} className="text-orange-500 flex-shrink-0 sm:w-6 sm:h-6" />
                </div>
              </div>
            </div>
          </div>

          {/* Unified Tabbed Interface */}
          <Tabs value={equipmentDetailsTab} onValueChange={setEquipmentDetailsTab} className="w-full">
            <div className="overflow-x-auto overflow-y-hidden xl:overflow-x-visible xl:overflow-y-visible mb-16 scroll-smooth p-1">
              <TabsList className="flex xl:grid min-w-max xl:w-full bg-transparent rounded-2xl p-2 xl:grid-cols-3 gap-2 flex-nowrap">
                <TabsTrigger 
                  value="equipment-details" 
                  className="flex items-center gap-3 px-4 py-4 text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-blue-600 data-[state=active]:hover:to-blue-700 flex-shrink-0"
                >
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center data-[state=active]:bg-white/20 data-[state=active]:text-white">
                    <Building size={20} className="text-blue-600 data-[state=active]:text-white" />
                  </div>
                  <span>Equipment Details</span>
                </TabsTrigger>
                
                <TabsTrigger 
                  value="equipment-logs" 
                  className="flex items-center gap-3 px-4 py-4 text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-purple-600 data-[state=active]:hover:to-purple-700 flex-shrink-0"
                >
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center data-[state=active]:bg-white/20 data-[state=active]:text-white">
                    <FileText size={20} className="text-purple-600 data-[state=active]:text-white" />
                  </div>
                  <span>Equipment Logs</span>
                </TabsTrigger>

                <TabsTrigger 
                  value="settings" 
                  className="flex items-center gap-3 px-4 py-4 text-sm font-semibold bg-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-gray-500 data-[state=active]:to-gray-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:scale-105 transition-all duration-300 rounded-xl hover:bg-gray-200 data-[state=active]:hover:from-gray-600 data-[state=active]:hover:to-gray-700 flex-shrink-0"
                >
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center data-[state=active]:bg-white/20 data-[state=active]:text-white">
                    <Settings size={20} className="text-gray-600 data-[state=active]:text-white" />
                  </div>
                  <span>Settings</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Equipment Details Tab */}
            <TabsContent value="equipment-details" className="space-y-6 mt-8">
              <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-50 to-blue-100 px-6 py-4 border-b border-blue-200">
                  <h2 className="text-xl font-semibold text-blue-800 flex items-center gap-2">
                    <Building size={24} className="text-blue-600" />
                    Equipment Information
                  </h2>
                  <p className="text-blue-600 text-sm mt-1">View and manage equipment details</p>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                    {/* Left Column - Basic Information */}
                    <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Basic Information</h4>
                      <div className="space-y-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Equipment Type</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.type || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Tag Number</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.tagNumber || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Job Number</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.jobNumber || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">MSN Number</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.manufacturingSerial || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Location</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.location || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Consultant</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.consultant || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Consultant')?.value) || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">TPI Agency</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.tpiAgency || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'TPI Agency')?.value) || 'Not specified'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Column - Technical Specifications */}
                    <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Technical Specifications</h4>
                      <div className="space-y-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Size</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.size || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Material</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.material || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Design Code</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.designCode || 'Not specified'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Client & Project Information */}
                  <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                    {/* Left Column - Client Information */}
                    <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Client Information</h4>
                      <div className="space-y-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Client Name</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.clientName || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Client Name')?.value) || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Client Industry</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.clientIndustry || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Client Industry')?.value) || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Client Focal Point</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.clientFocalPoint || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Client Focal Point')?.value) || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Plant Location</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.plantLocation || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Plant Location')?.value) || viewingEquipment.location || 'Not specified'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Column - Project Details */}
                    <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Project Details</h4>
                      <div className="space-y-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">PO Number</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.poNumber || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'PO Number')?.value) || viewingEquipment.poCdd || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Sales Order Date</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">
                            {(() => {
                              const salesOrderDate = viewingEquipment.salesOrderDate || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Sales Order Date')?.value) || '';
                              if (!salesOrderDate || salesOrderDate === 'Not specified') return 'Not specified';
                              // Remove time portion if present (format: YYYY-MM-DDTHH:mm:ss...)
                              return salesOrderDate.split('T')[0];
                            })()}
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Completion Date</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">
                            {(() => {
                              const completionDate = viewingEquipment.completionDate || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Completion Date')?.value) || '';
                              if (!completionDate || completionDate === 'Not specified') return 'Not specified';
                              // Remove time portion if present (format: YYYY-MM-DDTHH:mm:ss...)
                              return completionDate.split('T')[0];
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Team & Management */}
                  <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                    {/* Left Column - Team Members */}
                    <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Team Members</h4>
                      <div className="space-y-0">
                        {(() => {
                          // Get team members from state (for standalone equipment) or fallback to equipment data
                          let displayMembers: any[] = [];
                          if (projectId === 'standalone' && viewingEquipmentId) {
                            // Use teamMembers state if available, otherwise use allEquipmentTeamMembers cache
                            displayMembers = teamMembers.length > 0 
                              ? teamMembers 
                              : (allEquipmentTeamMembers[viewingEquipmentId] || []);
                          } else {
                            // For project equipment, show Equipment Manager from equipment data
                            const equipmentManager = viewingEquipment.equipmentManager || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Equipment Manager')?.value);
                            if (equipmentManager) {
                              displayMembers = [{ position: 'Equipment Manager', name: equipmentManager }];
                            }
                          }
                          
                          // If no team members found, show fallback
                          if (displayMembers.length === 0) {
                            const fallbackManager = viewingEquipment.equipmentManager || (viewingEquipment.custom_fields?.find((f: any) => f.name === 'Equipment Manager')?.value);
                            return (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Equipment Manager</span>
                                <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{fallbackManager || 'Not specified'}</span>
                        </div>
                            );
                          }
                          
                          // Display all team members
                          return displayMembers.map((member, index) => (
                            <div key={member.id || index} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 ${index < displayMembers.length - 1 ? 'border-b border-gray-100' : ''}`}>
                              <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">{member.position || member.position_name || 'Team Member'}</span>
                              <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{member.name || member.person_name || 'Not specified'}</span>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>

                    {/* Right Column - Status & Progress */}
                    <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                      <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Status & Progress</h4>
                      <div className="space-y-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Status</span>
                          <Badge className={`w-fit ${
                            viewingEquipment.status === 'on-track' ? 'bg-green-100 text-green-800 border-green-200' :
                            viewingEquipment.status === 'delayed' ? 'bg-red-100 text-red-800 border-red-200' :
                            viewingEquipment.status === 'completed' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                            'bg-gray-100 text-gray-800 border-gray-200'
                          }`}>
                            {viewingEquipment.status || 'Not specified'}
                          </Badge>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Progress Phase</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.progressPhase || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3 border-b border-gray-100">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">Next Milestone</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.nextMilestone || 'Not specified'}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2 sm:py-3">
                          <span className="text-xs sm:text-sm font-medium text-gray-600 mb-1 sm:mb-0">PO-CDD</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-800 break-words">{viewingEquipment.poCdd || 'Not specified'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Scope of Work */}
                  <div className="mt-6 bg-gray-50 rounded-lg p-4 sm:p-6 border-0 shadow-sm">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4 sm:mb-6 flex items-center">
                      <Target size={18} className="sm:w-5 sm:h-5 mr-2 text-indigo-600" />
                      Equipment Specifications
                    </h3>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                      {/* Left Column - Services Included */}
                      <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                        <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Services Included</h4>
                        <div className="space-y-0">
                          {(() => {
                            const services = viewingEquipment.servicesIncluded || {};
                            const serviceList = typeof services === 'object' && !Array.isArray(services) 
                              ? Object.entries(services).filter(([_, included]: [string, any]) => included).map(([service]) => service)
                              : Array.isArray(services) ? services : [];
                            
                            return serviceList.length > 0 ? (
                              serviceList.map((service: string, index: number) => (
                                <div key={index} className="flex items-center py-2 sm:py-3 border-b border-gray-100 last:border-b-0">
                                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full mr-2 sm:mr-3"></div>
                                  <span className="text-xs sm:text-sm text-gray-700 capitalize">{service}</span>
                                </div>
                              ))
                            ) : (
                              <p className="text-gray-500 text-xs sm:text-sm">No services specified</p>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Right Column - Scope Description */}
                      <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                        <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Scope Description</h4>
                        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border">
                          <p className="text-xs sm:text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                            {viewingEquipment.scopeDescription || viewingEquipment.custom_fields?.find((f: any) => f.name === 'Scope Description')?.value || 'No scope description provided. Please add detailed scope information for this equipment.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Documents Uploaded */}
                  <div className="mt-6 bg-gray-50 rounded-lg p-4 sm:p-6 border-0 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 space-y-3 sm:space-y-0">
                      <h3 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center">
                        <FileText size={18} className="sm:w-5 sm:h-5 mr-2 text-amber-600" />
                        Documents Uploaded
                      </h3>
                    </div>

                    <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                        {/* Left Column - Core Documents */}
                        <div className="space-y-3 sm:space-y-4">
                          <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3">Core Documents</h4>

                          {/* Unpriced PO File */}
                          {(() => {
                            const unpricedPODoc = documents[viewingEquipmentId]?.find((doc: any) => doc.document_type === 'Unpriced PO File');
                            const hasUnpricedPO = !!unpricedPODoc;
                            return (
                              <div className={`p-3 sm:p-4 rounded-lg border transition-all duration-200 ${hasUnpricedPO
                                  ? 'border-emerald-200 bg-emerald-25 hover:bg-emerald-50 shadow-sm'
                                  : 'border-gray-200 bg-gray-50'
                                }`}>
                                <div className="flex items-center gap-2 sm:gap-3">
                                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${hasUnpricedPO ? 'bg-emerald-100' : 'bg-gray-100'
                                    }`}>
                                    {hasUnpricedPO ? (
                                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                    ) : (
                                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                      </svg>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-gray-800 text-sm sm:text-base">Unpriced PO File</h4>
                                    <p className={`text-xs sm:text-sm ${hasUnpricedPO ? 'text-emerald-600' : 'text-gray-500'
                                      }`}>
                                      {hasUnpricedPO ? 'File uploaded • Click to view' : 'No file uploaded'}
                                    </p>
                                  </div>
                                  {hasUnpricedPO && (
                                    <button
                                      onClick={() => setDocumentUrlModal({
                                        url: unpricedPODoc.document_url,
                                        name: unpricedPODoc.document_name || unpricedPODoc.name,
                                        uploadedBy: unpricedPODoc.uploadedBy,
                                        uploadDate: unpricedPODoc.uploadDate
                                      })}
                                      className="p-1.5 hover:bg-emerald-100 rounded-md text-emerald-600 transition-colors"
                                      title="View document"
                                    >
                                      <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Design Inputs PID */}
                          {(() => {
                            const designInputsDoc = documents[viewingEquipmentId]?.find((doc: any) => doc.document_type === 'Design Inputs PID');
                            const hasDesignInputs = !!designInputsDoc;
                            return (
                              <div className={`p-3 sm:p-4 rounded-lg border transition-all duration-200 ${hasDesignInputs
                                  ? 'border-emerald-200 bg-emerald-25 hover:bg-emerald-50 shadow-sm'
                                  : 'border-gray-200 bg-gray-50'
                                }`}>
                                <div className="flex items-center gap-2 sm:gap-3">
                                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${hasDesignInputs ? 'bg-emerald-100' : 'bg-gray-100'
                                    }`}>
                                    {hasDesignInputs ? (
                                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                    ) : (
                                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                      </svg>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-gray-800 text-sm sm:text-base">Design Inputs PID</h4>
                                    <p className={`text-xs sm:text-sm ${hasDesignInputs ? 'text-emerald-600' : 'text-gray-500'
                                      }`}>
                                      {hasDesignInputs ? 'File uploaded • Click to view' : 'No file uploaded'}
                                    </p>
                                  </div>
                                  {hasDesignInputs && (
                                    <button
                                      onClick={() => setDocumentUrlModal({
                                        url: designInputsDoc.document_url,
                                        name: designInputsDoc.document_name || designInputsDoc.name,
                                        uploadedBy: designInputsDoc.uploadedBy,
                                        uploadDate: designInputsDoc.uploadDate
                                      })}
                                      className="p-1.5 hover:bg-emerald-100 rounded-md text-emerald-600 transition-colors"
                                      title="View document"
                                    >
                                      <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Right Column - Additional Documents */}
                        <div className="space-y-3 sm:space-y-4">
                          <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3">Additional Documents</h4>

                          {/* Client Reference Doc */}
                          {(() => {
                            const clientRefDoc = documents[viewingEquipmentId]?.find((doc: any) => doc.document_type === 'Client Reference Doc');
                            const hasClientRef = !!clientRefDoc;
                            return (
                              <div className={`p-3 sm:p-4 rounded-lg border transition-all duration-200 ${hasClientRef
                                  ? 'border-emerald-200 bg-emerald-25 hover:bg-emerald-50 shadow-sm'
                                  : 'border-gray-200 bg-gray-50'
                                }`}>
                                <div className="flex items-center gap-2 sm:gap-3">
                                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${hasClientRef ? 'bg-emerald-100' : 'bg-gray-100'
                                    }`}>
                                    {hasClientRef ? (
                                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                    ) : (
                                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                      </svg>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-gray-800 text-sm sm:text-base">Client Reference Doc</h4>
                                    <p className={`text-xs sm:text-sm ${hasClientRef ? 'text-emerald-600' : 'text-gray-500'
                                      }`}>
                                      {hasClientRef ? 'File uploaded • Click to view' : 'No file uploaded'}
                                    </p>
                                  </div>
                                  {hasClientRef && (
                                    <button
                                      onClick={() => setDocumentUrlModal({
                                        url: clientRefDoc.document_url,
                                        name: clientRefDoc.document_name || clientRefDoc.name,
                                        uploadedBy: clientRefDoc.uploadedBy,
                                        uploadDate: clientRefDoc.uploadDate
                                      })}
                                      className="p-1.5 hover:bg-emerald-100 rounded-md text-emerald-600 transition-colors"
                                      title="View document"
                                    >
                                      <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Other Documents */}
                          {(() => {
                            const otherDocs = documents[viewingEquipmentId]?.filter((doc: any) => doc.document_type === 'Other Documents') || [];
                            const hasOtherDocs = otherDocs.length > 0;
                            return (
                              <div className={`p-3 sm:p-4 rounded-lg border transition-all duration-200 ${hasOtherDocs
                                  ? 'border-emerald-200 bg-emerald-25 hover:bg-emerald-50 shadow-sm'
                                  : 'border-gray-200 bg-gray-50'
                                }`}>
                                <div className="flex items-center gap-2 sm:gap-3">
                                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center ${hasOtherDocs ? 'bg-emerald-100' : 'bg-gray-100'
                                    }`}>
                                    {hasOtherDocs ? (
                                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                    ) : (
                                      <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                      </svg>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-gray-800 text-sm sm:text-base">Other Documents</h4>
                                    <p className={`text-xs sm:text-sm ${hasOtherDocs ? 'text-emerald-600' : 'text-gray-500'
                                      }`}>
                                      {hasOtherDocs
                                        ? `${otherDocs.length} file(s) uploaded • Click to view`
                                        : 'No files uploaded'
                                      }
                                    </p>
                                  </div>
                                  {hasOtherDocs && (
                                    <button
                                      onClick={() => {
                                        // Open first document in modal
                                        setDocumentUrlModal({
                                          url: otherDocs[0].document_url,
                                          name: otherDocs[0].document_name || otherDocs[0].name,
                                          uploadedBy: otherDocs[0].uploadedBy,
                                          uploadDate: otherDocs[0].uploadDate
                                        });
                                      }}
                                      className="p-1.5 hover:bg-emerald-100 rounded-md text-emerald-600 transition-colors"
                                      title="View documents"
                                    >
                                      <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes & Additional Information */}
                  <div className="mt-6 bg-white rounded-lg p-4 sm:p-6">
                    <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-800 mb-3 sm:mb-4 flex items-center">
                      <FileText size={16} className="sm:w-4 sm:h-4 lg:w-5 lg:h-5 mr-2 text-teal-600 flex-shrink-0" />
                      <span className="whitespace-nowrap">Notes & Additional Information</span>
                    </h3>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                      {/* Left Column - Kickoff Meeting Notes */}
                      <div className="space-y-3 sm:space-y-4">
                        <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3">Kickoff Meeting Notes</h4>
                        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border">
                          <p className="text-xs sm:text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                            {viewingEquipment.kickoffMeetingNotes || viewingEquipment.custom_fields?.find((f: any) => f.name === 'Kickoff Meeting Notes')?.value || 'No kickoff meeting notes provided. Please add meeting notes and key discussion points.'}
                          </p>
                        </div>
                      </div>

                      {/* Right Column - Special Production Notes */}
                      <div className="space-y-3 sm:space-y-4">
                        <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3">Special Production Notes</h4>
                        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg border">
                          <p className="text-xs sm:text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                            {viewingEquipment.specialProductionNotes || viewingEquipment.custom_fields?.find((f: any) => f.name === 'Special Production Notes')?.value || 'No special production notes provided. Please add critical production requirements and specifications.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Equipment Logs Tab */}
            <TabsContent value="equipment-logs" className="space-y-4 sm:space-y-6 mt-6 sm:mt-8">
              <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-4 sm:px-6 py-3 sm:py-4 border-b border-purple-200">
                  <h2 className="text-lg sm:text-xl font-semibold text-purple-800 flex items-center gap-2">
                    <TrendingUp size={20} className="text-purple-600 sm:w-6 sm:h-6" />
                    Equipment Logs
                  </h2>
                  <p className="text-purple-600 text-xs sm:text-sm mt-1">Track equipment progress updates and milestones</p>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="space-y-4 sm:space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <h3 className="text-base sm:text-xl font-semibold text-gray-800 flex items-center gap-2">
                        <Building size={18} className="text-purple-600 sm:w-5 sm:h-5" />
                        Equipment Activity Log
                      </h3>
                      <Button
                        onClick={exportEquipmentLogsToExcel}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1 sm:gap-2 bg-white hover:bg-purple-50 border-purple-200 text-purple-700 hover:text-purple-800 hover:border-purple-300 transition-all duration-200 text-xs sm:text-sm px-3"
                      >
                        <Download size={14} className="sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Export to Excel</span>
                        <span className="sm:hidden">Export</span>
                      </Button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search equipment logs by unit, status, or user..."
                        value={equipmentSearchQuery}
                        onChange={(e) => setEquipmentSearchQuery(e.target.value)}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 pl-9 sm:pl-10 text-xs sm:text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                      />
                      <div className="absolute inset-y-0 left-0 pl-2.5 sm:pl-3 flex items-center pointer-events-none">
                        <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      {equipmentSearchQuery && (
                        <button
                          onClick={() => setEquipmentSearchQuery("")}
                          className="absolute inset-y-0 right-0 pr-2.5 sm:pr-3 flex items-center"
                        >
                          <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                    
                    {/* Equipment Logs List - Fixed height container */}
                    <div className="h-96">
                      {/* Filtered Equipment Logs */}
                      {(() => {
                        // Helper function to format date
                        const formatDate = (dateString: string) => {
                          if (!dateString) return 'Unknown';
                          const date = new Date(dateString);
                          return date.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          });
                        };

                        // Helper function to calculate time ago
                        const getTimeAgo = (dateString: string) => {
                          if (!dateString) return 'Unknown';
                          const days = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
                          if (days === 0) return 'Today';
                          if (days === 1) return '1 day ago';
                          return `${days} days ago`;
                        };

                        // Helper function to format values properly (handle objects, arrays, null, etc.)
                        const formatValue = (value: any, fieldName?: string): string => {
                          // Handle null/undefined
                          if (value === null || value === undefined || value === '') {
                            return 'Not set';
                          }
                          
                          // Handle progress field - add % if it's a number or numeric string
                          if (fieldName?.toLowerCase().includes('progress')) {
                            const numValue = typeof value === 'number' ? value : parseFloat(String(value));
                            if (!isNaN(numValue) && isFinite(numValue)) {
                              return `${numValue}%`;
                            }
                          }
                          
                          // Handle arrays
                          if (Array.isArray(value)) {
                            if (value.length === 0) return 'Empty';
                            // For technical sections array, show summary
                            if (fieldName?.toLowerCase().includes('technical') && value.length > 0) {
                              const sectionNames = value.map((s: any) => s?.name || s?.section_name || 'Unnamed').filter(Boolean);
                              if (sectionNames.length > 0) {
                                return `${value.length} section${value.length > 1 ? 's' : ''} (${sectionNames.slice(0, 3).join(', ')}${sectionNames.length > 3 ? '...' : ''})`;
                              }
                            }
                            // For other arrays, show count or first few items
                            if (value.length <= 3) {
                              return value.map((v: any) => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
                            }
                            return `${value.length} items`;
                          }
                          
                          // Handle objects
                          if (typeof value === 'object') {
                            // For technical sections object/array, try to extract meaningful info
                            if (fieldName?.toLowerCase().includes('technical')) {
                              try {
                                // If it's an array of sections
                                if (Array.isArray(value)) {
                                  const sections = value.filter(Boolean);
                                  if (sections.length > 0) {
                                    const names = sections.map((s: any) => s?.name || s?.section_name || 'Section').slice(0, 3);
                                    return `${sections.length} section${sections.length > 1 ? 's' : ''}: ${names.join(', ')}${sections.length > 3 ? '...' : ''}`;
                                  }
                                }
                                // If it's a single section object
                                if (value.name || value.section_name) {
                                  return `Section: ${value.name || value.section_name}`;
                                }
                              } catch (e) {
                                // Fall through to JSON stringify
                              }
                            }
                            
                            // For custom fields, show field count
                            if (fieldName?.toLowerCase().includes('custom') && Array.isArray(value)) {
                              return `${value.length} field${value.length !== 1 ? 's' : ''}`;
                            }
                            
                            // Try to stringify objects meaningfully
                            try {
                              const str = JSON.stringify(value);
                              // If too long, truncate
                              if (str.length > 100) {
                                return str.substring(0, 100) + '...';
                              }
                              return str;
                            } catch (e) {
                              return 'Object';
                            }
                          }
                          
                          // Handle boolean
                          if (typeof value === 'boolean') {
                            return value ? 'Yes' : 'No';
                          }
                          
                          // Default: convert to string
                          const str = String(value);
                          
                          // Handle empty strings
                          if (str.trim() === '') {
                            return 'Not set';
                          }
                          
                          return str;
                        };

                        // Helper function to parse changes from metadata or action description
                        const parseChanges = (log: any) => {
                          const changes: Array<{ field: string; old: string; new: string }> = [];
                          
                          // Special handling for technical_sections
                          if (log.metadata?.changes?.technical_sections) {
                            const techChange = log.metadata.changes.technical_sections;
                            if (techChange && typeof techChange === 'object' && ('old' in techChange || 'new' in techChange)) {
                              // Parse technical sections to show what actually changed
                              const oldSections = techChange.old;
                              const newSections = techChange.new;
                              
                              if (Array.isArray(oldSections) && Array.isArray(newSections)) {
                                const oldNames = oldSections.map((s: any) => s?.name || s?.section_name).filter(Boolean);
                                const newNames = newSections.map((s: any) => s?.name || s?.section_name).filter(Boolean);
                                
                                if (JSON.stringify(oldNames.sort()) !== JSON.stringify(newNames.sort())) {
                                  changes.push({
                                    field: 'Technical Sections',
                                    old: formatValue(oldSections, 'technical_sections'),
                                    new: formatValue(newSections, 'technical_sections')
                                  });
                                } else {
                                  // Same sections, but might have field changes - check individual section fields
                                  newSections.forEach((newSec: any, idx: number) => {
                                    const oldSec = oldSections.find((s: any) => 
                                      (s?.name || s?.section_name) === (newSec?.name || newSec?.section_name)
                                    );
                                    
                                    if (oldSec && newSec.customFields) {
                                      const sectionName = newSec.name || newSec.section_name || `Section ${idx + 1}`;
                                      
                                      // Check for field changes in this section
                                      const oldFields = oldSec.customFields || [];
                                      const newFields = newSec.customFields || [];
                                      
                                      oldFields.forEach((oldField: any) => {
                                        const newField = newFields.find((f: any) => f.name === oldField.name);
                                        if (newField && newField.value !== oldField.value) {
                                          changes.push({
                                            field: `${sectionName} - ${oldField.name}`,
                                            old: formatValue(oldField.value),
                                            new: formatValue(newField.value)
                                          });
                                        }
                                      });
                                      
                                      // Check for new fields
                                      newFields.forEach((newField: any) => {
                                        if (!oldFields.find((f: any) => f.name === newField.name)) {
                                          changes.push({
                                            field: `${sectionName} - ${newField.name}`,
                                            old: 'Not set',
                                            new: formatValue(newField.value)
                                          });
                                        }
                                      });
                                    }
                                  });
                                }
                              } else {
                                changes.push({
                                  field: 'Technical Sections',
                                  old: formatValue(oldSections, 'technical_sections'),
                                  new: formatValue(newSections, 'technical_sections')
                                });
                              }
                            }
                          }
                          
                          // Try to get other changes from metadata (excluding technical_sections which we handled above)
                          if (log.metadata?.changes && typeof log.metadata.changes === 'object') {
                            Object.entries(log.metadata.changes).forEach(([field, change]: [string, any]) => {
                              // Skip technical_sections as we already handled it
                              if (field === 'technical_sections') return;
                              
                              if (change && typeof change === 'object' && ('old' in change || 'new' in change)) {
                                const formattedOld = formatValue(change.old, field);
                                const formattedNew = formatValue(change.new, field);
                                
                                // Skip futile changes: "Not set" → "Not set" or identical values
                                if (formattedOld === formattedNew) return;
                                if (formattedOld === 'Not set' && formattedNew === 'Not set') return;
                                if (formattedOld === 'Not-set' && formattedNew === 'Not-set') return;
                                
                                // Normalize both values to check if they're effectively the same (empty/not assigned)
                                const normalizeForEmpty = (val: string): string => {
                                  const lower = val.toLowerCase().trim();
                                  if (lower === 'not set' || lower === 'not-set' || lower === 'not assigned' || 
                                      lower === 'null' || lower === 'undefined' || lower === '') {
                                    return 'empty';
                                  }
                                  return lower;
                                };
                                
                                const oldNormalized = normalizeForEmpty(formattedOld);
                                const newNormalized = normalizeForEmpty(formattedNew);
                                
                                // Skip if both are effectively empty/not assigned
                                if (oldNormalized === 'empty' && newNormalized === 'empty') {
                                  return;
                                }
                                
                                const formattedField = field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                changes.push({
                                  field: formattedField,
                                  old: formattedOld,
                                  new: formattedNew
                                });
                              }
                            });
                          }
                          
                          // Fallback to old_value and new_value if available
                          if (changes.length === 0 && (log.old_value !== undefined || log.new_value !== undefined)) {
                            const formattedOld = formatValue(log.old_value, log.field_name);
                            const formattedNew = formatValue(log.new_value, log.field_name);
                            
                            // Skip futile changes here too
                            if (formattedOld !== formattedNew && 
                                !(formattedOld === 'Not set' && formattedNew === 'Not set') &&
                                !(formattedOld === 'Not-set' && formattedNew === 'Not-set')) {
                              changes.push({
                                field: log.field_name ? log.field_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Field',
                                old: formattedOld,
                                new: formattedNew
                              });
                            }
                          }
                          
                          // Final filter: remove any remaining futile entries
                          return changes.filter(change => {
                            const oldNorm = String(change.old).trim().toLowerCase();
                            const newNorm = String(change.new).trim().toLowerCase();
                            
                            // Skip if identical
                            if (oldNorm === newNorm) return false;
                            
                            // Skip if both are "not set"/"not assigned" variations (equivalent empty states)
                            const emptyVariants = ['not set', 'not-set', 'not assigned', 'null', 'undefined', ''];
                            if (emptyVariants.includes(oldNorm) && emptyVariants.includes(newNorm)) return false;
                            
                            return true;
                          });
                        };

                        // Helper function to get activity type badge info
                        const getActivityTypeInfo = (activityType: string) => {
                          const types: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: any }> = {
                            'equipment_created': { label: 'Created', color: 'text-green-800', bgColor: 'bg-green-100', borderColor: 'border-green-200', icon: Building },
                            'equipment_updated': { label: 'Updated', color: 'text-blue-800', bgColor: 'bg-blue-100', borderColor: 'border-blue-200', icon: Wrench },
                            'equipment_deleted': { label: 'Deleted', color: 'text-red-800', bgColor: 'bg-red-100', borderColor: 'border-red-200', icon: AlertTriangle },
                            'progress_image_uploaded': { label: 'Progress Image', color: 'text-purple-800', bgColor: 'bg-purple-100', borderColor: 'border-purple-200', icon: Image },
                            'technical_specs_updated': { label: 'Technical Specs', color: 'text-orange-800', bgColor: 'bg-orange-100', borderColor: 'border-orange-200', icon: Wrench },
                            'technical_section_added': { label: 'Tech Section Added', color: 'text-orange-800', bgColor: 'bg-orange-100', borderColor: 'border-orange-200', icon: Wrench },
                            'document_uploaded': { label: 'Document Added', color: 'text-indigo-800', bgColor: 'bg-indigo-100', borderColor: 'border-indigo-200', icon: FileCheck },
                            'document_updated': { label: 'Document Updated', color: 'text-indigo-800', bgColor: 'bg-indigo-100', borderColor: 'border-indigo-200', icon: FileCheck },
                            'team_member_added': { label: 'Team Member', color: 'text-teal-800', bgColor: 'bg-teal-100', borderColor: 'border-teal-200', icon: UserPlus },
                            'team_member_removed': { label: 'Team Member', color: 'text-red-800', bgColor: 'bg-red-100', borderColor: 'border-red-200', icon: UserPlus },
                            'progress_updated': { label: 'Progress', color: 'text-blue-800', bgColor: 'bg-blue-100', borderColor: 'border-blue-200', icon: TrendingUp }
                          };
                          
                          return types[activityType] || { 
                            label: 'Activity', 
                            color: 'text-gray-800', 
                            bgColor: 'bg-gray-100', 
                            borderColor: 'border-gray-200', 
                            icon: FileText 
                          };
                        };

                        // Use real equipment activity logs from equipment_activity_logs table
                        const entries = equipmentProgressEntries || [];
                        const equipmentLogs = entries.map((log: any, index: number) => {
                          const changes = parseChanges(log);
                          const activityInfo = getActivityTypeInfo(log.activity_type || '');
                          // For batch entries, show simplified count; otherwise single tag number
                          let tagNumber = 'Unknown';
                          if (log.metadata?.isBatch && log.metadata?.equipmentList) {
                            // Just show count in header - detailed list shown below
                            const count = log.metadata.equipmentCount || log.metadata.equipmentList.length || 0;
                            tagNumber = `${count} equipment`;
                          } else {
                            tagNumber = log.metadata?.tagNumber || log.metadata?.tag_number || viewingEquipment?.tagNumber || 'Unknown';
                          }
                          const equipmentType = log.metadata?.equipmentType || log.metadata?.equipment_type || viewingEquipment?.type || 'Equipment';
                          
                          return {
                            id: log.id || index + 1,
                            activityType: log.activity_type,
                            activityInfo,
                            equipmentType,
                            tagNumber,
                            changes,
                            description: log.action_description || '',
                            metadata: log.metadata || {},
                            updated: formatDate(log.created_at),
                            timeAgo: getTimeAgo(log.created_at),
                            updatedBy: log.created_by_user?.full_name || log.created_by || 'Unknown User',
                            oldValue: log.old_value,
                            newValue: log.new_value,
                            fieldName: log.field_name
                          };
                        });

                        const filteredLogs = equipmentSearchQuery
                          ? equipmentLogs.filter(log =>
                              log.equipmentType.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
                              log.tagNumber.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
                              log.activityInfo.label.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
                              log.updatedBy.toLowerCase().includes(equipmentSearchQuery.toLowerCase()) ||
                              log.description.toLowerCase().includes(equipmentSearchQuery.toLowerCase())
                            )
                          : equipmentLogs;

                        if (isLoadingEquipmentLogs) {
                          return (
                            <div className="h-full flex items-center justify-center text-gray-500">
                              <div className="text-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                              <p>Loading equipment logs...</p>
                              </div>
                            </div>
                          );
                        }

                        if (filteredLogs.length === 0) {
                          return (
                            <div className="h-full flex items-center justify-center text-gray-500">
                              <div className="text-center">
                              <Building size={32} className="mx-auto mb-2 text-gray-300" />
                              <p>No equipment logs match the search criteria.</p>
                              <p className="text-sm text-gray-400 mt-1">Try adjusting your search terms.</p>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div className="h-full overflow-y-auto space-y-3 pr-1.5 sm:pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                            {filteredLogs.map((log) => {
                              const ActivityIcon = log.activityInfo.icon;
                              
                              return (
                                <div key={log.id} className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all p-3 sm:p-4">
                                  {/* Header: Equipment Tag + Activity Type Badge */}
                                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 mb-3">
                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                      <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-[10px] sm:text-xs md:text-sm font-semibold rounded-lg shadow-sm whitespace-nowrap flex-shrink-0">
                                        <Building size={12} className="sm:w-[14px] sm:h-[14px] flex-shrink-0" />
                                        <span className="truncate max-w-[80px] sm:max-w-none">{log.tagNumber}</span>
                                      </span>
                                      {!log.metadata?.isBatch && log.equipmentType !== 'Equipment' && (
                                        <span className="text-[10px] sm:text-xs text-gray-600 font-medium truncate">({log.equipmentType})</span>
                                      )}
                                    </div>
                                    <span className={`inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold rounded-full border w-fit ${log.activityInfo.bgColor} ${log.activityInfo.color} ${log.activityInfo.borderColor}`}>
                                      <ActivityIcon size={10} className="sm:w-3 sm:h-3 flex-shrink-0" />
                                      <span className="whitespace-nowrap">{log.activityInfo.label}</span>
                                    </span>
                                  </div>

                                  {/* Activity-Specific Content */}
                                  <div className="space-y-2 mb-3">
                                    {/* Equipment Updates - Show Changes */}
                                    {(log.activityType === 'equipment_updated' || log.changes.length > 0) && log.changes.length > 0 && (
                                      <div className="space-y-1.5">
                                        {log.changes
                                          .filter(change => {
                                            // Filter out progress percentage changes if progress_phase is also changing
                                            // (progress is automatically set based on phase, so it's redundant)
                                            if (change.field.toLowerCase() === 'progress' || change.field.toLowerCase() === 'progress %') {
                                              const hasPhaseChange = log.changes.some(c => 
                                                c.field.toLowerCase() === 'progress phase' || 
                                                c.field.toLowerCase() === 'progress_phase'
                                              );
                                              if (hasPhaseChange) {
                                                return false; // Hide progress % when phase is changing
                                              }
                                            }
                                            return true;
                                          })
                                          .map((change, idx) => (
                                            <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm">
                                              <span className="font-medium text-gray-700 flex-shrink-0">{change.field}:</span>
                                              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                                                <span className="px-1.5 sm:px-2 py-0.5 bg-red-50 text-red-700 rounded border border-red-200 line-through text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{change.old}</span>
                                                <ArrowRight size={10} className="sm:w-3 sm:h-3 text-gray-400 flex-shrink-0" />
                                                <span className="px-1.5 sm:px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-200 font-medium text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{change.new}</span>
                                              </div>
                                            </div>
                                          ))}
                                      </div>
                                    )}

                                    {/* Progress Image Added */}
                                    {log.activityType === 'progress_image_uploaded' && (
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-700 flex-wrap">
                                        <Image size={12} className="sm:w-[14px] sm:h-[14px] text-purple-600 flex-shrink-0" />
                                        <span className="flex-shrink-0">New progress image added</span>
                                        {log.metadata?.imageDescription && (
                                          <span className="text-gray-500 truncate">- {log.metadata.imageDescription}</span>
                                        )}
                                      </div>
                                    )}

                                    {/* Technical Specs Updates */}
                                    {(log.activityType === 'technical_specs_updated' || log.activityType === 'technical_section_added') && (
                                      <div className="space-y-1.5">
                                        {log.metadata?.sectionName && (
                                          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm mb-2 flex-wrap">
                                            <Wrench size={12} className="sm:w-[14px] sm:h-[14px] text-orange-600 flex-shrink-0" />
                                            <span className="font-medium text-gray-700">Section: <span className="text-gray-900 truncate">{log.metadata.sectionName}</span></span>
                                          </div>
                                        )}
                                        {log.changes.length > 0 ? (
                                          <div className={log.metadata?.sectionName ? "ml-0 sm:ml-5 space-y-1.5" : "space-y-1.5"}>
                                            {log.changes.map((change, idx) => (
                                              <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm">
                                                <span className="font-medium text-gray-700 flex-shrink-0">{change.field}:</span>
                                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                                                  <span className="px-1.5 sm:px-2 py-0.5 bg-red-50 text-red-700 rounded border border-red-200 line-through text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{change.old}</span>
                                                  <ArrowRight size={10} className="sm:w-3 sm:h-3 text-gray-400 flex-shrink-0" />
                                                  <span className="px-1.5 sm:px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-200 font-medium text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{change.new}</span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-xs text-gray-600">Technical sections updated</span>
                                        )}
                                      </div>
                                    )}

                                    {/* Document Added/Updated */}
                                    {(log.activityType === 'document_uploaded' || log.activityType === 'document_updated') && (
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-700 flex-wrap">
                                        <FileCheck size={12} className="sm:w-[14px] sm:h-[14px] text-indigo-600 flex-shrink-0" />
                                        <span className="font-medium flex-shrink-0">Document:</span>
                                        <span className="text-gray-900 truncate">{log.metadata?.fileName || log.metadata?.documentName || 'Unknown'}</span>
                                        {log.metadata?.documentType && (
                                          <span className="text-gray-500 truncate">({log.metadata.documentType})</span>
                                        )}
                                      </div>
                                    )}

                                    {/* Team Member Added */}
                                    {log.activityType === 'team_member_added' && (
                                      <div className="space-y-2">
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-700 flex-wrap">
                                          <UserPlus size={12} className="sm:w-[14px] sm:h-[14px] text-teal-600 flex-shrink-0" />
                                          <span className="font-medium truncate">{log.metadata?.memberName || 'Team member'}</span>
                                          <span className="text-gray-600 flex-shrink-0">added as</span>
                                          <span className="px-1.5 sm:px-2 py-0.5 bg-teal-50 text-teal-700 rounded border border-teal-200 font-medium whitespace-nowrap flex-shrink-0">
                                            {log.metadata?.role || 'Member'}
                                          </span>
                                        </div>
                                        {/* Show equipment list for batch entries */}
                                        {log.metadata?.isBatch && log.metadata?.equipmentList && (
                                          <div className="ml-0 sm:ml-5 space-y-1">
                                            <span className="text-[10px] sm:text-xs font-medium text-gray-600">Equipment:</span>
                                            <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                              {log.metadata.equipmentList.map((eq: any, idx: number) => (
                                                <span key={idx} className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-blue-50 text-blue-700 rounded border border-blue-200 truncate max-w-[150px] sm:max-w-none">
                                                  {eq.tagNumber} ({eq.type})
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Fallback: Show description if no specific format */}
                                    {log.changes.length === 0 && 
                                     !['progress_image_uploaded', 'technical_specs_updated', 'technical_section_added', 'document_uploaded', 'document_updated', 'team_member_added'].includes(log.activityType) && (
                                      <p className="text-xs sm:text-sm text-gray-600">{log.description}</p>
                                    )}
                                  </div>

                                  {/* Footer: Date and User */}
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pt-2 border-t border-gray-100 text-[10px] sm:text-xs text-gray-500">
                                    <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                                      <Clock size={10} className="sm:w-3 sm:h-3 flex-shrink-0" />
                                      <span className="truncate">{log.updated}</span>
                                      <span className="text-gray-400 hidden sm:inline">|</span>
                                      <span className="truncate">{log.timeAgo}</span>
                                    </div>
                                    <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
                                      <User size={10} className="sm:w-3 sm:h-3 flex-shrink-0" />
                                      <span className="text-blue-600 font-medium truncate">{log.updatedBy}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-6 mt-8">
              <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                  <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-800 flex items-center gap-2">
                    <Settings size={20} className="text-gray-600 sm:w-6 sm:h-6" />
                    Team & Permissions Settings
                  </h2>
                  <p className="text-gray-600 text-xs sm:text-sm mt-1">Manage team members and control access permissions</p>
                </div>
                <div className="p-6">
                  <div className="space-y-6">
                    {/* Team Management Header */}
                    <div className="flex items-center justify-between mb-6 sm:mb-8">
                      <div className="flex-1">
                        <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-800">Team Members</h3>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">Manage who has access to this equipment and their permissions</p>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 ml-4">
                        <button
                          onClick={() => setShowAddMember(true)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
                        >
                          <Users size={16} className="sm:w-4 sm:h-4" />
                          Add Member
                        </button>
                      </div>
                    </div>

                    {/* Team Members List */}
                    <div className="space-y-4">
                      {teamMembersLoading ? (
                        <div className="text-center py-6 sm:py-8">
                          <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600 mx-auto"></div>
                          <p className="text-gray-500 mt-2 text-xs sm:text-sm">Loading team members...</p>
                        </div>
                      ) : teamMembers.length === 0 ? (
                        <div className="text-center py-6 sm:py-8">
                          <Users size={36} className="mx-auto text-gray-300 mb-3 sm:mb-4 sm:w-12 sm:h-12" />
                          <p className="text-gray-500 text-sm sm:text-base">No team members found</p>
                          <p className="text-xs sm:text-sm text-gray-400 mt-1">Add team members to get started</p>
                        </div>
                      ) : (
                        teamMembers.map((member) => (
                          <div key={member.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
                              <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
                                <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                  <span className="text-blue-600 font-semibold text-xs sm:text-sm lg:text-lg">{member.avatar}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-gray-800 text-xs sm:text-sm lg:text-base truncate">{member.name}</h4>
                                  <p className="text-xs sm:text-sm text-gray-600 truncate">{member.email}</p>
                                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-1">
                                    <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800`}>
                                      {member.position || 'No Position'}
                                    </span>
                                    <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium ${member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                      {member.status}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 sm:gap-2">
                                <button
                                  onClick={() => editTeamMember(member)}
                                  className="px-2 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex-shrink-0"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => removeTeamMember(member.id)}
                                  className="px-2 py-1 sm:px-3 sm:py-1 text-xs sm:text-sm bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors flex-shrink-0"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>

                            {/* Equipment Assignments */}
                            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
                              <h5 className="text-xs sm:text-sm font-medium text-gray-700 mb-2">Equipment Assignments:</h5>
                              <div className="flex flex-wrap gap-1 sm:gap-2">
                                {member.equipmentAssignments && member.equipmentAssignments.length > 0 ? (
                                  member.equipmentAssignments.map((equipmentId: string, index: number) => {
                                    // For standalone equipment, show the equipment being viewed
                                    let displayName = 'This Equipment';
                                    if (equipmentId === viewingEquipmentId && viewingEquipment) {
                                      displayName = viewingEquipment.tagNumber || viewingEquipment.type || viewingEquipment.name || 'This Equipment';
                                    } else if (equipment && equipment.length > 0) {
                                      // Try to find equipment in the list
                                      const assignedEquipment = equipment.find(eq => eq.id === equipmentId);
                                      if (assignedEquipment) {
                                        displayName = assignedEquipment.manufacturingSerial || assignedEquipment.tagNumber || assignedEquipment.type || equipmentId;
                                      }
                                    }
                                    
                                    return (
                                      <span
                                        key={index}
                                        className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200"
                                      >
                                        {displayName}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="text-xs text-gray-500">No equipment assigned</span>
                                )}
                              </div>
                            </div>

                            {/* Data Access Levels */}
                            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
                              <h5 className="text-xs sm:text-sm font-medium text-gray-700 mb-2">Data Access:</h5>
                              <div className="space-y-1 sm:space-y-2">
                                {member.role === 'project_manager' && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Full Equipment Access</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can Manage All Equipment</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can Approve VDCR</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can Manage Team Members</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Access to All Tabs</span>
                                    </div>
                                  </>
                                )}
                                {member.role === 'vdcr_manager' && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">VDCR Management Access</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can Approve VDCR</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can View All Equipment</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-teal-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Access to VDCR & Equipment Tabs</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">No Access to Settings</span>
                                    </div>
                                  </>
                                )}
                                {member.role === 'editor' && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Assigned Equipment Only</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can Add Progress Images</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can Add Progress Entries</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Access to VDCR & Other Tabs</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">No Access to Settings</span>
                                    </div>
                                  </>
                                )}
                                {member.role === 'viewer' && (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Read-Only Access</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can View Assigned Equipment</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">Can View Progress & VDCR</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">No Edit Permissions</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                      <span className="text-xs text-gray-600">No Access to Settings</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Role Badge - Shows actual role from user record */}
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Role:</h5>
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getRoleColor(member.role)} border`}>
                                {mapRoleToDisplay(member.role)}
                              </span>
                            </div>
                            
                            {/* Position Badge - Shows dynamic position for this equipment */}
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Position:</h5>
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                                {member.position || 'No Position'}
                              </span>
                            </div>

                            {/* Permissions Display */}
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Permissions:</h5>
                              <div className="flex flex-wrap gap-2">
                                {(() => {
                                  const role = roles.find(r => r.name === member.role);
                                  const rolePermissions = role ? role.permissions : [];
                                  return rolePermissions.map((permission, index) => (
                                    <span
                                      key={index}
                                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
                                    >
                                      {getPermissionLabel(permission)}
                                    </span>
                                  ));
                                })()}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Add Member Modal */}
          {showAddMember && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-3 sm:px-6 py-3 sm:py-4 rounded-t-xl">
                  <div className="flex items-start sm:items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-xl font-semibold text-gray-900">Add New Team Member</h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">Fill in the details to add a new team member</p>
                    </div>
                    <button
                      onClick={handleCloseAddMember}
                      className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100 flex-shrink-0"
                    >
                      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-3 sm:p-6 space-y-4 sm:space-y-8">
                  {/* Select Existing Member or Add New */}
                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex items-center gap-2 sm:gap-3 mb-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-indigo-500 rounded-full flex-shrink-0"></div>
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Select Team Member</h4>
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                        Choose Existing Member or Add New *
                      </label>
                      <Select
                        value={selectedExistingMemberEmail}
                        onValueChange={(value) => handleExistingMemberSelect(value)}
                        disabled={isLoadingExistingMembers}
                        required
                      >
                        <SelectTrigger className="w-full h-auto px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white hover:bg-gray-50">
                          <SelectValue placeholder={isLoadingExistingMembers ? "Loading members..." : "Select or Add New Member..."} />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 sm:max-h-96">
                          {existingFirmMembers.length > 0 && (
                            <>
                              {existingFirmMembers.map((member, index) => (
                                <React.Fragment key={member.email}>
                                  {index > 0 && (
                                    <div className="border-t border-gray-200 my-1"></div>
                                  )}
                                  <SelectItem 
                                    value={member.email} 
                                    className="py-2.5 sm:py-3 px-3 sm:px-4 focus:bg-indigo-50"
                                  >
                                    <div className="flex flex-col gap-0.5 sm:gap-1 w-full">
                                      <div className="text-xs sm:text-sm font-medium text-gray-900">
                                        {member.name}
                                      </div>
                                      <div className="text-[10px] sm:text-xs text-gray-600">
                                        {member.email}
                                      </div>
                                      <div className="text-[10px] sm:text-xs text-gray-500">
                                        {mapRoleToDisplay(member.role || member.access_level || 'viewer')}
                                      </div>
                                    </div>
                                  </SelectItem>
                                </React.Fragment>
                              ))}
                            </>
                          )}
                          {existingFirmMembers.length > 0 && (
                            <div className="border-t border-gray-200 my-1"></div>
                          )}
                          <SelectItem value="new" className="text-xs sm:text-sm py-2.5 sm:py-3 px-3 sm:px-4 font-medium text-indigo-600 focus:bg-indigo-50">
                            ➕ Add New Team Member
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {isExistingMemberMode && (
                        <p className="mt-2 text-[10px] sm:text-xs text-blue-600 flex items-start gap-1.5">
                          <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="flex-1">Existing member selected. Name, email, phone, and access level are locked. Only position can be edited.</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Basic Information Section */}
                  <div className="space-y-3 sm:space-y-5">
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Basic Information</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                        <input
                          type="text"
                          value={newMember.name}
                          onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                          disabled={isExistingMemberMode}
                          className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                            isExistingMemberMode 
                              ? 'bg-gray-100 cursor-not-allowed text-gray-600' 
                              : 'bg-gray-50 hover:bg-white'
                          }`}
                          placeholder="Enter full name"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                        <input
                          type="email"
                          value={newMember.email}
                          onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                          disabled={isExistingMemberMode}
                          className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                            isExistingMemberMode 
                              ? 'bg-gray-100 cursor-not-allowed text-gray-600' 
                              : 'bg-gray-50 hover:bg-white'
                          }`}
                          placeholder="Enter email address"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                        <input
                          type="tel"
                          value={newMember.phone || ''}
                          onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                          disabled={isExistingMemberMode}
                          className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${
                            isExistingMemberMode 
                              ? 'bg-gray-100 cursor-not-allowed text-gray-600' 
                              : 'bg-gray-50 hover:bg-white'
                          }`}
                          placeholder="Enter phone number"
                          pattern="[0-9]{10}"
                          title="Please enter a 10-digit phone number"
                          maxLength={10}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Position/Title *</label>
                        <input
                          type="text"
                          value={newMember.position || ''}
                          onChange={(e) => setNewMember({ ...newMember, position: e.target.value })}
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border-2 border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-white hover:bg-blue-50"
                          placeholder="e.g., Engineer, Inspector, Manager"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Role & Access Section */}
                  <div className="space-y-3 sm:space-y-4">
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-purple-500 rounded-full flex-shrink-0"></div>
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Role & Access Level</h4>
                    </div>
                    
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Select Role *</label>
                      <Select
                        value={newMember.role}
                        onValueChange={(value) => {
                          const role = value;
                          setNewMember({
                            ...newMember, 
                            role: role,
                            accessLevel: role === 'Project Manager' ? 'project_manager' : 
                                        role === 'VDCR Manager' ? 'vdcr_manager' : 
                                        role === 'Editor' ? 'editor' : 'viewer',
                            permissions: role === 'Project Manager' ? ['view', 'edit', 'delete', 'manage_team', 'approve_vdcr', 'manage_equipment'] :
                                       role === 'VDCR Manager' ? ['view', 'edit', 'approve_vdcr', 'manage_vdcr'] :
                                       role === 'Editor' ? ['view', 'edit', 'manage_equipment'] : ['view', 'comment']
                          });
                        }}
                        disabled={isExistingMemberMode}
                        required
                      >
                        <SelectTrigger className={`w-full h-auto px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 ${
                          isExistingMemberMode 
                            ? 'bg-gray-100 cursor-not-allowed text-gray-600' 
                            : 'bg-gray-50 hover:bg-white'
                        }`}>
                          <SelectValue placeholder="Choose a role..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 sm:max-h-96">
                          <SelectItem value="Project Manager" className="text-xs sm:text-sm py-2">
                            Project Manager (Full Access)
                          </SelectItem>
                          <SelectItem value="VDCR Manager" className="text-xs sm:text-sm py-2">
                            VDCR Manager (VDCR Management)
                          </SelectItem>
                          <SelectItem value="Editor" className="text-xs sm:text-sm py-2">
                            Editor (Can Add Progress)
                          </SelectItem>
                          <SelectItem value="Viewer" className="text-xs sm:text-sm py-2">
                            Viewer (Read Only)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {/* Role Description with Data Access */}
                      {newMember.role && (
                        <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-purple-50 rounded-lg border border-purple-200">
                          <p className="text-[10px] sm:text-xs text-purple-700 font-medium mb-2 sm:mb-3">Default Data Access for Selected Role:</p>
                          <div className="text-[10px] sm:text-xs text-purple-700 space-y-1 sm:space-y-2">
                            {(() => {
                              // Map display role to database role
                              const roleMapping: Record<string, string> = {
                                'Project Manager': 'project_manager',
                                'VDCR Manager': 'vdcr_manager',
                                'Editor': 'editor',
                                'Viewer': 'viewer'
                              };
                              const dbRole = roleMapping[newMember.role] || 'viewer';
                              const dataAccess = getDataAccessByRole(dbRole);
                              
                              return (
                              <div className="space-y-1">
                                  {dataAccess.map((access, index) => (
                                    <div key={index}>• {access}</div>
                                  ))}
                              </div>
                              );
                            })()}
                              </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="sticky bottom-0 bg-white border-t border-gray-100 px-3 sm:px-6 py-3 sm:py-4 rounded-b-xl">
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('Add Team Member button clicked', { 
                          newMember, 
                          viewingEquipmentId,
                          allFieldsValid: !!(newMember.name && newMember.email && newMember.position && newMember.role && viewingEquipmentId)
                        });
                        addTeamMember();
                      }}
                      disabled={!newMember.name || !newMember.email || !newMember.position || !newMember.role || !viewingEquipmentId}
                      className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 text-sm sm:text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                    >
                      Add Team Member
                    </button>
                    <button
                      onClick={handleCloseAddMember}
                      className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 text-sm sm:text-base font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Edit Member Modal */}
          {showEditMember && selectedMember && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-3 sm:px-6 py-3 sm:py-4 rounded-t-xl">
                  <div className="flex items-start sm:items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-xl font-semibold text-gray-900">Edit Team Member</h3>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1">Update the team member's information and permissions</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowEditMember(false);
                        setSelectedMember(null);
                        setNewMember({ name: "", email: "", phone: "", position: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
                      }}
                      className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100 flex-shrink-0"
                    >
                      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="p-3 sm:p-6 space-y-4 sm:space-y-8">
                  {/* Basic Information Section */}
                  <div className="space-y-3 sm:space-y-5">
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide">Basic Information</h4>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                        <input
                          type="text"
                          value={newMember.name}
                          onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                          placeholder="Enter full name"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                        <input
                          type="email"
                          value={newMember.email}
                          onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                          placeholder="Enter email address"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                        <input
                          type="tel"
                          value={newMember.phone || ''}
                          onChange={(e) => setNewMember({ ...newMember, phone: e.target.value })}
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                          placeholder="Enter phone number"
                          pattern="[0-9]{10}"
                          title="Please enter a 10-digit phone number"
                          maxLength={10}
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Position/Title *</label>
                        <input
                          type="text"
                          value={newMember.position || ''}
                          onChange={(e) => setNewMember({ ...newMember, position: e.target.value })}
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 bg-gray-50 hover:bg-white"
                          placeholder="e.g., Engineer, Inspector, Manager"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Role & Access Section - DISABLED */}
                  <div className="space-y-3 sm:space-y-4 opacity-60">
                    <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-gray-400 rounded-full flex-shrink-0"></div>
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wide">Role & Access Level (Read Only)</h4>
                    </div>
                    
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-500 mb-2">Current Role</label>
                      <div className="w-full px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed">
                        {newMember.role || 'No role assigned'}
                      </div>
                      
                      {/* Disabled Notice */}
                      <div className="mt-3 p-2.5 sm:p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                          </svg>
                          <p className="text-[10px] sm:text-xs text-yellow-700 font-medium">Role & Access Level cannot be modified. Contact administrator to change user roles.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="sticky bottom-0 bg-white border-t border-gray-100 px-3 sm:px-6 py-3 sm:py-4 rounded-b-xl">
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <button
                      onClick={updateTeamMember}
                      className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 text-sm sm:text-base font-medium shadow-sm hover:shadow-md"
                    >
                      Edit Team Member
                    </button>
                    <button
                      onClick={() => {
                        setShowEditMember(false);
                        setSelectedMember(null);
                        setNewMember({ name: "", email: "", phone: "", position: "", role: "", permissions: [], equipmentAssignments: [], dataAccess: [], accessLevel: "viewer" });
                      }}
                      className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 text-sm sm:text-base font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Document URL Modal - Always rendered via portal outside conditional returns */}
      {documentUrlModal && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-2 sm:p-4" style={{ zIndex: 99999 }} onClick={() => setDocumentUrlModal(null)}>
          <div className="bg-white rounded-lg p-3 sm:p-4 md:p-6 max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2 mb-4">
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 truncate pr-2">Document: {documentUrlModal.name}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.open(documentUrlModal.url, '_blank');
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-8"
                >
                  <FileText size={14} className="sm:mr-1 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Open in New Tab</span>
                  <span className="sm:hidden">Open</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const response = await fetch(documentUrlModal.url);
                      const blob = await response.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = documentUrlModal.name;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (error) {
                      console.error('Error downloading file:', error);
                      window.open(documentUrlModal.url, '_blank');
                    }
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-8"
                >
                  <FileText size={14} className="sm:mr-1 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Download</span>
                  <span className="sm:hidden">Down</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDocumentUrlModal(null)}
                  className="text-gray-500 hover:text-gray-700 h-7 sm:h-8 w-7 sm:w-8 p-0"
                >
                  <X size={16} className="sm:w-5 sm:h-5" />
                </Button>
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {(() => {
                const fileName = documentUrlModal.name.toLowerCase();
                const isPDF = fileName.endsWith('.pdf');
                const isImage = fileName.match(/\.(jpg|jpeg|png|gif|webp)$/);
                
                if (isPDF) {
                  return (
                    <div className="text-center">
                      <iframe
                        src={documentUrlModal.url}
                        className="w-full h-[400px] sm:h-[500px] md:h-[600px] border border-gray-200 rounded-lg"
                        title={documentUrlModal.name}
                      />
                    </div>
                  );
                } else if (isImage) {
                  return (
                    <div className="text-center">
                      <img
                        src={documentUrlModal.url}
                        alt={documentUrlModal.name}
                        className="max-w-full h-auto max-h-[400px] sm:max-h-[500px] md:max-h-[600px] rounded-lg border border-gray-200 object-contain mx-auto"
                      />
                    </div>
                  );
                } else {
                  return (
                    <div className="text-center p-4 sm:p-6 md:p-8 bg-gray-50 rounded border border-gray-200">
                      <FileText className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-gray-400 mb-3 sm:mb-4" />
                      <div className="text-sm sm:text-base md:text-lg font-medium text-gray-600 mb-2 break-words">{documentUrlModal.name}</div>
                      <div className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 px-2">
                        This file type cannot be previewed. Please download or open in a new tab to view.
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <Button
                          variant="outline"
                          onClick={() => window.open(documentUrlModal.url, '_blank')}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-9"
                        >
                          <FileText size={14} className="mr-1 sm:w-4 sm:h-4" />
                          Open in New Tab
                        </Button>
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              const response = await fetch(documentUrlModal.url);
                              const blob = await response.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = documentUrlModal.name;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            } catch (error) {
                              console.error('Error downloading file:', error);
                              window.open(documentUrlModal.url, '_blank');
                            }
                          }}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-9"
                        >
                          <FileText size={14} className="mr-1 sm:w-4 sm:h-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                  );
                }
              })()}

              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                  <div>
                    <span className="font-medium text-gray-700 block mb-1">File Name:</span>
                    <div className="text-gray-600 break-words">{documentUrlModal.name}</div>
                  </div>
                  {documentUrlModal.uploadedBy && (
                    <div>
                      <span className="font-medium text-gray-700 block mb-1">Uploaded By:</span>
                      <div className="text-gray-600 break-words">{documentUrlModal.uploadedBy}</div>
                    </div>
                  )}
                  {documentUrlModal.uploadDate && (
                    <div className="sm:col-span-2">
                      <span className="font-medium text-gray-700 block mb-1">Upload Date:</span>
                      <div className="text-gray-600">
                        {new Date(documentUrlModal.uploadDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
    );
  }

  return (
    <>
    <div className="space-y-6">

      {/* Add New Equipment Section */}
      <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="w-7 h-7 sm:w-10 sm:h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Plus size={14} className="sm:w-5 sm:h-5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 truncate">Add New Equipment</h3>
              <p className="text-[10px] sm:text-xs md:text-sm text-gray-500 truncate hidden sm:block">Add new equipment to this project</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Button 
              onClick={() => {
                if (projectId === 'standalone') {
                  // For standalone equipment, open the modal form
                  setShowAddEquipmentForm(true);
                } else {
                  // For regular projects, toggle the inline mini form
                  setShowMiniForm(!showMiniForm);
                }
              }}
              className={`h-auto px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm whitespace-nowrap ${
                projectId === 'standalone' 
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : showMiniForm 
                  ? 'bg-gray-400 text-gray-600' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <Plus size={12} className="sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
              Add Equipment
            </Button>
            {projectId !== 'standalone' && (
            <button 
              onClick={() => setShowMiniForm(!showMiniForm)}
              className={`p-1 sm:p-1.5 text-gray-500 hover:text-gray-700 transition-transform flex-shrink-0 ${showMiniForm ? 'rotate-180' : ''}`}
            >
              <ChevronDown size={12} className="sm:w-4 sm:h-4" />
            </button>
            )}
          </div>
        </div>
        
        {/* Equipment Filters Section - Same div, below header */}
        {showMiniForm && projectId !== 'standalone' && (
          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
              <div>
                <Label htmlFor="inline-equipment-name" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Equipment Name</Label>
                <Select 
                  value={miniFormData.equipmentName} 
                  onValueChange={(value) => setMiniFormData(prev => ({ ...prev, equipmentName: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select equipment type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Heat Exchanger">Heat Exchanger</SelectItem>
                    <SelectItem value="Pressure Vessel">Pressure Vessel</SelectItem>
                    <SelectItem value="Reactor">Reactor</SelectItem>
                    <SelectItem value="Storage Tank">Storage Tank</SelectItem>
                    <SelectItem value="Distillation Column">Distillation Column</SelectItem>
                    <SelectItem value="Custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {miniFormData.equipmentName === 'Custom' && (
                <div>
                  <Label htmlFor="inline-custom-equipment" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Custom Equipment Name</Label>
                  <Input
                    id="inline-custom-equipment"
                    value={miniFormData.customEquipmentName}
                    onChange={(e) => setMiniFormData(prev => ({ ...prev, customEquipmentName: e.target.value }))}
                    placeholder="Enter custom equipment name"
                    className="w-full"
                  />
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="inline-tag" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Tag Number</Label>
                <Input
                  id="inline-tag"
                  value={miniFormData.tagNumber}
                  onChange={(e) => setMiniFormData(prev => ({ ...prev, tagNumber: e.target.value }))}
                  placeholder="Enter tag number"
                  className="w-full"
                />
              </div>
              
              <div>
                <Label htmlFor="inline-job" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Job Number</Label>
                <Input
                  id="inline-job"
                  value={miniFormData.jobNumber}
                  onChange={(e) => setMiniFormData(prev => ({ ...prev, jobNumber: e.target.value }))}
                  placeholder="Enter job number"
                  className="w-full"
                />
              </div>
              
              <div>
                <Label htmlFor="inline-msn" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">MSN No.</Label>
                <Input
                  id="inline-msn"
                  value={miniFormData.msnNumber}
                  onChange={(e) => setMiniFormData(prev => ({ ...prev, msnNumber: e.target.value }))}
                  placeholder="Enter MSN number"
                  className="w-full"
                />
              </div>
            </div>

            {/* Technical Specifications Section */}
            <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-200">
              <Label className="text-sm sm:text-base font-semibold text-gray-800 mb-3 sm:mb-4 block">Technical Specifications</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="inline-size" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Size</Label>
                  <Input
                    id="inline-size"
                    value={miniFormData.size}
                    onChange={(e) => setMiniFormData(prev => ({ ...prev, size: e.target.value }))}
                    placeholder="e.g., 4.2m x 1.6m"
                    className="w-full"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Dimensions (length × width × height)</p>
                </div>
                
                <div>
                  <Label htmlFor="inline-material" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Material</Label>
                  <Input
                    id="inline-material"
                    value={miniFormData.material}
                    onChange={(e) => setMiniFormData(prev => ({ ...prev, material: e.target.value }))}
                    placeholder="e.g., SS 304, Carbon Steel"
                    className="w-full"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Primary material specification</p>
                </div>
                
                <div>
                  <Label htmlFor="inline-design-code" className="text-xs sm:text-sm font-medium text-gray-700 mb-2 block">Design Code</Label>
                  <Input
                    id="inline-design-code"
                    value={miniFormData.designCode}
                    onChange={(e) => setMiniFormData(prev => ({ ...prev, designCode: e.target.value }))}
                    placeholder="e.g., ASME VIII Div 1, TEMA Class R"
                    className="w-full"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Applicable design standard</p>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-3 sm:pt-4">
              <Button 
                onClick={handleMiniFormSubmit}
                disabled={
                  !miniFormData.equipmentName || 
                  !miniFormData.tagNumber || 
                  !miniFormData.jobNumber || 
                  !miniFormData.msnNumber ||
                  (miniFormData.equipmentName === 'Custom' && !miniFormData.customEquipmentName)
                }
                className={`${
                  miniFormData.equipmentName && 
                  miniFormData.tagNumber && 
                  miniFormData.jobNumber && 
                  miniFormData.msnNumber &&
                  (miniFormData.equipmentName !== 'Custom' || miniFormData.customEquipmentName)
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-400 text-gray-600 cursor-not-allowed'
                }`}
              >
                <Plus size={14} className="sm:w-4 sm:h-4 mr-2" />
                Create Equipment
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Search Equipment */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <div className="relative">
          <Input
            type="text"
            placeholder="Search by equipment name, tag number, job number, or MSN..."
            className="h-9 sm:h-10 text-xs sm:text-sm pr-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search size={16} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Phase Tabs */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="border-b border-gray-200 overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <nav className="flex min-w-max space-x-6 sm:space-x-8 px-4 sm:px-6 whitespace-nowrap pb-0.5" aria-label="Equipment Phase Tabs">
            <button
              onClick={() => setSelectedPhase('all')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${selectedPhase === 'all'
                ? 'border-gray-500 text-gray-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Show All
              <span className="ml-2 bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {localEquipment.length}
              </span>
            </button>
            <button
              onClick={() => setSelectedPhase('documentation')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${selectedPhase === 'documentation'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Documentation
              <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {localEquipment.filter(eq => eq.progressPhase === 'documentation').length}
              </span>
            </button>
            <button
              onClick={() => setSelectedPhase('manufacturing')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${selectedPhase === 'manufacturing'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Manufacturing
              <span className="ml-2 bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {localEquipment.filter(eq => eq.progressPhase === 'manufacturing').length}
              </span>
            </button>
            <button
              onClick={() => setSelectedPhase('testing')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${selectedPhase === 'testing'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Testing
              <span className="ml-2 bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {localEquipment.filter(eq => eq.progressPhase === 'testing').length}
              </span>
            </button>
            <button
              onClick={() => setSelectedPhase('dispatched')}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${selectedPhase === 'dispatched'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Dispatched
              <span className="ml-2 bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                {localEquipment.filter(eq => eq.progressPhase === 'dispatched').length}
              </span>
            </button>
          </nav>
        </div>
      </div>

      {/* Equipment Grid */}
      {localEquipment.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building size={32} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">No Equipment Added Yet</h3>
          <p className="text-gray-600 mb-6">
            This project doesn't have any equipment added yet. Use the form above to add equipment to this project.
          </p>
          <div className="text-sm text-gray-500">
            Equipment will appear here once added to the project.
          </div>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {(() => {
              // Filter and sort equipment (same logic as before)
              const filteredAndSorted = localEquipment
            .filter(eq => {
              // Phase filter
              const phaseMatch = selectedPhase === 'all' ? true : eq.progressPhase === selectedPhase;
              
              // Search filter
              if (!phaseMatch) return false;
              
              if (searchQuery.trim()) {
                const searchLower = searchQuery.toLowerCase();
                const matchesSearch = 
                  (eq.type || '').toLowerCase().includes(searchLower) ||
                  (eq.name || '').toLowerCase().includes(searchLower) ||
                  (eq.tagNumber || '').toLowerCase().includes(searchLower) ||
                  (eq.jobNumber || '').toLowerCase().includes(searchLower) ||
                  (eq.manufacturingSerial || '').toLowerCase().includes(searchLower);
                return matchesSearch;
              }
              
              return true;
            })
            .sort((a, b) => {
              // Sort by lastUpdate date (descending - latest first)
              if (a.lastUpdate && b.lastUpdate) {
                const dateA = new Date(a.lastUpdate);
                const dateB = new Date(b.lastUpdate);
                return dateB.getTime() - dateA.getTime();
              }
              // If no lastUpdate, sort by ID (newer IDs first)
              return b.id.localeCompare(a.id);
                });
              
              // Pagination: Calculate total pages and slice data
              const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
              const startIndex = (currentPage - 1) * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const paginatedEquipment = filteredAndSorted.slice(startIndex, endIndex);
              
              // Reset to page 1 if current page is out of bounds
              if (currentPage > totalPages && totalPages > 0) {
                setCurrentPage(1);
              }
              
              return paginatedEquipment.map((item) => (
              <Card key={item.id} id={`equipment-card-${item.id}`} className="overflow-hidden hover:shadow-lg transition-shadow relative bg-gray-50 border border-gray-200 h-auto sm:min-h-[420px] flex flex-col">
                <div className="p-3 sm:p-4 flex-1 flex flex-col">
                  {/* PO-CDD Timer Section */}
                  <div className="mb-3 sm:mb-4 p-2 sm:p-2.5 bg-gray-50 border border-gray-200 rounded-md">
                    {editingEquipmentId === item.id ? (
                      // Edit Mode
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                          <span className="text-xs font-medium text-gray-600">PO-CDD</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs text-gray-600">PO-CDD Date</Label>
                            <Input
                              type="date"
                              value={editFormData.poCdd || item.poCdd}
                              onChange={(e) => setEditFormData({ ...editFormData, poCdd: e.target.value })}
                              className="text-xs h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-gray-600">Certification Title</Label>
                            {!showNewCertificationInput[item.id] ? (
                              <Select
                                value={editFormData.certificationTitle || undefined}
                                onValueChange={(value) => {
                                  if (value === '+new') {
                                    setShowNewCertificationInput(prev => ({ ...prev, [item.id]: true }));
                                    setNewCertificationTitle('');
                                  } else {
                                    setEditFormData({ ...editFormData, certificationTitle: value || undefined });
                                  }
                                }}
                              >
                                <SelectTrigger className="text-xs h-8">
                                  <SelectValue placeholder="Select certification title" />
                                </SelectTrigger>
                                <SelectContent>
                                  {allCertificationTitles.length > 0 && (
                                    allCertificationTitles.map((title) => (
                                      <SelectItem key={title} value={title}>
                                        {title}
                                      </SelectItem>
                                    ))
                                  )}
                                  <SelectItem value="+new" className="text-blue-600 font-medium">
                                    <Plus className="w-3 h-3 inline mr-1" />
                                    New
                                  </SelectItem>
                                  {editFormData.certificationTitle && !allCertificationTitles.includes(editFormData.certificationTitle) && (
                                    <SelectItem value={editFormData.certificationTitle}>
                                      {editFormData.certificationTitle}
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="flex gap-1">
                                <Input
                                  placeholder="Enter certification title"
                                  value={newCertificationTitle}
                                  onChange={(e) => setNewCertificationTitle(e.target.value)}
                                  className="text-xs h-8 flex-1"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newCertificationTitle.trim()) {
                                      const title = newCertificationTitle.trim();
                                      setEditFormData({ ...editFormData, certificationTitle: title });
                                      if (!allCertificationTitles.includes(title)) {
                                        setAllCertificationTitles(prev => [...prev, title].sort());
                                      }
                                      setShowNewCertificationInput(prev => ({ ...prev, [item.id]: false }));
                                      setNewCertificationTitle('');
                                    } else if (e.key === 'Escape') {
                                      setShowNewCertificationInput(prev => ({ ...prev, [item.id]: false }));
                                      setNewCertificationTitle('');
                                    }
                                  }}
                                  autoFocus
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() => {
                                    if (newCertificationTitle.trim()) {
                                      const title = newCertificationTitle.trim();
                                      setEditFormData({ ...editFormData, certificationTitle: title });
                                      if (!allCertificationTitles.includes(title)) {
                                        setAllCertificationTitles(prev => [...prev, title].sort());
                                      }
                                    }
                                    setShowNewCertificationInput(prev => ({ ...prev, [item.id]: false }));
                                    setNewCertificationTitle('');
                                  }}
                                >
                                  <Check className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2"
                                  onClick={() => {
                                    setShowNewCertificationInput(prev => ({ ...prev, [item.id]: false }));
                                    setNewCertificationTitle('');
                                  }}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="space-y-1.5">
                        {/* PO Number and Days Counter - Same Row */}
                        <div className="flex items-center justify-between gap-2">
                          {/* PO Number */}
                          {(() => {
                            // For project equipment, use project's PO Number instead of equipment's PO-CDD
                            let poNumber = item.poNumber || (item as any).po_number || (item.custom_fields?.find((f: any) => f.name === 'PO Number')?.value);
                            
                            // If no PO Number found and this is project equipment (not standalone), use project's PO Number
                            if (!poNumber && projectId !== 'standalone' && currentProject?.po_number) {
                              poNumber = currentProject.po_number;
                            }
                            
                            // Only fall back to PO-CDD if still no PO Number found
                            if (!poNumber) {
                              poNumber = item.poCdd;
                            }
                            
                            return poNumber ? (
                          <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                                <span className="text-xs font-medium text-gray-600">PO Number:</span>
                            <div className="text-xs sm:text-sm font-medium text-gray-800 truncate">
                                  {poNumber}
                            </div>
                          </div>
                            ) : null;
                          })()}
                          {/* Days Counter / Dispatched Date - Aligned with PO Number */}
                          <div className="flex items-center">
                          {(() => {
                            if (item.progressPhase === 'dispatched') {
                              return (
                                <div className="text-left">
                                  <div className="text-[11px] sm:text-xs text-gray-500 font-medium">Dispatched on</div>
                                    <div className="text-xs sm:text-sm font-bold text-green-700 truncate">
                                      {(() => {
                                        // Priority: completionDate (dispatch date) > updated_at > today's date
                                        let dispatchDate: Date | null = null;
                                        
                                        // First, try completionDate (set when dispatched)
                                        if (item.completionDate && item.completionDate !== 'No deadline set' && item.completionDate !== 'Not specified') {
                                          try {
                                            const date = new Date(item.completionDate);
                                            if (!isNaN(date.getTime())) {
                                              dispatchDate = date;
                                            }
                                          } catch (e) {
                                            // Continue to next option
                                          }
                                        }
                                        
                                        // Fallback to updated_at if completionDate not available
                                        if (!dispatchDate && item.updated_at) {
                                          try {
                                            const date = new Date(item.updated_at);
                                            if (!isNaN(date.getTime())) {
                                              dispatchDate = date;
                                            }
                                          } catch (e) {
                                            // Continue to next option
                                          }
                                        }
                                        
                                        // If still no date, use today (shouldn't happen, but safety fallback)
                                        if (!dispatchDate) {
                                          dispatchDate = new Date();
                                        }
                                        
                                        return dispatchDate.toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: 'numeric', 
                                          year: 'numeric' 
                                        });
                                      })()}
                                    </div>
                                </div>
                              );
                              } else if ((item.completionDate && item.completionDate !== 'No deadline set' && item.completionDate !== 'Not specified') || (item.poCdd && item.poCdd !== 'To be scheduled')) {
                              try {
                                  const deadlineDate = item.completionDate && item.completionDate !== 'No deadline set' && item.completionDate !== 'Not specified'
                                  ? new Date(item.completionDate) 
                                  : new Date(item.poCdd);
                                const today = new Date();
                                const timeDiff = deadlineDate.getTime() - today.getTime();
                                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

                                if (daysDiff < 0) {
                                  return (
                                    <div className="text-left">
                                      <div className="text-[11px] sm:text-xs text-gray-500 font-medium">Days to Completion</div>
                                      <div className="text-xs sm:text-sm font-bold text-red-700">{Math.abs(daysDiff)} days overdue</div>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div className="text-left">
                                      <div className="text-[11px] sm:text-xs text-gray-500 font-medium">Days to Completion</div>
                                      <div className="text-xs sm:text-sm font-bold text-blue-700">{daysDiff} days to go</div>
                                    </div>
                                  );
                                }
                              } catch (error) {
                                return (
                                  <div className="text-left">
                                    <div className="text-[11px] sm:text-xs text-gray-500 font-medium">Days to Completion</div>
                                    <div className="text-xs sm:text-sm font-bold text-gray-600">No deadline set</div>
                                  </div>
                                );
                              }
                            } else {
                              return (
                                <div className="text-left">
                                  <div className="text-[11px] sm:text-xs text-gray-500 font-medium">Days to Completion</div>
                                  <div className="text-xs sm:text-sm font-bold text-gray-600">No deadline set</div>
                                </div>
                              );
                            }
                          })()}
                          </div>
                        </div>
                        {/* PO-CDD / Completion Date */}
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0"></div>
                          <span className="text-xs font-medium text-gray-600">PO-CDD:</span>
                          <div className="text-xs sm:text-sm font-medium text-gray-800 truncate">
                            {(() => {
                              // Use completion date if available, otherwise use poCdd
                              if (item.completionDate && item.completionDate !== 'No deadline set' && item.completionDate !== 'Not specified') {
                                try {
                                  const completionDate = new Date(item.completionDate);
                                  if (!isNaN(completionDate.getTime())) {
                                    return completionDate.toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric', 
                                      year: 'numeric' 
                                    });
                                  }
                                } catch (e) {
                                  // Fall through to poCdd
                                }
                              }
                              return item.poCdd && item.poCdd !== 'To be scheduled' ? item.poCdd : 'To be scheduled';
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Progress Image Section */}
                  <div className="mb-4">
                    {editingEquipmentId === item.id ? (
                      // Edit Mode - Upload new progress image
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-gray-700">Progress Image</div>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleImageUpload(file);
                            }}
                            className="hidden"
                            id={`image-upload-${item.id}`}
                          />
                          <label htmlFor={`image-upload-${item.id}`} className="cursor-pointer">
                            <Camera size={24} className="mx-auto text-gray-400 mb-2" />
                            <div className="text-sm text-gray-600">
                              {newProgressImage ? newProgressImage.name : 'Click to upload image'}
                            </div>
                          </label>
                          {newProgressImage && (
                            <div className="text-xs text-green-600 mt-2">
                              Selected: {newProgressImage.name}
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <Input
                            placeholder="Describe what this image shows (required)..."
                            value={imageDescription}
                            onChange={(e) => setImageDescription(e.target.value)}
                            className="text-sm pr-10"
                            required
                          />
                          {newProgressImage && !imageDescription?.trim() && (
                            <p className="text-xs text-red-500 mt-1">Description is required to upload the image</p>
                          )}
                          <button
                            type="button"
                            onClick={isImageRecording ? stopImageAudioRecording : startImageAudioRecording}
                            className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded transition-colors ${isImageRecording
                                ? 'text-red-600 hover:text-red-700 hover:bg-red-50'
                                : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                              }`}
                            title={isImageRecording ? "Stop recording" : "Add audio description"}
                          >
                            {isImageRecording ? (
                              <MicOff className="w-4 h-4" />
                            ) : (
                              <Mic className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        {/* Recording Status */}
                        {isImageRecording && (
                          <div className="flex items-center gap-2 mt-2 px-2 py-1 bg-red-50 rounded-md border border-red-200">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-red-600 font-medium">
                              Recording... {formatDuration(imageRecordingDuration)}
                            </span>
                          </div>
                        )}

                        {imageAudioChunks.length > 0 && !isImageRecording && (
                          <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-green-50 rounded-md border border-green-200">
                            <button
                              onClick={() => {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  playImageAudio(reader.result as string);
                                };
                                reader.readAsDataURL(imageAudioChunks[0]);
                              }}
                              className="flex items-center justify-center w-6 h-6 bg-green-500 hover:bg-green-600 rounded-full text-white transition-colors"
                              title="Play audio"
                            >
                              <Play className="w-3 h-3 ml-0.5" />
                            </button>
                            <div className="flex-1">
                              <span className="text-xs text-green-600 font-medium">
                                Audio recorded ({formatDuration(imageRecordingDuration)})
                              </span>
                            </div>
                            <button
                              onClick={removeImageAudio}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                              title="Remove audio"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      // View Mode - Show progress image
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-gray-700">Progress Image</div>
                        {isLoadingProgressImages ? (
                          <div className="w-full h-64 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-dashed border-blue-200 rounded-lg flex items-center justify-center">
                            <div className="text-center">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                              <p className="text-sm font-medium text-gray-700 mb-1">
                                Fetching latest images of your equipment, straight from your plant...
                              </p>
                              <p className="text-xs text-gray-500">
                                This may take a few moments
                              </p>
                            </div>
                          </div>
                        ) : item.progressImages && item.progressImages.length > 0 ? (
                          <div className="space-y-2">
                            {/* Progress Image Display with Navigation */}
                            <div className="relative">
                              {(() => {
                                const currentIndex = currentProgressImageIndex[item.id] || 0;
                                const currentImage = item.progressImages[currentIndex];


                                if (!currentImage) {
                                  return (
                                    <div className="w-full h-64 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                                      <div className="text-center text-gray-500">
                                        <Camera size={24} className="mx-auto mb-2" />
                                        <div className="text-sm">Image not found</div>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div 
                                    className="relative cursor-pointer group"
                                    onClick={() => {
                                      setShowImagePreview({ url: currentImage, equipmentId: item.id, currentIndex: currentIndex });
                                    }}
                                  >
                                    <img
                                      src={currentImage}
                                      alt="Progress"
                                      className="w-full h-64 object-cover rounded-lg border border-gray-200 pointer-events-none"
                                    />

                                    {/* Eye Button */}
                                    <button
                                      className="absolute top-2 right-2 bg-white text-gray-800 p-1 rounded text-xs z-20 border border-gray-300 shadow-sm hover:bg-gray-50"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowImagePreview({ url: currentImage, equipmentId: item.id, currentIndex: currentIndex });
                                      }}
                                      title="View larger image"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>

                                    {/* Navigation arrows for multiple images */}
                                    {item.progressImages.length > 1 && (
                                      <>
                                        <button
                                          className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all z-10"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const prevIndex = currentIndex > 0 ? currentIndex - 1 : item.progressImages.length - 1;
                                            setCurrentProgressImageIndex(prev => ({
                                              ...prev,
                                              [item.id]: prevIndex
                                            }));
                                          }}
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                          </svg>
                                        </button>
                                        <button
                                          className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-all z-10"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const nextIndex = currentIndex < item.progressImages.length - 1 ? currentIndex + 1 : 0;
                                            setCurrentProgressImageIndex(prev => ({
                                              ...prev,
                                              [item.id]: nextIndex
                                            }));
                                          }}
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                          </svg>
                                        </button>
                                      </>
                                    )}

                                    {/* Image counter */}
                                    <div className="absolute top-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded z-10 pointer-events-none">
                                      {currentIndex + 1} of {item.progressImages.length}
                                    </div>

                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded-lg flex items-center justify-center pointer-events-none">
                                      <Eye size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>


                          </div>
                        ) : (
                          <div className="w-full h-64 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                            <div className="text-center text-gray-500">
                              <Camera size={24} className="mx-auto mb-2" />
                              <div className="text-sm">No progress image</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div className="flex-1 min-w-0 pr-2">
                      <h3 className="font-semibold text-foreground truncate text-sm sm:text-base">
                        {item.name || item.type}
                      </h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">Tag: {item.tagNumber || '—'}</p>
                      <div className="flex flex-col gap-1 mt-1 text-xs text-gray-500">
                        <span className="truncate">MSN: {item.manufacturingSerial || '—'}</span>
                        <span className="truncate">Job: {item.jobNumber || '—'}</span>
                      </div>
                    </div>

                    {/* Phase Status Dropdown */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <Select
                        value={item.progressPhase}
                        onValueChange={(value) => handleProgressPhaseChange(item.id, value as 'documentation' | 'manufacturing' | 'testing' | 'dispatched')}
                        disabled={loadingStates[`phase-${item.id}`]}
                      >
                        <SelectTrigger className="w-28 sm:w-32 md:w-36 h-7 text-xs">
                          <SelectValue />
                          {loadingStates[`phase-${item.id}`] && (
                            <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                          )}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="documentation">Documentation</SelectItem>
                          <SelectItem value="manufacturing">Manufacturing</SelectItem>
                          <SelectItem value="testing">Testing</SelectItem>
                          <SelectItem value="dispatched">Dispatched</SelectItem>
                        </SelectContent>
                      </Select>
                      {/* Certification Title - Capsule UI below status dropdown */}
                      {item.certificationTitle && (
                        <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                          {item.certificationTitle}
                        </span>
                      )}
                    </div>
                  </div>






                  <Tabs defaultValue="overview" className="w-full flex-1 flex flex-col">
                    <TabsList className="grid w-full grid-cols-5 h-8 sm:h-9">
                      <TabsTrigger value="overview" className="text-xs px-2 sm:px-3">Overview</TabsTrigger>
                      <TabsTrigger value="technical" className="text-xs px-2 sm:px-3">Technical</TabsTrigger>
                      <TabsTrigger value="team" className="text-xs px-2 sm:px-3">Team</TabsTrigger>
                      <TabsTrigger value="progress" className="text-xs px-2 sm:px-3">Updates</TabsTrigger>
                      <TabsTrigger
                        value="documents"
                        className="text-xs px-2 sm:px-3"
                        onClick={() => handleDocsTabClick(item.id)}
                      >
                        Docs
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="mt-3 sm:mt-4 space-y-3">
                      {editingEquipmentId === item.id ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <Label className="text-xs text-gray-600">Size</Label>
                              <Input
                                placeholder="e.g., 4.2m x 1.6m"
                                value={editFormData.size ?? ''}
                                onChange={(e) => setEditFormData({...editFormData, size: e.target.value})}
                                className="text-xs h-8"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">Dimensions (length × width × height)</p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-600">Material</Label>
                              <Input
                                placeholder="e.g., SS 304, Carbon Steel"
                                value={editFormData.material ?? ''}
                                onChange={(e) => setEditFormData({...editFormData, material: e.target.value})}
                                className="text-xs h-8"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">Primary material specification</p>
                            </div>
                            <div>
                              <Label className="text-xs text-gray-600">Design Code</Label>
                              <Input
                                placeholder="e.g., ASME VIII Div 1, TEMA Class R"
                                value={editFormData.designCode ?? ''}
                                onChange={(e) => setEditFormData({...editFormData, designCode: e.target.value})}
                                className="text-xs h-8"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">Applicable design standard</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-gray-600">Last Updated On</Label>
                              <Input
                                type="date"
                                value={(() => {
                                  // Priority 1: Use overviewLastUpdateRaw if available (user input or initialized)
                                  if (overviewLastUpdateRaw[item.id]) {
                                    const rawValue = overviewLastUpdateRaw[item.id];
                                    const dateValue = rawValue.split('T')[0].split(' ')[0]; // Handle both datetime and date strings
                                    if (dateValue && dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                      return dateValue;
                                    }
                                  }
                                  // Priority 2: Fall back to equipment's last_update field from database
                                  // This ensures the date shows even if overviewLastUpdateRaw isn't set yet
                                  const equipment = localEquipment.find(eq => eq.id === item.id);
                                  if (equipment && (equipment as any).last_update) {
                                    const rawDate = String((equipment as any).last_update);
                                    const dateValue = rawDate.split('T')[0].split(' ')[0]; // Handle both datetime and date strings
                                    if (dateValue && dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                      return dateValue;
                                    }
                                  }
                                  return '';
                                })()}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setOverviewLastUpdateRaw(prev => ({ ...prev, [item.id]: raw }));
                                  setEditFormData({
                                    ...editFormData,
                                    lastUpdate: raw ? formatDateOnly(raw) : ''
                                  });
                                }}
                                className="text-xs h-8"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">Reference date shown to the team</p>
                              {(() => {
                                const displayValue = overviewLastUpdateRaw[item.id] || 
                                  (localEquipment.find(eq => eq.id === item.id) as any)?.last_update;
                                return displayValue ? (
                                <p className="text-[11px] text-blue-500 mt-1">
                                    {formatDateDisplay(String(displayValue).split('T')[0])}
                                </p>
                                ) : null;
                              })()}
                            </div>
                            <div>
                              <Label className="text-xs text-gray-600">Next Milestone Date</Label>
                              <Input
                                type="date"
                                value={(() => {
                                  const dateValue = overviewNextMilestoneDate[item.id];
                                  // Only return valid date format (YYYY-MM-DD), not strings like "To be scheduled"
                                  if (dateValue && dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                    return dateValue;
                                  }
                                  return '';
                                })()}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  // Only set if it's a valid date format
                                  if (raw && raw.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                  setOverviewNextMilestoneDate(prev => ({ ...prev, [item.id]: raw }));
                                  setEditFormData({
                                    ...editFormData,
                                    nextMilestoneDate: raw ? new Date(raw).toISOString() : undefined
                                  });
                                  } else if (!raw) {
                                    // Clear if empty
                                    setOverviewNextMilestoneDate(prev => {
                                      const updated = { ...prev };
                                      delete updated[item.id];
                                      return updated;
                                    });
                                    setEditFormData({
                                      ...editFormData,
                                      nextMilestoneDate: undefined
                                    });
                                  }
                                }}
                                className="text-xs h-8"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">Pick the milestone date from the calendar</p>
                              {overviewNextMilestoneDate[item.id] && overviewNextMilestoneDate[item.id].match(/^\d{4}-\d{2}-\d{2}$/) && (
                                <p className="text-[11px] text-blue-500 mt-1">
                                  {formatDateDisplay(overviewNextMilestoneDate[item.id])}
                                </p>
                              )}
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-gray-600">Next Milestone Title / Summary</Label>
                            <Input
                              placeholder="e.g., Hydro Test"
                              value={editFormData.nextMilestone ?? ''}
                              onChange={(e) => setEditFormData({...editFormData, nextMilestone: e.target.value})}
                              className="text-xs h-8"
                            />
                            <p className="text-[11px] text-gray-400 mt-1">Short description that appears with the milestone date</p>
                          </div>
                          <div>
                            <Label className="text-xs text-gray-600">Update Description / Notes</Label>
                            <Textarea
                              placeholder="Share the latest progress, issues, or any client-facing summary"
                              value={editFormData.notes ?? ''}
                              onChange={(e) => setEditFormData({...editFormData, notes: e.target.value})}
                              className="text-xs min-h-[88px]"
                            />
                            <p className="text-[11px] text-gray-400 mt-1">This summary will surface in the overview snapshot</p>
                          </div>
                        </div>
                      ) : (
                        (() => {
                          const sizeValue = item.size && item.size.trim() !== '' ? item.size : '—';
                          const materialValue = item.material && item.material.trim() !== '' ? item.material : '—';
                          const designCodeValue = item.designCode && item.designCode.trim() !== '' ? item.designCode : '—';
                          const equipmentEntries = progressEntries[item.id] || item.progressEntries || [];
                          const latestEntry = equipmentEntries.length > 0 ? equipmentEntries[equipmentEntries.length - 1] : null;
                          // Get last updated value and format it as date only
                          // For standalone equipment, prioritize last_update (DATE column) over other fields
                          // last_update is already in YYYY-MM-DD format, so use it directly
                          const lastUpdatedRaw = (item as any).last_update || item.lastUpdate || latestEntry?.date || latestEntry?.created_at || item.updated_at || (item as any).updatedAt || '';
                          const lastUpdatedValue = lastUpdatedRaw ? formatDateOnly(lastUpdatedRaw) : '—';
                          const updateDescription =
                            (item.notes && item.notes.trim() !== '' ? item.notes : '') ||
                            latestEntry?.text || latestEntry?.comment || latestEntry?.entry_text ||
                            (item.nextMilestone && item.nextMilestone.trim() !== '' ? item.nextMilestone : '') ||
                            'No recent update details shared yet.';

                          return (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Size</div>
                                  <div className="text-sm font-semibold text-gray-900">{sizeValue}</div>
                                  <div className="text-[11px] text-gray-400 mt-1">Dimensions (L × W × H)</div>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Material</div>
                                  <div className="text-sm font-semibold text-gray-900">{materialValue}</div>
                                  <div className="text-[11px] text-gray-400 mt-1">Primary specification</div>
                                </div>
                                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Design Code</div>
                                  <div className="text-sm font-semibold text-gray-900">{designCodeValue}</div>
                                  <div className="text-[11px] text-gray-400 mt-1">Applicable standard</div>
                                </div>
                              </div>
                              <div className="p-4 rounded-lg border border-blue-100 bg-blue-50">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                  <div>
                                    <div className="text-[11px] uppercase tracking-wide text-blue-600">Last Updated</div>
                                    <div className="text-sm font-semibold text-gray-900 mt-1">{lastUpdatedValue}</div>
                                  </div>
                                  {(item.nextMilestone && item.nextMilestone.trim() !== '') || item.nextMilestoneDate ? (
                                    <div className="text-left sm:text-right">
                                      <div className="text-[11px] uppercase tracking-wide text-blue-500">Next Milestone</div>
                                      {item.nextMilestone && item.nextMilestone.trim() !== '' && (
                                        <div className="text-xs font-medium text-blue-700 mt-1">{item.nextMilestone}</div>
                                      )}
                                      {item.nextMilestoneDate && (
                                        <div className="text-[11px] text-blue-500 mt-1">
                                          {formatDateDisplay(item.nextMilestoneDate)}
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="mt-3 p-3 rounded-md bg-white/70 border border-blue-100 text-xs text-blue-700 leading-relaxed">
                                  {updateDescription}
                                </div>
                              </div>
                            </>
                          );
                        })()
                      )}
                    </TabsContent>

                    <TabsContent value="technical" className="mt-3 sm:mt-4 space-y-2 flex-1 flex flex-col">
                      <div className="space-y-2 text-xs sm:text-sm flex-1 flex flex-col">
                        {/* Technical Section Buttons */}
                        <div className="overflow-x-auto overflow-y-hidden scroll-smooth mb-4 -mx-1 px-1">
                          <div className="flex flex-nowrap sm:flex-wrap gap-2 min-w-max sm:min-w-0">
                            {technicalSections[item.id] && technicalSections[item.id].length > 0 && (
                              <>
                                {technicalSections[item.id].map((section) => (
                                  <Button
                                    key={section.name}
                                    variant={selectedSection[item.id] === section.name ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setSelectedSection(prev => ({ ...prev, [item.id]: section.name }))}
                                    onDoubleClick={() => {
                                      setEditingEquipmentId(item.id);
                                      setEditingSectionName(section.name);
                                      setEditingSectionOldName(section.name);
                                      setIsEditSectionModalOpen(true);
                                    }}
                                    className={`text-xs sm:text-sm px-3 py-1.5 sm:py-1 h-8 sm:h-7 whitespace-nowrap flex-shrink-0 ${selectedSection[item.id] === section.name
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-white text-gray-700 border-gray-300'
                                      }`}
                                  >
                                    {section.name}
                                  </Button>
                                ))}
                              </>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingEquipmentId(item.id);
                                setIsAddSectionModalOpen(true);
                              }}
                              className="text-xs sm:text-sm px-3 py-1.5 sm:py-1 h-8 sm:h-7 bg-green-100 text-green-700 border-green-300 hover:bg-green-200 whitespace-nowrap flex-shrink-0"
                            >
                              <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                              Add Section
                            </Button>
                          </div>
                        </div>

                        {/* Selected Section Details */}
                        {technicalSections[item.id] && technicalSections[item.id].length > 0 ? (
                          (() => {
                            // Auto-select first section if no section is selected
                            const currentSectionName = selectedSection[item.id] || technicalSections[item.id][0]?.name;
                            const currentSection = technicalSections[item.id].find(s => s.name === currentSectionName);

                            // Update selected section if not set
                            if (!selectedSection[item.id] && technicalSections[item.id].length > 0) {
                              setSelectedSection(prev => ({ ...prev, [item.id]: technicalSections[item.id][0].name }));
                            }

                            return currentSection ? (
                              <div className="space-y-3">
                                {(() => {
                                  const currentSection = technicalSections[item.id]?.find(s => s.name === selectedSection[item.id]);
                                  if (!currentSection) return null;
                                  return (
                                    <>
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-3">
                                        <h4 className="text-sm font-semibold text-gray-900">{currentSection.name}</h4>
                                        <div className="flex flex-row gap-2 flex-nowrap">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              setShowAddFieldInputs(prev => ({ ...prev, [item.id]: true }));
                                              setNewFieldName('');
                                              setNewFieldValue('');
                                            }}
                                            className="text-xs px-2 sm:px-3 py-1 h-7 bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap flex-shrink-0"
                                          >
                                            <Plus className="w-3 h-3 sm:mr-1" />
                                            <span className="hidden sm:inline">Add Custom Field</span>
                                            <span className="sm:hidden">Add Custom Field</span>
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={async () => {
                                              if (isEditMode[item.id]) {
                                                // Done Editing - Save changes directly to database
                                                try {
                                                  await fastAPI.updateEquipment(item.id, {
                                                    technical_sections: technicalSections[item.id] || []
                                                  }, user?.id);

                                                  toast({
                                                    title: "Success",
                                                    description: "Custom fields updated successfully",
                                                  });
                                                } catch (error) {
                                                  console.error('Error saving custom fields:', error);
                                                  toast({
                                                    title: "Error",
                                                    description: "Failed to save custom fields",
                                                    variant: "destructive",
                                                  });
                                                }
                                              }
                                              
                                              setIsEditMode(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                                              setShowAddFieldInputs(prev => ({ ...prev, [item.id]: false }));
                                            }}
                                            className="text-xs px-2 sm:px-3 py-1 h-7 bg-green-600 text-white hover:bg-green-700 whitespace-nowrap flex-shrink-0"
                                          >
                                            <Edit className="w-3 h-3 sm:mr-1" />
                                            <span className="hidden sm:inline">{isEditMode[item.id] ? 'Done Editing' : 'Edit Custom Field'}</span>
                                            <span className="sm:hidden">{isEditMode[item.id] ? 'Done Editing' : 'Edit Custom Field'}</span>
                                          </Button>
                                        </div>
                                      </div>

                                      {/* Add Field Inputs */}
                                      {showAddFieldInputs[item.id] && (
                                        <div className="space-y-2 p-3 bg-gray-50 rounded-md border">
                                          <div className="flex gap-2">
                                            <Input
                                              placeholder="Field name (e.g., Pressure)"
                                              value={newFieldName}
                                              onChange={(e) => setNewFieldName(e.target.value)}
                                              className="text-xs h-7"
                                            />
                                            <Input
                                              placeholder="Field value (e.g., 150 PSI)"
                                              value={newFieldValue}
                                              onChange={(e) => setNewFieldValue(e.target.value)}
                                              className="text-xs h-7"
                                            />
                                          </div>
                                          <div className="flex gap-2">
                                            <Button
                                              size="sm"
                                              onClick={async () => {
                                                // Capture field values before clearing
                                                const fieldNameToSave = newFieldName.trim();
                                                const fieldValueToSave = newFieldValue.trim();
                                                
                                                // Clear fields immediately but keep form open for next entry
                                                setNewFieldName('');
                                                setNewFieldValue('');

                                                if (fieldNameToSave) {
                                                  const newField = { name: fieldNameToSave, value: fieldValueToSave };
                                                  const currentSection = selectedSection[item.id];

                                                  if (currentSection) {
                                                    // Update technical sections with new custom field
                                                    const updatedSections = (technicalSections[item.id] || []).map(section =>
                                                      section.name === currentSection
                                                        ? { ...section, customFields: [...section.customFields, newField] }
                                                        : section
                                                    );

                                                    // Update local state
                                                    setTechnicalSections(prev => ({
                                                      ...prev,
                                                      [item.id]: updatedSections
                                                    }));

                                                    // Save to database using the same API as main save
                                                    try {
                                                      await fastAPI.updateEquipment(item.id, {
                                                        technical_sections: updatedSections
                                                      }, user?.id);

                                                      toast({
                                                        title: "Success",
                                                        description: "Custom field added successfully",
                                                      });
                                                    } catch (error) {
                                                      console.error('Error saving custom field:', error);
                                                      toast({
                                                        title: "Error",
                                                        description: "Failed to save custom field",
                                                        variant: "destructive",
                                                      });
                                                    }
                                                  }
                                                }
                                              }}
                                              className="text-xs px-3 py-1 h-6 bg-green-600 text-white hover:bg-green-700"
                                            >
                                              <Check className="w-3 h-3 mr-1" />
                                              Save
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => {
                                                setShowAddFieldInputs(prev => ({ ...prev, [item.id]: false }));
                                                setNewFieldName('');
                                                setNewFieldValue('');
                                              }}
                                              className="text-xs px-3 py-1 h-6"
                                            >
                                              <X className="w-3 h-3 mr-1" />
                                              Cancel
                                            </Button>
                                          </div>
                                        </div>
                                      )}

                                      {/* Display Custom Fields */}
                                      {(() => {
                                        const currentSection = technicalSections[item.id]?.find(s => s.name === selectedSection[item.id]);
                                        const sectionFields = currentSection?.customFields || [];

                                        return sectionFields.length > 0 ? (
                                          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 max-h-[200px] sm:max-h-64 overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]`}>
                                            {sectionFields.map((field, index) => (
                                              <div key={index} className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 gap-2">
                                                {isEditMode[item.id] ? (
                                                  <div className="flex-1 flex gap-2">
                                                    <Input
                                                      value={field.name}
                                                      onChange={async (e) => {
                                                        const updatedSections = (technicalSections[item.id] || []).map(section =>
                                                          section.name === selectedSection[item.id]
                                                            ? {
                                                              ...section,
                                                              customFields: section.customFields.map((f, i) =>
                                                                i === index ? { ...f, name: e.target.value } : f
                                                              )
                                                            }
                                                            : section
                                                        );
                                                        setTechnicalSections(prev => ({
                                                          ...prev,
                                                          [item.id]: updatedSections
                                                        }));

                                                        // Save to database immediately
                                                        try {
                                                          await updateEquipment(item.id, {
                                                            technical_sections: updatedSections
                                                          });
                                                          // console.log('✅ Field name saved to database, refreshing data...');
                                                          await refreshEquipmentData();
                                                        } catch (error) {
                                                          console.error('Error saving field name change:', error);
                                                        }
                                                      }}
                                                      className="text-xs h-7"
                                                    />
                                                    <Input
                                                      value={field.value}
                                                      onChange={async (e) => {
                                                        const updatedSections = (technicalSections[item.id] || []).map(section =>
                                                          section.name === selectedSection[item.id]
                                                            ? {
                                                              ...section,
                                                              customFields: section.customFields.map((f, i) =>
                                                                i === index ? { ...f, value: e.target.value } : f
                                                              )
                                                            }
                                                            : section
                                                        );
                                                        setTechnicalSections(prev => ({
                                                          ...prev,
                                                          [item.id]: updatedSections
                                                        }));

                                                        // Save to database immediately
                                                        try {
                                                          await updateEquipment(item.id, {
                                                            technical_sections: updatedSections
                                                          });
                                                          // console.log('✅ Field value saved to database, refreshing data...');
                                                          await refreshEquipmentData();
                                                        } catch (error) {
                                                          console.error('Error saving field value change:', error);
                                                        }
                                                      }}
                                                      className="text-xs h-7"
                                                    />
                                                  </div>
                                                ) : (
                                                  <span className="text-gray-800 font-medium text-xs sm:text-sm break-words">{field.name}: <span className="text-gray-600 font-normal">{field.value}</span></span>
                                                )}
                                                {isEditMode[item.id] && (
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={async () => {
                                                      const updatedSections = (technicalSections[item.id] || []).map(section =>
                                                        section.name === selectedSection[item.id]
                                                          ? { ...section, customFields: section.customFields.filter((_, i) => i !== index) }
                                                          : section
                                                      );

                                                      // Update local state
                                                      setTechnicalSections(prev => ({
                                                        ...prev,
                                                        [item.id]: updatedSections
                                                      }));

                                                      // Save to database
                                                      try {
                                                        // console.log('🗑️ Deleting custom field from database:', item.id, updatedSections);
                                                        await updateEquipment(item.id, {
                                                          technical_sections: updatedSections
                                                        });
                                                        // console.log('✅ Custom field deleted successfully');
                                                        toast({
                                                          title: "Success",
                                                          description: "Custom field deleted successfully",
                                                        });
                                                      } catch (error) {
                                                        console.error('Error deleting custom field:', error);
                                                        toast({
                                                          title: "Error",
                                                          description: "Failed to delete custom field",
                                                          variant: "destructive",
                                                        });
                                                      }
                                                    }}
                                                    className="text-xs p-1 h-6 w-6 hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors duration-200"
                                                  >
                                                    <X className="w-4 h-4" />
                                                  </Button>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="text-center py-8 text-gray-500 text-sm bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                            <div className="flex flex-col items-center gap-2">
                                              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                                                <Plus className="w-6 h-6 text-gray-400" />
                                              </div>
                                              <p>No technical specifications added yet.</p>
                                              <p className="text-xs text-gray-400">Click "Add Custom Field" to add specifications.</p>
                                            </div>
                                          </div>
                                        );
                                      })()}

                                      {/* New section info removed - using new structure */}

                                    </>
                                  );
                                })()}
                              </div>
                            ) : null;
                          })()
                        ) : (
                          <div className="text-center py-8 text-gray-500 text-sm">
                            <div className="flex flex-col items-center gap-2">
                              <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                                <Plus className="w-6 h-6 text-gray-400" />
                              </div>
                              <p>Please add section first</p>
                              <p className="text-xs text-gray-400">Click "+ Add Section" to create a new technical section.</p>
                            </div>
                          </div>
                        )}

                      </div>
                    </TabsContent>

                    <TabsContent value="team" className="mt-1 sm:mt-2 space-y-2 flex-1 flex flex-col">
                      <div className="space-y-2 text-xs sm:text-sm flex-1 flex flex-col">
                        {editingEquipmentId === item.id ? (
                          // Edit Mode
                          <div className="space-y-3">
                            {false && item.customTeamPositions && item.customTeamPositions.length > 0 && (
                              <div className="space-y-4">
                                <h4 className="text-sm font-medium text-gray-700">Custom Team Positions</h4>
                                {item.customTeamPositions.map((pos, index) => (
                                  <div key={pos.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <Label className="text-xs text-gray-600">Position</Label>
                                        <Input
                                          value={pos.position}
                                          onChange={(e) => {
                                            const updatedPositions = [...(item.customTeamPositions || [])];
                                            updatedPositions[index] = { ...updatedPositions[index], position: e.target.value };
                                            setLocalEquipment(prev => prev.map(eq =>
                                              eq.id === item.id
                                                ? { ...eq, customTeamPositions: updatedPositions }
                                                : eq
                                            ));
                                          }}
                                          className="text-xs h-8"
                                          placeholder="Position name"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs text-gray-600">Name</Label>
                                        <Input
                                          value={pos.name}
                                          onChange={(e) => {
                                            const updatedPositions = [...(item.customTeamPositions || [])];
                                            updatedPositions[index] = { ...updatedPositions[index], name: e.target.value };
                                            setLocalEquipment(prev => prev.map(eq =>
                                              eq.id === item.id
                                                ? { ...eq, customTeamPositions: updatedPositions }
                                                : eq
                                            ));
                                          }}
                                          className="text-xs h-8"
                                          placeholder="Person name"
                                        />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 mt-2">
                                      <div>
                                        <Label className="text-xs text-gray-600">Email</Label>
                                        <Input
                                          value={pos.email || ''}
                                          onChange={(e) => {
                                            const updatedPositions = [...(item.customTeamPositions || [])];
                                            updatedPositions[index] = { ...updatedPositions[index], email: e.target.value };
                                            setLocalEquipment(prev => prev.map(eq =>
                                              eq.id === item.id
                                                ? { ...eq, customTeamPositions: updatedPositions }
                                                : eq
                                            ));
                                          }}
                                          className="text-xs h-8"
                                          placeholder="Email"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-xs text-gray-600">Phone</Label>
                                        <Input
                                          value={pos.phone || ''}
                                          onChange={(e) => {
                                            const updatedPositions = [...(item.customTeamPositions || [])];
                                            updatedPositions[index] = { ...updatedPositions[index], phone: e.target.value };
                                            setLocalEquipment(prev => prev.map(eq =>
                                              eq.id === item.id
                                                ? { ...eq, customTeamPositions: updatedPositions }
                                                : eq
                                            ));
                                          }}
                                          className="text-xs h-8"
                                          placeholder="Phone"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add New Team Position */}
                            <div className="border-t pt-3">
                              <div className="text-xs font-medium text-gray-700 mb-2">Add New Team Position:</div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs text-gray-600">Position</Label>
                                  <Input
                                    placeholder="e.g., Fabricator, Engineer"
                                    value={newTeamPosition}
                                    onChange={(e) => setNewTeamPosition(e.target.value)}
                                    className="text-xs h-8"
                                  />
                                </div>
                                <div className="relative">
                                  <Label className="text-xs text-gray-600">Name</Label>
                                  <div className="relative">
                                    <Input
                                      placeholder="Type name or select from existing users"
                                      value={newTeamName}
                                      onChange={(e) => {
                                        setNewTeamName(e.target.value);
                                        setShowTeamSuggestions(e.target.value.length > 0);
                                      }}
                                      onFocus={() => setShowTeamSuggestions(newTeamName.length > 0)}
                                      className="text-xs h-8 pr-8"
                                    />
                                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </div>
                                  </div>
                                  {/* Team Member Suggestions Dropdown */}
                                  {showTeamSuggestions && availableTeamMembers.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 z-20 bg-white border border-gray-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
                                      <div className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b">
                                        Select from existing users:
                                      </div>
                                      {availableTeamMembers
                                        .filter(member =>
                                          member.full_name.toLowerCase().includes(newTeamName.toLowerCase()) ||
                                          member.email.toLowerCase().includes(newTeamName.toLowerCase())
                                        )
                                        .slice(0, 5)
                                        .map((member) => (
                                          <div
                                            key={member.id}
                                            onClick={() => selectTeamMember(member)}
                                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-xs border-b border-gray-100 last:border-b-0"
                                          >
                                            <div className="font-medium text-gray-800">{member.full_name}</div>
                                            <div className="text-gray-500">{member.email} • {member.role}</div>
                                          </div>
                                        ))}
                                      <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-t">
                                        Or continue typing to add new user
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-3 mt-3">
                                <div>
                                  <Label className="text-xs text-gray-600">Email</Label>
                                  <Input
                                    placeholder="Enter email address"
                                    type="email"
                                    value={newTeamEmail}
                                    onChange={(e) => setNewTeamEmail(e.target.value)}
                                    className="text-xs h-8"
                                    pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}$"
                                    title="Please enter a valid email address"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-600">Phone</Label>
                                  <Input
                                    placeholder="Enter phone number"
                                    type="tel"
                                    value={newTeamPhone}
                                    onChange={(e) => setNewTeamPhone(e.target.value)}
                                    className="text-xs h-8"
                                    pattern="[0-9]{10}"
                                    title="Please enter a 10-digit phone number"
                                    maxLength={10}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-600">Role</Label>
                                  <Select
                                    value={newTeamRole}
                                    onValueChange={(value: 'editor' | 'viewer') => setNewTeamRole(value)}
                                  >
                                    <SelectTrigger className="text-xs h-8">
                                      <SelectValue placeholder="Select role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="viewer">Viewer</SelectItem>
                                      <SelectItem value="editor">Editor</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => addTeamPosition(item.id)}
                                disabled={!newTeamPosition?.trim() || !newTeamName?.trim()}
                                className="w-full mt-2 bg-green-600 hover:bg-green-700 text-xs"
                              >
                                <Plus size={14} className="mr-2" />
                                Add Team Position
                              </Button>
                            </div>

                            {/* Custom Team Positions List */}
                            {teamPositions[item.id] && teamPositions[item.id].length > 0 && (
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-gray-700">Custom Team Positions:</div>
                                {teamPositions[item.id].map((pos) => (
                                  <div key={pos.id} className="flex items-center justify-between p-2 bg-green-50 rounded border border-green-200">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <div className="text-xs font-medium text-green-800">{pos.position}</div>
                                        <Badge variant={pos.role === 'editor' ? 'default' : 'secondary'} className="text-xs">
                                          {pos.role}
                                        </Badge>
                                      </div>
                                      <div className="text-xs text-green-700">{pos.name}</div>
                                      {pos.email && (
                                        <div className="text-xs text-green-600">{pos.email}</div>
                                      )}
                                      {pos.phone && (
                                        <div className="text-xs text-green-600">{pos.phone}</div>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => removeTeamPosition(item.id, pos.id)}
                                      className="text-red-600 hover:text-red-700 p-1 h-6 w-6"
                                    >
                                      <X size={12} />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          // View Mode - Show empty (team members will be shown in Team Custom Fields section)
                          null
                        )}

                        {/* Team Custom Fields Section */}
                        <div>
                          <div className="flex flex-row items-center justify-between gap-2 mb-2">
                            <div className="text-sm font-semibold text-gray-900">Team Custom Fields</div>
                            <div className="flex gap-2">
                              {/* Commented out buttons as requested */}
                              {/* <Button
                               size="sm"
                               variant="outline"
                               onClick={() => {
                              setShowAddTeamFieldInputs(prev => ({ ...prev, [item.id]: true }));
                              setNewTeamFieldName('');
                              setNewTeamFieldValue('');
                            }}
                            className="text-xs px-3 py-1 h-7 bg-blue-600 text-white hover:bg-blue-700"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add Custom Field
                             </Button>
                             <Button
                               size="sm"
                               variant="outline"
                               onClick={() => {
                              setIsEditTeamMode(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                              setShowAddTeamFieldInputs(prev => ({ ...prev, [item.id]: false }));
                            }}
                            className="text-xs px-3 py-1 h-7 bg-green-600 text-white hover:bg-green-700"
                          >
                            Edit Custom Field
                             </Button> */}

                              {/* Manage Team button that redirects to Settings tab */}
                                <Button
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm h-7 sm:h-6 px-2 sm:px-3 whitespace-nowrap"
                                  onClick={() => {
                                  if (projectId === 'standalone') {
                                    // For standalone equipment, navigate to Settings tab in equipment details view
                                    setViewingEquipmentId(item.id);
                                    // Use setTimeout to ensure viewingEquipmentId is set first
                                    setTimeout(() => {
                                      setEquipmentDetailsTab('settings');
                                    }, 100);
                                  } else {
                                    // For projects, dispatch event to navigate to project Settings tab
                                    const navigateEvent = new CustomEvent('navigateToTab', {
                                      detail: { tab: 'settings' }
                                    });
                                    window.dispatchEvent(navigateEvent);
                                  }
                                  }}
                                >
                                  <Plus size={12} className="w-3 h-3 mr-1" />
                                  Manage Team
                                </Button>
                              {/* <Button
                               size="sm"
                               variant="outline"
                               onClick={() => {
                              setIsEditTeamMode(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                              setShowAddTeamFieldInputs(prev => ({ ...prev, [item.id]: false }));
                            }}
                            className="text-xs px-3 py-1 h-7 bg-green-600 text-white hover:bg-green-700"
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            {isEditTeamMode[item.id] ? 'Done Editing' : 'Edit Custom Field'}
                             </Button> */}
                            </div>
                          </div>

                          {/* Add Field Inputs */}
                          {showAddTeamFieldInputs[item.id] && (
                            <div className="space-y-2 p-3 bg-gray-50 rounded-md border mb-3">
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Field name (e.g., Team Lead)"
                                  value={newTeamFieldName}
                                  onChange={(e) => setNewTeamFieldName(e.target.value)}
                                  className="text-xs h-7"
                                />
                                <Select
                                  value={newTeamFieldValue}
                                  onValueChange={handleAddNewUser}
                                >
                                  <SelectTrigger className="text-xs h-7">
                                    <SelectValue placeholder="Select user" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allUsers.map((user) => (
                                      <SelectItem key={user.id} value={user.name || user.email}>
                                        {user.name || user.email}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="add_new_user" className="text-blue-600 font-medium">
                                      + Add New User
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    if (newTeamFieldName?.trim()) {
                                      const newField = { name: newTeamFieldName?.trim(), value: newTeamFieldValue?.trim() };

                                      // Update team custom fields
                                      const currentTeamFields = (teamCustomFields[item.id] || []);
                                      const updatedTeamFields = [...currentTeamFields, newField];

                                      // Update local state
                                      setTeamCustomFields(prev => ({
                                        ...prev,
                                        [item.id]: updatedTeamFields
                                      }));

                                      // Save to database
                                      try {
                                        // console.log('💾 Saving team custom field to database:', item.id, updatedTeamFields);
                                        await updateEquipment(item.id, {
                                          team_custom_fields: updatedTeamFields
                                        });
                                        // console.log('✅ Team custom field saved successfully');
                                        toast({
                                          title: "Success",
                                          description: "Team custom field added successfully",
                                        });
                                      } catch (error) {
                                        console.error('Error saving team custom field:', error);
                                        toast({
                                          title: "Error",
                                          description: "Failed to save team custom field",
                                          variant: "destructive",
                                        });
                                      }

                                      setNewTeamFieldName('');
                                      setNewTeamFieldValue('');
                                      setShowAddTeamFieldInputs(prev => ({ ...prev, [item.id]: false }));
                                    }
                                  }}
                                  className="text-xs px-3 py-1 h-6 bg-green-600 text-white hover:bg-green-700"
                                >
                                  <Check className="w-3 h-3 mr-1" />
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setShowAddTeamFieldInputs(prev => ({ ...prev, [item.id]: false }));
                                    setNewTeamFieldName('');
                                    setNewTeamFieldValue('');
                                  }}
                                  className="text-xs px-3 py-1 h-6"
                                >
                                  <X className="w-3 h-3 mr-1" />
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Display Team Custom Fields + Project Members */}
                          {(() => {
                            const teamFields = teamCustomFields[item.id] || [];
                            
                            // console.log('🔍 Team tab - projectMembers:', projectMembers);
                            // console.log('🔍 Team tab - equipment ID:', item.id);

                            // For standalone equipment, get team members from standalone_equipment_team_positions
                            let assignedMembers: any[] = [];
                            if (projectId === 'standalone') {
                              // First try to get from allEquipmentTeamMembers state (for equipment card)
                              if (allEquipmentTeamMembers[item.id] && allEquipmentTeamMembers[item.id].length > 0) {
                                assignedMembers = allEquipmentTeamMembers[item.id];
                              } else {
                                // Fallback to teamMembers state (for viewed equipment)
                                assignedMembers = teamMembers.filter(member => 
                                  member.equipmentAssignments && 
                                  (member.equipmentAssignments.includes(item.id) || 
                                   member.equipmentAssignments.includes("All Equipment"))
                                );
                                
                                // OPTIMIZATION: If no team members found, trigger a fetch in background
                                if (assignedMembers.length === 0) {
                                  // Fetch team members for this equipment in background
                                  (async () => {
                                    try {
                                      const { DatabaseService } = await import('@/lib/database');
                                      const teamData = await DatabaseService.getStandaloneTeamPositions(item.id);
                                      
                                      if (teamData && teamData.length > 0) {
                                        const transformedMembers = (teamData as any[]).map((member, index) => ({
                                          id: member.id || `member-${index}`,
                                          name: member.person_name || 'Unknown',
                                          email: member.email || '',
                                          phone: member.phone || '',
                                          position: member.position_name || '',
                                          role: member.role || 'viewer',
                                          permissions: getPermissionsByRole(member.role || 'viewer'),
                                          status: 'active',
                                          avatar: (member.person_name || 'U').split(' ').map((n: string) => n[0]).join('').toUpperCase(),
                                          lastActive: 'Unknown',
                                          equipmentAssignments: [item.id],
                                          dataAccess: getDataAccessByRole(member.role || 'viewer'),
                                          accessLevel: member.role || 'viewer'
                                        }));
                                        
                                        setAllEquipmentTeamMembers(prev => ({
                                          ...prev,
                                          [item.id]: transformedMembers
                                        }));
                                        console.log('✅ Fetched team members on-demand for equipment card:', item.id);
                                      }
                                    } catch (error) {
                                      console.error('❌ Error fetching team members on-demand (non-fatal):', error);
                                    }
                                  })();
                                }
                              }
                            } else {
                              // For project equipment, use projectMembers
                              assignedMembers = projectMembers.filter(member => {
                              // console.log('🔍 Checking member:', member.name, 'equipment_assignments:', member.equipment_assignments);
                              return member.equipment_assignments &&
                                (member.equipment_assignments.includes(item.id) ||
                                 member.equipment_assignments.includes("All Equipment"));
                            });
                            }
                            
                            // console.log('🔍 Team tab - assignedMembers:', assignedMembers);

                            // Create combined list of custom fields and project members
                            const allTeamItems = [
                              // Add project members as team items
                              // 🆕 For standalone equipment, show Name - Position format
                              ...assignedMembers.map(member => ({
                                id: `member-${member.id}`,
                                name: projectId === 'standalone' 
                                  ? `${member.name} - ${member.position || 'Team Member'}` // Show "Name - Position" for standalone
                                  : (member.position || 'Team Member'), // For projects, show position only
                                value: projectId === 'standalone' 
                                  ? member.position || 'Team Member' // For standalone, value is just position
                                  : member.name, // For projects, value is name
                                isProjectMember: true,
                                memberData: member
                              })),
                              // Add custom fields
                              ...teamFields.map((field, index) => ({
                                id: `custom-${index}`,
                                name: field.name,
                                value: field.value,
                                isProjectMember: false,
                                fieldIndex: index
                              }))
                            ];

                            return allTeamItems.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] sm:max-h-64 overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {allTeamItems.map((teamItem, index) => (
                                  <div key={teamItem.id} className="flex items-center justify-between px-4 py-3 bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200">
                                    {isEditTeamMode[item.id] && !teamItem.isProjectMember ? (
                                      <div className="flex-1 flex gap-2">
                                        <Input
                                          value={teamItem.name}
                                          onChange={async (e) => {
                                            const updatedFields = [...teamFields];
                                            updatedFields[(teamItem as any).fieldIndex] = { ...updatedFields[(teamItem as any).fieldIndex], name: e.target.value };

                                            setTeamCustomFields(prev => ({
                                              ...prev,
                                              [item.id]: updatedFields
                                            }));

                                            // Save to database immediately
                                            try {
                                              await updateEquipment(item.id, {
                                                team_custom_fields: updatedFields
                                              });
                                              await refreshEquipmentData();
                                            } catch (error) {
                                              console.error('Error saving team field name change:', error);
                                            }
                                          }}
                                          className="text-xs h-7"
                                        />
                                        <Select
                                          value={teamItem.value}
                                          onValueChange={(value) => handleEditAddNewUser(value, (teamItem as any).fieldIndex, teamFields)}
                                        >
                                          <SelectTrigger className="text-xs h-7">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {allUsers.map((user) => (
                                              <SelectItem key={user.id} value={user.name || user.email}>
                                                {user.name || user.email}
                                              </SelectItem>
                                            ))}
                                            <SelectItem value="add_new_user" className="text-blue-600 font-medium">
                                              + Add New User
                                            </SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    ) : (
                                      <span className="text-gray-800 font-medium text-xs sm:text-sm break-words">
                                        {teamItem.isProjectMember 
                                          ? (projectId === 'standalone' 
                                              ? teamItem.name // For standalone: name already contains "Name - Position" format
                                              : `${teamItem.name}: ${teamItem.value}` // For projects: show "Position: Name" (original format)
                                            )
                                          : `${teamItem.name}: ${teamItem.value}` // For custom fields, show "name: value"
                                        }
                                      </span>
                                    )}
                                    {!teamItem.isProjectMember && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={async () => {
                                          const updatedFields = teamFields.filter((_, i) => i !== (teamItem as any).fieldIndex);

                                          // Update local state
                                          setTeamCustomFields(prev => ({
                                            ...prev,
                                            [item.id]: updatedFields
                                          }));

                                          // Save to database
                                          try {
                                            // console.log('🗑️ Deleting team custom field from database:', item.id, updatedFields);
                                            await updateEquipment(item.id, {
                                              team_custom_fields: updatedFields
                                            });
                                            // console.log('✅ Team custom field deleted successfully');
                                            toast({
                                              title: "Success",
                                              description: "Team custom field deleted successfully",
                                            });
                                          } catch (error) {
                                            console.error('Error deleting team custom field:', error);
                                            toast({
                                              title: "Error",
                                              description: "Failed to delete team custom field",
                                              variant: "destructive",
                                            });
                                          }
                                        }}
                                        className="text-xs p-1 h-6 w-6 hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors duration-200"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-gray-500 text-sm bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                <div className="flex flex-col items-center gap-2">
                                  <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                                    <Plus className="w-6 h-6 text-gray-400" />
                                  </div>
                                  <p>No team members or custom fields added yet.</p>
                                  <p className="text-xs text-gray-400">Add team members from Settings tab or click "Add Custom Field" to add fields.</p>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="progress" className="mt-1 sm:mt-2 space-y-2 flex-1 flex flex-col">
                      <div className="space-y-2 text-xs sm:text-sm flex-1 flex flex-col">
                        {(editingEquipmentId === item.id || addingProgressEntryForEquipment === item.id || editingProgressEntryForEquipment === item.id) ? (
                          // Edit Mode - Add/Edit Progress Entries
                          <div className="space-y-3">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium text-gray-700">
                                {editingProgressEntryId ? 'Edit Progress Entry' : 'Add Progress Entry'}
                              </h4>
                              {(editingProgressEntryId || addingProgressEntryForEquipment === item.id || editingProgressEntryForEquipment === item.id) && (
                                <button
                                  onClick={() => {
                                    setEditingProgressEntryId(null);
                                    setAddingProgressEntryForEquipment(null);
                                    setEditingProgressEntryForEquipment(null);
                                    setNewProgressType('general');
                                    setNewProgressEntry('');
                                    setNewProgressImage(null);
                                    setImageDescription('');
                                    setIsAddingCustomProgressType(false);
                                    setCustomProgressTypeName('');
                                    // Reset audio recording state
                                    setAudioChunks([]);
                                    setRecordingDuration(0);
                                    setIsRecording(false);
                                  }}
                                  className="text-xs text-gray-500 hover:text-gray-700"
                                >
                                  {editingProgressEntryId ? 'Cancel Edit' : 'Cancel Add'}
                                </button>
                              )}
                            </div>

                            {/* 3 Inputs in a Row */}
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <Label className="text-xs text-gray-600">Progress Type</Label>
                                <Select
                                  value={newProgressType}
                                  onValueChange={(value) => {
                                    if (value === 'add-custom') {
                                      setIsAddingCustomProgressType(true);
                                      setNewProgressType('general'); // Temporary default
                                    } else {
                                      setIsAddingCustomProgressType(false);
                                      setCustomProgressTypeName('');
                                      setNewProgressType(value);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="text-xs h-8">
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="welding">Welding</SelectItem>
                                    <SelectItem value="material">Material</SelectItem>
                                    <SelectItem value="inspection">Inspection</SelectItem>
                                    <SelectItem value="assembly">Assembly</SelectItem>
                                    <SelectItem value="testing">Testing</SelectItem>
                                    <SelectItem value="general">General</SelectItem>
                                    <SelectItem value="comment">Comment</SelectItem>
                                    <SelectItem value="image">Image</SelectItem>
                                    {customProgressTypes.map((customType) => (
                                      <SelectItem key={customType} value={customType}>
                                        {customType}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value="add-custom">+ Add Custom</SelectItem>
                                  </SelectContent>
                                </Select>
                                
                                {/* Custom Progress Type Input */}
                                {isAddingCustomProgressType && (
                                  <div className="mt-2 flex items-center space-x-2">
                                    <Input
                                      type="text"
                                      placeholder="Enter custom type name"
                                      value={customProgressTypeName}
                                      onChange={(e) => setCustomProgressTypeName(e.target.value)}
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter' && customProgressTypeName.trim()) {
                                          const trimmedName = customProgressTypeName.trim();
                                          setNewProgressType(trimmedName);
                                          setCustomProgressTypes(prev => {
                                            if (!prev.includes(trimmedName)) {
                                              return [...prev, trimmedName];
                                            }
                                            return prev;
                                          });
                                          setIsAddingCustomProgressType(false);
                                          setCustomProgressTypeName('');
                                        }
                                      }}
                                      className="flex-grow text-xs h-8"
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => {
                                        if (customProgressTypeName.trim()) {
                                          const trimmedName = customProgressTypeName.trim();
                                          setNewProgressType(trimmedName);
                                          setCustomProgressTypes(prev => {
                                            if (!prev.includes(trimmedName)) {
                                              return [...prev, trimmedName];
                                            }
                                            return prev;
                                          });
                                          setIsAddingCustomProgressType(false);
                                          setCustomProgressTypeName('');
                                        }
                                      }}
                                      disabled={!customProgressTypeName.trim()}
                                      className="text-xs h-8 px-2"
                                    >
                                      Add
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setIsAddingCustomProgressType(false);
                                        setCustomProgressTypeName('');
                                        setNewProgressType('general');
                                      }}
                                      className="text-xs h-8 px-2"
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                )}
                              </div>
                              <div>
                                <Label className="text-xs text-gray-600">Comment</Label>
                                <Input
                                  placeholder="Enter progress details"
                                  value={newProgressEntry}
                                  onChange={(e) => setNewProgressEntry(e.target.value)}
                                  className="text-xs h-8"
                                />
                              </div>

                              {/* Audio Recording Section */}
                              <div>
                                <Label className="text-xs text-gray-600">Voice Message</Label>
                                <div className="flex items-center gap-2 mt-1">
                                  {!isRecording ? (
                                    <button
                                      onClick={startAudioRecording}
                                      className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-md border border-blue-200 text-xs font-medium transition-colors"
                                      title="Start voice recording"
                                    >
                                      <Mic className="w-4 h-4" />
                                      Record Voice
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={stopAudioRecording}
                                        className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md text-xs font-medium transition-colors"
                                        title="Stop recording"
                                      >
                                        <MicOff className="w-4 h-4" />
                                        Stop Recording
                                      </button>
                                      <div className="flex items-center gap-2 px-2 py-1 bg-red-50 rounded-md border border-red-200">
                                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                                        <span className="text-xs text-red-600 font-medium">
                                          {formatDuration(recordingDuration)}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                  {audioChunks.length > 0 && (
                                    <div className="flex items-center gap-2 px-2 py-1 bg-green-50 rounded-md border border-green-200">
                                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                      <span className="text-xs text-green-600 font-medium">
                                        Voice recorded ({formatDuration(recordingDuration)})
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-gray-600">Image</Label>
                                <div className="space-y-2">
                                  {/* Show existing image preview when editing */}
                                  {editingProgressEntryId && typeof newProgressImage === 'string' && newProgressImage && (
                                    <div className="relative">
                                      <img
                                        src={newProgressImage}
                                        alt="Existing progress image"
                                        className="w-24 h-24 object-cover rounded-lg border border-gray-200"
                                      />
                                      <button
                                        onClick={() => setNewProgressImage(null)}
                                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs"
                                        title="Remove image"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                      <p className="text-xs text-gray-500 mt-1">Current image (click below to replace)</p>
                                    </div>
                                  )}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        setNewProgressImage(file);
                                      }
                                    }}
                                    className="text-xs h-8 w-full border border-gray-300 rounded px-2"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Image Description */}
                            {(newProgressImage || imageDescription) && (
                              <div>
                                <Label className="text-xs text-gray-600">Image Description</Label>
                                <Input
                                  placeholder="Describe the image (optional)"
                                  value={imageDescription}
                                  onChange={(e) => setImageDescription(e.target.value)}
                                  className="text-xs h-8"
                                />
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => addProgressEntry(item.id)}
                                disabled={!newProgressEntry?.trim()}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs"
                              >
                                {editingProgressEntryId ? (
                                  <>
                                    <Check size={14} className="mr-2" />
                                    Update
                                  </>
                                ) : (
                                  <>
                                    <Plus size={14} className="mr-2" />
                                    Add
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setNewProgressType('general');
                                  setNewProgressEntry('');
                                  setNewProgressImage(null);
                                  setImageDescription('');
                                  setEditingProgressEntryId(null);
                                  setIsAddingCustomProgressType(false);
                                  setCustomProgressTypeName('');
                                  // Reset audio recording state
                                  setAudioChunks([]);
                                  setRecordingDuration(0);
                                  setIsRecording(false);
                                  // Reset image audio recording state
                                  setImageAudioChunks([]);
                                  setImageRecordingDuration(0);
                                  setIsImageRecording(false);
                                }}
                                className="flex-1 bg-white hover:bg-gray-50 border-gray-300 text-gray-700 text-xs"
                              >
                                <X size={14} className="mr-2" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          // View Mode - Show Progress Entries
                          <>
                            {/* Progress Entries List */}
                            <div className="flex flex-row items-center justify-between gap-2 mb-2">
                              <div className="text-sm font-semibold text-gray-900">Progress Entries</div>
                              <Button
                                size="sm"
                                onClick={() => {
                                  // console.log('➕ Add Entry button clicked for equipment:', item.id);
                                  setAddingProgressEntryForEquipment(item.id);
                                  setNewProgressType('general');
                                  setNewProgressEntry('');
                                  setNewProgressImage(null);
                                  setImageDescription('');
                                  setEditingProgressEntryId(null);
                                  setIsAddingCustomProgressType(false);
                                  setCustomProgressTypeName('');
                                  // Reset audio recording state
                                  setAudioChunks([]);
                                  setRecordingDuration(0);
                                  setIsRecording(false);
                                  // Reset image audio recording state
                                  setImageAudioChunks([]);
                                  setImageRecordingDuration(0);
                                  setIsImageRecording(false);
                                  // console.log('🔄 Form reset for new entry');
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm h-7 sm:h-6 px-2 sm:px-3 whitespace-nowrap"
                              >
                                <Plus size={12} className="w-3 h-3 mr-1" />
                                Add Entry
                              </Button>
                            </div>
                            <div className="space-y-3 max-h-[280px] sm:max-h-80 overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {/* New Consolidated Progress Entries */}
                                {item.progressEntries && item.progressEntries.length > 0 ? (
                                  item.progressEntries.map((entry, index) => (
                                    <div key={entry.id} className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all p-3 sm:p-4">
                                      {/* Header: Type Badge */}
                                      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
                                        <span className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold rounded-full border bg-blue-100 text-blue-800 border-blue-200">
                                          {(entry as any).entry_type || entry.type || 'General'}
                                        </span>
                                        
                                        {/* Right Side: Image + Action Buttons */}
                                        <div className="flex items-center gap-1.5 sm:gap-2">
                                          {/* Image Preview - Next to action buttons */}
                                          {(entry.image || (entry as any).image_url) && (
                                            <div 
                                              className="relative group cursor-pointer"
                                              onClick={() => {
                                                // Get user name with priority: entry users > uploadedBy > user object > localStorage > email (last resort)
                                                let userName = (entry as any).users?.full_name || (entry as any).uploadedBy;
                                                
                                                if (!userName) {
                                                  // Try user object
                                                  userName = (user as any)?.full_name;
                                                }
                                                
                                                if (!userName) {
                                                  // Try localStorage userData
                                                  try {
                                                    const userData = JSON.parse(localStorage.getItem('userData') || '{}');
                                                    userName = userData?.full_name || userData?.name;
                                                  } catch (e) {
                                                    // Ignore parse errors
                                                  }
                                                }
                                                
                                                if (!userName) {
                                                  // Try old userName in localStorage
                                                  userName = localStorage.getItem('userName');
                                                }
                                                
                                                // Email as last resort only
                                                if (!userName) {
                                                  userName = user?.email || 'Unknown User';
                                                }
                                                
                                                setShowProgressImageModal({
                                                  url: entry.image || (entry as any).image_url,
                                                  description: entry.imageDescription || (entry as any).image_description,
                                                  uploadedBy: userName,
                                                  uploadDate: entry.uploadDate || (entry as any).created_at
                                                });
                                              }}
                                              title="Click to view larger image"
                                            >
                                              <img
                                                src={entry.image || (entry as any).image_url}
                                                alt={`Progress ${index + 1}`}
                                                className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded-lg border border-gray-200 shadow-sm transition-all hover:shadow-md hover:border-blue-300"
                                              />
                                              {/* Eye Icon Overlay - Visual indicator only */}
                                              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-all opacity-0 group-hover:opacity-100 pointer-events-none">
                                                <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                                              </div>
                                            </div>
                                          )}
                                          
                                          {/* Action Buttons */}
                                          <div className="flex items-center gap-0.5 sm:gap-1">
                                            <button
                                              onClick={() => editProgressEntry(item.id, entry.id)}
                                              className="p-1 sm:p-1.5 hover:bg-blue-50 rounded-md text-blue-600 transition-colors"
                                              title="Edit entry"
                                            >
                                              <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                            </button>
                                            <button
                                              onClick={() => {
                                                if (confirm('Are you sure you want to delete this progress entry?')) {
                                                  deleteProgressEntry(item.id, entry.id);
                                                }
                                              }}
                                              className="p-1 sm:p-1.5 hover:bg-red-50 rounded-md text-red-600 transition-colors"
                                              title="Delete entry"
                                            >
                                              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Description */}
                                      <div className="mb-2 sm:mb-3">
                                        <p className="text-xs sm:text-sm text-gray-800 leading-relaxed break-words">
                                          {entry.comment || (entry as any).entry_text || 'No comment'}
                                        </p>
                                      </div>

                                      {/* Audio Section - Only if audio exists */}
                                      {(entry.audio || (entry as any).audio_data) && (
                                        <div className="mb-2 sm:mb-3 pb-2 sm:pb-3 border-b border-gray-100">
                                          <div className="flex items-center gap-2 bg-green-50 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-green-200 w-fit">
                                            <button
                                              onClick={() => playAudio(entry.audio || (entry as any).audio_data, entry.id)}
                                              className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 bg-green-500 hover:bg-green-600 rounded-full text-white transition-all hover:shadow-md"
                                              title={playingAudioId === entry.id ? "Pause audio" : "Play audio"}
                                            >
                                              {playingAudioId === entry.id ? (
                                                <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                              ) : (
                                                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-0.5" />
                                              )}
                                            </button>
                                            <div className="flex flex-col">
                                              <span className="text-[10px] sm:text-xs font-semibold text-green-800">
                                                Voice
                                              </span>
                                              <span className="text-[10px] sm:text-xs text-green-600">
                                                {(entry.audioDuration || (entry as any).audio_duration) ? formatDuration(entry.audioDuration || (entry as any).audio_duration) : '0:00'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* Footer: Metadata */}
                                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 pt-2 border-t border-gray-100 text-[10px] sm:text-xs text-gray-500">
                                        <div className="flex items-center gap-1 sm:gap-1.5">
                                          <User className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                          <span className="text-blue-600 font-medium truncate">
                                            {(() => {
                                              // Get user name with priority: entry users > uploadedBy > user object > localStorage > email (last resort)
                                              let userName = (entry as any).users?.full_name || (entry as any).uploadedBy;
                                              
                                              if (!userName) {
                                                // Try user object
                                                userName = (user as any)?.full_name;
                                              }
                                              
                                              if (!userName) {
                                                // Try localStorage userData
                                                try {
                                                  const userData = JSON.parse(localStorage.getItem('userData') || '{}');
                                                  userName = userData?.full_name || userData?.name;
                                                } catch (e) {
                                                  // Ignore parse errors
                                                }
                                              }
                                              
                                              if (!userName) {
                                                // Try old userName in localStorage
                                                userName = localStorage.getItem('userName');
                                              }
                                              
                                              // Email as last resort only
                                              if (!userName) {
                                                userName = user?.email || 'Unknown User';
                                              }
                                              
                                              return userName;
                                            })()}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1 sm:gap-1.5">
                                          <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                          <span>
                                            {(() => {
                                              const dateValue = entry.uploadDate || (entry as any).created_at;
                                              if (!dateValue) return 'Unknown date';
                                              try {
                                                const date = new Date(dateValue);
                                                return date.toLocaleDateString('en-US', { 
                                                  month: 'short', 
                                                  day: 'numeric', 
                                                  year: 'numeric' 
                                                });
                                              } catch (error) {
                                                return 'Invalid date';
                                              }
                                            })()}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="flex flex-col items-center justify-center p-8 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-dashed border-gray-300">
                                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-3">
                                      <FileText className="w-6 h-6 text-gray-400" />
                                    </div>
                                    <span className="text-sm text-gray-500 font-medium">No progress entries yet</span>
                                    <span className="text-xs text-gray-400 mt-1">Add your first entry to get started</span>
                                  </div>
                                )}
                              </div>
                          </>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="documents" className="mt-1 sm:mt-2 space-y-2 flex-1 flex flex-col">
                      <div className="space-y-2 text-xs sm:text-sm flex-1 flex flex-col">
                        {editingEquipmentId === item.id ? (
                          // Edit Mode - Upload Documents
                          <div className="space-y-3">
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                              <FileText size={24} className="mx-auto text-gray-400 mb-2" />
                              <div className="text-sm text-gray-600">
                                Click to upload documents
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                PDF, DOC, XLS, DWG, Images supported
                              </div>
                            </div>

                            {/* Simple File Input */}
                            <div className="mt-2">
                              <input
                                type="file"
                                multiple
                                accept=".pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf,.jpg,.jpeg,.png"
                                onChange={(e) => {
                                  // console.log('🚀 SIMPLE: File input changed!');
                                  // console.log('🚀 SIMPLE: Files:', e.target.files);
                                  const files = Array.from(e.target.files || []);
                                  // console.log('🚀 SIMPLE: Files array:', files);
                                  if (files.length > 0) {
                                    // console.log('🚀 SIMPLE: Starting upload...');
                                    handleDocumentUpload(item.id, files);
                                  }
                                }}
                                className="w-full text-xs"
                              />
                            </div>

                            {/* Existing Equipment Documents Display */}
                            {documents[item.id] && documents[item.id]
                              .filter((doc) => {
                                // Filter out Core Documents - they should only appear in Details tab
                                const coreDocumentTypes = ['Unpriced PO File', 'Design Inputs PID', 'Client Reference Doc', 'Other Documents'];
                                return !coreDocumentTypes.includes(doc.document_type || '');
                              })
                              .length > 0 && (
                              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                                <p className="text-sm font-medium text-green-800 mb-2">Existing Equipment Documents:</p>
                                <div className="space-y-1">
                                  {documents[item.id]
                                    .filter((doc) => {
                                      // Filter out Core Documents - they should only appear in Details tab
                                      const coreDocumentTypes = ['Unpriced PO File', 'Design Inputs PID', 'Client Reference Doc', 'Other Documents'];
                                      return !coreDocumentTypes.includes(doc.document_type || '');
                                    })
                                    .map((doc) => (
                                    <div key={doc.id} className="flex items-center justify-between text-sm">
                                      <div className="flex items-center space-x-2">
                                        <FileText size={14} className="text-green-600" />
                                        <span className="text-green-700">{doc.name}</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleOpenDocument(doc)}
                                          className="text-green-600 hover:text-green-800 p-1 h-6 w-6"
                                        >
                                          <Eye size={12} />
                                        </Button>

                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            const newName = prompt('Enter document name:', doc.name);
                                            if (newName && newName.trim()) {
                                              handleDocumentNameChange(item.id, doc.id, newName.trim());
                                            }
                                          }}
                                          className="text-green-600 hover:text-green-800 p-1 h-6 w-6"
                                        >
                                          <Edit size={12} />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleDeleteDocument(item.id, doc.id)}
                                          className="text-red-600 hover:text-red-700 p-1 h-6 w-6"
                                        >
                                          <X size={12} />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Uploaded Documents List */}
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-gray-700">Upload New Documents:</div>
                              <div className="h-36 overflow-y-auto border border-gray-200 rounded bg-gray-50 p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                {(() => {
                                  // console.log('📄 EDIT MODE: Checking documents for equipment:', item.id);
                                  // console.log('📄 EDIT MODE: Documents state:', documents);
                                  // console.log('📄 EDIT MODE: Documents for this equipment:', documents[item.id]);
                                  // console.log('📄 EDIT MODE: Documents length:', documents[item.id]?.length || 0);
                                  // console.log('📄 EDIT MODE: Documents loading:', documentsLoading[item.id]);
                                  return null;
                                })()}
                                {documentsLoading[item.id] ? (
                                  <div className="p-4 space-y-3">
                                    <Skeleton className="h-4 w-full" />
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-4 w-1/2" />
                                  </div>
                                ) : (
                                  <div className="text-xs text-gray-500 italic">Upload new documents using the file input above</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          // View Mode - Show Documents
                          <>
                            <div className="flex flex-row items-center justify-between gap-2 mb-2">
                              <div className="text-sm font-semibold text-gray-900">Equipment Documents</div>
                              <Button
                                size="sm"
                                onClick={() => {
                                  // console.log('➕ Add Document button clicked for equipment:', item.id);
                                  setEditingEquipmentId(item.id);
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm h-7 sm:h-6 px-2 sm:px-3 whitespace-nowrap"
                              >
                                <Plus size={12} className="w-3 h-3 mr-1" />
                                Add Document
                              </Button>
                            </div>
                            <div className="max-h-[200px] sm:h-36 overflow-y-auto border border-gray-200 rounded bg-gray-50 p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                              {(() => {
                                // console.log('📄 PERFECT: Rendering documents for equipment:', item.id);
                                // console.log('📄 PERFECT: Documents state:', documents);
                                // console.log('📄 PERFECT: Documents for this equipment:', documents[item.id]);
                                // console.log('📄 PERFECT: Documents length:', documents[item.id]?.length || 0);
                                // console.log('📄 PERFECT: Documents loading:', documentsLoading[item.id]);
                                return null;
                              })()}
                              {documentsLoading[item.id] ? (
                                <div className="p-4 space-y-3">
                                  <Skeleton className="h-4 w-full" />
                                  <Skeleton className="h-4 w-3/4" />
                                  <Skeleton className="h-4 w-1/2" />
                                </div>
                              ) : documents[item.id] && documents[item.id].length > 0 ? (
                                documents[item.id]
                                  .filter((doc) => {
                                    // Filter out Core Documents - they should only appear in Details tab
                                    const coreDocumentTypes = ['Unpriced PO File', 'Design Inputs PID', 'Client Reference Doc', 'Other Documents'];
                                    return !coreDocumentTypes.includes(doc.document_type || '');
                                  })
                                  .map((doc) => {
                                  const getDocumentCategory = (fileName: string) => {
                                    const ext = fileName.split('.').pop()?.toLowerCase();
                                    if (['pdf'].includes(ext || '')) return 'PDF';
                                    if (['dwg', 'dxf'].includes(ext || '')) return 'CAD';
                                    if (['doc', 'docx'].includes(ext || '')) return 'Document';
                                    if (['xls', 'xlsx'].includes(ext || '')) return 'Spreadsheet';
                                    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) return 'Image';
                                    return 'Other';
                                  };

                                  const getCategoryColor = (category: string) => {
                                    const colors: Record<string, string> = {
                                      'PDF': 'bg-red-100 text-red-800',
                                      'CAD': 'bg-blue-100 text-blue-800',
                                      'Document': 'bg-green-100 text-green-800',
                                      'Spreadsheet': 'bg-yellow-100 text-yellow-800',
                                      'Image': 'bg-purple-100 text-purple-800',
                                      'Other': 'bg-gray-100 text-gray-800'
                                    };
                                    return colors[category] || colors['Other'];
                                  };

                                  const getFileIcon = (fileName: string) => {
                                    const ext = fileName.split('.').pop()?.toLowerCase();
                                    if (['pdf'].includes(ext || '')) return '📄';
                                    if (['dwg', 'dxf'].includes(ext || '')) return '📐';
                                    if (['doc', 'docx'].includes(ext || '')) return '📝';
                                    if (['xls', 'xlsx'].includes(ext || '')) return '📊';
                                    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext || '')) return '🖼️';
                                    return '📎';
                                  };

                                  const category = getDocumentCategory(doc.document_name || doc.name);
                                  const categoryColor = getCategoryColor(category);
                                  const fileIcon = getFileIcon(doc.document_name || doc.name);

                                  return (
                                    <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 p-2 sm:p-2 bg-white rounded border border-gray-200 mb-2 last:mb-0 hover:shadow-sm transition-shadow">
                                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpenDocument(doc)}>
                                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                                          <span className="text-sm flex-shrink-0">{fileIcon}</span>
                                          <span className="text-xs sm:text-sm font-medium text-gray-800 hover:text-gray-900 break-words min-w-0 flex-1">
                                            {doc.document_name || doc.name}
                                          </span>
                                          <span className={`px-1.5 py-0.5 text-[10px] sm:text-xs rounded-full flex-shrink-0 ${categoryColor}`}>
                                            {category}
                                          </span>
                                        </div>
                                        <div className="text-[10px] sm:text-xs text-gray-500 truncate">
                                          By: {doc.uploadedBy} • {new Date(doc.uploadDate).toLocaleDateString()}
                                        </div>
                                      </div>
                                      <div className="flex gap-2 sm:gap-1 justify-end sm:justify-start flex-shrink-0">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 w-7 sm:h-6 sm:w-6 p-0 flex-shrink-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenDocument(doc);
                                          }}
                                        >
                                          <Eye size={14} className="sm:w-3 sm:h-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 w-7 sm:h-6 sm:w-6 p-0 text-red-600 hover:text-red-700 flex-shrink-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteDocument(item.id, doc.id);
                                          }}
                                        >
                                          <Trash2 size={14} className="sm:w-3 sm:h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="flex items-center justify-center p-4 bg-white rounded border border-gray-200">
                                  <div className="text-center">
                                    <FileText size={24} className="text-gray-400 mx-auto mb-2" />
                                    <span className="text-xs text-gray-500">No documents uploaded</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>

                  {/* Action Buttons */}
                  <div className="flex flex-row flex-wrap gap-2 mt-3 mt-auto">
                    {editingEquipmentId === item.id ? (
                      // Edit Mode - Show Save/Cancel
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 bg-white hover:bg-gray-50 border-gray-300 hover:border-gray-400 text-gray-700 text-xs sm:text-sm"
                          onClick={handleCancelEdit}
                        >
                          <X size={14} className="mr-1" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm"
                          onClick={handleSaveEquipment}
                          disabled={loadingStates[`save-${editingEquipmentId}`]}
                        >
                          {loadingStates[`save-${editingEquipmentId}`] ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></div>
                              Saving...
                            </>
                          ) : (
                            <>
                              <Check size={14} className="mr-1" />
                              Save
                            </>
                          )}
                        </Button>
                      </>
                    ) : (
                      // View Mode - Show View (standalone only)/Edit/Complete/Delete
                      <>
                        {/* View button - only for standalone equipment */}
                        {projectId === 'standalone' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 bg-white hover:bg-purple-50 border-purple-200 hover:border-purple-300 text-purple-700 text-xs sm:text-sm"
                            onClick={() => {
                              if (onViewDetails) {
                                onViewDetails();
                              } else {
                                // Set viewing equipment ID to show details view
                                setViewingEquipmentId(item.id);
                              }
                            }}
                          >
                            <Eye size={14} className="mr-1" />
                            View
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 bg-white hover:bg-blue-50 border-blue-200 hover:border-blue-300 text-blue-700 text-xs sm:text-sm"
                          onClick={() => {
                            setEditingEquipmentId(item.id);
                            const formData = {
                              location: item.location || '',
                              supervisor: item.supervisor || '',
                              nextMilestone: item.nextMilestone || '',
                              size: item.size || '',
                              weight: item.weight || '',
                              designCode: item.designCode || '',
                              material: item.material || '',
                              workingPressure: item.workingPressure || '',
                              designTemp: item.designTemp || '',
                              welder: item.welder || '',
                              engineer: item.engineer || '',
                              qcInspector: item.qcInspector || '',
                              projectManager: item.projectManager || '',
                              poCdd: item.poCdd || '',
                              status: item.status || 'on-track',
                              customFields: item.customFields || [],
                              certificationTitle: item.certificationTitle || ''
                            };
                            // console.log('🔧 Setting editFormData with custom fields:', formData);
                            setEditFormData(formData);
                          }}
                        >
                          <Edit size={14} className="mr-1" />
                          Edit
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 bg-white hover:bg-green-50 border-green-200 hover:border-green-300 text-green-700 text-xs sm:text-sm"
                          onClick={() => handleMarkComplete(item)}
                          disabled={loadingStates[`complete-${item.id}`]}
                        >
                          {loadingStates[`complete-${item.id}`] ? (
                            <>
                              <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin mr-1"></div>
                              Completing...
                            </>
                          ) : (
                            <>
                              <Check size={14} className="mr-1" />
                              Complete
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 bg-white hover:bg-red-50 border-red-200 hover:border-red-300 text-red-700 text-xs sm:text-sm"
                          onClick={() => handleDeleteEquipment(item)}
                          disabled={loadingStates[`delete-${item.id}`]}
                        >
                          {loadingStates[`delete-${item.id}`] ? (
                            <>
                              <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin mr-1"></div>
                              Deleting...
                            </>
                          ) : (
                            <>
                              <X size={14} className="mr-1" />
                              Delete
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
              ));
            })()}
        </div>
          
          {/* Pagination Controls */}
          {(() => {
            const filteredAndSorted = localEquipment
              .filter(eq => {
                const phaseMatch = selectedPhase === 'all' ? true : eq.progressPhase === selectedPhase;
                if (!phaseMatch) return false;
                if (searchQuery.trim()) {
                  const searchLower = searchQuery.toLowerCase();
                  return (eq.type || '').toLowerCase().includes(searchLower) ||
                    (eq.name || '').toLowerCase().includes(searchLower) ||
                    (eq.tagNumber || '').toLowerCase().includes(searchLower) ||
                    (eq.jobNumber || '').toLowerCase().includes(searchLower) ||
                    (eq.manufacturingSerial || '').toLowerCase().includes(searchLower);
                }
                return true;
              })
              .sort((a, b) => {
                if (a.lastUpdate && b.lastUpdate) {
                  const dateA = new Date(a.lastUpdate);
                  const dateB = new Date(b.lastUpdate);
                  return dateB.getTime() - dateA.getTime();
                }
                return b.id.localeCompare(a.id);
              });
            
            const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
            const totalItems = filteredAndSorted.length;
            
            if (totalPages <= 1) return null;
            
            return (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} equipment
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                            currentPage === pageNum
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* Image Preview Modal */}
      {showImagePreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={() => {
          setShowImagePreview(null);
        }}>
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Progress Image</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowImagePreview(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </Button>
            </div>
            <div className="relative">
              {/* Image with Navigation Overlay */}
              <div className="relative">
                <img
                  src={showImagePreview.url}
                  alt="Progress"
                  className="w-full h-auto rounded-lg border border-gray-200"
                />

                {/* Image Navigation - Left/Right Sides like Carousel */}
                {(() => {
                  const currentEquipment = localEquipment.find(eq => eq.id === showImagePreview.equipmentId);
                  const images = currentEquipment?.progressImages || []; // Use progressImages instead of images


                  if (images.length > 1) {
                    return (
                      <>
                        {/* Left Navigation Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const prevIndex = showImagePreview.currentIndex > 0 ? showImagePreview.currentIndex - 1 : images.length - 1;
                            setShowImagePreview({ url: images[prevIndex], equipmentId: showImagePreview.equipmentId, currentIndex: prevIndex });
                            // Sync with card view
                            setCurrentProgressImageIndex(prev => ({
                              ...prev,
                              [showImagePreview.equipmentId]: prevIndex
                            }));
                          }}
                          className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white/90 hover:bg-white border-gray-300 shadow-lg"
                        >
                          <ChevronLeft size={20} />
                        </Button>

                        {/* Right Navigation Button */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const nextIndex = showImagePreview.currentIndex < images.length - 1 ? showImagePreview.currentIndex + 1 : 0;
                            setShowImagePreview({ url: images[nextIndex], equipmentId: showImagePreview.equipmentId, currentIndex: nextIndex });
                            // Sync with card view
                            setCurrentProgressImageIndex(prev => ({
                              ...prev,
                              [showImagePreview.equipmentId]: nextIndex
                            }));
                          }}
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white/90 hover:bg-white border-gray-300 shadow-lg"
                        >
                          <ChevronRight size={20} />
                        </Button>

                        {/* Image Counter - Top Center */}
                        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded-full text-sm">
                          {showImagePreview.currentIndex + 1} of {images.length}
                        </div>
                      </>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="space-y-2 mt-4">
                <div className="text-sm text-gray-600">
                  <strong>Description:</strong> {(() => {
                    const currentEquipment = localEquipment.find(eq => eq.id === showImagePreview.equipmentId);
                    const metadata = currentEquipment?.progressImagesMetadata || [];
                    const currentMetadata = metadata[showImagePreview.currentIndex];

                    return currentMetadata?.description || "Progress image";
                  })()}
                </div>
                <div className="text-sm text-gray-600">
                  <strong>Uploaded by:</strong> {(() => {
                    const currentEquipment = localEquipment.find(eq => eq.id === showImagePreview.equipmentId);
                    const metadata = currentEquipment?.progressImagesMetadata || [];
                    const currentMetadata = metadata[showImagePreview.currentIndex];

                    return currentMetadata?.uploaded_by || "Team Member";
                  })()}
                </div>
                <div className="text-sm text-gray-600">
                  <strong>Date:</strong> {(() => {
                    const currentEquipment = localEquipment.find(eq => eq.id === showImagePreview.equipmentId);
                    const metadata = currentEquipment?.progressImagesMetadata || [];
                    const currentMetadata = metadata[showImagePreview.currentIndex];

                    if (currentMetadata?.upload_date) {
                      const date = new Date(currentMetadata.upload_date);
                      return date.toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true,
                        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                      });
                    }
                    return new Date().toLocaleString('en-US', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true,
                      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {documentPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Document: {documentPreview.name}</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Create a download link for the file
                    const url = URL.createObjectURL(documentPreview.file);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = documentPreview.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <FileText size={16} className="mr-2" />
                  Download
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDocumentPreview(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={20} />
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {/* File Type Preview */}
              {documentPreview.file.type.startsWith('image/') ? (
                <div className="text-center">
                  <img
                    src={URL.createObjectURL(documentPreview.file)}
                    alt={documentPreview.name}
                    className="max-w-full h-auto rounded-lg border border-gray-200"
                  />
                </div>
              ) : documentPreview.file.type === 'application/pdf' ? (
                <div className="text-center">
                  <iframe
                    src={URL.createObjectURL(documentPreview.file)}
                    className="w-full h-96 border border-gray-200 rounded-lg"
                    title={documentPreview.name}
                  />
                </div>
              ) : (
                <div className="text-center p-8 bg-gray-50 rounded border border-gray-200">
                  <FileText size={64} className="mx-auto text-gray-400 mb-4" />
                  <div className="text-lg font-medium text-gray-600 mb-2">{documentPreview.name}</div>
                  <div className="text-sm text-gray-500 mb-4">
                    File type: {documentPreview.file.type || 'Unknown'}
                  </div>
                  <div className="text-sm text-gray-500">
                    Size: {(documentPreview.file.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              )}

              {/* File Information */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">File Name:</span>
                    <div className="text-gray-600">{documentPreview.name}</div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">File Type:</span>
                    <div className="text-gray-600">{documentPreview.file.type || 'Unknown'}</div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">File Size:</span>
                    <div className="text-gray-600">{(documentPreview.file.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Upload Date:</span>
                    <div className="text-gray-600">{new Date().toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Equipment Form Modal */}
      {showAddEquipmentForm && (
        projectId === 'standalone' ? (
          <AddStandaloneEquipmentFormNew
            onClose={() => setShowAddEquipmentForm(false)}
            onSubmit={handleAddStandaloneEquipment}
          />
        ) : (
        <AddEquipmentForm
          onClose={() => setShowAddEquipmentForm(false)}
          onSubmit={handleAddEquipment}
          projectId={projectId}
        />
        )
      )}

      {/* Progress Image Modal */}
      {showProgressImageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-lg overflow-hidden">
            {/* Close Button */}
            <button
              onClick={() => setShowProgressImageModal(null)}
              className="absolute top-4 right-4 z-10 bg-black bg-opacity-50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-opacity-75"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Image */}
            <div className="flex items-center justify-center p-4">
              <img
                src={showProgressImageModal.url}
                alt="Progress Image"
                className="max-w-full max-h-[80vh] object-contain"
              />
            </div>

            {/* Description and Details */}
            {(showProgressImageModal.description || showProgressImageModal.uploadedBy || showProgressImageModal.uploadDate) && (
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white p-4">
                {showProgressImageModal.description && (
                  <div className="text-sm mb-2">{showProgressImageModal.description}</div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-gray-300">
                  {showProgressImageModal.uploadedBy && (
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span className="text-white font-medium">Uploaded by: {showProgressImageModal.uploadedBy}</span>
                    </div>
                  )}
                  {showProgressImageModal.uploadDate && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {(() => {
                          try {
                            const date = new Date(showProgressImageModal.uploadDate);
                            const formattedDate = date.toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            });
                            const formattedTime = date.toLocaleTimeString('en-US', { 
                              hour: 'numeric', 
                              minute: '2-digit',
                              hour12: true
                            });
                            return `${formattedDate} at ${formattedTime}`;
                          } catch (error) {
                            return showProgressImageModal.uploadDate;
                          }
                        })()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Technical Section Modal */}
      <AddTechnicalSectionModal
        isOpen={isAddSectionModalOpen}
        onClose={() => setIsAddSectionModalOpen(false)}
        onAddSection={handleAddSection}
      />

      {/* Edit Section Modal */}
      <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${isEditSectionModalOpen ? 'block' : 'hidden'}`}>
        <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Edit Technical Section</h2>
            <button
              onClick={() => {
                setIsEditSectionModalOpen(false);
                setEditingSectionName('');
                setEditingSectionOldName('');
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Section Name
              </label>
              <Input
                value={editingSectionName}
                onChange={(e) => setEditingSectionName(e.target.value)}
                placeholder="e.g., Heat Exchanger, Pump, Motor"
                className="w-full"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-sm text-blue-800">
                This will update the section name and all associated custom fields will be preserved.
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm('Are you sure you want to delete this section? This action cannot be undone.')) {
                  handleDeleteSection(editingSectionOldName);
                }
              }}
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              Delete Section
            </Button>
            <Button
              onClick={() => {
                if (editingSectionName?.trim()) {
                  handleEditSection(editingSectionName?.trim());
                }
              }}
              disabled={!editingSectionName?.trim()}
            >
              Update Section
            </Button>
          </div>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Add New User</h2>
              <button
                onClick={() => {
                  setShowAddUserModal(false);
                  setNewUserData({ name: '', email: '' });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <Input
                  value={newUserData.name}
                  onChange={(e) => setNewUserData({ ...newUserData, name: e.target.value })}
                  placeholder="Enter full name"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <Input
                  value={newUserData.email}
                  onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                  placeholder="Enter email address"
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddUserModal(false);
                  setNewUserData({ name: '', email: '' });
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!newUserData.name?.trim() || !newUserData.email?.trim()) {
                    toast({
                      title: "Error",
                      description: "Please fill in all fields",
                      variant: "destructive",
                    });
                    return;
                  }

                  try {
                    // Add user to database
                    const newUserDataForDB = {
                      name: newUserData.name,
                      email: newUserData.email,
                      role: 'viewer',
                      project_id: projectId,
                      position: 'Team Member',
                      phone: '',
                      permissions: ['view'],
                      status: 'active',
                      access_level: 'viewer'
                    };

                    // console.log('👥 Adding new user to database:', newUserDataForDB);
                    const createdUser = await fastAPI.createProjectMember(newUserDataForDB);
                    // console.log('👥 User created successfully:', createdUser);

                    // Refresh the users list to include the new user
                    await fetchProjectUsers();

                    // Notify parent component to refresh Settings tab
                    if (onUserAdded) {
                      onUserAdded();
                    }

                    // Set the new user as selected value
                    setNewTeamFieldValue(newUserData.name);

                    toast({
                      title: "Success",
                      description: "User added successfully to project",
                    });

                    setShowAddUserModal(false);
                    setNewUserData({ name: '', email: '' });
                  } catch (error) {
                    console.error('Error adding user:', error);
                    toast({
                      title: "Error",
                      description: "Failed to add user",
                      variant: "destructive",
                    });
                  }
                }}
                className="flex-1"
              >
                Add User
              </Button>
              
            </div>
          </div>
        </div>
      )}

      {/* Document URL Modal - for database documents - Always rendered via portal outside conditional returns */}
      {documentUrlModal && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-2 sm:p-4" style={{ zIndex: 99999 }} onClick={() => setDocumentUrlModal(null)}>
          <div className="bg-white rounded-lg p-3 sm:p-4 md:p-6 max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-2 mb-4">
              <h3 className="text-sm sm:text-base md:text-lg font-semibold text-gray-800 truncate pr-2">Document: {documentUrlModal.name}</h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.open(documentUrlModal.url, '_blank');
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-8"
                >
                  <FileText size={14} className="sm:mr-1 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Open in New Tab</span>
                  <span className="sm:hidden">Open</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      // Fetch the file as a blob to force download
                      const response = await fetch(documentUrlModal.url);
                      const blob = await response.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = documentUrlModal.name;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    } catch (error) {
                      console.error('Error downloading file:', error);
                      // Fallback: open in new tab if download fails
                      window.open(documentUrlModal.url, '_blank');
                    }
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-8"
                >
                  <FileText size={14} className="sm:mr-1 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Download</span>
                  <span className="sm:hidden">Down</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDocumentUrlModal(null)}
                  className="text-gray-500 hover:text-gray-700 h-7 sm:h-8 w-7 sm:w-8 p-0"
                >
                  <X size={16} className="sm:w-5 sm:h-5" />
                </Button>
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {/* Determine file type and render accordingly */}
              {(() => {
                const fileName = documentUrlModal.name.toLowerCase();
                const isPDF = fileName.endsWith('.pdf');
                const isImage = fileName.match(/\.(jpg|jpeg|png|gif|webp)$/);
                
                if (isPDF) {
                  return (
                    <div className="text-center">
                      <iframe
                        src={documentUrlModal.url}
                        className="w-full h-[400px] sm:h-[500px] md:h-[600px] border border-gray-200 rounded-lg"
                        title={documentUrlModal.name}
                      />
                    </div>
                  );
                } else if (isImage) {
                  return (
                    <div className="text-center">
                      <img
                        src={documentUrlModal.url}
                        alt={documentUrlModal.name}
                        className="max-w-full h-auto max-h-[400px] sm:max-h-[500px] md:max-h-[600px] rounded-lg border border-gray-200 object-contain mx-auto"
                      />
                    </div>
                  );
                } else {
                  return (
                    <div className="text-center p-4 sm:p-6 md:p-8 bg-gray-50 rounded border border-gray-200">
                      <FileText className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-gray-400 mb-3 sm:mb-4" />
                      <div className="text-sm sm:text-base md:text-lg font-medium text-gray-600 mb-2 break-words">{documentUrlModal.name}</div>
                      <div className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 px-2">
                        This file type cannot be previewed. Please download or open in a new tab to view.
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <Button
                          variant="outline"
                          onClick={() => {
                            window.open(documentUrlModal.url, '_blank');
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-9"
                        >
                          <FileText size={14} className="mr-1 sm:w-4 sm:h-4" />
                          Open in New Tab
                        </Button>
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              // Fetch the file as a blob to force download
                              const response = await fetch(documentUrlModal.url);
                              const blob = await response.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = documentUrlModal.name;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            } catch (error) {
                              console.error('Error downloading file:', error);
                              // Fallback: open in new tab if download fails
                              window.open(documentUrlModal.url, '_blank');
                            }
                          }}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm px-3 sm:px-4 h-8 sm:h-9"
                        >
                          <FileText size={14} className="mr-1 sm:w-4 sm:h-4" />
                          Download
                        </Button>
                      </div>
                    </div>
                  );
                }
              })()}

              {/* Document Information */}
              <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                  <div>
                    <span className="font-medium text-gray-700 block mb-1">File Name:</span>
                    <div className="text-gray-600 break-words">{documentUrlModal.name}</div>
                  </div>
                  {documentUrlModal.uploadedBy && (
                    <div>
                      <span className="font-medium text-gray-700 block mb-1">Uploaded By:</span>
                      <div className="text-gray-600 break-words">{documentUrlModal.uploadedBy}</div>
                    </div>
                  )}
                  {documentUrlModal.uploadDate && (
                    <div className="sm:col-span-2">
                      <span className="font-medium text-gray-700 block mb-1">Upload Date:</span>
                      <div className="text-gray-600">
                        {new Date(documentUrlModal.uploadDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
    </>
  );
};

export default EquipmentGrid;





