import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Calendar, User, MapPin, ChevronLeft, ChevronRight, FileText, Users, Settings, TrendingUp, AlertTriangle, ClipboardCheck, Shield, Plus, Edit, Check, X, Camera, Upload, Clock, Building, Trash2, Mic, MicOff, Play, Pause, ChevronDown, Search } from "lucide-react";
import AddEquipmentForm from "@/components/forms/AddEquipmentForm";
import AddTechnicalSectionModal from "@/components/forms/AddTechnicalSectionModal";
import { fastAPI, getEquipmentDocuments, deleteEquipmentDocument, uploadEquipmentDocument } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { updateEquipment } from "@/lib/database";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { logProgressEntryAdded, logProgressEntryUpdated, logProgressEntryDeleted, logDocumentUploaded, logDocumentDeleted, logProgressImageUploaded, logTeamMemberAdded } from "@/lib/activityLogger";
import axios from "axios";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface ProgressEntry {
  id: string;
  type?: string;
  entry_type?: string;
  comment?: string;
  entry_text?: string;
  image?: string; // Base64 encoded image
  image_url?: string; // Database field
  imageDescription?: string;
  image_description?: string; // Database field
  audio?: string; // Base64 encoded audio file
  audio_data?: string; // Database field
  audioDuration?: number; // Audio duration in seconds
  audio_duration?: number; // Database field
  uploadedBy?: string;
  created_by?: string; // Database field
  uploadDate?: string;
  created_at?: string; // Database field
}

// TechnicalSection interface removed - using new structure

interface Equipment {
  id: string;
  name?: string;
  type: string;
  tagNumber: string;
  jobNumber: string;
  manufacturingSerial: string;
  poCdd: string;
  status: 'on-track' | 'delayed' | 'nearing-completion' | 'completed' | 'pending';
  progress: number;
  progressPhase: 'documentation' | 'manufacturing' | 'testing' | 'dispatched';
  completionDate?: string;
  location: string;
  supervisor: string;
  lastUpdate: string;
  updated_at?: string; // Raw database timestamp for date inputs
  images: string[];
  progressImages: string[]; // Legacy field - will be removed
  progressImagesMetadata?: Array<{
    id: string;
    image_url: string;
    description: string;
    uploaded_by: string;
    upload_date: string;
  }>; // Legacy field - will be removed
  progressEntries: ProgressEntry[]; // New consolidated field
  nextMilestone: string;
  nextMilestoneDate?: string;
  notes?: string;
  priority: 'high' | 'medium' | 'low';
  documents: File[];
  isBasicInfo: boolean;
  // Additional technical specifications
  size?: string;
  custom_fields?: Array<{ name: string, value: string }>;
  technicalSections?: Array<{ name: string, customFields: Array<{ name: string, value: string }> }>;
  teamCustomFields?: Array<{ name: string, value: string }>;
  weight?: string;
  designCode?: string;
  material?: string;
  workingPressure?: string;
  designTemp?: string;
  // Team positions with dynamic field names
  welder?: string;
  welderEmail?: string;
  welderPhone?: string;
  qcInspector?: string;
  qcInspectorEmail?: string;
  qcInspectorPhone?: string;
  engineer?: string;
  projectManager?: string;
  projectManagerEmail?: string;
  projectManagerPhone?: string;
  supervisorEmail?: string;
  supervisorPhone?: string;
  supervisorRole?: 'editor' | 'viewer';
  welderRole?: 'editor' | 'viewer';
  qcInspectorRole?: 'editor' | 'viewer';
  projectManagerRole?: 'editor' | 'viewer';
  // Dynamic custom fields
  customFields?: Array<{
    id: string;
    name: string;
    value: string;
  }>;
  // Dynamic team positions
  customTeamPositions?: Array<{
    id: string;
    position: string;
    name: string;
    email: string;
    phone: string;
    role: 'editor' | 'viewer';
  }>;
  certificationTitle?: string;
}

interface EquipmentGridProps {
  equipment: Equipment[];
  projectName: string;
  projectId: string;
  onBack?: () => void;
  onViewDetails?: () => void;
  onViewVDCR?: () => void;
  onUserAdded?: () => void; // Callback to refresh Settings tab
  onActivityUpdate?: () => void; // Callback to refresh Activity Logs
}

