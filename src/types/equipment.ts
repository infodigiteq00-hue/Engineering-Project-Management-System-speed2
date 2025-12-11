// Shared types for Equipment components

export interface ProgressEntry {
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

export interface TechnicalSection {
  id: string;
  name: string;
  specifications: {
    status: string;
    material: string;
    pressure: string;
    temperature: string;
    dimensions: string;
    weight: string;
  };
  isNew?: boolean;
  customFields?: Array<{ name: string, value: string }>;
}

export interface Equipment {
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
  technicalSections?: Array<{ name: string, customFields: Array<{ name: string, value: string }> }> | TechnicalSection[];
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









