import { useState, useEffect, useMemo, useRef } from 'react';
import { fastAPI } from '@/lib/api';
import { activityApi } from '@/lib/activityApi';
import axios from 'axios';
import { Clock, User, FileText, CheckCircle, Send, Play, Pause, X, Eye, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface CompanyHighlightsProps {
  onSelectProject?: (projectId: string, initialTab?: string) => void;
}

type TimePeriod = '1 Day' | '1 Week' | '1 Month' | 'Custom';
type ActiveTab = 'production' | 'documentation' | 'timeline' | 'milestone';
type ProductionSubTab = 'key-progress' | 'all-updates';
type TimelineSubTab = 'with-dates' | 'without-dates';

const CompanyHighlights = ({ onSelectProject }: CompanyHighlightsProps) => {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('1 Week');
  const [activeTab, setActiveTab] = useState<ActiveTab>('production');
  const [productionSubTab, setProductionSubTab] = useState<ProductionSubTab>('key-progress');
  const [timelineSubTab, setTimelineSubTab] = useState<TimelineSubTab>('with-dates');
  const [productionUpdates, setProductionUpdates] = useState<any[]>([]);
  const [equipmentCardUpdates, setEquipmentCardUpdates] = useState<any[]>([]);
  const [documentationUpdates, setDocumentationUpdates] = useState<any[]>([]);
  const [timelineUpdates, setTimelineUpdates] = useState<any[]>([]);
  const [timelineUpdatesWithoutDates, setTimelineUpdatesWithoutDates] = useState<any[]>([]);
  const [milestoneUpdates, setMilestoneUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Search states for each section
  const [productionSearchQuery, setProductionSearchQuery] = useState('');
  const [documentationSearchQuery, setDocumentationSearchQuery] = useState('');
  const [timelineSearchQuery, setTimelineSearchQuery] = useState('');
  const [milestoneSearchQuery, setMilestoneSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [customDateRange, setCustomDateRange] = useState({ from: '', to: '' });
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showProgressImageModal, setShowProgressImageModal] = useState<{ url: string, description?: string, uploadedBy?: string, uploadDate?: string } | null>(null);
  
  // User role and project filtering
  const [userRole, setUserRole] = useState<string>('');
  const [assignedProjectIds, setAssignedProjectIds] = useState<string[]>([]);
  const [firmId, setFirmId] = useState<string>('');

  // Load user role and fetch assigned projects on mount
  useEffect(() => {
    const loadUserData = () => {
      const role = localStorage.getItem('userRole') || '';
      const userId = localStorage.getItem('userId') || '';
      const userFirmId = localStorage.getItem('firmId') || '';
      
      setUserRole(role);
      setFirmId(userFirmId);
      
      // If VDCR Manager, set active tab to documentation
      if (role === 'vdcr_manager') {
        setActiveTab('documentation');
      }
      
      // Fetch assigned project IDs if not firm_admin
      if (role !== 'firm_admin' && userId) {
        fetchAssignedProjects(userId);
      }
    };
    
    loadUserData();
  }, []);
  
  // Fetch assigned project IDs for non-firm-admin users
  const fetchAssignedProjects = async (userId: string) => {
    try {
      const api = (await import('@/lib/api')).default;
      const response = await api.get(`/project_members?user_id=eq.${userId}&select=project_id`);
      const projectIds = (response.data as any[]).map((member: any) => member.project_id);
      setAssignedProjectIds([...new Set(projectIds)]); // Remove duplicates
    } catch (error) {
      console.error('Error fetching assigned projects:', error);
      setAssignedProjectIds([]);
    }
  };
  
  // Check if user can see a tab
  const canSeeTab = (tab: ActiveTab) => {
    if (userRole === 'vdcr_manager') {
      return tab === 'documentation';
    }
    // Firm Admin, Project Manager, Viewer, Editor can see all tabs
    return true;
  };
  
  // Fetch milestone updates - Equipment with next milestones
  useEffect(() => {
    const fetchMilestoneUpdates = async () => {
      setLoading(true);
      try {
        // Fetch all equipment with next_milestone data
        const equipment = await fastAPI.getAllEquipmentNearingCompletion(
          undefined,
          undefined,
          userRole === 'firm_admin' ? undefined : assignedProjectIds
        );
        
        // Filter equipment that has next_milestone - show all equipment with next_milestone set
        const eqArray = Array.isArray(equipment) ? equipment : [];
        const withMilestones = eqArray.filter((eq: any) => {
          // Show equipment that has next_milestone set (not empty/null)
          return eq.next_milestone && eq.next_milestone.trim() !== '';
        });
        
        // Sort by project name and equipment type
        const sortedMilestones = withMilestones.sort((a: any, b: any) => {
          const projectA = a.projects?.name || '';
          const projectB = b.projects?.name || '';
          if (projectA !== projectB) {
            return projectA.localeCompare(projectB);
          }
          return (a.type || '').localeCompare(b.type || '');
        });
        
        const filteredMilestones = filterByAssignedProjects(sortedMilestones, 'project_id');
        setMilestoneUpdates(filteredMilestones);
      } catch (error) {
        console.error('❌ Error fetching milestone updates:', error);
        setMilestoneUpdates([]);
      } finally {
        setLoading(false);
      }
    };

    if (isExpanded && activeTab === 'milestone' && canSeeTab('milestone')) {
      fetchMilestoneUpdates();
    }
  }, [activeTab, isExpanded, userRole, assignedProjectIds]);
  
  // Filter data by assigned projects
  const filterByAssignedProjects = (data: any[], projectIdKey: string = 'project_id') => {
    if (userRole === 'firm_admin') {
      return data; // Firm admin sees all data
    }
    if (assignedProjectIds.length === 0) {
      return []; // No assigned projects, return empty
    }
    return data.filter((item: any) => {
      // Handle nested paths like 'equipment.project_id' or 'vdcr_records.project_id'
      let itemProjectId: string | undefined;
      
      if (projectIdKey.includes('.')) {
        // Nested path - split and traverse
        const parts = projectIdKey.split('.');
        let current: any = item;
        for (const part of parts) {
          current = current?.[part];
          if (current === undefined || current === null) break;
        }
        itemProjectId = current;
      } else {
        // Direct path
        itemProjectId = item[projectIdKey] || item.equipment?.[projectIdKey] || item.vdcr_records?.[projectIdKey];
      }
      
      // If project ID is found, check if it's in assigned projects
      return itemProjectId && assignedProjectIds.includes(itemProjectId);
    });
  };

  // Calculate date range based on time period
  // FIX: Return primitive values (strings) instead of object to prevent infinite re-renders
  const dateRangeStart = useMemo(() => {
    const now = new Date();
    const startDate = new Date();

    if (timePeriod === 'Custom') {
      if (customDateRange.from && customDateRange.to) {
        return new Date(customDateRange.from).toISOString();
      }
      // Default to 1 month if custom dates not set
      startDate.setMonth(now.getMonth() - 1);
    } else {
      switch (timePeriod) {
        case '1 Day':
          startDate.setDate(now.getDate() - 1);
          break;
        case '1 Week':
          startDate.setDate(now.getDate() - 7);
          break;
        case '1 Month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        default:
          startDate.setDate(now.getDate() - 7);
      }
    }

    return startDate.toISOString();
  }, [timePeriod, customDateRange.from, customDateRange.to]);

  const dateRangeEnd = useMemo(() => {
    return new Date().toISOString();
  }, []); // Only recalculate when component mounts, not on every render

  // Fetch production updates (progress images for Key Progress, progress entries for All Updates)
  // FIX: Added request cancellation and fixed state clearing
  useEffect(() => {
    // Create abort controller for request cancellation
    const abortController = new AbortController();
    let isMounted = true;
    
    // Set loading immediately when effect runs (before async function)
    if (isExpanded && activeTab === 'production' && canSeeTab('production')) {
      setLoading(true);
    }
    
    const fetchProductionUpdates = async () => {
      
      try {
        if (productionSubTab === 'key-progress') {
          // Fetch progress images for Key Progress tab
          const images = await fastAPI.getAllProgressImages(
            dateRangeStart, 
            dateRangeEnd,
            userRole === 'firm_admin' ? undefined : assignedProjectIds
          );
          
          // Only update state if component is still mounted and request wasn't aborted
          if (isMounted && !abortController.signal.aborted) {
            const filteredImages = filterByAssignedProjects(images, 'equipment.project_id');
            setProductionUpdates(Array.isArray(filteredImages) ? filteredImages : []);
            setLoading(false); // Only set loading to false after data is set
          }
        } else {
          // Fetch progress entries for All Updates tab
          const entries = await fastAPI.getAllProgressEntries(
            dateRangeStart, 
            dateRangeEnd,
            userRole === 'firm_admin' ? undefined : assignedProjectIds
          );
          
          // Only update state if component is still mounted and request wasn't aborted
          if (isMounted && !abortController.signal.aborted) {
            const filteredEntries = filterByAssignedProjects(entries, 'equipment.project_id');
            setProductionUpdates(Array.isArray(filteredEntries) ? filteredEntries : []);
            setLoading(false); // Only set loading to false after data is set
          }
        }
      } catch (error: any) {
        // Don't log aborted requests as errors
        if (error?.name !== 'AbortError' && isMounted && !abortController.signal.aborted) {
          console.error('Error fetching production updates:', error);
          setProductionUpdates([]);
        }
        // Always set loading to false on error or abort
        if (isMounted && !abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    if (isExpanded && activeTab === 'production' && canSeeTab('production')) {
      fetchProductionUpdates();
    } else {
      // Clear data only when tab is not active
      setProductionUpdates([]);
      setLoading(false);
    }

    // Cleanup: Cancel request if component unmounts or dependencies change
    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [dateRangeStart, dateRangeEnd, isExpanded, activeTab, productionSubTab, userRole, assignedProjectIds]);

  // Fetch equipment card updates (equipment_updated activity logs)
  // NOTE: This runs separately for "All Updates" tab but doesn't affect the main loading state
  // to avoid conflicts with production updates loading
  useEffect(() => {
    const fetchEquipmentCardUpdates = async () => {
      // Don't set main loading state here to avoid conflicts
      // Equipment card updates are fetched separately and merged if needed
      try {
        const projectIds = userRole === 'firm_admin' ? undefined : assignedProjectIds;
        
        if (!projectIds || projectIds.length === 0) {
          if (userRole !== 'firm_admin') {
            setEquipmentCardUpdates([]);
            setLoading(false);
            return;
          }
        }

        // Fetch equipment activity logs with activity_type = 'equipment_updated'
        const allUpdates: any[] = [];
        
        if (projectIds && projectIds.length > 0) {
          // Fetch for each assigned project
          for (const projectId of projectIds) {
            try {
              const logs = await activityApi.getEquipmentActivityLogs(projectId, {
                activityType: 'equipment_updated',
                dateFrom: dateRangeStart,
                dateTo: dateRangeEnd
              });
              if (Array.isArray(logs)) {
                allUpdates.push(...logs);
              }
            } catch (error) {
              console.error(`Error fetching updates for project ${projectId}:`, error);
            }
          }
        } else if (userRole === 'firm_admin') {
          // For firm admin, fetch all equipment updates across all projects
          try {
            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
            const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
            const apiClient = axios.create({
              baseURL: `${SUPABASE_URL}/rest/v1`,
              headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
              },
              timeout: 30000
            });
            let url = `/equipment_activity_logs?activity_type=eq.equipment_updated&created_at=gte.${dateRangeStart}&created_at=lte.${dateRangeEnd}&select=*,equipment:equipment_id(id,tag_number,type,name,project_id,projects:project_id(id,name)),created_by_user:created_by(full_name,email)&order=created_at.desc`;
            const response = await apiClient.get(url);
            const logs = Array.isArray(response.data) ? response.data : [];
            allUpdates.push(...logs);
          } catch (error) {
            console.error('Error fetching all equipment updates:', error);
          }
        }

        // Transform activity logs to match the format expected by the UI
        const transformedUpdates = allUpdates.map((log: any) => ({
          id: log.id,
          entry_text: log.action_description || `Equipment "${log.equipment?.type || 'Equipment'}" (${log.equipment?.tag_number || 'N/A'}) was updated`,
          entry_type: 'update',
          activity_type: 'equipment_updated',
          created_at: log.created_at,
          created_by: log.created_by,
          created_by_user: log.created_by_user || { full_name: 'Unknown', email: '' },
          equipment: log.equipment || {
            id: log.equipment_id,
            tag_number: log.metadata?.tagNumber || log.metadata?.tag_number || 'N/A',
            type: log.metadata?.equipmentType || log.metadata?.equipment_type || 'Equipment',
            project_id: log.project_id || log.equipment?.project_id,
            projects: log.equipment?.projects || (log.metadata?.projectName ? { name: log.metadata.projectName } : null)
          },
          metadata: log.metadata || {}
        }));

        // Filter by assigned projects if not firm admin
        const filteredUpdates = filterByAssignedProjects(transformedUpdates, 'equipment.project_id');
        setEquipmentCardUpdates(filteredUpdates);
      } catch (error) {
        console.error('Error fetching equipment card updates:', error);
        setEquipmentCardUpdates([]);
      }
      // Don't set loading to false here - let production updates control the loading state
    };

    if (isExpanded && activeTab === 'production' && canSeeTab('production') && productionSubTab === 'all-updates') {
      fetchEquipmentCardUpdates();
    }
  }, [dateRangeStart, dateRangeEnd, isExpanded, activeTab, productionSubTab, userRole, assignedProjectIds]);

  // Audio playback function
  const playAudio = (audioData: string, entryId: string) => {
    if (playingAudioId === entryId && audioRef.current) {
      // Pause if already playing
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingAudioId(null);
    } else {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      // Create new audio element
      const audio = new Audio(audioData);
      audioRef.current = audio;
      setPlayingAudioId(entryId);
      
      audio.onended = () => {
        setPlayingAudioId(null);
        audioRef.current = null;
      };
      
      audio.onerror = () => {
        console.error('Error playing audio');
        setPlayingAudioId(null);
        audioRef.current = null;
      };
      
      audio.play().catch((error) => {
        console.error('Error playing audio:', error);
        setPlayingAudioId(null);
        audioRef.current = null;
      });
    }
  };

  // Format audio duration
  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Filter production updates by subtab and search query
  const filteredProductionUpdates = useMemo(() => {
    let filtered = productionUpdates;
    
    // Safety check: Ensure data type matches the current subtab
    // Key Progress should only show progress images (entry_type === 'progress_image')
    // All Updates should only show progress entries (entry_type !== 'progress_image')
    if (productionSubTab === 'key-progress') {
      // Filter to only show progress images
      // Progress images have entry_type === 'progress_image' (from getAllProgressImages)
      filtered = filtered.filter((entry: any) => {
        return entry.entry_type === 'progress_image';
      });
    } else {
      // Filter to only show progress entries (not progress images)
      // Progress entries have entry_type !== 'progress_image' (from getAllProgressEntries)
      filtered = filtered.filter((entry: any) => {
        return entry.entry_type !== 'progress_image';
      });
    }
    
    // Apply search filter
    if (productionSearchQuery.trim()) {
      const query = productionSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((entry: any) => {
        const tagNumber = (entry.equipment?.tag_number || '').toLowerCase();
        const equipmentType = (entry.equipment?.type || entry.equipment?.name || '').toLowerCase();
        const projectName = (entry.equipment?.projects?.name || '').toLowerCase();
        const entryText = (entry.entry_text || entry.comment || entry.entry_type || '').toLowerCase();
        const entryType = (entry.entry_type || entry.type || '').toLowerCase();
        
        return tagNumber.includes(query) || 
               equipmentType.includes(query) || 
               projectName.includes(query) || 
               entryText.includes(query) ||
               entryType.includes(query);
      });
    }
    
    return filtered;
  }, [productionUpdates, productionSubTab, productionSearchQuery]);
  
  // Filter documentation updates by search query
  const filteredDocumentationUpdates = useMemo(() => {
    let filtered = documentationUpdates;
    
    if (documentationSearchQuery.trim()) {
      const query = documentationSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((doc: any) => {
        const docName = (doc.document_name || doc.vdcr_records?.document_name || '').toLowerCase();
        const projectName = (doc.vdcr_records?.projects?.name || '').toLowerCase();
        const status = (doc.vdcr_records?.status || doc.status || '').toLowerCase();
        const equipmentTags = (doc.equipment_ids || doc.vdcr_records?.equipment_tag_numbers?.join(' ') || '').toLowerCase();
        
        return docName.includes(query) || 
               projectName.includes(query) || 
               status.includes(query) ||
               equipmentTags.includes(query);
      });
    }
    
    return filtered;
  }, [documentationUpdates, documentationSearchQuery]);
  
  // Filter timeline updates by search query
  const filteredTimelineUpdates = useMemo(() => {
    let filtered = timelineUpdates;
    
    if (timelineSearchQuery.trim()) {
      const query = timelineSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((eq: any) => {
        const tagNumber = (eq.tag_number || '').toLowerCase();
        const equipmentType = (eq.type || eq.name || '').toLowerCase();
        const projectName = (eq.projects?.name || '').toLowerCase();
        
        return tagNumber.includes(query) || 
               equipmentType.includes(query) || 
               projectName.includes(query);
      });
    }
    
    return filtered;
  }, [timelineUpdates, timelineSearchQuery]);
  
  const filteredTimelineUpdatesWithoutDates = useMemo(() => {
    let filtered = timelineUpdatesWithoutDates;
    
    if (timelineSearchQuery.trim()) {
      const query = timelineSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((eq: any) => {
        const tagNumber = (eq.tag_number || '').toLowerCase();
        const equipmentType = (eq.type || eq.name || '').toLowerCase();
        const projectName = (eq.projects?.name || '').toLowerCase();
        
        return tagNumber.includes(query) || 
               equipmentType.includes(query) || 
               projectName.includes(query);
      });
    }
    
    return filtered;
  }, [timelineUpdatesWithoutDates, timelineSearchQuery]);
  
  // Filter milestone updates by search query
  const filteredMilestoneUpdates = useMemo(() => {
    let filtered = milestoneUpdates;
    
    if (milestoneSearchQuery.trim()) {
      const query = milestoneSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((eq: any) => {
        const tagNumber = (eq.tag_number || '').toLowerCase();
        const equipmentType = (eq.type || eq.name || '').toLowerCase();
        const projectName = (eq.projects?.name || '').toLowerCase();
        const nextMilestone = (eq.next_milestone || '').toLowerCase();
        
        return tagNumber.includes(query) || 
               equipmentType.includes(query) || 
               projectName.includes(query) ||
               nextMilestone.includes(query);
      });
    }
    
    return filtered;
  }, [milestoneUpdates, milestoneSearchQuery]);

  // Fetch documentation updates - only those with status changes
  useEffect(() => {
    const fetchDocumentationUpdates = async () => {
      setLoading(true);
      try {
        // Fetch VDCR records with status changes filtered by updated_at in the selected time range
        const documents = await fastAPI.getAllVDCRDocuments(
          dateRangeStart, 
          dateRangeEnd,
          userRole === 'firm_admin' ? undefined : assignedProjectIds
        );
        // The API now filters by updated_at, so we just need to ensure we have valid records
        const docsArray = Array.isArray(documents) ? documents : [];
        // Filter to only show records with valid status (not null/undefined)
        const statusChangedDocs = docsArray.filter((doc: any) => {
          // Only show records that have been updated (status changes)
          return doc.vdcr_records?.updated_at && doc.vdcr_records?.status;
        });
        const filteredDocs = filterByAssignedProjects(statusChangedDocs, 'vdcr_records.project_id');
        setDocumentationUpdates(filteredDocs);
      } catch (error) {
        console.error('Error fetching documentation updates:', error);
        setDocumentationUpdates([]);
      } finally {
        setLoading(false);
      }
    };

    if (isExpanded && activeTab === 'documentation' && canSeeTab('documentation')) {
      fetchDocumentationUpdates();
    }
  }, [dateRangeStart, dateRangeEnd, activeTab, isExpanded, userRole, assignedProjectIds]);

  // Fetch timeline updates - ALL equipment ordered by days remaining (not filtered by time period)
  // Uses po_cdd (PO-CDD) field instead of completion_date
  useEffect(() => {
    const fetchTimelineUpdates = async () => {
      setLoading(true);
      try {
        // Fetch all equipment without date filtering
        const equipment = await fastAPI.getAllEquipmentNearingCompletion(
          undefined,
          undefined,
          userRole === 'firm_admin' ? undefined : assignedProjectIds
        );
        
        // Separate equipment into two groups: with PO-CDD dates and without
        const eqArray = Array.isArray(equipment) ? equipment : [];
        
        // Filter out equipment from completed projects first - more robust check
        const activeProjectEquipment = eqArray.filter((eq: any) => {
          // Check if project exists and is not completed
          if (!eq.projects) return false;
          const projectStatus = eq.projects.status;
          // Only include if status exists and is NOT 'completed'
          return projectStatus && projectStatus !== 'completed' && projectStatus.toLowerCase() !== 'completed';
        });
        
        // Equipment WITH PO-CDD dates
        const withPOCddDates = activeProjectEquipment.filter((eq: any) => {
          // Double-check project status is not completed
          if (eq.projects && (eq.projects.status === 'completed' || eq.projects.status?.toLowerCase() === 'completed')) {
            return false;
          }
          // Filter out null, empty, or "To be scheduled" values
          return eq.po_cdd && eq.po_cdd !== 'To be scheduled' && eq.po_cdd.trim() !== '';
        });
        const withDaysToGo = withPOCddDates.map((eq: any) => {
            const poCddDate = new Date(eq.po_cdd);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate day calculation
            poCddDate.setHours(0, 0, 0, 0);
            const diffTime = poCddDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return { ...eq, daysToGo: diffDays };
          })
          .sort((a: any, b: any) => {
            // Sort by daysToGo ascending (earliest completion first)
            // Negative days (overdue) come first, then positive days
            return a.daysToGo - b.daysToGo;
          });
        
        // Equipment WITHOUT PO-CDD dates
        const withoutPOCddDates = activeProjectEquipment.filter((eq: any) => {
          // Double-check project status is not completed
          if (eq.projects && (eq.projects.status === 'completed' || eq.projects.status?.toLowerCase() === 'completed')) {
            return false;
          }
          // Equipment that doesn't have a valid PO-CDD date
          return !eq.po_cdd || eq.po_cdd === 'To be scheduled' || eq.po_cdd.trim() === '';
        }).sort((a: any, b: any) => {
          // Sort by equipment type or tag number
          const aName = (a.type || a.name || '').toLowerCase();
          const bName = (b.type || b.name || '').toLowerCase();
          return aName.localeCompare(bName);
        });
        
        // Apply project assignment filtering, but ensure completed projects are still excluded
        const filteredWithDates = filterByAssignedProjects(withDaysToGo, 'project_id').filter((eq: any) => {
          return eq.projects && eq.projects.status !== 'completed' && eq.projects.status?.toLowerCase() !== 'completed';
        });
        const filteredWithoutDates = filterByAssignedProjects(withoutPOCddDates, 'project_id').filter((eq: any) => {
          return eq.projects && eq.projects.status !== 'completed' && eq.projects.status?.toLowerCase() !== 'completed';
        });
        
        setTimelineUpdates(filteredWithDates);
        setTimelineUpdatesWithoutDates(filteredWithoutDates);
      } catch (error) {
        console.error('❌ Error fetching timeline updates:', error);
        setTimelineUpdates([]);
      } finally {
        setLoading(false);
      }
    };

    if (isExpanded && activeTab === 'timeline' && canSeeTab('timeline')) {
      fetchTimelineUpdates();
    }
  }, [activeTab, isExpanded, userRole, assignedProjectIds]);

  // Clear search queries when switching tabs
  useEffect(() => {
    setProductionSearchQuery('');
    setDocumentationSearchQuery('');
    setTimelineSearchQuery('');
    setMilestoneSearchQuery('');
  }, [activeTab]);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    if (!isExpanded) return;

    const refreshData = async () => {
      if (activeTab === 'production' && canSeeTab('production')) {
        try {
          // CRITICAL FIX: Check which subtab is active and fetch the correct data type
          if (productionSubTab === 'key-progress') {
            // Fetch progress images for Key Progress tab
            const images = await fastAPI.getAllProgressImages(
              dateRangeStart, 
              dateRangeEnd,
              userRole === 'firm_admin' ? undefined : assignedProjectIds
            );
            const filteredImages = filterByAssignedProjects(images, 'equipment.project_id');
            setProductionUpdates(Array.isArray(filteredImages) ? filteredImages : []);
          } else {
            // Fetch progress entries for All Updates tab
            const entries = await fastAPI.getAllProgressEntries(
              dateRangeStart, 
              dateRangeEnd,
              userRole === 'firm_admin' ? undefined : assignedProjectIds
            );
            const filteredEntries = filterByAssignedProjects(entries, 'equipment.project_id');
            setProductionUpdates(Array.isArray(filteredEntries) ? filteredEntries : []);
          }
          
          // Refresh equipment card updates if on all-updates tab
          if (productionSubTab === 'all-updates') {
            const projectIds = userRole === 'firm_admin' ? undefined : assignedProjectIds;
            const allUpdates: any[] = [];
            
            if (projectIds && projectIds.length > 0) {
              for (const projectId of projectIds) {
                try {
                  const logs = await activityApi.getEquipmentActivityLogs(projectId, {
                    activityType: 'equipment_updated',
                    dateFrom: dateRangeStart,
                    dateTo: dateRangeEnd
                  });
                  if (Array.isArray(logs)) {
                    allUpdates.push(...logs);
                  }
                } catch (error) {
                  console.error(`Error fetching updates for project ${projectId}:`, error);
                }
              }
            } else if (userRole === 'firm_admin') {
              try {
                const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
                const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
                const apiClient = axios.create({
                  baseURL: `${SUPABASE_URL}/rest/v1`,
                  headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json'
                  },
                  timeout: 30000
                });
                let url = `/equipment_activity_logs?activity_type=eq.equipment_updated&created_at=gte.${dateRangeStart}&created_at=lte.${dateRangeEnd}&select=*,equipment:equipment_id(id,tag_number,type,name,project_id,projects:project_id(id,name)),created_by_user:created_by(full_name,email)&order=created_at.desc`;
                const response = await apiClient.get(url);
                const logs = Array.isArray(response.data) ? response.data : [];
                allUpdates.push(...logs);
              } catch (error) {
                console.error('Error fetching all equipment updates:', error);
              }
            }

            const transformedUpdates = allUpdates.map((log: any) => ({
              id: log.id,
              entry_text: log.action_description || `Equipment "${log.equipment?.type || 'Equipment'}" (${log.equipment?.tag_number || 'N/A'}) was updated`,
              entry_type: 'update',
              activity_type: 'equipment_updated',
              created_at: log.created_at,
              created_by: log.created_by,
              created_by_user: log.created_by_user || { full_name: 'Unknown', email: '' },
              equipment: log.equipment || {
                id: log.equipment_id,
                tag_number: log.metadata?.tagNumber || log.metadata?.tag_number || 'N/A',
                type: log.metadata?.equipmentType || log.metadata?.equipment_type || 'Equipment',
                project_id: log.project_id || log.equipment?.project_id,
                projects: log.equipment?.projects || (log.metadata?.projectName ? { name: log.metadata.projectName } : null)
              },
              metadata: log.metadata || {}
            }));

            // Filter by assigned projects if not firm admin
            const filteredUpdates = filterByAssignedProjects(transformedUpdates, 'equipment.project_id');
            setEquipmentCardUpdates(filteredUpdates);
          }
        } catch (error) {
          console.error('Error auto-refreshing production updates:', error);
        }
      } else if (activeTab === 'documentation' && canSeeTab('documentation')) {
        try {
          const documents = await fastAPI.getAllVDCRDocuments(
            dateRangeStart, 
            dateRangeEnd,
            userRole === 'firm_admin' ? undefined : assignedProjectIds
          );
          const docsArray = Array.isArray(documents) ? documents : [];
          const statusChangedDocs = docsArray.filter((doc: any) => {
            return doc.vdcr_records?.updated_at && doc.vdcr_records?.status;
          });
          const filteredDocs = filterByAssignedProjects(statusChangedDocs, 'vdcr_records.project_id');
          setDocumentationUpdates(filteredDocs);
        } catch (error) {
          console.error('Error auto-refreshing documentation updates:', error);
        }
      } else if (activeTab === 'timeline' && canSeeTab('timeline')) {
        try {
          const equipment = await fastAPI.getAllEquipmentNearingCompletion(
            undefined,
            undefined,
            userRole === 'firm_admin' ? undefined : assignedProjectIds
          );
          const eqArray = Array.isArray(equipment) ? equipment : [];
          const withPOCddDates = eqArray.filter((eq: any) => {
            // Filter out null, empty, or "To be scheduled" values
            return eq.po_cdd && eq.po_cdd !== 'To be scheduled' && eq.po_cdd.trim() !== '';
          });
          const withDaysToGo = withPOCddDates
            .map((eq: any) => {
              const poCddDate = new Date(eq.po_cdd);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              poCddDate.setHours(0, 0, 0, 0);
              const diffTime = poCddDate.getTime() - today.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              return { ...eq, daysToGo: diffDays };
            })
            .sort((a: any, b: any) => a.daysToGo - b.daysToGo);
          const filteredEquipment = filterByAssignedProjects(withDaysToGo, 'project_id');
          setTimelineUpdates(filteredEquipment);
        } catch (error) {
          console.error('Error auto-refreshing timeline updates:', error);
        }
      } else if (activeTab === 'milestone' && canSeeTab('milestone')) {
        try {
          const equipment = await fastAPI.getAllEquipmentNearingCompletion(
            undefined,
            undefined,
            userRole === 'firm_admin' ? undefined : assignedProjectIds
          );
          const eqArray = Array.isArray(equipment) ? equipment : [];
          const withMilestones = eqArray.filter((eq: any) => {
            return eq.next_milestone && eq.next_milestone.trim() !== '' && eq.next_milestone !== 'Initial Setup';
          });
          const sortedMilestones = withMilestones.sort((a: any, b: any) => {
            const projectA = a.projects?.name || '';
            const projectB = b.projects?.name || '';
            if (projectA !== projectB) {
              return projectA.localeCompare(projectB);
            }
            return (a.type || '').localeCompare(b.type || '');
          });
          const filteredMilestones = filterByAssignedProjects(sortedMilestones, 'project_id');
          setMilestoneUpdates(filteredMilestones);
        } catch (error) {
          console.error('Error auto-refreshing milestone updates:', error);
        }
      }
    };

    const interval = setInterval(refreshData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [isExpanded, activeTab, productionSubTab, dateRangeStart, dateRangeEnd, userRole, assignedProjectIds]);

  const formatTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      if (diffInSeconds < 60) return 'just now';
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
      if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
      if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 604800)} weeks ago`;
      return `${Math.floor(diffInSeconds / 2592000)} months ago`;
    } catch {
      return 'Recently';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return (
          <span className="inline-flex items-center px-1.5 xs:px-2 sm:px-2.5 md:px-3 py-0.5 rounded-full text-[9px] xs:text-[10px] sm:text-xs md:text-sm font-medium bg-green-100 text-green-800 border border-green-200">
            Approved
          </span>
        );
      case 'sent for approval':
      case 'pending':
        return (
          <span className="inline-flex items-center px-1.5 xs:px-2 sm:px-2.5 md:px-3 py-0.5 rounded-full text-[9px] xs:text-[10px] sm:text-xs md:text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
            Sent for Approval
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 xs:px-2 sm:px-2.5 md:px-3 py-0.5 rounded-full text-[9px] xs:text-[10px] sm:text-xs md:text-sm font-medium bg-gray-100 text-gray-800 border border-gray-200">
            {status || 'Pending'}
          </span>
        );
    }
  };

  return (
    <>
      <style>{`
        .company-highlights-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .company-highlights-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }
        .company-highlights-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .company-highlights-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
      <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-200 mb-4 sm:mb-6 md:mb-8 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 sm:p-4 md:p-5 cursor-pointer hover:bg-gray-50 transition-colors gap-2" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-2 sm:gap-3">
          <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h3 className="text-xs sm:text-sm md:text-base font-semibold text-gray-800">Company Highlights</h3>
        </div>
        <svg 
          className={`w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isExpanded && (
        <>
          {/* Time Period Filters */}
          <div className="px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 pb-2.5 sm:pb-3 border-b border-gray-200">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:gap-3">
              <span className="text-[10px] xs:text-xs sm:text-sm md:text-base font-medium text-gray-700 whitespace-nowrap">Time Period:</span>
              {(['1 Day', '1 Week', '1 Month', 'Custom'] as TimePeriod[]).map((period) => (
                <button
                  key={period}
                  onClick={() => {
                    setTimePeriod(period);
                    if (period === 'Custom') {
                      setShowCustomPicker(true);
                    } else {
                      setShowCustomPicker(false);
                    }
                  }}
                  className={`px-2 py-1 xs:px-2.5 xs:py-1.5 sm:px-3 sm:py-1.5 md:px-4 md:py-2 text-[10px] xs:text-xs sm:text-sm md:text-base font-medium rounded-md sm:rounded-lg transition-colors ${
                    timePeriod === period
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
            
            {/* Custom Date Picker */}
            {showCustomPicker && timePeriod === 'Custom' && (
              <div className="mt-2.5 sm:mt-3 flex flex-col sm:flex-row gap-2 sm:gap-3 items-start sm:items-center">
                <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                  <label className="text-[10px] xs:text-xs sm:text-sm md:text-base font-medium text-gray-700 whitespace-nowrap">From:</label>
                  <input
                    type="date"
                    value={customDateRange.from}
                    onChange={(e) => setCustomDateRange({ ...customDateRange, from: e.target.value })}
                    className="flex-1 sm:flex-none px-2 py-1 xs:px-2 xs:py-1.5 sm:px-2 sm:py-1.5 md:px-3 md:py-2 text-[10px] xs:text-xs sm:text-sm md:text-base border border-gray-300 rounded-md sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                  <label className="text-[10px] xs:text-xs sm:text-sm md:text-base font-medium text-gray-700 whitespace-nowrap">To:</label>
                  <input
                    type="date"
                    value={customDateRange.to}
                    onChange={(e) => setCustomDateRange({ ...customDateRange, to: e.target.value })}
                    max={new Date().toISOString().split('T')[0]}
                    className="flex-1 sm:flex-none px-2 py-1 xs:px-2 xs:py-1.5 sm:px-2 sm:py-1.5 md:px-3 md:py-2 text-[10px] xs:text-xs sm:text-sm md:text-base border border-gray-300 rounded-md sm:rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {customDateRange.from && customDateRange.to && (
                  <button
                    onClick={() => setShowCustomPicker(false)}
                    className="w-full sm:w-auto px-2.5 py-1.5 xs:px-3 xs:py-1.5 sm:px-3 sm:py-1.5 md:px-4 md:py-2 text-[10px] xs:text-xs sm:text-sm md:text-base bg-blue-600 text-white rounded-md sm:rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Apply
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 pb-2.5 sm:pb-3 border-b border-gray-200 overflow-x-auto">
            <div className="flex gap-1.5 sm:gap-2 md:gap-4 min-w-max sm:min-w-0">
              {canSeeTab('production') && (
                <button
                  onClick={() => setActiveTab('production')}
                  className={`px-2.5 py-1.5 xs:px-3 xs:py-2 sm:px-4 sm:py-2 md:px-5 md:py-2.5 text-[10px] xs:text-xs sm:text-sm md:text-base font-medium rounded-md sm:rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'production'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Production Updates
                </button>
              )}
              {canSeeTab('documentation') && (
                <button
                  onClick={() => setActiveTab('documentation')}
                  className={`px-2.5 py-1.5 xs:px-3 xs:py-2 sm:px-4 sm:py-2 md:px-5 md:py-2.5 text-[10px] xs:text-xs sm:text-sm md:text-base font-medium rounded-md sm:rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'documentation'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Documentation Updates
                </button>
              )}
              {canSeeTab('timeline') && (
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`px-2.5 py-1.5 xs:px-3 xs:py-2 sm:px-4 sm:py-2 md:px-5 md:py-2.5 text-[10px] xs:text-xs sm:text-sm md:text-base font-medium rounded-md sm:rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'timeline'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Manufacturing Timeline
                </button>
              )}
              {canSeeTab('milestone') && (
                <button
                  onClick={() => setActiveTab('milestone')}
                  className={`px-2.5 py-1.5 xs:px-3 xs:py-2 sm:px-4 sm:py-2 md:px-5 md:py-2.5 text-[10px] xs:text-xs sm:text-sm md:text-base font-medium rounded-md sm:rounded-lg transition-colors whitespace-nowrap ${
                    activeTab === 'milestone'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  Next Milestone & Date
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-2.5 sm:p-4 md:p-6">
            {loading ? (
              <div className="text-center py-6 sm:py-8 md:py-10">
                <div className="flex flex-col items-center justify-center">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10 border-b-2 border-blue-600 mb-3 sm:mb-4"></div>
                  <p className="text-xs sm:text-sm md:text-base text-gray-600 font-medium">
                    Collecting all updates from across projects & from all key team members...
                  </p>
                  <p className="text-[10px] xs:text-xs sm:text-sm text-gray-400 mt-1">
                    This may take a few moments
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Production Updates */}
                {activeTab === 'production' && (
                  <div>
                    {/* Production Subtabs - Underlined Style */}
                    <div className="flex gap-2 sm:gap-3 md:gap-4 mb-3 sm:mb-4 border-b border-gray-200">
                      <button
                        onClick={() => setProductionSubTab('key-progress')}
                        className={`px-2 py-1 xs:px-2.5 xs:py-1.5 sm:px-3 sm:py-1.5 md:px-4 md:py-2 text-[10px] xs:text-xs sm:text-sm md:text-base font-medium transition-colors relative pb-2.5 sm:pb-3 ${
                          productionSubTab === 'key-progress'
                            ? 'text-blue-600'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Key Progress
                        {productionSubTab === 'key-progress' && (
                          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></span>
                        )}
                      </button>
                      <button
                        onClick={() => setProductionSubTab('all-updates')}
                        className={`px-2 py-1 xs:px-2.5 xs:py-1.5 sm:px-3 sm:py-1.5 md:px-4 md:py-2 text-[10px] xs:text-xs sm:text-sm md:text-base font-medium transition-colors relative pb-2.5 sm:pb-3 ${
                          productionSubTab === 'all-updates'
                            ? 'text-blue-600'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        All Updates
                        {productionSubTab === 'all-updates' && (
                          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></span>
                        )}
                      </button>
                    </div>

                    {/* Search Input for Production Updates */}
                    <div className="mb-3 sm:mb-4">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                          type="text"
                          placeholder={productionSubTab === 'key-progress' 
                            ? "Search by equipment number, type, project name, or description..." 
                            : "Search by equipment number, type, project name, update type, or entry text..."}
                          value={productionSearchQuery}
                          onChange={(e) => setProductionSearchQuery(e.target.value)}
                          className="pl-8 pr-3 py-2 text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {loading ? (
                      <div className="text-center py-6 sm:py-8 md:py-10">
                        <div className="flex flex-col items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-b-2 border-blue-600 mb-3 sm:mb-4"></div>
                          <p className="text-xs sm:text-sm md:text-base text-gray-600 font-medium">
                            Collecting all updates from across projects & from all key team members...
                          </p>
                          <p className="text-[10px] xs:text-xs sm:text-sm text-gray-400 mt-1">
                            This may take a few moments
                          </p>
                        </div>
                      </div>
                    ) : filteredProductionUpdates.length === 0 ? (
                      <div className="text-center py-6 sm:py-8 md:py-10 text-gray-500">
                        <p className="text-xs sm:text-sm md:text-base">
                          {productionSearchQuery.trim() 
                            ? `No results found for "${productionSearchQuery}". Try a different search term.`
                            : `No ${productionSubTab === 'key-progress' ? 'equipment progress entries' : 'equipment card updates'} found for the selected time period.`}
                        </p>
                      </div>
                    ) : (
                      <div className="h-[280px] xs:h-[320px] sm:h-[360px] md:h-[400px] overflow-y-auto space-y-2 sm:space-y-3 md:space-y-4 pr-1 sm:pr-2 company-highlights-scrollbar">
                        {filteredProductionUpdates.map((entry: any) => (
                        <div
                          key={entry.id}
                          onClick={() => {
                            if (entry.equipment?.project_id && onSelectProject) {
                              onSelectProject(entry.equipment.project_id, 'equipment');
                            }
                          }}
                          className={`flex gap-2 sm:gap-3 md:gap-4 p-2.5 sm:p-3 md:p-4 bg-gray-50 rounded-md sm:rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all ${
                            entry.equipment?.project_id ? 'cursor-pointer' : ''
                          }`}
                        >
                          {/* Thumbnail */}
                          {(entry.image_url || entry.image) && (
                            <div 
                              className="flex-shrink-0 cursor-pointer group relative"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowProgressImageModal({
                                  url: entry.image_url || entry.image,
                                  description: entry.image_description || entry.imageDescription,
                                  uploadedBy: entry.created_by_user?.full_name || entry.uploaded_by || entry.created_by || 'Unknown User',
                                  uploadDate: entry.created_at || entry.uploadDate || entry.upload_date
                                });
                              }}
                            >
                              <img
                                src={entry.image_url || entry.image}
                                alt="Progress"
                                className="w-12 h-12 xs:w-14 xs:h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 object-cover rounded-md sm:rounded-lg border border-gray-200 hover:opacity-80 transition-opacity"
                              />
                              {/* Eye Icon Overlay - Visual indicator */}
                              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-md sm:rounded-lg transition-all opacity-0 group-hover:opacity-100 pointer-events-none">
                                <Eye className="w-3 h-3 xs:w-3.5 xs:h-3.5 sm:w-4 sm:h-4 text-white" />
                              </div>
                            </div>
                          )}
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="mb-0.5 sm:mb-1">
                              <h3 className="text-xs xs:text-sm sm:text-base md:text-lg font-semibold text-gray-900 truncate">
                                {entry.equipment?.tag_number || 'N/A'}
                              </h3>
                              <p className="text-[10px] xs:text-xs sm:text-sm md:text-base text-gray-600 truncate">
                                {entry.equipment?.type || entry.equipment?.name || 'Equipment'}
                              </p>
                            </div>
                            {/* Image Badge - Show if image exists */}
                            {(entry.image_url || entry.image) && (
                              <span className="inline-flex items-center px-1.5 xs:px-2 sm:px-2.5 py-0.5 text-[9px] xs:text-[10px] sm:text-xs font-semibold rounded-full border bg-blue-50 text-blue-700 border-blue-200 mb-1.5 sm:mb-2">
                                image
                              </span>
                            )}
                            <p className="text-[10px] xs:text-xs sm:text-sm md:text-base text-gray-600 mb-1.5 sm:mb-2 line-clamp-2">
                              {entry.description || entry.image_description || entry.imageDescription || entry.entry_text || entry.comment || 'Progress update'}
                            </p>
                            <div className="flex items-center flex-wrap gap-1 sm:gap-2 text-[10px] xs:text-xs sm:text-sm text-gray-500">
                              <span className="truncate">{entry.equipment?.projects?.name || 'Unknown Project'}</span>
                              <span>•</span>
                              <span className="whitespace-nowrap">{formatTimeAgo(entry.created_at || entry.uploadDate || new Date().toISOString())}</span>
                              {(entry.created_by_user?.full_name || entry.uploaded_by) && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center gap-0.5 sm:gap-1">
                                    <User className="w-2.5 h-2.5 xs:w-3 xs:h-3 sm:w-3.5 sm:h-3.5" />
                                    <span className="truncate">{entry.created_by_user?.full_name || entry.uploaded_by}</span>
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Audio and Status */}
                          <div className="flex flex-col items-end gap-1.5 sm:gap-2 flex-shrink-0">
                            {/* Audio Player */}
                            {(entry.audio_data || entry.audio) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playAudio(entry.audio_data || entry.audio, entry.id);
                                }}
                                className="flex items-center gap-1 xs:gap-1.5 px-1.5 xs:px-2 py-0.5 xs:py-1 sm:px-2.5 sm:py-1 bg-green-50 hover:bg-green-100 rounded-md sm:rounded-lg border border-green-200 transition-colors"
                                title={playingAudioId === entry.id ? "Pause audio" : "Play audio"}
                              >
                                {playingAudioId === entry.id ? (
                                  <Pause className="w-2.5 h-2.5 xs:w-3 xs:h-3 sm:w-3.5 sm:h-3.5 text-green-700" />
                                ) : (
                                  <Play className="w-2.5 h-2.5 xs:w-3 xs:h-3 sm:w-3.5 sm:h-3.5 text-green-700 ml-0.5" />
                                )}
                                <span className="text-[9px] xs:text-[10px] sm:text-xs font-medium text-green-700">
                                  {formatDuration(entry.audio_duration || entry.audioDuration)}
                                </span>
                              </button>
                            )}
                            {/* Status Badge */}
                            <span className="inline-flex items-center px-1.5 xs:px-2 sm:px-2.5 md:px-3 py-0.5 rounded-full text-[9px] xs:text-[10px] sm:text-xs md:text-sm font-medium bg-green-100 text-green-800 border border-green-200">
                              Completed
                            </span>
                          </div>
                        </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Documentation Updates */}
                {activeTab === 'documentation' && (
                  <div>
                    {/* Search Input for Documentation Updates */}
                    <div className="mb-3 sm:mb-4">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                          type="text"
                          placeholder="Search by document name, project name, status, or equipment tags..."
                          value={documentationSearchQuery}
                          onChange={(e) => setDocumentationSearchQuery(e.target.value)}
                          className="pl-8 pr-3 py-2 text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {filteredDocumentationUpdates.length === 0 ? (
                      <div className="text-center py-6 sm:py-8 md:py-10 text-gray-500">
                        <p className="text-xs sm:text-sm md:text-base">
                          {documentationSearchQuery.trim() 
                            ? `No results found for "${documentationSearchQuery}". Try a different search term.`
                            : 'No documentation updates found for the selected time period.'}
                        </p>
                      </div>
                    ) : (
                      <div className="h-[280px] xs:h-[320px] sm:h-[360px] md:h-[400px] overflow-y-auto space-y-2 sm:space-y-3 md:space-y-4 pr-1 sm:pr-2 company-highlights-scrollbar">
                        {filteredDocumentationUpdates.map((doc: any) => (
                        <div
                          key={doc.id}
                          onClick={() => {
                            if (doc.vdcr_records?.project_id && onSelectProject) {
                              onSelectProject(doc.vdcr_records.project_id, 'vdcr');
                            }
                          }}
                          className={`flex items-start gap-2 sm:gap-3 md:gap-4 p-2.5 sm:p-3 md:p-4 bg-gray-50 rounded-md sm:rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all ${
                            doc.vdcr_records?.project_id ? 'cursor-pointer' : ''
                          }`}
                        >
                          {/* Document Icon */}
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 xs:w-10 xs:h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-blue-100 rounded-md sm:rounded-lg flex items-center justify-center">
                              <FileText className="w-4 h-4 xs:w-5 xs:h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-blue-600" />
                            </div>
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-xs xs:text-sm sm:text-base md:text-lg font-semibold text-gray-900 mb-0.5 sm:mb-1 truncate">
                              {doc.document_name || 'Document'}
                            </h3>
                            <div className="text-[10px] xs:text-xs sm:text-sm md:text-base text-gray-600 mb-1 sm:mb-2">
                              <span className="font-medium">Equipment:</span> <span className="break-words">{doc.equipment_ids || 'N/A'}</span>
                            </div>
                            <div className="text-[10px] xs:text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">
                              <span className="font-medium">Project:</span> <span className="truncate">{doc.vdcr_records?.projects?.name || 'Unknown Project'}</span>
                            </div>
                            <div className="text-[10px] xs:text-xs sm:text-sm text-gray-500">
                              <span className="font-medium">Approved by:</span> <span className="truncate">{doc.approved_by || doc.vdcr_records?.status || 'Pending'}</span>
                            </div>
                            <div className="text-[10px] xs:text-xs sm:text-sm text-gray-400 mt-0.5 sm:mt-1">
                              {formatTimeAgo(doc.created_at || new Date().toISOString())}
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div className="flex-shrink-0">
                            {getStatusBadge(doc.vdcr_records?.status || doc.status || 'Pending')}
                          </div>
                        </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Manufacturing Timeline */}
                {activeTab === 'timeline' && (
                  <div>
                    {/* Timeline Subtabs - Underlined Style */}
                    <div className="flex gap-2 sm:gap-3 md:gap-4 mb-3 sm:mb-4 border-b border-gray-200">
                      <button
                        onClick={() => setTimelineSubTab('with-dates')}
                        className={`px-2 py-1 xs:px-2.5 xs:py-1.5 sm:px-3 sm:py-1.5 md:px-4 md:py-2 text-[10px] xs:text-xs sm:text-sm md:text-base font-medium transition-colors relative pb-2.5 sm:pb-3 ${
                          timelineSubTab === 'with-dates'
                            ? 'text-blue-600'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        With PO-CDD Dates
                        {timelineSubTab === 'with-dates' && (
                          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></span>
                        )}
                      </button>
                      <button
                        onClick={() => setTimelineSubTab('without-dates')}
                        className={`px-2 py-1 xs:px-2.5 xs:py-1.5 sm:px-3 sm:py-1.5 md:px-4 md:py-2 text-[10px] xs:text-xs sm:text-sm md:text-base font-medium transition-colors relative pb-2.5 sm:pb-3 ${
                          timelineSubTab === 'without-dates'
                            ? 'text-blue-600'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Without PO-CDD Dates
                        {timelineSubTab === 'without-dates' && (
                          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></span>
                        )}
                      </button>
                    </div>

                    {/* Search Input for Manufacturing Timeline */}
                    <div className="mb-3 sm:mb-4">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                          type="text"
                          placeholder="Search by equipment number, type, or project name..."
                          value={timelineSearchQuery}
                          onChange={(e) => setTimelineSearchQuery(e.target.value)}
                          className="pl-8 pr-3 py-2 text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {timelineSubTab === 'with-dates' ? (
                      filteredTimelineUpdates.length === 0 ? (
                        <div className="text-center py-6 sm:py-8 md:py-10 text-gray-500">
                          <p className="text-xs sm:text-sm md:text-base">
                            {timelineSearchQuery.trim() 
                              ? `No results found for "${timelineSearchQuery}". Try a different search term.`
                              : 'No equipment with PO-CDD dates found for active projects.'}
                          </p>
                        </div>
                      ) : (
                        <div className="h-[280px] xs:h-[320px] sm:h-[360px] md:h-[400px] overflow-y-auto space-y-2 sm:space-y-3 md:space-y-4 pr-1 sm:pr-2 company-highlights-scrollbar">
                          {filteredTimelineUpdates.map((eq: any) => {
                        const daysToGo = eq.daysToGo;
                        const progress = eq.progress || 0;
                        const isOverdue = daysToGo < 0;
                        const daysDisplay = isOverdue ? Math.abs(daysToGo) : daysToGo;
                        const status = isOverdue 
                          ? 'Overdue' 
                          : daysToGo <= 5 
                            ? 'Near Completion' 
                            : daysToGo <= 15 
                              ? 'On Track' 
                              : 'In Progress';
                        
                        return (
                          <div
                            key={eq.id}
                            onClick={() => {
                              if (eq.project_id && onSelectProject) {
                                onSelectProject(eq.project_id, 'equipment');
                              }
                            }}
                            className={`p-2.5 sm:p-3 md:p-4 bg-gray-50 rounded-md sm:rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all ${
                              eq.project_id ? 'cursor-pointer' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2 sm:mb-3">
                              <div className="flex-1 min-w-0 pr-2">
                                <h3 className="text-xs xs:text-sm sm:text-base md:text-lg font-semibold text-gray-900 mb-0.5 sm:mb-1 truncate">
                                  {eq.type || eq.name} {eq.tag_number || ''}
                                </h3>
                                <p className="text-[10px] xs:text-xs sm:text-sm md:text-base text-gray-600 truncate">
                                  {eq.projects?.name || 'Unknown Project'}
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className={`text-base xs:text-lg sm:text-xl md:text-2xl font-bold mb-0.5 ${
                                  isOverdue ? 'text-red-600' : 'text-blue-600'
                                }`}>
                                  {daysDisplay}
                                </div>
                                <div className="text-[9px] xs:text-[10px] sm:text-xs md:text-sm text-gray-500 whitespace-nowrap">
                                  {isOverdue ? 'days overdue' : 'days to go'}
                                </div>
                              </div>
                            </div>
                            
                            {/* Progress Bar */}
                            <div className="mb-1.5 sm:mb-2">
                              <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                                <span className="text-[10px] xs:text-xs sm:text-sm text-gray-600">Progress</span>
                                <span className="text-[10px] xs:text-xs sm:text-sm md:text-base font-medium text-gray-700">{progress}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                                <div
                                  className="bg-blue-600 h-1.5 sm:h-2 rounded-full transition-all"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                            
                            {/* Status */}
                            <div className="mt-1.5 sm:mt-2">
                              <span className={`inline-flex items-center px-1.5 xs:px-2 sm:px-2.5 md:px-3 py-0.5 rounded-full text-[9px] xs:text-[10px] sm:text-xs md:text-sm font-medium ${
                                status === 'Overdue'
                                  ? 'bg-red-100 text-red-800 border border-red-200'
                                  : status === 'Near Completion'
                                  ? 'bg-green-100 text-green-800 border border-green-200'
                                  : status === 'On Track'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-gray-100 text-gray-800 border border-gray-200'
                              }`}>
                                {status}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                        </div>
                      )
                    ) : (
                      filteredTimelineUpdatesWithoutDates.length === 0 ? (
                        <div className="text-center py-6 sm:py-8 md:py-10 text-gray-500">
                          <p className="text-xs sm:text-sm md:text-base">
                            {timelineSearchQuery.trim() 
                              ? `No results found for "${timelineSearchQuery}". Try a different search term.`
                              : 'No equipment without PO-CDD dates found for active projects.'}
                          </p>
                        </div>
                      ) : (
                        <div className="h-[280px] xs:h-[320px] sm:h-[360px] md:h-[400px] overflow-y-auto space-y-2 sm:space-y-3 md:space-y-4 pr-1 sm:pr-2 company-highlights-scrollbar">
                          {filteredTimelineUpdatesWithoutDates.map((eq: any) => {
                            const progress = eq.progress || 0;
                            
                            return (
                              <div
                                key={eq.id}
                                onClick={() => {
                                  if (eq.project_id && onSelectProject) {
                                    onSelectProject(eq.project_id, 'equipment');
                                  }
                                }}
                                className={`p-2.5 sm:p-3 md:p-4 bg-gray-50 rounded-md sm:rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all ${
                                  eq.project_id ? 'cursor-pointer' : ''
                                }`}
                              >
                                <div className="flex items-start justify-between mb-2 sm:mb-3">
                                  <div className="flex-1 min-w-0 pr-2">
                                    <h3 className="text-xs xs:text-sm sm:text-base md:text-lg font-semibold text-gray-900 mb-0.5 sm:mb-1 truncate">
                                      {eq.type || eq.name} {eq.tag_number || ''}
                                    </h3>
                                    <p className="text-[10px] xs:text-xs sm:text-sm md:text-base text-gray-600 truncate">
                                      {eq.projects?.name || 'Unknown Project'}
                                    </p>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <div className="text-[9px] xs:text-[10px] sm:text-xs md:text-sm text-gray-500 whitespace-nowrap bg-yellow-50 text-yellow-700 px-2 py-1 rounded border border-yellow-200">
                                      No date set
                                    </div>
                                  </div>
                                </div>
                                
                                {/* Progress Bar */}
                                <div className="mb-1.5 sm:mb-2">
                                  <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                                    <span className="text-[10px] xs:text-xs sm:text-sm text-gray-600">Progress</span>
                                    <span className="text-[10px] xs:text-xs sm:text-sm md:text-base font-medium text-gray-700">{progress}%</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                                    <div
                                      className="bg-blue-600 h-1.5 sm:h-2 rounded-full transition-all"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                                
                                {/* Status */}
                                <div className="mt-1.5 sm:mt-2">
                                  <span className="inline-flex items-center px-1.5 xs:px-2 sm:px-2.5 md:px-3 py-0.5 rounded-full text-[9px] xs:text-[10px] sm:text-xs md:text-sm font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                    Pending Schedule
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* Next Milestone & Date */}
                {activeTab === 'milestone' && (
                  <div>
                    {/* Search Input for Next Milestone */}
                    <div className="mb-3 sm:mb-4">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <Input
                          type="text"
                          placeholder="Search by equipment number, type, project name, or next milestone..."
                          value={milestoneSearchQuery}
                          onChange={(e) => setMilestoneSearchQuery(e.target.value)}
                          className="pl-8 pr-3 py-2 text-xs sm:text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {filteredMilestoneUpdates.length === 0 ? (
                      <div className="text-center py-6 sm:py-8 md:py-10 text-gray-500">
                        <p className="text-xs sm:text-sm md:text-base">
                          {milestoneSearchQuery.trim() 
                            ? `No results found for "${milestoneSearchQuery}". Try a different search term.`
                            : 'No equipment with next milestones found.'}
                        </p>
                      </div>
                    ) : (
                      <div className="h-[280px] xs:h-[320px] sm:h-[360px] md:h-[400px] overflow-y-auto space-y-2 sm:space-y-3 md:space-y-4 pr-1 sm:pr-2 company-highlights-scrollbar">
                        {filteredMilestoneUpdates.map((eq: any) => {
                        return (
                          <div
                            key={eq.id}
                            onClick={() => {
                              if (eq.project_id && onSelectProject) {
                                onSelectProject(eq.project_id, 'equipment');
                              }
                            }}
                            className={`p-2.5 sm:p-3 md:p-4 bg-gray-50 rounded-md sm:rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all ${
                              eq.project_id ? 'cursor-pointer' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2 sm:mb-3">
                              <div className="flex-1 min-w-0 pr-2">
                                <h3 className="text-xs xs:text-sm sm:text-base md:text-lg font-semibold text-gray-900 mb-0.5 sm:mb-1 truncate">
                                  {eq.type || eq.name} {eq.tag_number || ''}
                                </h3>
                                <p className="text-[10px] xs:text-xs sm:text-sm md:text-base text-gray-600 truncate mb-1 sm:mb-1.5">
                                  {eq.projects?.name || 'Unknown Project'}
                                </p>
                                <div className="mt-1.5 sm:mt-2">
                                  <p className="text-[10px] xs:text-xs sm:text-sm text-gray-500 mb-0.5">Next Milestone</p>
                                  <p className="text-xs xs:text-sm sm:text-base md:text-lg font-medium text-gray-800">
                                    {eq.next_milestone || 'Not set'}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                {(() => {
                                  // Use next_milestone_date if available, otherwise use po_cdd
                                  const milestoneDate = eq.next_milestone_date || (eq.po_cdd && eq.po_cdd !== 'To be scheduled' ? eq.po_cdd : null);
                                  return milestoneDate ? (
                                    <div className="mb-1 sm:mb-2">
                                      <div className="text-[9px] xs:text-[10px] sm:text-xs text-gray-500 mb-0.5">Date</div>
                                      <div className="text-xs xs:text-sm sm:text-base font-semibold text-blue-600">
                                        {(() => {
                                          try {
                                            const date = new Date(milestoneDate);
                                            // Format as "8 Oct" (day month) to match screenshot
                                            return date.toLocaleDateString('en-US', { 
                                              month: 'short', 
                                              day: 'numeric'
                                            });
                                          } catch {
                                            return milestoneDate;
                                          }
                                        })()}
                                      </div>
                                    </div>
                                  ) : null;
                                })()}
                                <div className="flex items-center gap-1 text-[9px] xs:text-[10px] sm:text-xs text-gray-500">
                                  <Clock className="w-3 h-3 xs:w-3.5 xs:h-3.5" />
                                  <span>Milestone</span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Progress Bar */}
                            {eq.progress !== undefined && (
                              <div className="mt-2 sm:mt-3">
                                <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                                  <span className="text-[10px] xs:text-xs sm:text-sm text-gray-600">Progress</span>
                                  <span className="text-[10px] xs:text-xs sm:text-sm md:text-base font-medium text-gray-700">{eq.progress || 0}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                                  <div
                                    className="bg-blue-600 h-1.5 sm:h-2 rounded-full transition-all"
                                    style={{ width: `${eq.progress || 0}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
      </div>

      {/* Progress Image Modal */}
      {showProgressImageModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-2 xs:p-3 sm:p-4"
          onClick={() => setShowProgressImageModal(null)}
        >
          <div 
            className="relative w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] bg-white rounded-lg sm:rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowProgressImageModal(null)}
              className="absolute top-2 right-2 xs:top-3 xs:right-3 sm:top-4 sm:right-4 z-10 bg-black bg-opacity-50 text-white rounded-full w-7 h-7 xs:w-8 xs:h-8 sm:w-9 sm:h-9 flex items-center justify-center hover:bg-opacity-75 transition-all"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Image */}
            <div className="flex items-center justify-center p-2 xs:p-3 sm:p-4 md:p-6">
              <img
                src={showProgressImageModal.url}
                alt="Progress Image"
                className="max-w-full max-h-[75vh] xs:max-h-[80vh] sm:max-h-[80vh] object-contain rounded"
              />
            </div>

            {/* Description and Details */}
            {(showProgressImageModal.description || showProgressImageModal.uploadedBy || showProgressImageModal.uploadDate) && (
              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white p-2 xs:p-3 sm:p-4">
                {showProgressImageModal.description && (
                  <div className="text-xs xs:text-sm sm:text-base mb-1.5 xs:mb-2 break-words">{showProgressImageModal.description}</div>
                )}
                <div className="flex flex-col xs:flex-row xs:items-center gap-1 xs:gap-2 sm:gap-3 text-[10px] xs:text-xs text-gray-300">
                  {showProgressImageModal.uploadedBy && (
                    <div className="flex items-center gap-1 xs:gap-1.5">
                      <User className="w-3 h-3 xs:w-3.5 xs:h-3.5 flex-shrink-0" />
                      <span className="text-white font-medium truncate">Uploaded by: {showProgressImageModal.uploadedBy}</span>
                    </div>
                  )}
                  {showProgressImageModal.uploadDate && (
                    <div className="flex items-center gap-1 xs:gap-1.5">
                      <Clock className="w-3 h-3 xs:w-3.5 xs:h-3.5 flex-shrink-0" />
                      <span className="break-words">
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
    </>
  );
};

export default CompanyHighlights;