const EquipmentGrid = ({ equipment, projectName, projectId, onBack, onViewDetails, onViewVDCR, onUserAdded, onActivityUpdate }: EquipmentGridProps) => {
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

  // Transform database fields to frontend fields
  const transformEquipmentData = useCallback((dbEquipment: any[]): Equipment[] => {
    return dbEquipment.map((eq: any) => {
      // PERFORMANCE: Console logs commented out - uncomment if needed for debugging
      // console.log('🔍 Raw equipment data:', eq);
      // console.log('🔍 Custom fields from DB:', eq.custom_fields);
      // console.log('🔍 Custom fields type:', typeof eq.custom_fields);
      // console.log('🔍 Custom fields length:', eq.custom_fields?.length);

      return {
        id: eq.id,
        name: eq.name || '',
        type: eq.type || '',
        tagNumber: eq.tag_number || '',
        jobNumber: eq.job_number || '',
        manufacturingSerial: eq.manufacturing_serial || '',
        poCdd: eq.po_cdd || 'To be scheduled',
        status: eq.status || 'pending',
        progress: eq.progress || 0,
        progressPhase: eq.progress_phase || 'documentation',
        completionDate: eq.completion_date || 'No deadline set',
        location: eq.location || 'Not Assigned',
        supervisor: eq.supervisor || '',
        lastUpdate: eq.updated_at ? new Date(eq.updated_at).toLocaleDateString() : new Date().toLocaleDateString(),
        updated_at: eq.updated_at || undefined, // Store raw timestamp for date inputs
        images: eq.images || [],
        progressImages: eq.progress_images || [], // Main progress images (top section)
        progressImagesMetadata: eq.progress_images_metadata || [], // Main progress images metadata
        progressEntries: eq.progress_entries || [], // Progress entries from equipment_progress_entries table (updates tab)
        nextMilestone: eq.next_milestone || 'Initial Setup',
        nextMilestoneDate: eq.next_milestone_date,
        notes: eq.notes,
        priority: eq.priority || 'medium',
        documents: eq.documents || [],
        isBasicInfo: eq.is_basic_info || true,
        // Technical specifications
        size: eq.size || '',
        weight: eq.weight || '',
        designCode: eq.design_code || '',
        material: eq.material || '',
        workingPressure: eq.working_pressure || '',
        designTemp: eq.design_temp || '',
        // Team positions
        welder: eq.welder || '',
        welderEmail: eq.welder_email || '',
        welderPhone: eq.welder_phone || '',
        qcInspector: eq.qc_inspector || '',
        qcInspectorEmail: eq.qc_inspector_email || '',
        qcInspectorPhone: eq.qc_inspector_phone || '',
        projectManager: eq.project_manager || '',
        projectManagerEmail: eq.project_manager_email || '',
        projectManagerPhone: eq.project_manager_phone || '',
        supervisorEmail: eq.supervisor_email || '',
        supervisorPhone: eq.supervisor_phone || '',
        supervisorRole: eq.supervisor_role || 'viewer',
        welderRole: eq.welder_role || 'viewer',
        qcInspectorRole: eq.qc_inspector_role || 'viewer',
        projectManagerRole: eq.project_manager_role || 'viewer',
        certificationTitle: eq.certification_title || '',
        // Dynamic team positions
        customTeamPositions: eq.custom_team_positions || [],
        // Custom fields
        custom_fields: eq.custom_fields || [],
        // Transform custom fields from database
        customFields: eq.custom_fields || [],
        // Technical sections
        technicalSections: (() => {
          // console.log('🔍 Raw technical_sections from DB:', eq.technical_sections);
          // console.log('🔍 Type of technical_sections:', typeof eq.technical_sections);
          // console.log('🔍 Length of technical_sections:', eq.technical_sections?.length);
          return eq.technical_sections || [];
        })(),
        // Team custom fields
        teamCustomFields: eq.team_custom_fields || []
      };
    });
  }, []); // Memoized with empty dependencies (pure function)

  const [localEquipment, setLocalEquipment] = useState<Equipment[]>(transformEquipmentData(equipment));
  const [imageMetadata, setImageMetadata] = useState<Record<string, Array<{ id: string, description: string, uploadedBy: string, uploadDate: string }>>>({});

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

  // Initialize date fields and notes when entering edit mode
  useEffect(() => {
    if (editingEquipmentId) {
      const equipment = localEquipment.find(eq => eq.id === editingEquipmentId);
      if (equipment) {
        // Initialize Last Updated On
        const updatedAtValue = equipment.updated_at || (equipment as any).updatedAt;
        if (updatedAtValue) {
          try {
            const updatedDate = new Date(updatedAtValue);
            if (!isNaN(updatedDate.getTime())) {
              const year = updatedDate.getFullYear();
              const month = String(updatedDate.getMonth() + 1).padStart(2, '0');
              const day = String(updatedDate.getDate()).padStart(2, '0');
              const hours = String(updatedDate.getHours()).padStart(2, '0');
              const minutes = String(updatedDate.getMinutes()).padStart(2, '0');
              const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`;
              setOverviewLastUpdateRaw(prev => {
                if (prev[editingEquipmentId] !== datetimeLocal) {
                  return { ...prev, [editingEquipmentId]: datetimeLocal };
                }
                return prev;
              });
            }
          } catch (error) {
            console.error('Error parsing updated_at in useEffect:', error);
          }
        }

        // Initialize Next Milestone Date
        const nextMilestoneDateValue = equipment.nextMilestoneDate || (equipment as any).next_milestone_date;
        if (nextMilestoneDateValue) {
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
            console.error('Error parsing nextMilestoneDate in useEffect:', error);
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
        console.error('❌ Error importing existing documents:', error);
      }

      const documentsMap: Record<string, any[]> = {};

      for (const eq of equipmentList) {
        try {
          const docs = await fastAPI.getDocumentsByEquipment(eq.id);
          documentsMap[eq.id] = Array.isArray(docs) ? docs : [];
        } catch (error) {
          console.error(`❌ Error loading documents for equipment ${eq.id}:`, error);
          documentsMap[eq.id] = [];
        }
      }

      setDocuments(documentsMap);
    } catch (error) {
      console.error('❌ Error loading documents:', error);
    }
  };

  // Update local equipment when equipment prop changes
  useEffect(() => {
    if (equipment && equipment.length > 0) {
      // PERFORMANCE: Console logs commented out - uncomment if needed for debugging
      // console.log('🔄 Equipment data received:', equipment);
      const transformedEquipment = transformEquipmentData(equipment);
      // console.log('🔄 Transformed equipment:', transformedEquipment);
      setLocalEquipment(transformedEquipment);

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
  }, [equipment]);

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
  const refreshEquipmentData = useCallback(async () => {
    try {
      // PERFORMANCE: Console logs commented out for production performance
      // Uncomment if needed for debugging:
      // console.log('🔄 refreshEquipmentData: Starting refresh for project:', projectId);
      // Check if this is standalone equipment
      const freshEquipment = projectId === 'standalone' 
        ? await fastAPI.getStandaloneEquipment() 
        : await fastAPI.getEquipmentByProject(projectId);
      // console.log('🔄 refreshEquipmentData: Fresh equipment data:', freshEquipment);

      // Debug progress images (commented for performance)
      // freshEquipment.forEach((eq: any, index: number) => {
      //   console.log(`🔍 Equipment ${index} (${eq.id}):`, {
      //     progress_images: eq.progress_images,
      //     progress_images_length: eq.progress_images?.length || 0
      //   });
      // });

      // Ensure freshEquipment is an array
      const equipmentArray = Array.isArray(freshEquipment) ? freshEquipment : [];
      const transformedEquipment = transformEquipmentData(equipmentArray);

      // Debug transformed data (commented for performance)
      // transformedEquipment.forEach((eq: any, index: number) => {
      //   console.log(`🔍 Transformed Equipment ${index} (${eq.id}):`, {
      //     progressImages: eq.progressImages,
      //     progressImages_length: eq.progressImages?.length || 0
      //   });
      // });

      setLocalEquipment(transformedEquipment);

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

      // console.log('✅ refreshEquipmentData: Completed successfully');

    } catch (error) {
      console.error('❌ Error refreshing equipment data:', error);
    }
  }, [projectId]); // Memoized with projectId dependency
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

      const equipmentDocs = await getEquipmentDocuments(equipmentId);

      if (equipmentDocs && Array.isArray(equipmentDocs) && equipmentDocs.length > 0) {
        // console.log('📄 Found equipment documents:', equipmentDocs);

        // Transform database documents to match our state format
        const transformedDocs = Array.isArray(equipmentDocs) ? equipmentDocs.map((doc: any) => ({
          id: doc.id,
          name: doc.document_name,
          document_name: doc.document_name,
          document_url: doc.document_url,
          uploadedBy: doc.uploaded_by || 'Unknown',
          uploadDate: doc.upload_date || doc.created_at
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
    // Convert updated_at to datetime-local format (YYYY-MM-DDTHH:mm)
    // Try multiple possible field names for updated_at
    const updatedAtValue = equipment.updated_at || (equipment as any).updatedAt;
    if (updatedAtValue) {
      try {
        const updatedDate = new Date(updatedAtValue);
        if (!isNaN(updatedDate.getTime())) {
          const year = updatedDate.getFullYear();
          const month = String(updatedDate.getMonth() + 1).padStart(2, '0');
          const day = String(updatedDate.getDate()).padStart(2, '0');
          const hours = String(updatedDate.getHours()).padStart(2, '0');
          const minutes = String(updatedDate.getMinutes()).padStart(2, '0');
          const datetimeLocal = `${year}-${month}-${day}T${hours}:${minutes}`;
          setOverviewLastUpdateRaw(prev => ({ ...prev, [equipment.id]: datetimeLocal }));
        }
      } catch (error) {
        console.error('Error parsing updated_at:', error, 'Value:', updatedAtValue);
      }
    }

    // Convert nextMilestoneDate to date format (YYYY-MM-DD)
    // Try multiple possible field names
    const nextMilestoneDateValue = equipment.nextMilestoneDate || (equipment as any).next_milestone_date;
    if (nextMilestoneDateValue) {
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
        const completionData = {
          status: 'completed',
          progress_phase: 'dispatched',
          progress: 100
        };

        // Call backend API to update equipment status
        if (projectId === 'standalone') {
          await fastAPI.updateStandaloneEquipment(equipment.id, completionData);
        } else {
          await fastAPI.updateEquipment(equipment.id, completionData);
        }

        // Update the local equipment data
        setLocalEquipment(prev => prev.map(eq =>
          eq.id === equipment.id
            ? {
              ...eq,
              status: 'completed' as const,
              progressPhase: 'dispatched' as const,
              progress: 100,
              lastUpdate: new Date().toLocaleString(),
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
      const phaseData = {
        progress_phase: newPhase,
        progress: newProgress
      };

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
            lastUpdate: new Date().toLocaleString()
          }
          : eq
      ));

      // console.log(`✅ Equipment ${equipmentId} moved to ${newPhase} phase with ${newProgress}% progress`);

      // Refresh activity logs if callback provided
      if (onActivityUpdate) {
        onActivityUpdate();
      }

      // Refresh equipment data from database
      await refreshEquipmentData();
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
      // Save progress image if uploaded
      if (newProgressImage && imageDescription) {
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

          // Store the image metadata
          const imageMetadata = {
            id: `img-${Date.now()}`,
            description: imageDescription,
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
            description: imageDescription,
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
                  imageDescription || undefined
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

        // Clear progress image state
        setNewProgressImage(null);
        setImageDescription('');

        // Refresh equipment data to show the new progress image
        await refreshEquipmentData();
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
        notes: editFormData.notes,
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

      // Remove undefined values
      Object.keys(equipmentData).forEach(key => {
        if (equipmentData[key] === undefined) {
          delete equipmentData[key];
        }
      });

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
      
      // Refresh equipment data from database to ensure consistency
      await refreshEquipmentData();

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
        // Create new progress entry in equipment_progress_entries table
        const createdEntry = await fastAPI.createProgressEntry({
          equipment_id: equipmentId,
          entry_text: newProgressEntry,
          entry_type: newProgressType,
          audio_data: audioBase64,
          audio_duration: audioDuration,
          image_url: imageBase64,
          image_description: imageDescription,
          created_by: user?.id
        });
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
        // Update existing progress entry in equipment_progress_entries table
        await fastAPI.updateProgressEntry(editingProgressEntryId, {
          entry_text: newProgressEntry,
          entry_type: newProgressType,
          audio_data: audioBase64,
          audio_duration: audioDuration,
          image_url: imageBase64,
          image_description: imageDescription
        });
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

    // Update database
    try {
      // console.log('🔄 Deleting progress entry from database...');
      const result = await fastAPI.deleteProgressEntry(entryId);
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

          // Upload to Supabase storage using the same method as AddProjectForm
          const filePath = `equipment/${equipmentId}/${Date.now()}_${file.name}`;
          // console.log('🚀 MANUAL: Uploading to storage path:', filePath);

          // console.log('🚀 MANUAL: Starting direct API upload...');
          // console.log('🚀 MANUAL: User context:', user);
          // console.log('🚀 MANUAL: User ID:', user?.id);

          // Use service role for storage upload to bypass RLS
          const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtbWFvc21rZ3drYW1mamhjeGlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNzU4NywiZXhwIjoyMDcyMjAzNTg3fQ.PVg3nnfYEBnqpceBXJjnZJIc9lwjmW1G7Lo2U7t0ehk';

          const formData = new FormData();
          formData.append('file', file);

          const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/project-documents/${filePath}`, {
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
          const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/project-documents/${filePath}`;
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
          const uploadedDoc = await uploadEquipmentDocument(equipmentId, documentData);
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
        const documentsResponse = await getEquipmentDocuments(equipmentId);
        const documents = Array.isArray(documentsResponse) ? documentsResponse : [];
        const documentToDelete = documents.find((doc: any) => doc.id === documentId);
        
        // console.log('🗑️ Deleting document:', documentId);
        await deleteEquipmentDocument(documentId);

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

  const handleAddEquipment = async (newEquipment: any) => {
    // console.log('New equipment added:', newEquipment);

    try {
      // Note: Global uniqueness check is now handled in the API (fastAPI.createEquipment)
      // This ensures uniqueness across ALL projects, not just current project

      // Map field names - AddEquipmentForm uses serialNumber, mini form uses manufacturingSerial
      const tagNumber = newEquipment.tagNumber || '';
      const jobNumber = newEquipment.jobNumber || '';
      const manufacturingSerial = newEquipment.manufacturingSerial || newEquipment.serialNumber || '';

      // Prepare equipment data for API call with proper field mapping
      const equipmentData = {
        project_id: projectId,
        type: newEquipment.type,
        tag_number: tagNumber,
        name: newEquipment.name,
        job_number: jobNumber,
        manufacturing_serial: manufacturingSerial,
        po_cdd: 'To be scheduled',
        status: 'pending',
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

      // Call API to create equipment (validates uniqueness globally)
      const createdEquipment = await fastAPI.createEquipment(equipmentData);
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

  return (
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
              onClick={() => setShowMiniForm(!showMiniForm)}
              className={`h-auto px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm whitespace-nowrap ${
                showMiniForm 
                  ? 'bg-gray-400 text-gray-600' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <Plus size={12} className="sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
              Add Equipment
            </Button>
            <button 
              onClick={() => setShowMiniForm(!showMiniForm)}
              className={`p-1 sm:p-1.5 text-gray-500 hover:text-gray-700 transition-transform flex-shrink-0 ${showMiniForm ? 'rotate-180' : ''}`}
            >
              <ChevronDown size={12} className="sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>
        
        {/* Equipment Filters Section - Same div, below header */}
        {showMiniForm && (
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {localEquipment
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
            })
            .map((item) => (
              <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-shadow relative bg-gray-50 border border-gray-200 h-auto sm:min-h-[420px] flex flex-col">
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
                      <div className="space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-gray-400 rounded-full flex-shrink-0"></div>
                            <span className="text-xs font-medium text-gray-600">PO-CDD</span>
                            <div className="text-xs sm:text-sm font-medium text-gray-800 truncate">
                              {item.poCdd}
                            </div>
                          </div>
                          {/* Days Counter / Dispatched Date - Inline with PO-CDD */}
                          {(() => {
                            if (item.progressPhase === 'dispatched') {
                              return (
                                <div className="text-left">
                                  <div className="text-[11px] sm:text-xs text-gray-500 font-medium">Dispatched on</div>
                                  <div className="text-xs sm:text-sm font-bold text-green-700 truncate">{item.poCdd}</div>
                                </div>
                              );
                            } else if ((item.poCdd && item.poCdd !== 'To be scheduled') || (item.completionDate && item.completionDate !== 'No deadline set')) {
                              try {
                                const deadlineDate = item.completionDate && item.completionDate !== 'No deadline set' 
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
                            placeholder="Describe what this image shows..."
                            value={imageDescription}
                            onChange={(e) => setImageDescription(e.target.value)}
                            className="text-sm pr-10"
                          />
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
                        {item.progressImages && item.progressImages.length > 0 ? (
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
                                type="datetime-local"
                                value={overviewLastUpdateRaw[item.id] || ''}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setOverviewLastUpdateRaw(prev => ({ ...prev, [item.id]: raw }));
                                  setEditFormData({
                                    ...editFormData,
                                    lastUpdate: raw ? formatDateTimeDisplay(raw) : ''
                                  });
                                }}
                                className="text-xs h-8"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">Reference timestamp shown to the team</p>
                              {overviewLastUpdateRaw[item.id] && (
                                <p className="text-[11px] text-blue-500 mt-1">
                                  {formatDateTimeDisplay(overviewLastUpdateRaw[item.id])}
                                </p>
                              )}
                            </div>
                            <div>
                              <Label className="text-xs text-gray-600">Next Milestone Date</Label>
                              <Input
                                type="date"
                                value={overviewNextMilestoneDate[item.id] || ''}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  setOverviewNextMilestoneDate(prev => ({ ...prev, [item.id]: raw }));
                                  setEditFormData({
                                    ...editFormData,
                                    nextMilestoneDate: raw ? new Date(raw).toISOString() : undefined
                                  });
                                }}
                                className="text-xs h-8"
                              />
                              <p className="text-[11px] text-gray-400 mt-1">Pick the milestone date from the calendar</p>
                              {overviewNextMilestoneDate[item.id] && (
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
                          const lastUpdatedValue = latestEntry?.date || latestEntry?.created_at || item.lastUpdate || '—';
                          const updateDescription =
                            latestEntry?.text || latestEntry?.comment || latestEntry?.entry_text ||
                            (item.notes && item.notes.trim() !== '' ? item.notes : '') ||
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

                    <TabsContent value="team" className="mt-3 sm:mt-4 space-y-2 flex-1 flex flex-col">
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

                              {/* Manage Team button that redirects to user settings */}
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm h-7 sm:h-6 px-2 sm:px-3 whitespace-nowrap"
                                onClick={() => {
                                  // Navigate to settings tab
                                  const event = new CustomEvent('navigateToTab', { 
                                    detail: { tab: 'settings' } 
                                  });
                                  window.dispatchEvent(event);
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

                            // Find team members assigned to this equipment
                            const assignedMembers = projectMembers.filter(member => {
                              // console.log('🔍 Checking member:', member.name, 'equipment_assignments:', member.equipment_assignments);
                              return member.equipment_assignments &&
                                (member.equipment_assignments.includes(item.id) ||
                                 member.equipment_assignments.includes("All Equipment"));
                            });
                            
                            // console.log('🔍 Team tab - assignedMembers:', assignedMembers);

                            // Create combined list of custom fields and project members
                            const allTeamItems = [
                              // Add project members as team items
                              ...assignedMembers.map(member => ({
                                id: `member-${member.id}`,
                                name: member.position || 'Team Member',
                                value: member.name,
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
                                      <span className="text-gray-800 font-medium text-xs sm:text-sm break-words">{teamItem.name}: <span className="text-gray-600 font-normal">{teamItem.value}</span></span>
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

                    <TabsContent value="progress" className="mt-3 sm:mt-4 space-y-2 flex-1 flex flex-col">
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

                    <TabsContent value="documents" className="mt-3 sm:mt-4 space-y-2 flex-1 flex flex-col">
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
                            {documents[item.id] && documents[item.id].length > 0 && (
                              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                                <p className="text-sm font-medium text-green-800 mb-2">Existing Equipment Documents:</p>
                                <div className="space-y-1">
                                  {documents[item.id].map((doc) => (
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
                                documents[item.id].map((doc) => {
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
                      // View Mode - Show Edit/Complete/Delete
                      <>
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
            ))}
        </div>
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

      {/* Document URL Modal - for database documents */}
      {documentUrlModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 sm:p-4" onClick={() => setDocumentUrlModal(null)}>
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
        </div>
      )}

      {/* Add Equipment Form Modal */}
      {showAddEquipmentForm && (
        <AddEquipmentForm
          onClose={() => setShowAddEquipmentForm(false)}
          onSubmit={handleAddEquipment}
          projectId={projectId}
        />
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
    </div>
  );
};

export default EquipmentGrid;





