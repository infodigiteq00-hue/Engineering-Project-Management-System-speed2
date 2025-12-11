import { useState, useMemo, useEffect } from "react";
import UnifiedProjectView from "@/components/dashboard/UnifiedProjectView";
import ProjectFilters from "@/components/dashboard/ProjectFilters";
import ProjectHeader from "@/components/dashboard/ProjectHeader";
import ProjectSummaryCards from "@/components/dashboard/ProjectSummaryCards";
import CompanyHighlights from "@/components/dashboard/CompanyHighlights";
import EquipmentGrid from "@/components/dashboard/EquipmentGrid";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AddProjectForm from "@/components/forms/AddProjectForm";
import { supabase } from "@/lib/supabase";
import { fastAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { logProjectCreated, logProjectUpdated, logProjectDeleted } from "@/lib/activityLogger";
import { generateRecommendationLetterWord } from "@/utils/wordGenerator";




// Dynamic projects will be loaded from Supabase
const mockProjects: any[] = [];
   

interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  equipmentCount: number;
  activeEquipment: number;
  progress: number;
  status: 'active' | 'delayed' | 'on-track' | 'completed';
  manager: string;
  deadline: string;
  completedDate?: string;
  poNumber: string;
  equipmentBreakdown: {
    heatExchanger?: number;
    pressureVessel?: number;
    storageTank?: number;
    reactor?: number;
    other?: number;
  };
  servicesIncluded?: string[];
  scopeOfWork?: string;
  recommendationLetter?: {
    status: 'not-requested' | 'requested' | 'received';
    requestDate?: string;
    lastReminderDate?: string;
    lastReminderDateTime?: string;
    reminderCount?: number;
    clientEmail?: string;
    clientContactPerson?: string;
    receivedDocument?: {
      name: string;
      uploaded: boolean;
      type: string;
      size?: number;
      uploadDate?: string;
      file?: File;
      url?: string;
    };
  };
}



const Index = () => {
  const { toast } = useToast();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedProjectTab, setSelectedProjectTab] = useState<string>("equipment");
  const [projects, setProjects] = useState(mockProjects);
  const [filteredProjects, setFilteredProjects] = useState(mockProjects);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [equipmentCarouselIndex, setEquipmentCarouselIndex] = useState<Record<string, number>>({});
  const [showAddProjectForm, setShowAddProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  
  // User data state
  const [userName, setUserName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  // PDF Viewer state
  const [currentPDF, setCurrentPDF] = useState<File | null>(null);
  const [pdfTitle, setPdfTitle] = useState<string>('');
  const [showPDFViewer, setShowPDFViewer] = useState<boolean>(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // Standalone Equipment state
  const [standaloneEquipment, setStandaloneEquipment] = useState<any[]>([]);
  const [standaloneEquipmentLoading, setStandaloneEquipmentLoading] = useState(false);

  // Load user data from localStorage on component mount
  useEffect(() => {
    // Load and set user data from localStorage
    const loadUserData = () => {
      try {
        
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        
        if (userData && userData.full_name) {
          setUserName(userData.full_name);
          setUserRole(userData.role);
          setUserEmail(userData.email);
        } else {
          // Set fallback values
          setUserName('User');
          setUserRole('user');
          setUserEmail('');
        }
        
        setLoading(false);
      } catch (error) {
        console.error('❌ Error loading user data:', error);
        setUserName('User');
        setUserRole('user');
        setUserEmail('');
        setLoading(false);
      }
    };

    loadUserData();
  }, []);

  // Fetch projects from Supabase on component mount
  useEffect(() => {
    // Fetch and load projects from Supabase database
    const fetchProjectsFromSupabase = async () => {
      try {
        
        // Get current user's firm_id
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        const firmId = userData.firm_id;
        
        if (!firmId) {
          return;
        }

        // Fetch projects from Supabase with role-based filtering
        const userRole = localStorage.getItem('userRole');
        const userId = localStorage.getItem('userId');
        const supabaseProjects = await fastAPI.getProjectsByFirm(firmId, userRole || undefined, userId || undefined);
        
        if (supabaseProjects && Array.isArray(supabaseProjects) && supabaseProjects.length > 0) {
          
          // Transform Supabase data to match our project structure
          const transformedProjects = await Promise.all((supabaseProjects as any[]).map(async (project: any) => {
            // Fetch equipment data for this project
            let equipmentData = [];
            let equipmentBreakdown = {};
            try {
              const equipment = await fastAPI.getEquipmentByProject(project.id);
              if (equipment && equipment.length > 0) {
                equipmentData = equipment;
                // Calculate equipment breakdown from actual equipment data
                const standardTypes = ['Heat Exchanger', 'Pressure Vessel', 'Storage Tank', 'Reactor'];
                const otherEquipment = equipment.filter((eq: any) => !standardTypes.includes(eq.type));
                
                // Create breakdown with actual equipment names for "other" types
                equipmentBreakdown = {
                  heatExchanger: equipment.filter((eq: any) => eq.type === 'Heat Exchanger').length,
                  pressureVessel: equipment.filter((eq: any) => eq.type === 'Pressure Vessel').length,
                  storageTank: equipment.filter((eq: any) => eq.type === 'Storage Tank').length,
                  reactor: equipment.filter((eq: any) => eq.type === 'Reactor').length,
                  // Add actual equipment types instead of generic "other"
                  ...otherEquipment.reduce((acc: any, eq: any) => {
                    const typeKey = eq.type.replace(/\s+/g, '').toLowerCase();
                    acc[typeKey] = (acc[typeKey] || 0) + 1;
                    return acc;
                  }, {})
                };
              }
            } catch (error) {
            }

            return {
            id: project.id,
            name: project.name,
            client: project.client,
            location: project.location || 'TBD',
            equipmentCount: project.equipmentCount || project.equipment_count || 0,
            activeEquipment: project.active_equipment || 0,
            progress: project.progress || 0,
            status: project.status || 'active',
            manager: project.manager || 'TBD',
            deadline: project.deadline || 'TBD',
            completedDate: project.completed_date ,
            poNumber: project.po_number || 'TBD',
            scopeOfWork: project.scope_of_work || '',
            // Add default values for other fields
            salesOrderDate: project.sales_order_date || '',
            clientIndustry: project.client_industry || 'Petrochemical',
            servicesIncluded: project.services_included ? 
              (typeof project.services_included === 'object' ? 
                Object.entries(project.services_included)
                  .filter(([_, value]) => value === true)
                  .map(([key, _]) => key) : 
                project.services_included) : [],
            consultant: project.consultant || 'ABC Consultants',
            tpiAgency: project.tpi_agency || 'Bureau Veritas',
            // clientFocalPoint: project.client_focal_point || project.manager || 'TBD',
            clientFocalPoint: project.client_focal_point || 'Not specified',
            vdcrManager: project.vdcr_manager || 'Quality Team Lead',
            kickoffMeetingNotes: project.kickoff_meeting_notes || '',
            specialProductionNotes: project.special_production_notes || '',
            equipmentBreakdown: equipmentBreakdown,
            equipment: equipmentData,
            // Document data - transform to expected structure
            unpricedPOFile: project.unpriced_po_documents && project.unpriced_po_documents.length > 0 ? 
              { name: project.unpriced_po_documents[0].document_name, uploaded: true, type: 'PDF' } : null,
            designInputsPID: project.design_inputs_documents && project.design_inputs_documents.length > 0 ? 
              { name: project.design_inputs_documents[0].document_name, uploaded: true, type: 'PDF' } : null,
            clientReferenceDoc: project.client_reference_documents && project.client_reference_documents.length > 0 ? 
              { name: project.client_reference_documents[0].document_name, uploaded: true, type: 'PDF' } : null,
            otherDocuments: project.other_documents && project.other_documents.length > 0 ? 
              project.other_documents.map((doc: any) => ({ name: doc.document_name || 'Document', uploaded: true, type: doc.mime_type || 'PDF' })) : null,
            unpricedPODocuments: project.unpriced_po_documents || [],
            designInputsDocuments: project.design_inputs_documents || [],
            clientReferenceDocuments: project.client_reference_documents || [],
            otherDocumentsLinks: project.other_documents || [],
            // Recommendation letter data
            recommendationLetter: project.recommendation_letter || {
              status: 'not-requested' as const,
              reminderCount: 0
            }
          };
          }));

          // Update state with Supabase data
          setProjects(transformedProjects as any);
          setFilteredProjects(transformedProjects as any);
          
        } else {
        }
        
      } catch (error) {
        console.error('❌ Error fetching projects from Supabase:', error);
      }
    };

    fetchProjectsFromSupabase();
  }, []);

  // Apply filters when projects change
  useEffect(() => {
    if (projects.length > 0) {
      applyFilters(activeFilters);
    }
  }, [projects]);

  // Cleanup PDF URLs on component unmount
  useEffect(() => {
    return () => {
      // Clean up any blob URLs when component unmounts
      if (pdfUrl && pdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(pdfUrl);
      }
    };
  }, [pdfUrl]);

  // Clean Tab System
  const [activeTab, setActiveTab] = useState<'all' | 'overdue' | 'active' | 'completed'>('all');
  
  // Main Tab System (Projects, Standalone Equipment, Tasks, Completion Certificates)
  const [mainTab, setMainTab] = useState<'projects' | 'equipment' | 'tasks' | 'certificates'>('projects');

  // Fetch standalone equipment when equipment tab is active
  useEffect(() => {
    const fetchStandaloneEquipment = async () => {
      if (mainTab === 'equipment') {
        try {
          setStandaloneEquipmentLoading(true);
          const equipment = await fastAPI.getStandaloneEquipment();
          
          // Pass raw data to EquipmentGrid - it will transform it using transformEquipmentData
          // This ensures certification_title and other fields are properly mapped
          setStandaloneEquipment(equipment);
        } catch (error) {
          console.error('❌ Error fetching standalone equipment:', error);
          toast({
            title: "Error",
            description: "Failed to load standalone equipment",
            variant: "destructive",
          });
        } finally {
          setStandaloneEquipmentLoading(false);
        }
      }
    };

    fetchStandaloneEquipment();
  }, [mainTab, toast]);
  
  // Completion Certificates tab state
  const [certificateTab, setCertificateTab] = useState<'all' | 'pending' | 'received'>('all');
  const [templatesDropdownExpanded, setTemplatesDropdownExpanded] = useState(false);
  
  // Template data for download
  const certificateTemplates = [
    {
      id: '1',
      name: 'Project Completion Certificate - Standard',
      description: 'Standard completion certificate template for engineering projects',
      fileName: 'completion-certificate-standard.docx',
      category: 'completion'
    },
    {
      id: '2',
      name: 'Project Completion Certificate - Detailed',
      description: 'Detailed completion certificate with equipment breakdown',
      fileName: 'completion-certificate-detailed.docx',
      category: 'completion'
    },
    {
      id: '3',
      name: 'Recommendation Letter - Client Template',
      description: 'Template for requesting client recommendation letters',
      fileName: 'recommendation-letter-request.docx',
      category: 'recommendation'
    },
    {
      id: '4',
      name: 'Quality Assurance Certificate',
      description: 'QA certificate template for completed projects',
      fileName: 'qa-certificate-template.docx',
      category: 'qa'
    },
    {
      id: '5',
      name: 'Final Inspection Certificate',
      description: 'Final inspection certificate template',
      fileName: 'final-inspection-certificate.docx',
      category: 'inspection'
    }
  ];
  
  // Hardcoded user data for demo
  // useEffect(() => {
  //   // User data is already set in useState above
  // }, []);
  
  // Separate filtered projects for each tab
  const overdueProjects = useMemo(() => {
    return filteredProjects.filter(project => {
      try {
        const deadline = new Date(project.deadline);
        const today = new Date();
        const diffTime = deadline.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        // Only show as overdue if past deadline AND not completed
        return diffDays < 0 && project.status !== 'completed';
      } catch (error) {
        return false;
      }
    });
  }, [filteredProjects]);
  
  const activeProjects = useMemo(() => {
    return filteredProjects.filter(project => {
      try {
        const deadline = new Date(project.deadline);
        const today = new Date();
        const diffTime = deadline.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        // Active projects: not overdue, not completed, and have a future deadline
        return diffDays >= 0 && project.status !== 'completed';
      } catch (error) {
        return false;
      }
    });
  }, [filteredProjects]);
  
  const completedProjects = useMemo(() => {
    return filteredProjects.filter(project => project.status === 'completed');
  }, [filteredProjects]);
  
  // For "All Projects" tab: show non-completed projects first, then completed projects at the bottom
  const allProjects = useMemo(() => {
    const nonCompleted = filteredProjects.filter(project => project.status !== 'completed');
    const completed = filteredProjects.filter(project => project.status === 'completed');
    return [...nonCompleted, ...completed];
  }, [filteredProjects]);
  
  // Current projects to display based on active tab
  const currentProjects = activeTab === 'overdue' ? overdueProjects : 
                         activeTab === 'active' ? activeProjects :
                         activeTab === 'completed' ? completedProjects : 
                         allProjects;
  
  // Mock VDCR data for ProjectDetails
  const mockVDCRData = [
    {
      id: "1",
      srNo: "001",
      equipmentTagNo: ["HE-UNIT-001"],
      mfgSerialNo: ["HE-001-2024-REL"],
      jobNo: ["JOB-2024-001"],
      clientDocNo: "REL-HE-001-GA-001",
      internalDocNo: "INT-GA-HE-001-2024",
      documentName: "General Assembly Drawing",
      revision: "Rev-02",
      codeStatus: "Code 2",
      status: "approved" as const,
      lastUpdate: "Jul 10, 2024",
      remarks: "General assembly drawing for heat exchanger unit",
      updatedBy: "John Doe",
      documentUrl: "/documents/vdcr/HE-001-GA-001.pdf"
    },
    {
      id: "2",
      srNo: "002",
      equipmentTagNo: ["HE-UNIT-001", "HE-UNIT-002", "HE-UNIT-003"],
      mfgSerialNo: ["HE-001-2024-REL", "HE-002-2024-REL", "HE-003-2024-REL"],
      jobNo: ["JOB-2024-001", "JOB-2024-002", "JOB-2024-003"],
      clientDocNo: "REL-HE-ALL-PQP-001",
      internalDocNo: "INT-PQP-HE-ALL-2024",
      documentName: "Project Quality Plan",
      revision: "Rev-01",
      codeStatus: "Code 3",
      status: "sent-for-approval" as const,
      lastUpdate: "Jul 12, 2024",
      remarks: "Quality plan covering all heat exchanger units",
      updatedBy: "Sarah Wilson",
      documentUrl: "/documents/vdcr/HE-ALL-PQP-001.docx"
    },
    {
      id: "3",
      srNo: "003",
      equipmentTagNo: ["HE-UNIT-001", "HE-UNIT-002", "HE-UNIT-003", "HE-UNIT-004", "HE-UNIT-005"],
      mfgSerialNo: ["HE-001-2024-REL", "HE-002-2024-REL", "HE-003-2024-REL", "HE-004-2024-REL", "HE-005-2024-REL"],
      jobNo: ["JOB-2024-001", "JOB-2024-002", "JOB-2024-003", "JOB-2024-004", "JOB-2024-005"],
      clientDocNo: "REL-HE-ALL-MTC-001",
      internalDocNo: "INT-MTC-HE-ALL-2024",
      documentName: "Material Test Certificate SS 316L Plates",
      revision: "Rev-01",
      codeStatus: "Code 1",
      status: "received-for-comment" as const,
      lastUpdate: "Jul 08, 2024",
      remarks: "Material test certificates for SS 316L plates",
      updatedBy: "Mike Johnson",
      documentUrl: "/documents/vdcr/HE-ALL-MTC-001.pdf"
    },
    {
      id: "4",
      srNo: "004",
      equipmentTagNo: ["HE-UNIT-001", "HE-UNIT-002"],
      mfgSerialNo: ["HE-001-2024-REL", "HE-002-2024-REF"],
      jobNo: ["JOB-2024-001", "JOB-2024-002"],
      clientDocNo: "REL-HE-GRP1-IOM-001",
      internalDocNo: "INT-IOM-HE-GRP1-2024",
      documentName: "Installation & Operation Manual - Group 1",
      revision: "Rev-00",
      codeStatus: "Code 4",
      status: "sent-for-approval" as const,
      lastUpdate: "Jul 14, 2024",
      remarks: "Installation manual for group 1 heat exchangers",
      updatedBy: "Lisa Chen",
      documentUrl: "/documents/vdcr/HE-GRP1-IOM-001.pdf"
    },
    {
      id: "5",
      srNo: "005",
      equipmentTagNo: ["HE-UNIT-001", "HE-UNIT-002", "HE-UNIT-003", "HE-UNIT-004"],
      mfgSerialNo: ["HE-001-2024-REL", "HE-002-2024-REL", "HE-003-2024-REL", "HE-004-2024-REL"],
      jobNo: ["JOB-2024-001", "JOB-2024-002", "JOB-2024-003", "JOB-2024-004"],
      clientDocNo: "REL-HE-ALL-WPS-001",
      internalDocNo: "INT-WPS-HE-ALL-2024",
      documentName: "Welding Procedure Specification - All Heat Exchanger",
      revision: "Rev-02",
      codeStatus: "Code 2",
      status: "approved" as const,
      lastUpdate: "Jul 09, 2024",
      remarks: "Welding procedure specification for all heat exchangers",
      updatedBy: "David Brown",
      documentUrl: "/documents/vdcr/HE-ALL-WPS-001.pdf"
    }
  ];
  
  const [activeFilters, setActiveFilters] = useState({
    client: 'All Clients',
    equipmentType: 'All Equipment',
    manager: 'All Managers',
    searchQuery: ''
  });

  const totalProjects = activeFilters.client === 'All Clients' && 
                       activeFilters.manager === 'All Managers' && 
                       activeFilters.equipmentType === 'All Equipment' && 
                       !activeFilters.searchQuery ? projects.length : filteredProjects.length;
  const totalEquipment = (activeFilters.client === 'All Clients' && 
                          activeFilters.manager === 'All Managers' && 
                          activeFilters.equipmentType === 'All Equipment' && 
                          !activeFilters.searchQuery ? projects : filteredProjects)
                          .reduce((sum, project) => sum + project.equipmentCount, 0);

  // Handle project selection and navigation
  const handleSelectProject = (projectId: string, initialTab: string = "equipment") => {
    setSelectedProject(projectId);
    setSelectedProjectTab(initialTab);
  };

  const handleBackToProjects = () => {
    setSelectedProject(null);
    setSelectedProjectTab("equipment");
  };

  // Handle adding new project to database
  const handleAddNewProject = async (projectData: any) => {
    try {
      
      // Get current user's firm_id
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const firmId = userData.firm_id;
      
      if (!firmId) {
        console.error('❌ Firm ID not found');
        return;
      }

      // Fetch updated projects from Supabase
      const userRole = localStorage.getItem('userRole');
      const userId = localStorage.getItem('userId');
      const updatedProjects = await fastAPI.getProjectsByFirm(firmId, userRole || undefined, userId || undefined);
      
      // Transform Supabase data to match our project structure
      const transformedProjects = (updatedProjects as any[]).map((project: any) => ({
        id: project.id,
        name: project.name,
        client: project.client,
        location: project.location || 'TBD',
        equipmentCount: project.equipment_count || 0,
        activeEquipment: project.active_equipment || 0,
        progress: project.progress || 0,
        status: project.status || 'active',
        manager: project.manager || 'TBD',
        deadline: project.deadline || 'TBD',
        poNumber: project.po_number || 'TBD',
        scopeOfWork: project.scope_of_work || '',
        // Add default values for other fields
        salesOrderDate: '',
        clientIndustry: 'Petrochemical',
        servicesIncluded: [],
        consultant: 'ABC Consultants',
        tpiAgency: 'Bureau Veritas',
        clientFocalPoint: 'Not specified',
        vdcrManager: 'Quality Team Lead',
        kickoffMeetingNotes: '',
        specialProductionNotes: '',
        equipmentBreakdown: {}
      }));

      // Update state with fresh data from Supabase
      setProjects(transformedProjects);
      setFilteredProjects(transformedProjects);
      
      
    } catch (error) {
      console.error('❌ Error refreshing projects:', error);
      toast({
        title: "Error",
        description: "Failed to refresh projects. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Handle editing existing project
  const handleEditProject = async (projectId: string) => {
    try {
      
      // Get current user's firm_id
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const firmId = userData.firm_id;
      
      if (!firmId) {
        toast({ title: 'Error', description: 'Firm ID not found. Please login again.', variant: 'destructive' });
        return;
      }

      // Fetch complete project data from Supabase
      const projectResponse = await fastAPI.getProjectById(projectId);
      const projectToEdit = projectResponse[0]; // API returns array
      
      if (!projectToEdit) {
        console.error('❌ Project not found:', projectId);
        toast({ title: 'Error', description: 'Project not found. Please try again.', variant: 'destructive' });
        return;
      }
      
      // Fetch equipment data for this project
      const equipmentResponse = await fastAPI.getEquipmentByProject(projectId);
      const equipmentData = equipmentResponse || [];
      
      // Transform equipment data to form format - CRITICAL: Preserve IDs
      const equipmentDetails = (equipmentData as any[]).reduce((acc: any, equipment: any) => {
        // Validate that equipment from database has ID
        if (!equipment.id) {
          console.error('❌ CRITICAL: Equipment loaded from database is missing ID!', equipment);
          // Skip equipment without ID - it shouldn't exist
          return acc;
        }
        
        const type = equipment.type || 'Other';
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push({
          id: equipment.id, // CRITICAL: ID must be preserved for edit mode
          tagNumber: equipment.tag_number || '',
          jobNumber: equipment.job_number || '',
          manufacturingSerial: equipment.manufacturing_serial || '',
          documents: [] // Equipment documents will be handled separately
        });
        return acc;
      }, {});
      
      // Transform project data to form format with all available data
      const editFormData = {
        id: projectToEdit.id,
        projectTitle: projectToEdit.name || '',
        clientName: projectToEdit.client || '',
        plantLocation: projectToEdit.location || '',
        poNumber: projectToEdit.po_number || '',
        salesOrderDate: projectToEdit.created_at ? new Date(projectToEdit.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        completionDate: projectToEdit.deadline || '',
        clientIndustry: projectToEdit.client_industry ,
        projectManager: projectToEdit.manager || '',
        consultant: projectToEdit.consultant,
        tpiAgency: projectToEdit.tpi_agency ,
        clientFocalPoint: projectToEdit.client_focal_point || '',
        vdcrManager: projectToEdit.vdcr_manager ,
        servicesIncluded: projectToEdit.services_included || {
          design: false,
          manufacturing: false,
          testing: false,
          documentation: false,
          installationSupport: false,
          commissioning: false
        },
        scopeDescription: projectToEdit.scope_of_work || '',
        unpricedPOFile: null, // File objects can't be restored, but we'll show existing documents
        designInputsPID: null,
        clientReferenceDoc: null,
        otherDocuments: null,
        kickoffMeetingNotes: projectToEdit.kickoff_meeting_notes || `Project: ${projectToEdit.name}\nClient: ${projectToEdit.client}\nLocation: ${projectToEdit.location}`,
        specialProductionNotes: projectToEdit.special_production_notes || '',
        // Document links from JSONB columns
        unpricedPODocuments: projectToEdit.unpriced_po_documents || [],
        designInputsDocuments: projectToEdit.design_inputs_documents || [],
        clientReferenceDocuments: projectToEdit.client_reference_documents || [],
        otherDocumentsLinks: projectToEdit.other_documents || [],
        // Equipment data
        equipment: equipmentDetails,
        // Additional project data
        status: projectToEdit.status || 'active',
        progress: projectToEdit.progress || 0,
        equipmentCount: projectToEdit.equipment_count || 0,
        activeEquipment: projectToEdit.active_equipment || 0
      };
      
      setEditingProject(editFormData);
      setShowAddProjectForm(true);
      setEditMode(true);
      
    } catch (error) {
      console.error('❌ Error fetching project data for editing:', error);
      toast({ title: 'Error', description: 'Failed to load project data for editing. Please try again.', variant: 'destructive' });
    }
  };

  // Handle deleting project and associated equipment
  const handleDeleteProject = async (projectId: string) => {
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone. This will also delete all associated equipment.')) {
      try {
        
        // First, delete all associated equipment
        try {
          const equipmentResponse = await fastAPI.getEquipmentByProject(projectId);
          const equipmentArray = equipmentResponse as any[];
          if (equipmentArray && equipmentArray.length > 0) {
            for (const equipment of equipmentArray) {
              await fastAPI.deleteEquipment(equipment.id);
            }
          }
        } catch (equipmentError) {
          console.warn('⚠️ Could not delete associated equipment:', equipmentError);
        }
        
        // Get project name for logging before deletion
        const projectToDelete = projects.find(p => p.id === projectId);
        const projectName = projectToDelete?.name || 'Unknown Project';
        
        // Then delete the project
        await fastAPI.deleteProject(projectId);
        
        // Log project deletion
        await logProjectDeleted(projectId, projectName);
        
        // Update local state
        setProjects(prev => prev.filter(p => p.id !== projectId));
        setFilteredProjects(prev => prev.filter(p => p.id !== projectId));
        
        // Navigate back to project list if currently viewing the deleted project
        if (selectedProject === projectId) {
          setSelectedProject(null);
          setSelectedProjectTab('equipment');
        }
        
        toast({
          title: "Success",
          description: "Project and associated equipment deleted successfully!",
          variant: "default"
        });
        
      } catch (error) {
        console.error('❌ Error deleting project:', error);
        toast({
          title: "Error",
          description: "Failed to delete project. Please try again.",
          variant: "destructive"
        });
      }
    }
  };


  // Handle marking project as completed
  const handleCompleteProject = async (projectId: string) => {
    if (window.confirm('Are you sure you want to mark this project as completed? This action cannot be undone.')) {
      try {
        const completionDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
        
        
        // Update project in database
        const updateData = {
          status: 'completed',
          completed_date: completionDate,
          progress: 100
        };
        
        await fastAPI.updateProject(projectId, updateData);
        
        // Get project name for logging
        const projectToComplete = projects.find(p => p.id === projectId);
        const projectName = projectToComplete?.name || 'Unknown Project';
        
        // Log project completion
        await logProjectUpdated(projectId, projectName, {
          status: { old: projectToComplete?.status || 'active', new: 'completed' },
          progress: { old: projectToComplete?.progress || 0, new: 100 }
        });
        
        // Update local state
        setProjects(prevProjects => 
          prevProjects.map(project => 
            project.id === projectId 
              ? { ...project, status: 'completed' as const, completedDate: completionDate, progress: 100 }
              : project
          )
        );
        
        setFilteredProjects(prevFilteredProjects => 
          prevFilteredProjects.map(project => 
            project.id === projectId 
              ? { ...project, status: 'completed' as const, completedDate: completionDate, progress: 100 }
              : project
          )
        );
        
        toast({ title: 'Success', description: 'Project marked as completed!' });
        
      } catch (error) {
        console.error('❌ Error completing project:', error);
        toast({ title: 'Error', description: 'Failed to complete project. Please try again.', variant: 'destructive' });
      }
    }
  };

  
  // Recommendation Letter Functions
  const handleRequestRecommendationLetter = async (project: Project) => {
    const clientEmail = project.recommendationLetter?.clientEmail || `contact@${project.client.toLowerCase().replace(/\s+/g, '')}.com`;
    const clientContact = project.recommendationLetter?.clientContactPerson || 'Project Manager';
    
    try {
      // Generate Word file template
      const wordData = {
        projectName: project.name,
        client: project.client,
        location: project.location,
        completionDate: project.completedDate || new Date().toISOString().split('T')[0],
        poNumber: project.poNumber,
        manager: project.manager,
        clientContact: clientContact
      };

      const wordBlob = await generateRecommendationLetterWord(wordData);
      // Add timestamp to make filename unique and avoid duplicate errors
      const timestamp = Date.now();
      // Remove spaces from project name for file path to avoid URL encoding issues
      const projectNameForPath = project.name.replace(/\s+/g, '_');
      let filePath = `${projectNameForPath}/Recommendation_Letters/Recommendation_Letter_${projectNameForPath}_${timestamp}.doc`;
      
      // Upload Word file to Supabase storage
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtbWFvc21rZ3drYW1mamhjeGlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNzU4NywiZXhwIjoyMDcyMjAzNTg3fQ.PVg3nnfYEBnqpceBXJjnZJIc9lwjmW1G7Lo2U7t0ehk';
      
      // Convert blob to File
      const wordFile = new File([wordBlob], filePath.split('/').pop() || 'Recommendation_Letter.doc', {
        type: 'application/msword'
      });

      let uploadResponse;
      let publicUrl;

      // Try upload with retry logic for duplicate errors
      for (let attempt = 0; attempt < 3; attempt++) {
        const formData = new FormData();
        formData.append('file', wordFile);

        uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/project-documents/${filePath}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'apikey': SERVICE_ROLE_KEY
          },
          body: formData
        });

        if (uploadResponse.ok) {
          // Success - get public URL (no need to encode, use path as is)
          publicUrl = `${SUPABASE_URL}/storage/v1/object/public/project-documents/${filePath}`;
          break;
        } else {
          const errorText = await uploadResponse.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }
          
          // If duplicate error, retry with new timestamp
          if ((uploadResponse.status === 400 || uploadResponse.status === 409) && attempt < 2) {
            const newTimestamp = Date.now();
            filePath = `${projectNameForPath}/Recommendation_Letters/Recommendation_Letter_${projectNameForPath}_${newTimestamp}.doc`;
            continue;
          } else {
            console.error('❌ Storage upload failed:', uploadResponse.status, errorText);
            throw new Error(`Storage upload failed: ${uploadResponse.status}`);
          }
        }
      }

      if (!publicUrl) {
        throw new Error('Failed to upload file after retries');
      }

      // Create professional email template with download link
      const subject = `Recommendation Letter Request - ${project.name} Project`;
      const emailBody = `Dear ${clientContact},

I hope this email finds you well.

We are pleased to inform you that the ${project.name} project has been successfully completed on ${project.completedDate}. We are grateful for the opportunity to work with ${project.client} and are proud of the quality work delivered.

As we continue to grow our business and showcase our capabilities to potential clients, we would be extremely grateful if you could provide us with a recommendation letter/testimonial highlighting:

• Quality of work delivered
• Adherence to timelines and specifications  
• Professional conduct and communication
• Overall satisfaction with our services

This recommendation would be invaluable in helping us demonstrate our track record of successful project delivery to future clients.

If you need any additional information about the project or our services, please do not hesitate to contact us.

Thank you for your time and consideration.

Best regards,
${project.manager}
Project Manager

---
Project Details:
Project Name: ${project.name}
Client: ${project.client}
Location: ${project.location}
Completion Date: ${project.completedDate}
PO Number: ${project.poNumber}`;

      // Create Gmail compose URL instead of mailto to open in Gmail
      const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(clientEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
      
      // Open Gmail compose window
      window.open(gmailComposeUrl, '_blank');

      // Show toast notification
      toast({
        title: "Email Opened",
        description: `Recommendation letter request email opened.`,
      });
    } catch (error) {
      console.error('Error generating Word file:', error);
      toast({
        title: "Error",
        description: "Failed to generate Word file. Please try again.",
        variant: "destructive"
      });
      return;
    }
    
    // Update project status in database
    const recommendationLetterData = {
      status: 'requested' as const,
      requestDate: new Date().toISOString().split('T')[0],
      reminderCount: 0,
      clientEmail,
      clientContactPerson: clientContact
    };
    
    try {
      await fastAPI.updateProject(project.id, {
        recommendation_letter: recommendationLetterData
      });
      
      // Update local state
      const updatedProjects = projects.map(p => 
        p.id === project.id 
          ? { 
              ...p, 
              recommendationLetter: recommendationLetterData
            } as Project
          : p
      );
      
      setProjects(updatedProjects as Project[]);
      setFilteredProjects(updatedProjects as Project[]);
      
      toast({
        title: "Success",
        description: "Recommendation letter request saved!",
      });
    } catch (error) {
      console.error('❌ Error saving recommendation letter request:', error);
      toast({
        title: "Error",
        description: "Failed to save request. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleSendRecommendationReminder = async (project: Project) => {
    const clientEmail = project.recommendationLetter?.clientEmail || `contact@${project.client.toLowerCase().replace(/\s+/g, '')}.com`;
    const clientContact = project.recommendationLetter?.clientContactPerson || 'Project Manager';
    const reminderCount = (project.recommendationLetter?.reminderCount || 0) + 1;
    const now = new Date();
    const lastReminderDateTime = now.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    
    try {
      // Generate Word file template for reminder
      const wordData = {
        projectName: project.name,
        client: project.client,
        location: project.location,
        completionDate: project.completedDate || new Date().toISOString().split('T')[0],
        poNumber: project.poNumber,
        manager: project.manager,
        clientContact: clientContact
      };

      const wordBlob = await generateRecommendationLetterWord(wordData);
      // Add timestamp to make filename unique and avoid duplicate errors
      const timestamp = Date.now();
      // Remove spaces from project name for file path to avoid URL encoding issues
      const projectNameForPath = project.name.replace(/\s+/g, '_');
      let filePath = `${projectNameForPath}/Recommendation_Letters/Recommendation_Letter_${projectNameForPath}_${timestamp}.doc`;
      
      // Upload Word file to Supabase storage
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtbWFvc21rZ3drYW1mamhjeGlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNzU4NywiZXhwIjoyMDcyMjAzNTg3fQ.PVg3nnfYEBnqpceBXJjnZJIc9lwjmW1G7Lo2U7t0ehk';
      
      // Convert blob to File
      const wordFile = new File([wordBlob], filePath.split('/').pop() || 'Recommendation_Letter.doc', {
        type: 'application/msword'
      });

      let uploadResponse;
      let publicUrl;

      // Try upload with retry logic for duplicate errors
      for (let attempt = 0; attempt < 3; attempt++) {
        const formData = new FormData();
        formData.append('file', wordFile);

        uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/project-documents/${filePath}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'apikey': SERVICE_ROLE_KEY
          },
          body: formData
        });

        if (uploadResponse.ok) {
          // Success - get public URL (no need to encode, use path as is)
          publicUrl = `${SUPABASE_URL}/storage/v1/object/public/project-documents/${filePath}`;
          break;
        } else {
          const errorText = await uploadResponse.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }
          
          // If duplicate error, retry with new timestamp
          if ((uploadResponse.status === 400 || uploadResponse.status === 409) && attempt < 2) {
            const newTimestamp = Date.now();
            filePath = `${projectNameForPath}/Recommendation_Letters/Recommendation_Letter_${projectNameForPath}_${newTimestamp}.doc`;
            continue;
          } else {
            console.error('❌ Storage upload failed:', uploadResponse.status, errorText);
            throw new Error(`Storage upload failed: ${uploadResponse.status}`);
          }
        }
      }

      if (!publicUrl) {
        throw new Error('Failed to upload file after retries');
      }

      // Create gentle reminder email template with download link
      const subject = `Gentle Reminder - Recommendation Letter Request - ${project.name} Project`;
      const emailBody = `Dear ${clientContact},

I hope you are doing well.

This is a gentle follow-up regarding our request for a recommendation letter for the ${project.name} project that was completed on ${project.completedDate}.

We understand you have a busy schedule, but we would be extremely grateful if you could spare a few minutes to provide us with a brief testimonial or recommendation letter. Your feedback would be incredibly valuable for our business growth.

If you have already sent the recommendation letter and we may have missed it, please let us know and we will check our records.

Thank you for your time and continued support.

Best regards,
${project.manager}
Project Manager

---
Project: ${project.name} | Client: ${project.client} | Completed: ${project.completedDate}

Note: Please download the Recommendation Letter template using the link above, fill in the details, sign it, and send it back to us.`;

      // Create Gmail compose URL instead of mailto to open in Gmail
      const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(clientEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
      
      // Open Gmail compose window
      window.open(gmailComposeUrl, '_blank');

      // Show toast notification
      toast({
        title: "Email Opened",
        description: `Recommendation letter request email opened.`,
      });
    } catch (error) {
      console.error('Error generating Word file:', error);
      toast({
        title: "Error",
        description: "Failed to generate Word file. Please try again.",
        variant: "destructive"
      });
      return;
    }
    
    // Update project status in database - keep it as 'requested' but with reminder tracking
    const recommendationLetterData = {
      ...project.recommendationLetter,
      status: 'requested' as const, // Keep as requested, not reminder_sent
      lastReminderDate: new Date().toISOString().split('T')[0],
      lastReminderDateTime,
      reminderCount
    };
    
    try {
      await fastAPI.updateProject(project.id, {
        recommendation_letter: recommendationLetterData
      });
      
      // Update local state
      const updatedProjects = projects.map(p => 
        p.id === project.id 
          ? { 
              ...p, 
              recommendationLetter: recommendationLetterData
            } as Project
          : p
      );
      
      setProjects(updatedProjects as Project[]);
      setFilteredProjects(updatedProjects as Project[]);
      
      toast({
        title: "Success",
        description: `Reminder email sent! (Reminder #${reminderCount})`,
      });
    } catch (error) {
      console.error('❌ Error saving reminder:', error);
      toast({
        title: "Error",
        description: "Failed to save reminder. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleUploadRecommendationLetter = (project: Project) => {
    // Create a hidden file input element for PDF upload
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf';
    fileInput.style.position = 'absolute';
    fileInput.style.left = '-9999px';
    fileInput.style.visibility = 'hidden';
    
    // Handle file selection
    fileInput.addEventListener('change', async (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      
      if (!file) {
        return; // User cancelled
      }
      
      // Validate file type (PDF only)
      if (file.type !== 'application/pdf') {
        toast({
          title: "Error",
          description: "Please select a PDF file only.",
          variant: "destructive"
        });
        return;
      }
      
      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        toast({
          title: "Error",
          description: "File size too large. Please select a PDF smaller than 10MB.",
          variant: "destructive"
        });
        return;
      }
      
      // Show upload progress
      toast({
        title: "Uploading",
        description: `Uploading "${file.name}"...`,
      });
      
      try {
        // Upload to Supabase Storage using the same pattern as other documents
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtbWFvc21rZ3drYW1mamhjeGlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNzU4NywiZXhwIjoyMDcyMjAzNTg3fQ.PVg3nnfYEBnqpceBXJjnZJIc9lwjmW1G7Lo2U7t0ehk';
        
        // Use unique folder path to avoid conflicts: {projectName}/Recommendation Letters/{timestamp}_{filename}
        const fileName = `${project.name}/Recommendation Letters/${Date.now()}_${file.name}`;
        
        // Create FormData for upload
        const formData = new FormData();
        formData.append('file', file);
        
        // Upload to Supabase Storage
        const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/project-documents/${fileName}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'apikey': SERVICE_ROLE_KEY
          },
          body: formData
        });
        
        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error('❌ Storage upload failed:', uploadResponse.status, errorText);
          throw new Error(`Storage upload failed: ${uploadResponse.status}`);
        }
        
        // Get public URL
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/project-documents/${fileName}`;
        
        // Create document metadata
        const uploadedDocument = {
          name: file.name,
          uploaded: true,
          type: file.type,
          size: file.size,
          uploadDate: new Date().toISOString(),
          url: publicUrl
        };
        
        // Update project in database
        const recommendationLetterData = {
          ...project.recommendationLetter,
          status: 'received' as const,
          receivedDocument: uploadedDocument
        };
        
        await fastAPI.updateProject(project.id, {
          recommendation_letter: recommendationLetterData
        });
        
        // Update local state
        const updatedProjects = projects.map(p => 
          p.id === project.id 
            ? { 
                ...p, 
                recommendationLetter: recommendationLetterData
              } as Project
            : p
        );
        
        setProjects(updatedProjects as Project[]);
        setFilteredProjects(updatedProjects as Project[]);
        
        toast({
          title: "Success",
          description: `Successfully uploaded recommendation letter! (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
        });
      } catch (error) {
        console.error('❌ Error uploading recommendation letter:', error);
        toast({
          title: "Error",
          description: "Failed to upload recommendation letter. Please try again.",
          variant: "destructive"
        });
      }
    });
    
    // Add to DOM, trigger click, and clean up after
    document.body.appendChild(fileInput);
    fileInput.click();
    
    // Clean up after a delay to ensure the file dialog has opened
    setTimeout(() => {
      if (document.body.contains(fileInput)) {
        document.body.removeChild(fileInput);
      }
    }, 1000);
  };

  // PDF Viewer Functions
  const handleViewRecommendationLetter = (project: Project) => {
    const doc = project.recommendationLetter?.receivedDocument;
    if (doc && doc.url) {
      // Use URL from database (Supabase Storage URL)
      setPdfUrl(doc.url);
      setCurrentPDF(null); // No File object when loading from database
      setPdfTitle(`${project.name} - Recommendation Letter`);
      setShowPDFViewer(true);
    } else if (doc && doc.file) {
      // Fallback: Create object URL from File object (for in-memory files)
      const url = URL.createObjectURL(doc.file);
      setCurrentPDF(doc.file);
      setPdfUrl(url);
      setPdfTitle(`${project.name} - Recommendation Letter`);
      setShowPDFViewer(true);
    } else {
      toast({
        title: "Error",
        description: "No PDF file available to view.",
        variant: "destructive"
      });
    }
  };

  const closePDFViewer = () => {
    setShowPDFViewer(false);
    // Clean up object URL to prevent memory leaks
    if (pdfUrl && pdfUrl.startsWith('blob:')) {
      URL.revokeObjectURL(pdfUrl);
    }
    setCurrentPDF(null);
    setPdfUrl(null);
    setPdfTitle('');
  };



  // Apply filters to project list
  const applyFilters = (filters: any) => {
    setActiveFilters(filters);
    
    let filtered = projects.filter(project => {
      // Client filter
      if (filters.client !== 'All Clients' && project.client !== filters.client) {
        return false;
      }
      
      
      // Manager filter
      if (filters.manager !== 'All Managers' && project.manager !== filters.manager) {
        return false;
      }
      
      // Equipment type filter
      if (filters.equipmentType !== 'All Equipment') {
        const hasEquipmentType = Object.entries(project.equipmentBreakdown).some(([type, count]) => {
          if ((count as number) > 0) {
            const normalizedType = type === 'heatExchanger' ? 'Heat Exchanger' :
                                 type === 'pressureVessel' ? 'Pressure Vessel' :
                                 type === 'storageTank' ? 'Storage Tank' :
                                 type === 'reactor' ? 'Reactor' : 'Other';
            return normalizedType === filters.equipmentType;
          }
          return false;
        });
        if (!hasEquipmentType) return false;
      }
      
      // Search query filter
      if (filters.searchQuery) 
      {
        const searchLower = filters.searchQuery.toLowerCase();
        const matchesSearch = 
          project.name.toLowerCase().includes(searchLower) ||
          project.poNumber.toLowerCase().includes(searchLower) ||
          project.client.toLowerCase().includes(searchLower) ||
          project.location.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }
      
      return true;
    });
    
    setFilteredProjects(filtered);
  };

  // Handle updating project data
  const handleUpdateProject = async (updatedProjectData: any) => {
    try {
      
      // Update in Supabase
      const projectDataForSupabase = {
        name: updatedProjectData.projectTitle,
        client: updatedProjectData.clientName,
        location: updatedProjectData.plantLocation || 'TBD',
        manager: updatedProjectData.projectManager,
        deadline: updatedProjectData.completionDate || null,
        po_number: updatedProjectData.poNumber || 'TBD',
        scope_of_work: updatedProjectData.scopeDescription || '',
        client_focal_point: updatedProjectData.clientFocalPoint || '',
        status: 'active'
      };
      
      await fastAPI.updateProject(updatedProjectData.id, projectDataForSupabase);
      
      // Update local state
    setProjects(prev => prev.map(p => 
        p.id === updatedProjectData.id ? {
          ...p,
          name: updatedProjectData.projectTitle,
          client: updatedProjectData.clientName,
          location: updatedProjectData.plantLocation,
          manager: updatedProjectData.projectManager,
          deadline: updatedProjectData.completionDate,
          poNumber: updatedProjectData.poNumber,
          clientFocalPoint: updatedProjectData.clientFocalPoint 

        } : p
    ));
    setFilteredProjects(prev => prev.map(p => 
        p.id === updatedProjectData.id ? {
          ...p,
          name: updatedProjectData.projectTitle,
          client: updatedProjectData.clientName,
          location: updatedProjectData.plantLocation,
          manager: updatedProjectData.projectManager,
          deadline: updatedProjectData.completionDate,
          poNumber: updatedProjectData.poNumber,
          clientFocalPoint: updatedProjectData.clientFocalPoint
        } : p
      ));
      
    setShowAddProjectForm(false);
    setEditMode(false);
    setEditingProject(null);
      
      // Show success message
      toast({ title: 'Success', description: 'Project updated successfully!' });
      
    } catch (error) {
      console.error('❌ Error updating project:', error);
      toast({ title: 'Error', description: 'Failed to update project. Please try again.', variant: 'destructive' });
    }
  };


  const selectedProjectData = projects.find(p => p.id === selectedProject);
  
  // Calculate completion certificates statistics
  const completedProjectsCount = useMemo(() => {
    return projects.filter(p => p.status === 'completed').length;
  }, [projects]);
  
  const recommendationLettersCollected = useMemo(() => {
    // Count projects with received recommendation letters
    return projects.filter(p => {
      if (p.status === 'completed') {
        return p.recommendationLetter?.status === 'received';
      }
      return false;
    }).length;
  }, [projects]);
  
  const recommendationLettersPending = useMemo(() => {
    // Count completed projects with pending recommendation letters
    const completedProjects = projects.filter(p => p.status === 'completed');
    return completedProjects.length - recommendationLettersCollected;
  }, [projects, recommendationLettersCollected]);
  
  // Mock certificate data - replace with actual database query
  const mockCertificates = useMemo(() => {
    const completed = projects.filter(p => p.status === 'completed');
    return completed.map(project => {
      const recLetterStatus = project.recommendationLetter?.status || 'not-requested';
      let status, recommendationLetterStatus;
      
      if (recLetterStatus === 'received') {
        status = 'received';
        recommendationLetterStatus = 'received';
      } else if (recLetterStatus === 'requested') {
        status = 'pending';
        recommendationLetterStatus = 'pending';
      } else {
        status = 'pending';
        recommendationLetterStatus = 'pending';
      }
      
      return {
        id: project.id,
        projectName: project.name,
        client: project.client,
        completionDate: project.completedDate || project.deadline,
        status: status,
        recommendationLetterStatus: recommendationLetterStatus,
        requestedDate: project.recommendationLetter?.requestDate || project.completedDate || new Date().toISOString().split('T')[0],
        receivedDate: recLetterStatus === 'received' ? new Date().toISOString().split('T')[0] : null,
        recommendationLetter: project.recommendationLetter
      };
    });
  }, [projects]);
  
  // Filter certificates based on active tab
  const filteredCertificates = useMemo(() => {
    if (certificateTab === 'pending') {
      return mockCertificates.filter(c => c.status === 'pending' || c.recommendationLetterStatus === 'pending');
    } else if (certificateTab === 'received') {
      return mockCertificates.filter(c => c.status === 'received' && c.recommendationLetterStatus === 'received');
    }
    return mockCertificates;
  }, [mockCertificates, certificateTab]);
  
  // Filter completed projects based on certificate tab for display
  const filteredCompletedProjects = useMemo(() => {
    const completed = projects.filter(p => p.status === 'completed');
    
    if (certificateTab === 'pending') {
      return completed.filter(p => {
        const recStatus = p.recommendationLetter?.status || 'not-requested';
        return recStatus === 'not-requested' || recStatus === 'requested';
      });
    } else if (certificateTab === 'received') {
      return completed.filter(p => p.recommendationLetter?.status === 'received');
    }
    return completed;
  }, [projects, certificateTab]);
  
  // Handle template download
  const handleDownloadTemplate = (template: typeof certificateTemplates[0]) => {
    // Create a simple text file as template (in production, this would be a real DOCX file)
    const content = `Template: ${template.name}\n\n${template.description}\n\nThis is a sample template file. In production, this would be a proper DOCX file.`;
    const blob = new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = template.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Template Downloaded',
      description: `${template.name} has been downloaded successfully.`,
    });
  };
  
  // Debug: Log selected project data

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <ProjectHeader loading={loading} userName={userName} userRole={userRole} />

        {/* Main Tab Navigation */}
        <div className="mt-6">
          <div className="border-b border-gray-200 overflow-x-auto overflow-y-hidden">
            <nav className="-mb-px flex space-x-8 min-w-max flex-nowrap px-1">
              <button
                onClick={() => setMainTab('projects')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors flex-shrink-0 ${
                  mainTab === 'projects'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Projects ({projects.length})
                </div>
              </button>
              <button
                onClick={() => setMainTab('equipment')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors flex-shrink-0 ${
                  mainTab === 'equipment'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Standalone Equipment
                </div>
              </button>
             
              <button
                onClick={() => setMainTab('certificates')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors flex-shrink-0 ${
                  mainTab === 'certificates'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Completion Certificates
                </div>
              </button>
              <button
                onClick={() => setMainTab('tasks')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors flex-shrink-0 ${
                  mainTab === 'tasks'
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Tasks
                </div>
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {mainTab === 'projects' && !selectedProject ? (
          <>
            <ProjectSummaryCards totalProjects={totalProjects} totalEquipment={totalEquipment} />

            {/* Company Highlights Section */}
            <CompanyHighlights onSelectProject={handleSelectProject} />

            {/* Expandable Project Filters */}
            <div className="mb-6 sm:mb-8">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div 
                  className="flex items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-gray-50 transition-colors gap-2 sm:gap-0"
                  onClick={() => setFiltersExpanded(!filtersExpanded)}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.207A1 1 0 013 6.5V4z" />
                    </svg>
                    <h3 className="text-xs sm:text-sm font-semibold text-gray-800">Project Filters & Actions</h3>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    {userRole !== 'vdcr_manager' && (
                      <Button 
                        onClick={() => setShowAddProjectForm(true)} 
                        className="bg-blue-600 hover:bg-blue-700 text-xs sm:text-sm px-2 py-1 sm:px-4 sm:py-2 h-7 sm:h-9"
                      >
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        Add New Project
                      </Button>
                    )}
                    <svg 
                      className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-600 transition-transform ${filtersExpanded ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                
                {filtersExpanded && (
                  <div className="border-t border-gray-200 p-3 sm:p-4 bg-gray-50">
                    <ProjectFilters 
                      onFilterChange={applyFilters}
                      onAddNewProject={handleAddNewProject}
                      onApplyFilters={applyFilters}
                      projects={projects}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Enhanced Project Overview */}
            <div className="mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800 leading-tight">Projects Overview</h2>
                <div className="text-xs sm:text-sm text-gray-600 sm:text-right">
                  <span>Showing {currentProjects.length} of {totalProjects} projects</span>
                </div>
              </div>

              {/* Clean Tab System */}
              <div className="mb-6">
                <div className="border-b border-gray-200 overflow-x-auto overflow-y-hidden xl:overflow-x-visible scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                  <nav className="-mb-px flex min-w-max space-x-6 sm:space-x-8 px-3 sm:px-0 whitespace-nowrap pb-0.5">
                    <button
                      onClick={() => setActiveTab('all')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'all'
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      All Projects ({allProjects.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('active')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'active'
                          ? 'border-green-500 text-green-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Active Projects ({activeProjects.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('overdue')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'overdue'
                          ? 'border-red-500 text-red-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Overdue Projects ({overdueProjects.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('completed')}
                      className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'completed'
                          ? 'border-purple-500 text-purple-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-purple-300'
                      }`}
                    >
                      Completed Projects ({completedProjects.length})
                    </button>
                  </nav>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {loading ? (
                  // Skeleton loading for projects
                  Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <div className="h-24 bg-white p-4">
                        <Skeleton className="h-6 w-3/4 mb-2" />
                        <Skeleton className="h-4 w-1/2 mb-1" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                      <div className="p-4 space-y-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                      <div className="p-4 border-t border-gray-100">
                        <Skeleton className="h-8 w-24" />
                      </div>
                    </div>
                  ))
                ) : (
                  currentProjects.map((project, index) => {
                  // Check if deadline is valid
                  const hasValidDeadline = project.deadline && !isNaN(new Date(project.deadline).getTime());
                  
                  let diffDays = 0;
                  let isOverdue = false;
                  
                  if (hasValidDeadline) {
                    const deadline = new Date(project.deadline);
                    const today = new Date();
                    const diffTime = deadline.getTime() - today.getTime();
                    diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    // Only consider overdue if not completed and past deadline
                    isOverdue = diffDays < 0 && project.status !== 'completed';
                  }

                  return (
                    <div 
                      key={project.id} 
                      onClick={() => handleSelectProject(project.id, "equipment")}
                      className={`bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] border transition-all duration-300 overflow-hidden group cursor-pointer flex flex-col ${
                        project.status === 'completed' ? 'h-[750px]' : 'h-[650px]'
                      } ${
                      isOverdue 
                        ? 'border-red-200 hover:border-red-300 hover:shadow-[0_4px_16px_rgba(239,68,68,0.15),0_2px_8px_rgba(239,68,68,0.1)]' 
                        : 'border-gray-100 hover:border-gray-200 hover:shadow-[0_8px_25px_rgba(0,0,0,0.12),0_4px_10px_rgba(0,0,0,0.08)]'
                      }`}
                    >
                      {/* Premium White Header with Neumorphic Effect */}
                      <div className="h-auto sm:h-24 bg-white p-4 pb-4 sm:pb-4 text-gray-800 border-b border-gray-100 relative group-hover:shadow-inner transition-all duration-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8),inset_0_-1px_0_0_rgba(0,0,0,0.05)]">
                        {/* Click Indicator */}
                        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-0">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-1 sm:mb-1 truncate">{project.name}</h3>
                            <p className="hidden sm:block text-xs text-blue-600 font-medium mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              Click to view details →
                            </p>
                            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-4 text-xs sm:text-sm text-gray-600 mb-1 sm:mb-0">
                              <span className="flex items-center gap-1 min-w-0">
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                                <span className="truncate max-w-[140px] sm:max-w-none">{project.client}</span>
                              </span>
                              <span className="flex items-center gap-1 min-w-0">
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="truncate max-w-[140px] sm:max-w-none">{project.location}</span>
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-start sm:items-end gap-1 sm:gap-1 mt-1 sm:mt-0">
                            {/* Days Counter / Completion Status */}
                            <div className="text-left sm:text-right min-w-[140px]">
                              {project.status === 'completed' ? (
                                <>
                                  <div className="text-xs text-gray-500 mb-1">Completed on</div>
                                  <div className="text-lg font-bold text-green-600">
                                    {project.completedDate 
                                      ? new Date(project.completedDate).toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: 'numeric', 
                                          year: 'numeric' 
                                        })
                                      : new Date().toLocaleDateString('en-US', { 
                                          month: 'short', 
                                          day: 'numeric', 
                                          year: 'numeric' 
                                        })}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1 leading-none">Days to Completion Date</div>
                                  <div className={`text-base sm:text-lg font-bold whitespace-nowrap leading-none ${
                                    isOverdue ? 'text-red-600' : 'text-blue-600'
                                  }`}>
                                    {(() => {
                                      if (!hasValidDeadline) {
                                        return <span className="text-gray-500">No deadline set</span>;
                                      } else if (diffDays < 0) {
                                        return <span className="text-red-600">{Math.abs(diffDays)} days overdue</span>;
                                      } else if (diffDays === 0) {
                                        return <span className="text-orange-600">Due today</span>;
                                      } else {
                                        return <span>{diffDays} days to go</span>;
                                      }
                                    })()}
                                  </div>
                                </>
                              )}
                            </div>
                            
                            {/* Edit & Delete Buttons */}
                            {userRole !== 'vdcr_manager' && (
                              <div className="flex items-center gap-1 pb-0 sm:pb-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditProject(project.id);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                  title="Edit Project"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteProject(project.id);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                  title="Delete Project"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                                {project.status !== 'completed' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCompleteProject(project.id);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                                    title="Mark as Completed"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                     {/* Recommendation Letter Actions - Only for Completed Projects */}
                     {project.status === 'completed' && (
                        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-green-50">
                          <div className="text-sm font-medium text-gray-700 mb-3">Recommendation Letter</div>
                          <div className="flex gap-2">
                            {project.recommendationLetter?.status === 'received' ? (
                              <>
                                <div className="flex items-center gap-2 text-green-600 text-sm">
                                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                  <span>Received</span>
                                </div>
                                 {project.recommendationLetter.receivedDocument && (
                                   <Button 
                                     variant="outline" 
                                     size="sm"
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       handleViewRecommendationLetter(project);
                                     }}
                                     className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 border-blue-300"
                                   >
                                     <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                     </svg>
                                     View Letter
                                   </Button>
                                 )}
                              </>
                            ) : project.recommendationLetter?.status === 'requested' ? (
                              <>
                                <div className="flex items-center gap-2 text-yellow-600 text-sm mb-3">
                                  <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                  <span>Requested</span>
                                </div>
                                <div className="flex gap-2">
                                  {project.recommendationLetter.reminderCount && project.recommendationLetter.reminderCount > 0 ? (
                                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-xs flex-shrink-0">
                                      <div className="flex items-center gap-1 text-orange-700 font-medium mb-1">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 00-15 0v5h5l-5 5-5-5h5v-5a7.5 7.5 0 0115 0v5z" />
                                        </svg>
                                        {project.recommendationLetter.reminderCount} sent
                                      </div>
                                      {project.recommendationLetter.lastReminderDateTime && (
                                        <div className="text-orange-600 text-xs">Last: {project.recommendationLetter.lastReminderDateTime}</div>
                                      )}
                                    </div>
                                  ) : null}
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSendRecommendationReminder(project);
                                    }}
                                    className="flex-1 text-orange-600 hover:text-orange-800 hover:bg-orange-50 border-orange-300"
                                  >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 00-15 0v5h5l-5 5-5-5h5v-5a7.5 7.5 0 0115 0v5z" />
                                    </svg>
                                    {project.recommendationLetter.reminderCount && project.recommendationLetter.reminderCount > 0 ? 'Send Another' : 'Send Reminder'}
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUploadRecommendationLetter(project);
                                    }}
                                    className="flex-1 bg-green-600 text-white hover:bg-green-700 border-green-600"
                                  >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    Upload Letter
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRequestRecommendationLetter(project);
                                  }}
                                  className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                                >
                                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  Request Letter
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUploadRecommendationLetter(project);
                                  }}
                                  className="flex-1 bg-green-600 text-white hover:bg-green-700 border-green-600"
                                >
                                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                  </svg>
                                  Upload Letter
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Project Details Grid */}
                      <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-blue-50">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Project Manager</span>
                            <p className="font-semibold text-gray-800 mt-1">{project.manager}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">PO Number</span>
                            <p className="font-semibold text-gray-800 mt-1">{project.poNumber}</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Completion Date</span>
                            <p className="font-semibold text-gray-800 mt-1">
                              {project.status === 'completed' && project.completedDate
                                ? new Date(project.completedDate).toISOString().split('T')[0]
                                : project.deadline}
                            </p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Equipment</span>
                            <p className="font-semibold text-gray-800 mt-1">{project.equipmentCount} units</p>
                          </div>
                        </div>
                      </div>

                      {/* Equipment Breakdown Section */}
                      <div className="p-6 bg-gradient-to-r from-slate-50 to-blue-50 border-l-4 border-blue-200 flex-1 flex flex-col min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Equipment Breakdown
                          </span>
                          <span className="text-sm font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                            {project.equipmentCount} units
                          </span>
                        </div>
                        
                        {/* Equipment Type Breakdown with Carousel */}
                        <div className="relative flex-1 flex flex-col">
                          <div className="grid grid-cols-2 gap-3">
                            {(() => {
                              // Use actual project equipment breakdown or show empty state
                              const equipmentBreakdown = project.equipmentBreakdown || {};
                              const hasEquipment = Object.values(equipmentBreakdown).some(count => (count as number) > 0);
                              

                              
                              if (!hasEquipment) {
                                return (
                                  <div className="col-span-2 text-center py-8">
                                    <div className="text-gray-400 mb-2">
                                      <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      </svg>
                                    </div>
                                    <p className="text-sm text-gray-500">No equipment added yet</p>
                                    <p className="text-xs text-gray-400 mt-1">Project Manager will add equipment details</p>
                                  </div>
                                );
                              }
                              
                              // Create equipment types array with actual names
                              const equipmentTypes = [];
                              
                              // Add standard types
                              if (equipmentBreakdown.pressureVessel > 0) {
                                equipmentTypes.push({ name: 'Pressure Vessels', count: equipmentBreakdown.pressureVessel, color: 'blue' });
                              }
                              if (equipmentBreakdown.heatExchanger > 0) {
                                equipmentTypes.push({ name: 'Heat Exchangers', count: equipmentBreakdown.heatExchanger, color: 'green' });
                              }
                              if (equipmentBreakdown.reactor > 0) {
                                equipmentTypes.push({ name: 'Reactors', count: equipmentBreakdown.reactor, color: 'purple' });
                              }
                              if (equipmentBreakdown.storageTank > 0) {
                                equipmentTypes.push({ name: 'Storage Tanks', count: equipmentBreakdown.storageTank, color: 'orange' });
                              }
                              
                              // Add actual equipment types (not standard ones)
                              const standardKeys = ['pressureVessel', 'heatExchanger', 'reactor', 'storageTank'];
                              Object.entries(equipmentBreakdown).forEach(([key, count]) => {
                                if (!standardKeys.includes(key) && (count as number) > 0) {
                                  // Convert key back to readable name
                                  const readableName = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                  const colors = ['indigo', 'pink', 'red', 'yellow', 'teal', 'cyan'];
                                  const colorIndex = equipmentTypes.length % colors.length;
                                  equipmentTypes.push({ 
                                    name: readableName, 
                                    count: count, 
                                    color: colors[colorIndex] 
                                  });
                                }
                              });
                              
                              const currentIndex = equipmentCarouselIndex[project.id] || 0;
                              const itemsPerPage = 4;
                              const startIndex = currentIndex * itemsPerPage;
                              const endIndex = startIndex + itemsPerPage;
                              const visibleEquipment = equipmentTypes.slice(startIndex, endIndex);
                              
                              return visibleEquipment.map((equipment, index) => (
                                <div key={index} className="bg-white/70 rounded-lg p-3 border border-gray-200">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-gray-600">{equipment.name}</span>
                                    <span className={`text-xs font-bold ${
                                      equipment.color === 'blue' ? 'text-blue-800' :
                                      equipment.color === 'green' ? 'text-green-800' :
                                      equipment.color === 'purple' ? 'text-purple-800' :
                                      equipment.color === 'orange' ? 'text-orange-800' :
                                      equipment.color === 'indigo' ? 'text-indigo-800' :
                                      equipment.color === 'pink' ? 'text-pink-800' :
                                      equipment.color === 'teal' ? 'text-teal-800' :
                                      equipment.color === 'amber' ? 'text-amber-800' :
                                      equipment.color === 'red' ? 'text-red-800' :
                                      equipment.color === 'yellow' ? 'text-yellow-800' :
                                      equipment.color === 'cyan' ? 'text-cyan-800' :
                                      'text-gray-800'
                                    }`}>{equipment.count}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {equipment.color === 'blue' && (
                                      <>
                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                                        <div className="w-2 h-2 rounded-full bg-blue-300"></div>
                                      </>
                                    )}
                                    {equipment.color === 'green' && (
                                      <>
                                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                        <div className="w-2 h-2 rounded-full bg-green-400"></div>
                                        <div className="w-2 h-2 rounded-full bg-green-300"></div>
                                      </>
                                    )}
                                    {equipment.color === 'purple' && (
                                      <>
                                        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                        <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                                        <div className="w-2 h-2 rounded-full bg-purple-300"></div>
                                      </>
                                    )}
                                    {equipment.color === 'orange' && (
                                      <>
                                        <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                        <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                                        <div className="w-2 h-2 rounded-full bg-orange-300"></div>
                                      </>
                                    )}
                                    {equipment.color === 'indigo' && (
                                      <>
                                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                        <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                                        <div className="w-2 h-2 rounded-full bg-indigo-300"></div>
                                      </>
                                    )}
                                    {equipment.color === 'pink' && (
                                      <>
                                        <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                                        <div className="w-2 h-2 rounded-full bg-pink-400"></div>
                                        <div className="w-2 h-2 rounded-full bg-pink-300"></div>
                                      </>
                                    )}
                                    {equipment.color === 'teal' && (
                                      <>
                                        <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                                        <div className="w-2 h-2 rounded-full bg-teal-400"></div>
                                        <div className="w-2 h-2 rounded-full bg-teal-300"></div>
                                      </>
                                    )}
                                    {equipment.color === 'amber' && (
                                      <>
                                        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                        <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                                        <div className="w-2 h-2 rounded-full bg-amber-300"></div>
                                      </>
                                    )}
                                    {equipment.color === 'red' && (
                                      <>
                                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                        <div className="w-2 h-2 rounded-full bg-red-400"></div>
                                        <div className="w-2 h-2 rounded-full bg-red-300"></div>
                                      </>
                                    )}
                                    {equipment.color === 'yellow' && (
                                      <>
                                        <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                                        <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                                        <div className="w-2 h-2 rounded-full bg-yellow-300"></div>
                                      </>
                                    )}
                                    {equipment.color === 'cyan' && (
                                      <>
                                        <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                                        <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
                                        <div className="w-2 h-2 rounded-full bg-cyan-300"></div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                          
                          {/* Carousel Navigation */}
                          <div className="mt-auto">
                          {(() => {
                            // Get equipment breakdown for this project
                            const equipmentBreakdown = project.equipmentBreakdown || {};
                            const hasEquipment = Object.values(equipmentBreakdown).some(count => (count as number) > 0);
                            
                            if (!hasEquipment) return null;
                            
                            // Calculate total equipment types
                            const equipmentTypes = [];
                            
                            // Add standard types
                            if (equipmentBreakdown.pressureVessel > 0) {
                              equipmentTypes.push({ name: 'Pressure Vessels', count: equipmentBreakdown.pressureVessel, color: 'blue' });
                            }
                            if (equipmentBreakdown.heatExchanger > 0) {
                              equipmentTypes.push({ name: 'Heat Exchangers', count: equipmentBreakdown.heatExchanger, color: 'green' });
                            }
                            if (equipmentBreakdown.reactor > 0) {
                              equipmentTypes.push({ name: 'Reactors', count: equipmentBreakdown.reactor, color: 'purple' });
                            }
                            if (equipmentBreakdown.storageTank > 0) {
                              equipmentTypes.push({ name: 'Storage Tanks', count: equipmentBreakdown.storageTank, color: 'orange' });
                            }
                            
                            // Add actual equipment types (not standard ones)
                            const standardKeys = ['pressureVessel', 'heatExchanger', 'reactor', 'storageTank'];
                            Object.entries(equipmentBreakdown).forEach(([key, count]) => {
                              if (!standardKeys.includes(key) && (count as number) > 0) {
                                // Convert key back to readable name
                                const readableName = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                const colors = ['indigo', 'pink', 'red', 'yellow', 'teal', 'cyan'];
                                const colorIndex = equipmentTypes.length % colors.length;
                                equipmentTypes.push({ 
                                  name: readableName, 
                                  count: count, 
                                  color: colors[colorIndex] 
                                });
                              }
                            });
                            
                            const totalEquipmentTypes = equipmentTypes.length;
                            const currentIndex = equipmentCarouselIndex[project.id] || 0;
                            const itemsPerPage = 4;
                            const totalPages = Math.ceil(totalEquipmentTypes / itemsPerPage);
                            const hasMorePages = totalPages > 1;
                            
                            if (!hasMorePages) return null;
                            
                            return (
                              <div className="flex items-center justify-center gap-2 mt-4">
                                <button
                                  onClick={() => {
                                    const newIndex = Math.max(0, (equipmentCarouselIndex[project.id] || 0) - 1);
                                    setEquipmentCarouselIndex(prev => ({
                                      ...prev,
                                      [project.id]: newIndex
                                    }));
                                  }}
                                  disabled={currentIndex === 0}
                                  className={`p-1 rounded-full transition-colors ${
                                    currentIndex === 0 
                                      ? 'text-gray-300 cursor-not-allowed' 
                                      : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                                  }`}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                  </svg>
                                </button>
                                
                                <div className="flex gap-1">
                                  {Array.from({ length: totalPages }, (_, i) => (
                                    <div
                                      key={i}
                                      className={`w-2 h-2 rounded-full transition-colors ${
                                        i === currentIndex 
                                          ? 'bg-blue-500' 
                                          : 'bg-gray-300'
                                      }`}
                                    ></div>
                                  ))}
                                </div>
                                
                                <button
                                  onClick={() => {
                                    const newIndex = Math.min(
                                      totalPages - 1,
                                      (equipmentCarouselIndex[project.id] || 0) + 1
                                    );
                                    setEquipmentCarouselIndex(prev => ({
                                      ...prev,
                                      [project.id]: newIndex
                                    }));
                                  }}
                                  disabled={currentIndex >= totalPages - 1}
                                  className={`p-1 rounded-full transition-colors ${
                                    currentIndex >= totalPages - 1 
                                      ? 'text-gray-300 cursor-not-allowed' 
                                      : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                                  }`}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </div>
                            );
                          })()}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="p-4 sm:p-6 border-t border-gray-100 bg-white mt-auto">
                        <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 sm:gap-3 overflow-visible">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectProject(project.id, "equipment");
                            }}
                            className="w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center bg-white hover:bg-blue-50 border-gray-300 text-gray-700 hover:text-blue-700 hover:border-blue-300 font-medium transition-all duration-200"
                          >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="sm:hidden">Equip</span>
                            <span className="hidden sm:inline">View Equipment</span>
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectProject(project.id, "vdcr");
                            }}
                            className="w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center bg-white hover:bg-green-50 border-gray-300 text-gray-700 hover:text-green-700 hover:border-green-300 font-medium transition-all duration-200"
                          >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="sm:hidden">VDCR</span>
                            <span className="hidden sm:inline">View VDCR</span>
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectProject(project.id, "project-details");
                            }}
                            className="w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center bg-white hover:bg-purple-50 border-gray-300 text-gray-700 hover:text-purple-700 hover:border-purple-300 font-medium transition-all duration-200"
                          >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            <span className="sm:hidden">Details</span>
                            <span className="hidden sm:inline">Details</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
                )}
              </div>
            </div>
          </>
        ) : mainTab === 'equipment' ? (
          <div className="mt-8">
            {/* Equipment Summary Section */}
            <div className="mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-green-500 via-green-600 to-green-700 rounded-xl p-6 text-white shadow-xl hover:shadow-2xl transition-shadow transition-transform duration-300 transform hover:-translate-y-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-100 text-sm font-medium uppercase tracking-wide">Total Standalone Equipment</p>
                      <p className="text-4xl font-bold text-white mt-2">{standaloneEquipment.length}</p>
                      <p className="text-green-200 text-sm mt-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Individual equipment orders
                      </p>
                    </div>
                    <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <div className="w-10 h-10 bg-white/30 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 rounded-xl p-6 text-white shadow-xl hover:shadow-2xl transition-shadow transition-transform duration-300 transform hover:-translate-y-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-emerald-100 text-sm font-medium uppercase tracking-wide">Active Equipment</p>
                      <p className="text-4xl font-bold text-white mt-2">
                        {standaloneEquipment.filter((eq: any) => 
                          eq.status !== 'completed' && eq.status !== 'pending'
                        ).length}
                      </p>
                      <p className="text-emerald-200 text-sm mt-2 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Currently in production
                      </p>
                    </div>
                    <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <div className="w-10 h-10 bg-white/30 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Equipment Grid */}
            {standaloneEquipmentLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-64 w-full" />
                ))}
              </div>
            ) : (
              <EquipmentGrid
                equipment={standaloneEquipment}
                projectName="Standalone Equipment"
                projectId="standalone"
                onBack={undefined}
                onViewDetails={undefined}
                onViewVDCR={undefined}
                onUserAdded={undefined}
                onActivityUpdate={undefined}
              />
            )}
          </div>
        ) : mainTab === 'tasks' ? (
          <div className="mt-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="flex flex-col items-center justify-center">
                <svg className="w-16 h-16 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Tasks</h3>
                <p className="text-gray-500">Content will be added soon</p>
              </div>
            </div>
          </div>
        ) : mainTab === 'certificates' ? (
          <div className="mt-8">
            {/* Preview Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-xl hover:shadow-2xl transition-shadow transition-transform duration-300 transform hover:-translate-y-1 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100 text-sm font-medium mb-1">Projects Completed</p>
                    <p className="text-4xl font-bold">{completedProjectsCount}</p>
                    <p className="text-blue-100 text-xs mt-2">Total completed engineering projects</p>
                  </div>
                  <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                    <div className="w-11 h-11 bg-white/30 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-xl hover:shadow-2xl transition-shadow transition-transform duration-300 transform hover:-translate-y-1 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100 text-sm font-medium mb-1">Recommendation Letters</p>
                    <p className="text-4xl font-bold">{recommendationLettersCollected}</p>
                    <p className="text-green-100 text-xs mt-2">Collected from clients</p>
                  </div>
                  <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                    <div className="w-11 h-11 bg-white/30 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-xl hover:shadow-2xl transition-shadow transition-transform duration-300 transform hover:-translate-y-1 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-orange-100 text-sm font-medium mb-1">Recommendation Letters</p>
                    <p className="text-4xl font-bold">{recommendationLettersPending}</p>
                    <p className="text-orange-100 text-xs mt-2">Pending from clients</p>
                  </div>
                  <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                    <div className="w-11 h-11 bg-white/30 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Template Download Section - Collapsible Dropdown */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
              <div 
                className="flex items-center justify-between p-4 sm:p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setTemplatesDropdownExpanded(!templatesDropdownExpanded)}
              >
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-gray-800">Download Sample Templates</h3>
                </div>
                <svg 
                  className={`w-5 h-5 text-gray-600 transition-transform duration-200 ${templatesDropdownExpanded ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              
              {templatesDropdownExpanded && (
                <div className="border-t border-gray-200 p-4 sm:p-6 bg-gray-50">
                  <p className="text-sm text-gray-500 mb-4">Pre-loaded templates ready to download and share</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {certificateTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-800 text-sm mb-1">{template.name}</h4>
                            <p className="text-xs text-gray-500 mb-3">{template.description}</p>
                          </div>
                          <svg className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <button
                          onClick={() => handleDownloadTemplate(template)}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Download Template
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sub-tabs */}
            <div className="mb-6">
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setCertificateTab('all')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                      certificateTab === 'all'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    All ({projects.filter(p => p.status === 'completed').length})
                  </button>
                  <button
                    onClick={() => setCertificateTab('pending')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                      certificateTab === 'pending'
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Pending ({projects.filter(p => {
                      if (p.status !== 'completed') return false;
                      const recStatus = p.recommendationLetter?.status || 'not-requested';
                      return recStatus === 'not-requested' || recStatus === 'requested';
                    }).length})
                  </button>
                  <button
                    onClick={() => setCertificateTab('received')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                      certificateTab === 'received'
                        ? 'border-green-500 text-green-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Received ({projects.filter(p => p.status === 'completed' && p.recommendationLetter?.status === 'received').length})
                  </button>
                </nav>
              </div>
            </div>

            {/* Completed Projects List */}
            <div>
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-1">
                  {certificateTab === 'all' && 'All Certificates'}
                  {certificateTab === 'pending' && 'Pending Certificates'}
                  {certificateTab === 'received' && 'Received Certificates'}
                </h3>
                <p className="text-sm text-gray-500">
                  Showing {filteredCompletedProjects.length} of {projects.filter(p => p.status === 'completed').length} completed projects
                </p>
              </div>
              
              {filteredCompletedProjects.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {filteredCompletedProjects.map((project) => {
                    // Check if deadline is valid
                    const hasValidDeadline = project.deadline && !isNaN(new Date(project.deadline).getTime());
                    
                    let diffDays = 0;
                    let isOverdue = false;
                    
                    if (hasValidDeadline) {
                      const deadline = new Date(project.deadline);
                      const today = new Date();
                      const diffTime = deadline.getTime() - today.getTime();
                      diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      isOverdue = diffDays < 0 && project.status !== 'completed';
                    }

                    return (
                      <div 
                        key={project.id} 
                        onClick={() => handleSelectProject(project.id, "equipment")}
                        className={`bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.04)] border transition-all duration-300 overflow-hidden group cursor-pointer flex flex-col ${
                          project.status === 'completed' ? 'h-[750px]' : 'h-[650px]'
                        } ${
                        isOverdue 
                          ? 'border-red-200 hover:border-red-300 hover:shadow-[0_4px_16px_rgba(239,68,68,0.15),0_2px_8px_rgba(239,68,68,0.1)]' 
                          : 'border-gray-100 hover:border-gray-200 hover:shadow-[0_8px_25px_rgba(0,0,0,0.12),0_4px_10px_rgba(0,0,0,0.08)]'
                        }`}
                      >
                        {/* Premium White Header with Neumorphic Effect */}
                        <div className="h-auto sm:h-24 bg-white p-4 pb-4 sm:pb-4 text-gray-800 border-b border-gray-100 relative group-hover:shadow-inner transition-all duration-300 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8),inset_0_-1px_0_0_rgba(0,0,0,0.05)]">
                          {/* Click Indicator */}
                          <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-0">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-1 sm:mb-1 truncate">{project.name}</h3>
                              <p className="hidden sm:block text-xs text-blue-600 font-medium mb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                Click to view details →
                              </p>
                              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-4 text-xs sm:text-sm text-gray-600 mb-1 sm:mb-0">
                                <span className="flex items-center gap-1 min-w-0">
                                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                  </svg>
                                  <span className="truncate max-w-[140px] sm:max-w-none">{project.client}</span>
                                </span>
                                <span className="flex items-center gap-1 min-w-0">
                                  <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                  </svg>
                                  <span className="truncate max-w-[140px] sm:max-w-none">{project.location}</span>
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col items-start sm:items-end gap-1 sm:gap-1 mt-1 sm:mt-0">
                              {/* Days Counter / Completion Status */}
                              <div className="text-left sm:text-right min-w-[140px]">
                                {project.status === 'completed' ? (
                                  <>
                                    <div className="text-xs text-gray-500 mb-1">Completed on</div>
                                    <div className="text-lg font-bold text-green-600">
                                      {project.completedDate 
                                        ? new Date(project.completedDate).toLocaleDateString('en-US', { 
                                            month: 'short', 
                                            day: 'numeric', 
                                            year: 'numeric' 
                                          })
                                        : new Date().toLocaleDateString('en-US', { 
                                            month: 'short', 
                                            day: 'numeric', 
                                            year: 'numeric' 
                                          })}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1 leading-none">Days to Completion Date</div>
                                    <div className={`text-base sm:text-lg font-bold whitespace-nowrap leading-none ${
                                      isOverdue ? 'text-red-600' : 'text-blue-600'
                                    }`}>
                                      {(() => {
                                        if (!hasValidDeadline) {
                                          return <span className="text-gray-500">No deadline set</span>;
                                        } else if (diffDays < 0) {
                                          return <span className="text-red-600">{Math.abs(diffDays)} days overdue</span>;
                                        } else if (diffDays === 0) {
                                          return <span className="text-orange-600">Due today</span>;
                                        } else {
                                          return <span>{diffDays} days to go</span>;
                                        }
                                      })()}
                                    </div>
                                  </>
                                )}
                              </div>
                              
                              {/* Edit & Delete Buttons */}
                              {userRole !== 'vdcr_manager' && (
                                <div className="flex items-center gap-1 pb-0 sm:pb-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditProject(project.id);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                    title="Edit Project"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteProject(project.id);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                    title="Delete Project"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Recommendation Letter Actions - Only for Completed Projects */}
                        {project.status === 'completed' && (
                          <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-green-50">
                            <div className="text-sm font-medium text-gray-700 mb-3">Recommendation Letter</div>
                            <div className="flex gap-2">
                              {project.recommendationLetter?.status === 'received' ? (
                                <>
                                  <div className="flex items-center gap-2 text-green-600 text-sm">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    <span>Received</span>
                                  </div>
                                  {project.recommendationLetter.receivedDocument && (
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewRecommendationLetter(project);
                                      }}
                                      className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 border-blue-300"
                                    >
                                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                      View Letter
                                    </Button>
                                  )}
                                </>
                              ) : project.recommendationLetter?.status === 'requested' ? (
                                <>
                                  <div className="flex items-center gap-2 text-yellow-600 text-sm mb-3">
                                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                                    <span>Requested</span>
                                  </div>
                                  <div className="flex gap-2">
                                    {project.recommendationLetter.reminderCount && project.recommendationLetter.reminderCount > 0 ? (
                                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-xs flex-shrink-0">
                                        <div className="flex items-center gap-1 text-orange-700 font-medium mb-1">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 00-15 0v5h5l-5 5-5-5h5v-5a7.5 7.5 0 0115 0v5z" />
                                          </svg>
                                          {project.recommendationLetter.reminderCount} sent
                                        </div>
                                        {project.recommendationLetter.lastReminderDateTime && (
                                          <div className="text-orange-600 text-xs">Last: {project.recommendationLetter.lastReminderDateTime}</div>
                                        )}
                                      </div>
                                    ) : null}
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSendRecommendationReminder(project);
                                      }}
                                      className="flex-1 text-orange-600 hover:text-orange-800 hover:bg-orange-50 border-orange-300"
                                    >
                                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5-5-5h5v-5a7.5 7.5 0 00-15 0v5h5l-5 5-5-5h5v-5a7.5 7.5 0 0115 0v5z" />
                                      </svg>
                                      {project.recommendationLetter.reminderCount && project.recommendationLetter.reminderCount > 0 ? 'Send Another' : 'Send Reminder'}
                                    </Button>
                                    <Button 
                                      variant="outline" 
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUploadRecommendationLetter(project);
                                      }}
                                      className="flex-1 bg-green-600 text-white hover:bg-green-700 border-green-600"
                                    >
                                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                      </svg>
                                      Upload Letter
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRequestRecommendationLetter(project);
                                    }}
                                    className="flex-1 bg-blue-600 text-white hover:bg-blue-700 border-blue-600"
                                  >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    Request Letter
                                  </Button>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUploadRecommendationLetter(project);
                                    }}
                                    className="flex-1 bg-green-600 text-white hover:bg-green-700 border-green-600"
                                  >
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    Upload Letter
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Project Details Grid */}
                        <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-blue-50">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                              <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Project Manager</span>
                              <p className="font-semibold text-gray-800 mt-1">{project.manager}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                              <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">PO Number</span>
                              <p className="font-semibold text-gray-800 mt-1">{project.poNumber}</p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                              <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Completion Date</span>
                              <p className="font-semibold text-gray-800 mt-1">
                                {project.status === 'completed' && project.completedDate
                                  ? new Date(project.completedDate).toISOString().split('T')[0]
                                  : project.deadline}
                              </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                              <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Equipment</span>
                              <p className="font-semibold text-gray-800 mt-1">{project.equipmentCount} units</p>
                            </div>
                          </div>
                        </div>

                        {/* Equipment Breakdown Section */}
                        <div className="p-6 bg-gradient-to-r from-slate-50 to-blue-50 border-l-4 border-blue-200 flex-1 flex flex-col min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              Equipment Breakdown
                            </span>
                            <span className="text-sm font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                              {project.equipmentCount} units
                            </span>
                          </div>
                          
                          {/* Equipment Type Breakdown with Carousel */}
                          <div className="relative flex-1 flex flex-col">
                            <div className="grid grid-cols-2 gap-3">
                              {(() => {
                                const equipmentBreakdown = project.equipmentBreakdown || {};
                                const hasEquipment = Object.values(equipmentBreakdown).some(count => (count as number) > 0);
                                
                                if (!hasEquipment) {
                                  return (
                                    <div className="col-span-2 text-center py-8">
                                      <div className="text-gray-400 mb-2">
                                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                      </div>
                                      <p className="text-sm text-gray-500">No equipment added yet</p>
                                      <p className="text-xs text-gray-400 mt-1">Project Manager will add equipment details</p>
                                    </div>
                                  );
                                }
                                
                                const equipmentTypes = [];
                                
                                if (equipmentBreakdown.pressureVessel > 0) {
                                  equipmentTypes.push({ name: 'Pressure Vessels', count: equipmentBreakdown.pressureVessel, color: 'blue' });
                                }
                                if (equipmentBreakdown.heatExchanger > 0) {
                                  equipmentTypes.push({ name: 'Heat Exchangers', count: equipmentBreakdown.heatExchanger, color: 'green' });
                                }
                                if (equipmentBreakdown.reactor > 0) {
                                  equipmentTypes.push({ name: 'Reactors', count: equipmentBreakdown.reactor, color: 'purple' });
                                }
                                if (equipmentBreakdown.storageTank > 0) {
                                  equipmentTypes.push({ name: 'Storage Tanks', count: equipmentBreakdown.storageTank, color: 'orange' });
                                }
                                
                                const standardKeys = ['pressureVessel', 'heatExchanger', 'reactor', 'storageTank'];
                                Object.entries(equipmentBreakdown).forEach(([key, count]) => {
                                  if (!standardKeys.includes(key) && (count as number) > 0) {
                                    const readableName = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                    const colors = ['indigo', 'pink', 'red', 'yellow', 'teal', 'cyan'];
                                    const colorIndex = equipmentTypes.length % colors.length;
                                    equipmentTypes.push({ 
                                      name: readableName, 
                                      count: count, 
                                      color: colors[colorIndex] 
                                    });
                                  }
                                });
                                
                                const currentIndex = equipmentCarouselIndex[project.id] || 0;
                                const itemsPerPage = 4;
                                const startIndex = currentIndex * itemsPerPage;
                                const endIndex = startIndex + itemsPerPage;
                                const visibleEquipment = equipmentTypes.slice(startIndex, endIndex);
                                
                                return visibleEquipment.map((equipment, index) => (
                                  <div key={index} className="bg-white/70 rounded-lg p-3 border border-gray-200">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-medium text-gray-600">{equipment.name}</span>
                                      <span className={`text-xs font-bold ${
                                        equipment.color === 'blue' ? 'text-blue-800' :
                                        equipment.color === 'green' ? 'text-green-800' :
                                        equipment.color === 'purple' ? 'text-purple-800' :
                                        equipment.color === 'orange' ? 'text-orange-800' :
                                        equipment.color === 'indigo' ? 'text-indigo-800' :
                                        equipment.color === 'pink' ? 'text-pink-800' :
                                        equipment.color === 'teal' ? 'text-teal-800' :
                                        equipment.color === 'amber' ? 'text-amber-800' :
                                        equipment.color === 'red' ? 'text-red-800' :
                                        equipment.color === 'yellow' ? 'text-yellow-800' :
                                        equipment.color === 'cyan' ? 'text-cyan-800' :
                                        'text-gray-800'
                                      }`}>{equipment.count}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {equipment.color === 'blue' && (
                                        <>
                                          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                          <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                                          <div className="w-2 h-2 rounded-full bg-blue-300"></div>
                                        </>
                                      )}
                                      {equipment.color === 'green' && (
                                        <>
                                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                          <div className="w-2 h-2 rounded-full bg-green-400"></div>
                                          <div className="w-2 h-2 rounded-full bg-green-300"></div>
                                        </>
                                      )}
                                      {equipment.color === 'purple' && (
                                        <>
                                          <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                                          <div className="w-2 h-2 rounded-full bg-purple-400"></div>
                                          <div className="w-2 h-2 rounded-full bg-purple-300"></div>
                                        </>
                                      )}
                                      {equipment.color === 'orange' && (
                                        <>
                                          <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                          <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                                          <div className="w-2 h-2 rounded-full bg-orange-300"></div>
                                        </>
                                      )}
                                      {equipment.color === 'indigo' && (
                                        <>
                                          <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                          <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                                          <div className="w-2 h-2 rounded-full bg-indigo-300"></div>
                                        </>
                                      )}
                                      {equipment.color === 'pink' && (
                                        <>
                                          <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                                          <div className="w-2 h-2 rounded-full bg-pink-400"></div>
                                          <div className="w-2 h-2 rounded-full bg-pink-300"></div>
                                        </>
                                      )}
                                      {equipment.color === 'teal' && (
                                        <>
                                          <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                                          <div className="w-2 h-2 rounded-full bg-teal-400"></div>
                                          <div className="w-2 h-2 rounded-full bg-teal-300"></div>
                                        </>
                                      )}
                                      {equipment.color === 'amber' && (
                                        <>
                                          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                          <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                                          <div className="w-2 h-2 rounded-full bg-amber-300"></div>
                                        </>
                                      )}
                                      {equipment.color === 'red' && (
                                        <>
                                          <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                          <div className="w-2 h-2 rounded-full bg-red-400"></div>
                                          <div className="w-2 h-2 rounded-full bg-red-300"></div>
                                        </>
                                      )}
                                      {equipment.color === 'yellow' && (
                                        <>
                                          <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                                          <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                                          <div className="w-2 h-2 rounded-full bg-yellow-300"></div>
                                        </>
                                      )}
                                      {equipment.color === 'cyan' && (
                                        <>
                                          <div className="w-2 h-2 rounded-full bg-cyan-500"></div>
                                          <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
                                          <div className="w-2 h-2 rounded-full bg-cyan-300"></div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ));
                              })()}
                            </div>
                            
                            {/* Carousel Navigation */}
                            <div className="mt-auto">
                              {(() => {
                                const equipmentBreakdown = project.equipmentBreakdown || {};
                                const hasEquipment = Object.values(equipmentBreakdown).some(count => (count as number) > 0);
                                
                                if (!hasEquipment) return null;
                                
                                const equipmentTypes = [];
                                
                                if (equipmentBreakdown.pressureVessel > 0) {
                                  equipmentTypes.push({ name: 'Pressure Vessels', count: equipmentBreakdown.pressureVessel, color: 'blue' });
                                }
                                if (equipmentBreakdown.heatExchanger > 0) {
                                  equipmentTypes.push({ name: 'Heat Exchangers', count: equipmentBreakdown.heatExchanger, color: 'green' });
                                }
                                if (equipmentBreakdown.reactor > 0) {
                                  equipmentTypes.push({ name: 'Reactors', count: equipmentBreakdown.reactor, color: 'purple' });
                                }
                                if (equipmentBreakdown.storageTank > 0) {
                                  equipmentTypes.push({ name: 'Storage Tanks', count: equipmentBreakdown.storageTank, color: 'orange' });
                                }
                                
                                const standardKeys = ['pressureVessel', 'heatExchanger', 'reactor', 'storageTank'];
                                Object.entries(equipmentBreakdown).forEach(([key, count]) => {
                                  if (!standardKeys.includes(key) && (count as number) > 0) {
                                    const readableName = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                    const colors = ['indigo', 'pink', 'red', 'yellow', 'teal', 'cyan'];
                                    const colorIndex = equipmentTypes.length % colors.length;
                                    equipmentTypes.push({ 
                                      name: readableName, 
                                      count: count, 
                                      color: colors[colorIndex] 
                                    });
                                  }
                                });
                                
                                const totalEquipmentTypes = equipmentTypes.length;
                                const currentIndex = equipmentCarouselIndex[project.id] || 0;
                                const itemsPerPage = 4;
                                const totalPages = Math.ceil(totalEquipmentTypes / itemsPerPage);
                                const hasMorePages = totalPages > 1;
                                
                                if (!hasMorePages) return null;
                                
                                return (
                                  <div className="flex items-center justify-center gap-2 mt-4">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const newIndex = Math.max(0, (equipmentCarouselIndex[project.id] || 0) - 1);
                                        setEquipmentCarouselIndex(prev => ({
                                          ...prev,
                                          [project.id]: newIndex
                                        }));
                                      }}
                                      disabled={currentIndex === 0}
                                      className={`p-1 rounded-full transition-colors ${
                                        currentIndex === 0 
                                          ? 'text-gray-300 cursor-not-allowed' 
                                          : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                                      }`}
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                      </svg>
                                    </button>
                                    
                                    <div className="flex gap-1">
                                      {Array.from({ length: totalPages }, (_, i) => (
                                        <div
                                          key={i}
                                          className={`w-2 h-2 rounded-full transition-colors ${
                                            i === currentIndex 
                                              ? 'bg-blue-500' 
                                              : 'bg-gray-300'
                                          }`}
                                        ></div>
                                      ))}
                                    </div>
                                    
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const newIndex = Math.min(
                                          totalPages - 1,
                                          (equipmentCarouselIndex[project.id] || 0) + 1
                                        );
                                        setEquipmentCarouselIndex(prev => ({
                                          ...prev,
                                          [project.id]: newIndex
                                        }));
                                      }}
                                      disabled={currentIndex >= totalPages - 1}
                                      className={`p-1 rounded-full transition-colors ${
                                        currentIndex >= totalPages - 1 
                                          ? 'text-gray-300 cursor-not-allowed' 
                                          : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                                      }`}
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    </button>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="p-4 sm:p-6 border-t border-gray-100 bg-white mt-auto">
                          <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 sm:gap-3 overflow-visible">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectProject(project.id, "equipment");
                              }}
                              className="w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center bg-white hover:bg-blue-50 border-gray-300 text-gray-700 hover:text-blue-700 hover:border-blue-300 font-medium transition-all duration-200"
                            >
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              <span className="sm:hidden">Equip</span>
                              <span className="hidden sm:inline">View Equipment</span>
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectProject(project.id, "vdcr");
                              }}
                              className="w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center bg-white hover:bg-green-50 border-gray-300 text-gray-700 hover:text-green-700 hover:border-green-300 font-medium transition-all duration-200"
                            >
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span className="sm:hidden">VDCR</span>
                              <span className="hidden sm:inline">View VDCR</span>
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectProject(project.id, "project-details");
                              }}
                              className="w-full sm:flex-1 h-8 sm:h-8 px-2 sm:px-3 text-[11px] sm:text-sm whitespace-nowrap justify-center bg-white hover:bg-purple-50 border-gray-300 text-gray-700 hover:text-purple-700 hover:border-purple-300 font-medium transition-all duration-200"
                            >
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              <span className="sm:hidden">Details</span>
                              <span className="hidden sm:inline">Details</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                  <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-500">No completed projects found in this category</p>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Selected Project View - Only show in Projects tab */}
        {mainTab === 'projects' && selectedProject ? (
          <UnifiedProjectView
            projectId={selectedProject}
            projectName={selectedProjectData?.name || "Project"}
            onBack={handleBackToProjects}
            equipment={selectedProjectData?.equipment || []}
            vdcrData={mockVDCRData}
            projectData={selectedProjectData || mockProjects[0]}
            initialTab={selectedProjectTab}
            userRole={userRole}
            onEditProject={handleEditProject}
            onDeleteProject={handleDeleteProject}
            onCompleteProject={handleCompleteProject}
          />
        ) : null}
      </div>
      
      {/* Add Project Form Modal */}
      {showAddProjectForm && (
        <AddProjectForm
          onClose={() => {
            setShowAddProjectForm(false);
            setEditMode(false);
            setEditingProject(null);
          }}
          onSubmit={editMode ? handleUpdateProject : handleAddNewProject}
          editData={editMode ? editingProject : null}
          isEditMode={editMode}
        />
      )}

      {/* PDF Viewer Modal */}
      {showPDFViewer && pdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-800 truncate">{pdfTitle}</h2>
              <button
                onClick={closePDFViewer}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Close"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* PDF Content */}
            <div className="flex-1 p-4 sm:p-6 overflow-hidden">
              <div className="w-full h-full border border-gray-200 rounded-lg overflow-hidden bg-gray-100">
                <iframe
                  src={pdfUrl}
                  className="w-full h-full"
                  style={{ minHeight: '400px' }}
                  title="PDF Viewer"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-4 sm:p-6 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={closePDFViewer}
                className="px-4 py-2"
              >
                Close
              </Button>
              {currentPDF && (
                <Button
                  variant="default"
                  onClick={() => {
                    const url = URL.createObjectURL(currentPDF);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = currentPDF.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;