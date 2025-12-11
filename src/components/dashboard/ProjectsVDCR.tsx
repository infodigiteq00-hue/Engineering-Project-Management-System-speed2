import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, FileText, Download, Edit, Plus, Eye, Check, X, ChevronDown, ChevronRight, Users, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fastAPI } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Declare XLSX for TypeScript
declare global {
  interface Window {
    XLSX: any;
  }
}

// Extend Window interface for XLSX
interface Window {
  XLSX: any;
}

interface DocumentFile {
  id: string;
  fileName: string;
  originalName: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'image' | 'other';
  fileSize: number;
  uploadDate: string;
  uploadedBy: string;
  filePath: string;
  thumbnail?: string;
}

interface VDCRRecord {
  id: string;
  srNo: string;
  equipmentTagNo: string[];
  mfgSerialNo: string[];
  jobNo: string[];
  clientDocNo: string;
  internalDocNo: string;
  documentName: string;
  revision: string;
  codeStatus: string;
  status: 'approved' | 'sent-for-approval' | 'received-for-comment' | 'pending' | 'rejected';
  lastUpdate: string;
  remarks?: string;
  updatedBy?: string;
  documentFile?: DocumentFile;
  documentUrl?: string;
}

interface Equipment {
  tagNo: string;
  mfgSerialNo: string;
  jobNo: string;
  type: string;
  location: string;
  status: string;
}

interface ProjectsVDCRProps {
  projectId: string;
  projectName: string;
  onBack?: () => void;
  onViewDetails?: () => void;
  onViewEquipment?: () => void;
}

const ProjectsVDCR = ({ projectId, projectName, onBack, onViewDetails, onViewEquipment }: ProjectsVDCRProps) => {
  const { user, userName } = useAuth();
  const { toast } = useToast();
  const [selectedVDCR, setSelectedVDCR] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingVDCR, setEditingVDCR] = useState<VDCRRecord | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [selectedEquipments, setSelectedEquipments] = useState<string[]>([]);
  const [expandedEquipmentTypes, setExpandedEquipmentTypes] = useState<string[]>([]);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form state for editing
  const [formData, setFormData] = useState({
    srNo: '',
    revision: '',
    documentName: '',
    clientDocNo: '',
    internalDocNo: '',
    codeStatus: '',
    status: '',
    remarks: ''
  });

  // Get current user info for tracking who made updates
  const currentUser = userName || user?.email || 'Unknown User';

  // Debug: Log selectedEquipments changes (only when not empty)
  useEffect(() => {
    if (selectedEquipments.length > 0) {
      // console.log('🔧 selectedEquipments changed:', selectedEquipments);
    }
  }, [selectedEquipments]);

  // Document management state
  const [uploadedFiles, setUploadedFiles] = useState<DocumentFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Document preview modal state
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    document: DocumentFile | null;
    documentName: string;
  }>({
    isOpen: false,
    document: null,
    documentName: ''
  });

  // PDF viewer state
  const [pdfViewerState, setPdfViewerState] = useState({
    currentPage: 1,
    totalPages: 1,
    zoomLevel: 100,
    searchText: '',
    isFullscreen: false,
    isAnnotating: false,
    searchResults: []
  });

  // Search modal state
  const [searchModal, setSearchModal] = useState({
    isOpen: false,
    searchText: '',
    isSearching: false
  });

  // Annotation tools state
  const [annotationTools, setAnnotationTools] = useState({
    isVisible: false,
    selectedTool: 'highlight',
    color: '#ffff00',
    size: 'medium',
    message: ''
  });

  // Text input modal state
  const [textInputModal, setTextInputModal] = useState({
    isOpen: false,
    text: '',
    position: { x: 0, y: 0 }
  });

  // PDF.js state
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  // Bulk upload modal state
  const [bulkUploadModal, setBulkUploadModal] = useState<{
    isOpen: boolean;
    template: string;
    uploadedFile: File | null;
    previewData: any[];
    isProcessing: boolean;
  }>({
    isOpen: false,
    template: 'equipment',
    uploadedFile: null,
    previewData: [],
    isProcessing: false
  });
  // VDCR data state - will be loaded from Supabase
  const [vdcrData, setVdcrData] = useState<VDCRRecord[]>([]);

  // Equipment data state - will be loaded from Supabase
  const [equipmentData, setEquipmentData] = useState<Equipment[]>([]);

  // Load data on component mount
  useEffect(() => {
    loadVDCRData();
    loadEquipmentData();
  }, [projectId]);

  // Set selected equipment when equipment data loads and we're editing
  useEffect(() => {
    if (editingVDCR && equipmentData.length > 0 && selectedEquipments.length === 0) {
      // console.log('🔧 Equipment data loaded, setting selected equipment for edit:', editingVDCR.equipmentTagNo);
      setSelectedEquipments(editingVDCR.equipmentTagNo);
    }
  }, [equipmentData, editingVDCR]);

  // Clean up AUTO-GENERATED values from database
  const cleanupAutoGeneratedValues = async (data: any[]) => {
    try {
      for (const record of data) {
        let needsUpdate = false;
        const updatedMfgSerial = (record.mfg_serial_numbers || []).filter((serial: string) => serial !== 'AUTO-GENERATED');
        const updatedJobNo = (record.job_numbers || []).filter((job: string) => job !== 'AUTO-GENERATED');

        if (updatedMfgSerial.length !== (record.mfg_serial_numbers || []).length ||
          updatedJobNo.length !== (record.job_numbers || []).length) {
          needsUpdate = true;
        }

        if (needsUpdate) {
          await fastAPI.updateVDCRRecord(record.id, {
            mfg_serial_numbers: updatedMfgSerial,
            job_numbers: updatedJobNo
          });
          // console.log(`✅ Cleaned up AUTO-GENERATED values for record ${record.id}`);
        }
      }
    } catch (error) {
      // console.error('Error cleaning up AUTO-GENERATED values:', error);
    }
  };

  // Load VDCR data from Supabase
  const loadVDCRData = async () => {
    try {
      setIsLoading(true);
      const data = await fastAPI.getVDCRRecordsByProject(projectId);

      // Clean up any existing AUTO-GENERATED values in the database
      await cleanupAutoGeneratedValues(data as any[]);

      // Transform Supabase data to match UI interface
      const transformedData: VDCRRecord[] = await Promise.all((data as any[]).map(async (record: any) => {
        let documentFile = undefined;

        // Use document_url directly from vdcr_records table
        if (record.document_url) {
          // Extract filename from URL
          const urlParts = record.document_url.split('/');
          const fileName = urlParts[urlParts.length - 1];

          // Determine file type from filename
          const fileType = fileName.toLowerCase().includes('.pdf') ? 'pdf' :
            fileName.toLowerCase().includes('.docx') ? 'docx' :
              fileName.toLowerCase().includes('.xlsx') ? 'xlsx' :
                fileName.toLowerCase().includes('.pptx') ? 'pptx' :
                  fileName.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/) ? 'image' : 'other';

          documentFile = {
            id: `doc-${record.id}`,
            fileName: fileName,
            originalName: record.document_name || fileName,
            fileType: fileType as any,
            fileSize: 1024 * 1024, // Default 1MB since we don't store file size in vdcr_records
            uploadDate: new Date(record.updated_at).toLocaleDateString('en-US', {
              month: 'short',
              day: '2-digit',
              year: 'numeric'
            }),
            uploadedBy: record.updated_by_user?.full_name || 'Unknown',
            filePath: record.document_url
          };
        }

        // Fallback: Create document file from VDCR record data if no document_url
        if (!documentFile && record.document_name) {
          const documentUrl = record.document_url || `/documents/vdcr/${record.id}`;

          documentFile = {
            id: `doc-${record.id}`,
            fileName: record.document_name,
            originalName: record.document_name,
            fileType: record.document_name.toLowerCase().includes('.pdf') ? 'pdf' :
              record.document_name.toLowerCase().includes('.docx') ? 'docx' :
                record.document_name.toLowerCase().includes('.xlsx') ? 'xlsx' :
                  record.document_name.toLowerCase().includes('.pptx') ? 'pptx' :
                    record.document_name.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/) ? 'image' : 'other',
            fileSize: record.file_size || 1024 * 1024, // Default 1MB if no size
            uploadDate: new Date(record.updated_at).toLocaleDateString('en-US', {
              month: 'short',
              day: '2-digit',
              year: 'numeric'
            }),
            uploadedBy: currentUser || 'Unknown', // Use current user name
            filePath: documentUrl
          };
        }

        return {
          id: record.id,
          srNo: record.sr_no,
          equipmentTagNo: record.equipment_tag_numbers || [],
          mfgSerialNo: (record.mfg_serial_numbers || []).filter(serial => serial !== 'AUTO-GENERATED'),
          jobNo: (record.job_numbers || []).filter(job => job !== 'AUTO-GENERATED'),
          clientDocNo: record.client_doc_no,
          internalDocNo: record.internal_doc_no,
          documentName: record.document_name,
          revision: record.revision,
          codeStatus: record.code_status,
          status: record.status,
          lastUpdate: new Date(record.updated_at).toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric'
          }),
          remarks: record.remarks,
          updatedBy: record.updated_by_user?.full_name || record.updated_by || 'Unknown User',
          documentUrl: documentFile?.filePath || (record.document_name ? `/documents/vdcr/${record.id}` : undefined),
          documentFile: documentFile
        };
      }));

      setVdcrData(transformedData);
    } catch (error) {
      // console.error('Error loading VDCR data:', error);
      setVdcrData([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load equipment data from Supabase
  const loadEquipmentData = async () => {
    try {
      const data = await fastAPI.getEquipmentByProject(projectId);

      // Transform Supabase data to match UI interface
      const transformedData: Equipment[] = (data as any[]).map((equipment: any) => ({
        tagNo: equipment.tag_number,
        mfgSerialNo: equipment.manufacturing_serial,
        jobNo: equipment.job_number,
        type: equipment.type,
        location: equipment.location,
        status: equipment.status
      }));

      setEquipmentData(transformedData);
    } catch (error) {
      // console.error('Error loading equipment data:', error);
      setEquipmentData([]);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-50 text-green-700 border border-green-200';
      case 'sent-for-approval':
        return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
      case 'received-for-comment':
        return 'bg-orange-50 text-orange-700 border border-orange-200';
      case 'pending':
        return 'bg-gray-50 text-gray-700 border border-gray-200';
      case 'rejected':
        return 'bg-red-50 text-red-700 border border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved':
        return 'Approved';
      case 'sent-for-approval':
        return 'Sent for Approval';
      case 'received-for-comment':
        return 'Received for Comment';
      case 'pending':
        return 'Pending';
      case 'rejected':
        return 'Rejected';
      default:
        return status;
    }
  };

  const getCodeStatusColor = (codeStatus: string) => {
    switch (codeStatus) {
      case 'Code 1':
        return 'bg-blue-50 text-blue-700 border border-blue-200';
      case 'Code 2':
        return 'bg-green-50 text-green-700 border border-green-200';
      case 'Code 3':
        return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
      case 'Code 4':
        return 'bg-purple-50 text-purple-700 border border-purple-200';
      default:
        return 'bg-gray-50 text-gray-700 border border-gray-200';
    }
  };

  const handleEditVDCR = (record: VDCRRecord) => {
    // console.log('🔧 Opening edit form for VDCR record, equipment tags:', record.equipmentTagNo);

    setEditingVDCR(record);
    setIsAddingNew(false);
    setSelectedEquipments(record.equipmentTagNo);
    setFormData({
      srNo: record.srNo,
      revision: record.revision,
      documentName: record.documentName,
      clientDocNo: record.clientDocNo,
      internalDocNo: record.internalDocNo,
      codeStatus: record.codeStatus,
      status: record.status,
      remarks: record.remarks || ''
    });

    // Set uploaded files if document exists
    if (record.documentFile) {
      setUploadedFiles([record.documentFile]);
    } else {
      setUploadedFiles([]);
    }

    setIsEditModalOpen(true);
  };

  const handleAddNewVDCR = () => {
    setEditingVDCR(null);
    setIsAddingNew(true);
    setSelectedEquipments([]);

    // Auto-generate next Sr. No.
    const existingSrNos = vdcrData.map(record => {
      const srNoStr = record.srNo.toString();
      const match = srNoStr.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    });
    const nextSrNo = Math.max(...existingSrNos, 0) + 1;
    const autoGeneratedSrNo = String(nextSrNo).padStart(3, '0');

    setFormData({
      srNo: autoGeneratedSrNo,
      revision: 'Rev-00',
      documentName: '',
      clientDocNo: '',
      internalDocNo: '',
      codeStatus: 'Code 3',
      status: 'pending',
      remarks: ''
    });
    setIsEditModalOpen(true);
  };

  const handleSaveChanges = async () => {
    // Validate required fields
    if (!formData.srNo || !formData.documentName || !formData.clientDocNo || !formData.internalDocNo || selectedEquipments.length === 0) {
      toast({ title: 'Notice', description: 'Please fill in all required fields and select at least one equipment.' });
      return;
    }

    try {
      setIsSaving(true);

      // Get selected equipment details
      const selectedEquipmentDetails = getSelectedEquipmentDetails();
      const newMfgSerialNos = selectedEquipmentDetails.map(eq => eq.mfgSerialNo);
      const newJobNos = selectedEquipmentDetails.map(eq => eq.jobNo);

      // Get document file ID if document is uploaded
      let documentFileId = null;
      if (uploadedFiles.length > 0) {
        const latestFile = uploadedFiles[uploadedFiles.length - 1];
        // Only use UUID format IDs, skip local fallback IDs
        if (latestFile.id && !latestFile.id.startsWith('doc-')) {
          documentFileId = latestFile.id;
        }
      }

      // Get document URL from uploaded files
      const documentUrl = uploadedFiles.length > 0 ? uploadedFiles[uploadedFiles.length - 1].filePath : null;

      // Get firm_id from user data
      const userData = JSON.parse(localStorage.getItem('userData') || '{}');
      const firmId = userData.firm_id;

      // Prepare data for Supabase
      const vdcrData = {
        project_id: projectId,
        sr_no: formData.srNo,
        equipment_tag_numbers: selectedEquipments,
        mfg_serial_numbers: newMfgSerialNos,
        job_numbers: newJobNos,
        client_doc_no: formData.clientDocNo,
        internal_doc_no: formData.internalDocNo,
        document_name: formData.documentName,
        revision: formData.revision,
        code_status: formData.codeStatus,
        status: formData.status,
        remarks: formData.remarks,
        updated_by: user?.id,
        document_url: documentUrl, // Store document URL directly in vdcr_records
        firm_id: firmId, // Required field for vdcr_records table
        last_update: new Date().toISOString() // Required field for vdcr_records table
      };

      if (isAddingNew) {
        // Create new VDCR record
        const newRecord = await fastAPI.createVDCRRecord(vdcrData);
        // console.log('✅ New VDCR record created:', newRecord);

        // Set the selectedVDCR to the newly created record ID
        if (newRecord && (newRecord as any).id) {
          const recordId = (newRecord as any).id;
          setSelectedVDCR(recordId);
          // console.log('🎯 Set selectedVDCR to:', recordId);

          // Document URL is already saved in vdcr_records.document_url field
          // console.log('✅ Document URL saved in vdcr_records.document_url field');
        }
      } else {
        // Update existing VDCR record - only send updatable fields
        if (!editingVDCR) return;

        const updateData = {
          sr_no: formData.srNo,
          equipment_tag_numbers: selectedEquipments,
          mfg_serial_numbers: newMfgSerialNos,
          job_numbers: newJobNos,
          client_doc_no: formData.clientDocNo,
          internal_doc_no: formData.internalDocNo,
          document_name: formData.documentName,
          revision: formData.revision,
          code_status: formData.codeStatus,
          status: formData.status,
          remarks: formData.remarks,
          updated_by: user?.id,
          document_url: documentUrl, // Store document URL directly in vdcr_records
          last_update: new Date().toISOString() // Update timestamp
        };

        await fastAPI.updateVDCRRecord(editingVDCR.id, updateData);
      }

      // Reload data from Supabase
      await loadVDCRData();

      // Close modal and reset
      setIsEditModalOpen(false);
      setEditingVDCR(null);
      setIsAddingNew(false);
      setSelectedEquipments([]);
      setUploadedFiles([]);
      setFormData({
        srNo: '',
        revision: '',
        documentName: '',
        clientDocNo: '',
        internalDocNo: '',
        codeStatus: '',
        status: '',
        remarks: ''
      });

    } catch (error) {
      // console.error('Error saving VDCR record:', error);
      toast({ title: 'Error', description: 'Error saving VDCR record. Please try again.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteVDCR = async (recordId: string) => {
    if (window.confirm('Are you sure you want to delete this VDCR record? This action cannot be undone.')) {
      try {
        await fastAPI.deleteVDCRRecord(recordId);
        // Reload data from Supabase
        await loadVDCRData();
      } catch (error) {
        // console.error('Error deleting VDCR record:', error);
        toast({ title: 'Error', description: 'Error deleting VDCR record. Please try again.', variant: 'destructive' });
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

    // Add this after: if (!files || files.length === 0) return;

    const uploadedFile = files[0];
    const maxFileSize = 50 * 1024 * 1024; // 2MB in bytes

    // Check file size
    if (uploadedFile.size > maxFileSize) {
      toast({ title: 'Error', description: `File size exceeds 50MB limit. Your file is ${(uploadedFile.size / 1024 / 1024).toFixed(2)}MB. Please choose a smaller file.`, variant: 'destructive' });
      return;
    }

    // Auto-populate document name field with the selected file name
    setFormData(prev => ({ ...prev, documentName: uploadedFile.name }));

    // File type detection
    const fileType = uploadedFile.name.toLowerCase().includes('.pdf') ? 'pdf' :
      uploadedFile.name.toLowerCase().includes('.docx') ? 'docx' :
        uploadedFile.name.toLowerCase().includes('.xlsx') ? 'xlsx' :
          uploadedFile.name.toLowerCase().includes('.pptx') ? 'pptx' :
            uploadedFile.name.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/) ? 'image' : 'other';

    // Generate unique file name
    const fileExtension = uploadedFile.name.split('.').pop();
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;

    // console.log('📤 Starting file upload:', uploadedFile.name);
    // console.log('📁 File type:', fileType);
    // console.log('📁 File size:', uploadedFile.size, 'bytes');

    try {
      // console.log('🔄 Starting Supabase storage upload...');

      // Skip bucket check for faster upload

      // No timeout needed - let upload take as long as needed

      // Upload to Supabase Storage - Direct approach without timeout race
      // console.log('🚀 Starting upload to VDCR-docs bucket...');
      // console.log('📁 Upload path: documents/' + uniqueFileName);
      // console.log('📊 File size:', (uploadedFile.size / 1024 / 1024).toFixed(2), 'MB');

      // Direct upload without timeout race - let it take as long as needed
      // console.log('⏳ Starting direct upload (no timeout)...');

      // Show progress to user (simplified)
      // console.log(`📤 Uploading ${uploadedFile.name}...`);

      let uploadData, uploadError;
      const bucketName = 'VDCR-docs';

      try {
        // console.log('🔍 About to call supabase.storage.upload...');
        // console.log('🔍 Bucket: VDCR-docs');
        // console.log('🔍 Path: documents/' + uniqueFileName);
        // console.log('🔍 File:', uploadedFile.name, uploadedFile.size, 'bytes');

        // Try VDCR-docs bucket first, fallback to project-documents if it fails
        // let bucketName = 'VDCR-docs';
        // let result;

        // try {
        //   console.log('🔍 Trying VDCR-docs bucket first...');

        //   // Add timeout wrapper to prevent hanging
        //   const uploadPromise = supabase.storage
        //     .from(bucketName)
        //     .upload(`documents/${uniqueFileName}`, uploadedFile);

        //   const timeoutPromise = new Promise((_, reject) => 
        //     setTimeout(() => reject(new Error('Upload timeout after 60 seconds')), 60000)
        //   );

        //   result = await Promise.race([uploadPromise, timeoutPromise]);

        //   if (result.error && result.error.message.includes('Bucket not found')) {
        //     throw new Error('VDCR-docs bucket not found');
        //   }

        // } 
        // catch (bucketError) {
        //   console.warn('⚠️ VDCR-docs bucket failed, trying project-documents bucket:', bucketError);

        //   bucketName = 'project-documents';
        //   console.log('🔍 Trying project-documents bucket as fallback...');

        //   const uploadPromise = supabase.storage
        //     .from(bucketName)
        //     .upload(`documents/${uniqueFileName}`, uploadedFile);

        //   const timeoutPromise = new Promise((_, reject) => 
        //     setTimeout(() => reject(new Error('Upload timeout after 60 seconds')), 60000)
        //   );

        //   result = await Promise.race([uploadPromise, timeoutPromise]);
        // }

        // Upload to VDCR-docs bucket only (no fallback to project-documents)
        let result;

        try {
          // console.log('🔍 Uploading to VDCR-docs bucket using direct API...');

          // Use direct API call with service role key (same as equipment upload)
          const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtbWFvc21rZ3drYW1mamhjeGlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjYyNzU4NywiZXhwIjoyMDcyMjAzNTg3fQ.PVg3nnfYEBnqpceBXJjnZJIc9lwjmW1G7Lo2U7t0ehk';
          
          const formData = new FormData();
          formData.append('file', uploadedFile);

          const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/VDCR-docs/documents/${uniqueFileName}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${serviceRoleKey}`,
              'apikey': serviceRoleKey
            },
            body: formData
          });

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            // console.error('❌ VDCR storage upload failed:', uploadResponse.status, errorText);
            throw new Error(`VDCR storage upload failed: ${uploadResponse.status} ${errorText}`);
          }

          // console.log('🔍 VDCR upload successful:', uploadResponse.status);
          
          // Create result object similar to Supabase SDK response
          result = {
            data: {
              path: `documents/${uniqueFileName}`,
              id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
              fullPath: `documents/${uniqueFileName}`
            },
            error: null
          };

        } catch (bucketError) {
          // console.error('❌ VDCR-docs bucket upload failed:', bucketError);
          toast({ title: 'Error', description: 'Failed to upload to VDCR storage. Please ensure the VDCR-docs bucket exists and try again.', variant: 'destructive' });
          return;
        }

        // console.log('🔍 Upload result:', result);
        uploadData = result.data;
        uploadError = result.error;

        // Upload completed

        // console.log('📤 Upload completed!');

        if (uploadError) {
          // console.error('❌ Storage upload error:', uploadError);
          // console.error('❌ Error details:', uploadError.message);

          // Check for specific error types
          if (uploadError.message.includes('File size exceeds')) {
            toast({ title: 'Error', description: 'File is too large. Please upload a file smaller than 2MB.', variant: 'destructive' });
          } else if (uploadError.message.includes('Invalid file type')) {
            toast({ title: 'Error', description: 'Invalid file type. Please upload PDF, Word, Excel, PowerPoint, or image files.', variant: 'destructive' });
          } else if (uploadError.message.includes('Bucket not found')) {
            toast({ title: 'Error', description: 'Storage bucket not found. Please contact support.', variant: 'destructive' });
          } else {
            toast({ title: 'Error', description: `Upload failed: ${uploadError.message}. Please try again.`, variant: 'destructive' });
          }
          return;
        }

        // Upload successful - skip verification to avoid hanging
        // console.log('✅ Upload completed successfully!');

        // Show success message
        // console.log(`✅ ${uploadedFile.name} uploaded successfully!`);

      } catch (error) {
        // Upload failed

        // console.error('❌ Upload error:', error);

        // Handle timeout specifically
        if (error.message.includes('timeout')) {
          toast({ title: 'Error', description: 'Upload timed out. Please check your internet connection and try again.', variant: 'destructive' });
        } else {
          toast({ title: 'Error', description: `Upload failed: ${error.message}. Please try again.`, variant: 'destructive' });
        }

        throw error;
      }

      // console.log('✅ File uploaded to storage:', uploadData);

      // Get public URL using direct API method
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/VDCR-docs/documents/${uniqueFileName}`;
      // console.log('✅ Public URL generated:', publicUrl);

      // Store document info for later use when saving VDCR record
      const newDocument: DocumentFile = {
        id: `doc-${Date.now()}`,
        fileName: uniqueFileName,
        originalName: uploadedFile.name,
        fileType: fileType as any,
        fileSize: uploadedFile.size,
        uploadDate: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric'
        }),
        uploadedBy: currentUser,
        filePath: publicUrl
      };

      setUploadedFiles(prev => [...prev, newDocument]);
      setFormData(prev => ({ ...prev, documentName: uploadedFile.name }));

      // console.log('✅ File uploaded to storage successfully');
      // console.log('📄 Document URL will be saved to vdcr_records.document_url when form is submitted');

    } catch (error) {
      // console.error('❌ File upload failed:', error);
      toast({ title: 'Error', description: `File upload failed: ${error.message}. Please try again.`, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const openDocumentPreview = async (documentUrl: string, documentName: string) => {
    // console.log('🔍 Opening document preview:', { documentUrl, documentName });

    // Find the document file from multiple sources
    let document = null;

    // First, try to find in uploaded files
    document = uploadedFiles.find(f => f.filePath === documentUrl);

    // If not found, try to find in VDCR data
    if (!document) {
      const vdcrRecord = vdcrData.find(r => r.documentUrl === documentUrl);
      if (vdcrRecord?.documentFile) {
        document = vdcrRecord.documentFile;
      }
    }

    // If still not found, try to find by document name in VDCR data
    if (!document) {
      const vdcrRecord = vdcrData.find(r => r.documentName === documentName);
      if (vdcrRecord?.documentFile) {
        document = vdcrRecord.documentFile;
      }
    }

    // If still not found, create a mock document for preview
    if (!document && documentUrl) {
      // console.log('📄 Creating mock document for preview');
      document = {
        id: `mock-${Date.now()}`,
        fileName: documentName,
        originalName: documentName,
        fileType: documentName.toLowerCase().includes('.pdf') ? 'pdf' :
          documentName.toLowerCase().includes('.docx') ? 'docx' :
            documentName.toLowerCase().includes('.xlsx') ? 'xlsx' :
              documentName.toLowerCase().includes('.pptx') ? 'pptx' :
                documentName.toLowerCase().match(/\.(jpg|jpeg|png|gif)$/) ? 'image' : 'other',
        fileSize: 1024 * 1024, // 1MB default
        uploadDate: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric'
        }),
        uploadedBy: currentUser,
        filePath: documentUrl
      };
    }

    // console.log('📄 Document found/created:', document);

    setPreviewModal({
      isOpen: true,
      document: document,
      documentName: documentName
    });

    // Reset PDF viewer state
    setPdfViewerState({
      currentPage: 1,
      totalPages: 1,
      zoomLevel: 100,
      searchText: '',
      isFullscreen: false,
      isAnnotating: false,
      searchResults: []
    });

    // Reset annotation tools
    setAnnotationTools({
      isVisible: false,
      selectedTool: 'highlight',
      color: '#ffff00',
      size: 'medium',
      message: ''
    });

    // Load PDF if it's a PDF file
    // console.log('🔍 Document name:', documentName);
    // console.log('🔍 Document name lowercase:', documentName.toLowerCase());
    // console.log('🔍 Ends with .pdf:', documentName.toLowerCase().endsWith('.pdf'));
    // console.log('🔍 Document fileType:', document?.fileType);
    // console.log('🔍 Document URL:', documentUrl);

    if (documentName.toLowerCase().endsWith('.pdf') || document?.fileType === 'pdf') {
      // console.log('📄 Loading PDF document...');
      // Convert relative URL to absolute URL if needed
      const pdfUrl = documentUrl.startsWith('http') ? documentUrl : `https://ammaosmkgwkamfjhcxik.supabase.co/storage/v1/object/public/VDCR-docs${documentUrl}`;
      // console.log('📄 PDF URL for loading:', pdfUrl);
      await loadPdfDocument(pdfUrl);
    } else {
      // console.log('📄 Not a PDF file, skipping PDF loading');
    }
  };

  // PDF Viewer Functions
  const handleZoomIn = () => {
    setPdfViewerState(prev => ({
      ...prev,
      zoomLevel: Math.min(prev.zoomLevel + 25, 300)
    }));
  };

  const handleZoomOut = () => {
    setPdfViewerState(prev => ({
      ...prev,
      zoomLevel: Math.max(prev.zoomLevel - 25, 50)
    }));
  };

  const handlePrevPage = () => {
    setPdfViewerState(prev => ({
      ...prev,
      currentPage: Math.max(prev.currentPage - 1, 1)
    }));
  };

  const handleNextPage = () => {
    setPdfViewerState(prev => ({
      ...prev,
      currentPage: Math.min(prev.currentPage + 1, prev.totalPages)
    }));
  };

  const handleSearch = () => {
    setSearchModal({
      isOpen: true,
      searchText: '',
      isSearching: false
    });

    // Force focus on input after modal opens
    setTimeout(() => {
      const input = document.querySelector('input[placeholder="Enter search term..."]') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  };

  const handleSearchSubmit = async () => {
    if (!searchModal.searchText.trim()) return;

    setSearchModal(prev => ({ ...prev, isSearching: true }));

    setPdfViewerState(prev => ({
      ...prev,
      searchText: searchModal.searchText
    }));

    // Real PDF search functionality
    if (pdfDocument) {
      await searchInPDF(searchModal.searchText);
    } else {
      // Fallback for non-PDF documents
      setPdfViewerState(prev => ({
        ...prev,
        searchResults: [{ page: 1, matches: 1, text: 'Search functionality available for PDF documents only.' }]
      }));
    }

    setSearchModal(prev => ({ ...prev, isSearching: false, isOpen: false }));
  };

  // Real PDF search function
  const searchInPDF = async (searchText: string) => {
    if (!pdfDocument) return;

    try {
      let totalMatches = 0;
      const searchResults = [];

      // Search through all pages
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const textItems = textContent.items;

        // Combine all text items for the page
        const pageText = textItems.map((item: any) => item.str).join(' ');

        // Search for the term (case insensitive)
        const regex = new RegExp(searchText, 'gi');
        const matches = pageText.match(regex);

        if (matches) {
          totalMatches += matches.length;
          searchResults.push({
            page: pageNum,
            matches: matches.length,
            text: pageText.substring(0, 100) + '...' // Preview of page content
          });
        }
      }


      if (totalMatches > 0) {
        // Jump to first result page
        setPdfViewerState(prev => ({
          ...prev,
          currentPage: searchResults[0].page,
          searchResults: searchResults
        }));

      } else {
        setPdfViewerState(prev => ({
          ...prev,
          searchResults: []
        }));
      }
    } catch (error) {
      setPdfViewerState(prev => ({
        ...prev,
        searchResults: []
      }));
    }
  };

  const handleAnnotate = () => {
    if (pdfDocument) {
      // Toggle annotation mode
      setPdfViewerState(prev => ({
        ...prev,
        isAnnotating: !prev.isAnnotating
      }));

      if (!pdfViewerState.isAnnotating) {
        // Show annotation tools UI
        setAnnotationTools({
          isVisible: true,
          selectedTool: 'highlight',
          color: '#ffff00',
          size: 'medium',
          message: ''
        });
      } else {
        // Hide annotation tools
        setAnnotationTools({
          isVisible: false,
          selectedTool: 'highlight',
          color: '#ffff00',
          size: 'medium',
          message: ''
        });
      }
    } else {
      // Show non-PDF message
      setAnnotationTools({
        isVisible: true,
        selectedTool: 'highlight',
        color: '#ffff00',
        size: 'medium',
        message: 'Annotation tools available for PDF documents only'
      });
    }
  };

  const handleFullscreen = () => {
    if (pdfDocument) {
      setPdfViewerState(prev => ({
        ...prev,
        isFullscreen: !prev.isFullscreen
      }));

      // Real fullscreen functionality
      if (!pdfViewerState.isFullscreen) {
        // Enter fullscreen
        const element = document.documentElement;
        if (element.requestFullscreen) {
          element.requestFullscreen().then(() => {
            // Successfully entered fullscreen
          }).catch(err => {
            toast({ title: 'Error', description: 'Unable to enter fullscreen mode. Please try again.', variant: 'destructive' });
          });
        } else {
          toast({ title: 'Notice', description: 'Fullscreen mode not supported in this browser.' });
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          document.exitFullscreen().then(() => {
            // Successfully exited fullscreen
          }).catch(err => {
            // Error exiting fullscreen
          });
        }
      }
    } else {
      toast({ title: 'Notice', description: `📱 Fullscreen mode available for PDF documents only.\n\nCurrent document: ${previewModal.documentName}\nFile type: ${previewModal.document?.fileType || 'Unknown'}` });
    }
  };

  const clearSearch = () => {
    setPdfViewerState(prev => ({
      ...prev,
      searchText: ''
    }));
  };

  // PDF.js Functions
  const loadPdfDocument = async (pdfUrl: string) => {
    try {
      setIsLoadingPdf(true);
      // console.log('📄 Loading PDF document:', pdfUrl);
      // console.log('📄 PDF.js available:', typeof window !== 'undefined' && (window as any).pdfjsLib);

      // Check if PDF.js is available
      if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
        const pdfjsLib = (window as any).pdfjsLib;
        // console.log('📄 PDF.js library found:', pdfjsLib);

        // Configure PDF.js worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        // console.log('📄 PDF.js worker configured');

        // Load the PDF document
        // console.log('📄 Starting PDF document loading...');
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;

        // console.log('✅ PDF loaded successfully:', pdf);
        setPdfDocument(pdf);
        setPdfViewerState(prev => ({
          ...prev,
          totalPages: pdf.numPages,
          currentPage: 1
        }));

        // console.log('📄 PDF pages:', pdf.numPages);
      } else {
        // console.warn('⚠️ PDF.js not available, falling back to iframe');
      }
    } catch (error) {
      // console.error('❌ Error loading PDF:', error);
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const renderPdfPage = async (pageNum: number) => {
    if (!pdfDocument) return;

    try {
      const page = await pdfDocument.getPage(pageNum);
      const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      const viewport = page.getViewport({ scale: pdfViewerState.zoomLevel / 100 });
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      await page.render(renderContext).promise;
      // console.log('✅ PDF page rendered:', pageNum);
    } catch (error) {
      // console.error('❌ Error rendering PDF page:', error);
    }
  };

  // Effect to render PDF page when document or page changes
  useEffect(() => {
    if (pdfDocument && pdfViewerState.currentPage > 0) {
      renderPdfPage(pdfViewerState.currentPage);
    }
  }, [pdfDocument, pdfViewerState.currentPage, pdfViewerState.zoomLevel]);

  // Download PDF function
  const downloadPDF = () => {
    if (previewModal.document?.filePath) {
      const link = document.createElement('a');
      link.href = previewModal.document.filePath;
      link.download = previewModal.documentName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Standard VDCR Template for bulk upload
  const vdcrTemplate = {
    name: 'VDCR Template',
    description: 'Standard template for Vendor Document Control Records',
    columns: ['Sr. No.', 'Equipment Tag No.', 'Document Name', 'Revision', 'Code Status', 'Status', 'Client Doc No.', 'Internal Doc No.', 'Remarks'],
    sampleData: [
      ['001', 'HE-UNIT-001', 'General Assembly Drawing', 'Rev-01', 'Code 2', 'pending', 'REL-HE-001-GA-001', 'INT-GA-HE-001-2024', 'Equipment assembly drawing'],
      ['002', 'HE-UNIT-002', 'Installation Manual', 'Rev-00', 'Code 3', 'sent-for-approval', 'REL-HE-002-IM-001', 'INT-IM-HE-002-2024', 'Installation instructions'],
      ['003', 'ST-UNIT-001', 'Storage Tank Specification', 'Rev-01', 'Code 1', 'approved', 'REL-ST-001-SPEC-001', 'INT-SPEC-ST-001-2024', 'Storage tank specifications']
    ]
  };

  const handleBulkUpload = () => {
    setBulkUploadModal(prev => ({ ...prev, isOpen: true }));
  };

  const downloadTemplate = async () => {
    try {
      // Download pre-formatted Excel template with working dropdowns
      const templateUrl = '/templates/VDCR_Template.xlsx';
      
      // Create a temporary link to download the template
      const link = document.createElement('a');
      link.href = templateUrl;
      link.download = 'VDCR_Bulk_Upload_Template.xlsx';
      link.style.display = 'none';
      
      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Show success message
      toast({ title: 'Success', description: 'VDCR Template downloaded successfully!\n\n📋 Instructions:\n• Use dropdowns in columns D, E, F\n• Fill in your data\n• Upload the completed file\n\n⚠️ Note: If dropdowns don\'t work, manually type the exact values:\n• Revision: Rev-00, Rev-01, Rev-02, Rev-03, Rev-04, Rev-05\n• Code Status: Code 1, Code 2, Code 3, Code 4\n• Status: pending, sent-for-approval, received-for-comment, approved, rejected' });
      
    } catch (error) {
      // console.error('Error downloading template:', error);
      toast({ title: 'Error', description: 'Error downloading template. Please try again or contact support.', variant: 'destructive' });
    }
  };


  const handleFileUploadForBulk = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkUploadModal(prev => ({ ...prev, uploadedFile: file }));

    // Check file type
    const isExcel = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');
    const isCSV = file.name.toLowerCase().endsWith('.csv');

    if (isExcel) {
      processExcelFile(file);
    } else if (isCSV) {
      processCSVFile(file);
    } else {
      toast({ title: 'Notice', description: 'Please upload a CSV or Excel file (.csv, .xlsx, .xls)' });
      return;
    }
  };

  const processCSVFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvContent = e.target?.result as string;
      const lines = csvContent.split('\n');
      const headers = lines[0].split(',');
      const data = lines.slice(1).filter(line => line.trim()).map(line => {
        const values = line.split(',');
        return headers.reduce((obj, header, index) => {
          obj[header.trim()] = values[index]?.trim() || '';
          return obj;
        }, {} as any);
      });

      setBulkUploadModal(prev => ({ ...prev, previewData: data }));
    };
    reader.readAsText(file);
  };


  const processExcelFile = async (file: File) => {
    try {
      // Check if XLSX is already loaded
      if (!window.XLSX) {
        // Load xlsx from CDN
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.onload = () => processExcelFileContent(file);
        script.onerror = () => {
          toast({ title: 'Error', description: 'Failed to load Excel library. Please try again.', variant: 'destructive' });
        };
        document.head.appendChild(script);
      } else {
        processExcelFileContent(file);
      }
    } catch (error) {
      // console.error('Error processing Excel file:', error);
      toast({ title: 'Error', description: 'Error processing Excel file. Please try again.', variant: 'destructive' });
    }
  };

  const processExcelFileContent = (file: File) => {
    try {
      const XLSX = window.XLSX;
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const fileData = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(fileData, { type: 'array' });

          // Get the first worksheet (VDCR Template sheet)
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];

          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (jsonData.length < 2) {
            toast({ title: 'Error', description: 'Excel file must have at least a header row and one data row.', variant: 'destructive' });
            return;
          }

          // Get headers from first row
          const headers = jsonData[0] as string[];

          // Process data rows (skip header row)
          const processedData = jsonData.slice(1).filter(row => {
            // Filter out completely empty rows
            return row.some(cell => cell && String(cell).trim() !== '');
          }).map(row => {
            return headers.reduce((obj, header, index) => {
              obj[header.trim()] = row[index] ? String(row[index]).trim() : '';
              return obj;
            }, {} as any);
          });

          setBulkUploadModal(prev => ({ ...prev, previewData: processedData }));

        } catch (error) {
          // console.error('Error parsing Excel file:', error);

          
          toast({ title: 'Error', description: 'Error parsing Excel file. Please check the file format.', variant: 'destructive' });
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (error) {
      // console.error('Error processing Excel file content:', error);
      toast({ title: 'Error', description: 'Error processing Excel file. Please try again.', variant: 'destructive' });
    }
  };

  const processBulkUpload = async () => {
    setBulkUploadModal(prev => ({ ...prev, isProcessing: true }));

    try {
      // Find the highest existing Sr. No. to continue from
      const existingSrNos = vdcrData.map(record => {
        const srNoStr = record.srNo.toString();
        // Extract just the numeric part, handle formats like "001", "Rev-01", etc.
        const match = srNoStr.match(/\d+/);
        return match ? parseInt(match[0]) : 0;
      });

      const highestSrNo = Math.max(...existingSrNos, 0);
      // console.log('Highest existing Sr. No.:', highestSrNo);

      // Process each row and create VDCR records
      for (let index = 0; index < bulkUploadModal.previewData.length; index++) {
        const row = bulkUploadModal.previewData[index];
        const equipmentTag = row['Equipment Tag No.']?.trim();

        // Auto-fill equipment-related fields from database if equipment tag exists
        let autoFilledData = {
          mfgSerialNo: [],
          jobNo: []
        };

        if (equipmentTag) {
          // Find equipment in our database
          const equipment = equipmentData.find(eq => eq.tagNo === equipmentTag);
          if (equipment) {
            autoFilledData = {
              mfgSerialNo: [equipment.mfgSerialNo],
              jobNo: [equipment.jobNo]
            };
          } else {
            // If equipment not found, use empty arrays instead of AUTO-GENERATED
            autoFilledData = {
              mfgSerialNo: [],
              jobNo: []
            };
          }
        }

        // If user provided Sr. No., use it; otherwise continue from highest existing
        let srNo: string;
        if (row['Sr. No.']?.trim()) {
          srNo = row['Sr. No.'].trim();
        } else {
          // Continue from the highest existing Sr. No.
          srNo = String(highestSrNo + index + 1).padStart(3, '0');
        }

        // console.log(`Row ${index}: Sr. No. = ${srNo} (continuing from ${highestSrNo})`);

        // Prepare data for Supabase
        const vdcrRecordData = {
          project_id: projectId,
          sr_no: srNo,
          equipment_tag_numbers: equipmentTag ? [equipmentTag] : ['GENERIC'],
          mfg_serial_numbers: autoFilledData.mfgSerialNo,
          job_numbers: autoFilledData.jobNo,
          client_doc_no: row['Client Doc No.'] || `CLIENT-${Date.now()}-${index}`,
          internal_doc_no: row['Internal Doc No.'] || `INT-${Date.now()}-${index}`,
          document_name: row['Document Name'] || `Document ${index + 1}`,
          revision: row['Revision'] || 'Rev-00',
          code_status: row['Code Status'] || 'Code 3',
          status: (row['Status'] as any) || 'pending',
          remarks: row['Remarks'] || '',
          updated_by: user?.id
        };

        // Create VDCR record in Supabase
        await fastAPI.createVDCRRecord(vdcrRecordData);
      }

      // Reload data from Supabase
      await loadVDCRData();

      setBulkUploadModal(prev => ({
        ...prev,
        isOpen: false,
        isProcessing: false,
        uploadedFile: null,
        previewData: []
      }));

    } catch (error) {
      // console.error('Error processing bulk upload:', error);
      toast({ title: 'Error', description: 'Error processing bulk upload. Please try again.', variant: 'destructive' });
      setBulkUploadModal(prev => ({
        ...prev,
        isProcessing: false
      }));
    }
  };

  const handleEquipmentSelection = (equipmentTag: string, checked: boolean) => {
    if (checked) {
      setSelectedEquipments(prev => [...prev, equipmentTag]);
    } else {
      setSelectedEquipments(prev => prev.filter(tag => tag !== equipmentTag));
    }
  };

  const getSelectedEquipmentDetails = () => {
    return equipmentData.filter(eq => selectedEquipments.includes(eq.tagNo));
  };

  const autoGenerateMfgSerialNos = () => {
    return getSelectedEquipmentDetails().map(eq => eq.mfgSerialNo);
  };

  const autoGenerateJobNos = () => {
    return getSelectedEquipmentDetails().map(eq => eq.jobNo);
  };

  const toggleEquipmentType = (type: string) => {
    setExpandedEquipmentTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const groupedEquipments = equipmentData.reduce((acc, equipment) => {
    if (!acc[equipment.type]) {
      acc[equipment.type] = [];
    }
    acc[equipment.type].push(equipment);
    return acc;
  }, {} as Record<string, Equipment[]>);

  // Excel Export Function
  const exportToExcel = async () => {
    try {
      // Check if XLSX is already loaded
      if (!window.XLSX) {
        // Load xlsx from CDN
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.onload = () => processExcelExport();
        script.onerror = () => {
          toast({ title: 'Error', description: 'Failed to load Excel export library. Please try again.', variant: 'destructive' });
        };
        document.head.appendChild(script);
      } else {
        processExcelExport();
      }
    } catch (error) {
      // console.error('Error exporting to Excel:', error);
      toast({ title: 'Error', description: 'Error exporting to Excel. Please try again.', variant: 'destructive' });
    }
  };

  const processExcelExport = () => {
    try {
      const XLSX = window.XLSX;

      // Prepare data for Excel export
      const excelData = vdcrData.map((record, index) => ({
        'Sr. No.': record.srNo,
        'Equipment Tag': record.equipmentTagNo.join(', '),
        'Mfg Serial No.': record.mfgSerialNo.join(', '),
        'Job No.': record.jobNo.join(', '),
        'Client Doc No.': record.clientDocNo,
        'Internal Doc No.': record.internalDocNo,
        'Document Name': record.documentName,
        'Revision': record.revision,
        'Code Status': record.codeStatus,
        'Status': getStatusText(record.status),
        'Remarks': record.remarks || '',
        'Updated On': record.lastUpdate,
        'Updated By': record.updatedBy || 'Unknown'
      }));

      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      const columnWidths = [
        { wch: 10 }, // Sr. No.
        { wch: 20 }, // Equipment Tag
        { wch: 20 }, // Mfg Serial No.
        { wch: 15 }, // Job No.
        { wch: 20 }, // Client Doc No.
        { wch: 20 }, // Internal Doc No.
        { wch: 30 }, // Document Name
        { wch: 10 }, // Revision
        { wch: 12 }, // Code Status
        { wch: 20 }, // Status
        { wch: 30 }, // Remarks
        { wch: 15 }, // Updated On
        { wch: 20 }  // Updated By
      ];
      worksheet['!cols'] = columnWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'VDCR Records');

      // Generate filename with current date
      const currentDate = new Date().toISOString().split('T')[0];
      const filename = `${projectName}_VDCR_Records_${currentDate}.xlsx`;

      // Save the file
      XLSX.writeFile(workbook, filename);

      // Show success message
      const successToast = document.createElement('div');
      successToast.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 9999;
        background: #10b981; color: white; padding: 12px 20px;
        border-radius: 8px; font-family: system-ui; font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      `;
      successToast.textContent = `✅ Excel file exported successfully: ${filename}`;
      document.body.appendChild(successToast);
      setTimeout(() => document.body.removeChild(successToast), 3000);

    } catch (error) {
      // console.error('Error processing Excel export:', error);
      toast({ title: 'Error', description: 'Error processing Excel export. Please try again.', variant: 'destructive' });
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-6">
        <div className="flex items-start sm:items-center">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground leading-snug">
            {projectName} - VDCR Management
          </h2>
        </div>
        <div className="flex items-stretch sm:items-center gap-2 sm:gap-2">
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white px-3 sm:px-4 py-2 shadow-md hover:shadow-lg transition-all duration-200"
            onClick={handleBulkUpload}
          >
            <FileText size={14} className="mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Bulk Upload VDCR</span>
            <span className="sm:hidden">Bulk Upload</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="bg-white hover:bg-gray-50 text-gray-700 border-gray-300 hover:border-gray-400 hover:text-gray-800 px-3 sm:px-4"
            onClick={handleAddNewVDCR}
          >
            <Edit size={14} className="mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Update VDCR</span>
            <span className="sm:hidden">Update</span>
          </Button>

          <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold text-gray-800">
                  {isAddingNew ? 'Add New VDCR Record' : 'Edit VDCR Record'}
                </DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* Equipment Selection Accordion */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Select Equipment</h3>
                  <div className="space-y-3">
                    {Object.entries(groupedEquipments).map(([type, equipments]) => (
                      <div key={type} className="border border-gray-200 rounded-lg">
                        <button
                          onClick={() => toggleEquipmentType(type)}
                          className="w-full p-4 text-left bg-gray-50 hover:bg-gray-100 transition-colors rounded-t-lg flex items-center justify-between"
                        >
                          <span className="font-medium text-gray-800">{type}</span>
                          {expandedEquipmentTypes.includes(type) ? (
                            <ChevronDown size={20} className="text-gray-600" />
                          ) : (
                            <ChevronRight size={20} className="text-gray-600" />
                          )}
                        </button>

                        {expandedEquipmentTypes.includes(type) && (
                          <div className="p-4 space-y-2 border-t border-gray-200">
                            {equipments.map((equipment) => {
                              const isSelected = selectedEquipments.includes(equipment.tagNo);
                              return (
                                <div key={equipment.tagNo} className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                                  <Checkbox
                                    id={equipment.tagNo}
                                    checked={isSelected}
                                    onCheckedChange={(checked) => handleEquipmentSelection(equipment.tagNo, checked as boolean)}
                                  />
                                  <Label htmlFor={equipment.tagNo} className="flex-1 cursor-pointer">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium text-gray-800">{equipment.tagNo}</span>
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">
                                      {equipment.location} • {equipment.mfgSerialNo}
                                    </div>
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Document Upload Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Document Management</h3>

                  <div className="space-y-4">
                    {/* Upload New Document Section */}
                    <div>
                      <Label htmlFor="documentUpload">Upload New Document</Label>
                      <div className="mt-2">
                        <Input
                          id="documentUpload"
                          type="file"
                          accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png,.gif"
                          onChange={handleFileUpload}
                          className="cursor-pointer"
                          disabled={isUploading}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {/* Supported formats: PDF, Word, Excel, PowerPoint, Images (max 50MB each) */}
                          "Supported formats: PDF, Word, Excel, PowerPoint, Images (max 2MB each)"
                        </p>
                        <p className="text-xs text-blue-600 mt-1">
                          💡 You can upload multiple documents - each will be listed below
                        </p>
                      </div>

                      {isUploading && (
                        <div className="flex items-center space-x-2 text-blue-600 mt-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          <span className="text-sm">Uploading document...</span>
                        </div>
                      )}
                    </div>

                    {/* Uploaded Documents List */}
                    {(uploadedFiles.length > 0 || (!isAddingNew && editingVDCR?.documentFile)) && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium text-gray-800">Uploaded Documents</Label>

                        {/* Show newly uploaded files */}
                        {uploadedFiles.map((file, index) => (
                          <div key={file.id || index} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                <FileText size={16} className="text-blue-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-800">{file.originalName}</p>
                                <p className="text-xs text-gray-500">
                                  {file.fileType.toUpperCase()} • {file.uploadDate} • {(file.fileSize / 1024 / 1024).toFixed(2)} MB
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openDocumentPreview(file.filePath, file.originalName)}
                                className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setUploadedFiles(prev => prev.filter(f => f.id !== file.id));
                                }}
                                className="text-xs border-red-300 text-red-700 hover:bg-red-50"
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}

                        {/* Show existing document from editing VDCR */}
                        {!isAddingNew && editingVDCR?.documentFile && !uploadedFiles.some(f => f.originalName === editingVDCR.documentFile?.originalName) && (
                          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                                <FileText size={16} className="text-green-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-800">{editingVDCR.documentFile.originalName}</p>
                                <p className="text-xs text-gray-500">
                                  {editingVDCR.documentFile.fileType.toUpperCase()} • {editingVDCR.documentFile.uploadDate}
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openDocumentPreview(editingVDCR.documentFile!.filePath, editingVDCR.documentFile!.originalName)}
                              className="text-xs border-green-300 text-green-700 hover:bg-green-50"
                            >
                              View
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </div>

                {/* VDCR Form */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">VDCR Details</h3>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="srNo">Serial Number</Label>
                        <Input
                          id="srNo"
                          value={formData.srNo}
                          onChange={(e) => setFormData(prev => ({ ...prev, srNo: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="revision">Revision</Label>
                        <Input
                          id="revision"
                          value={formData.revision}
                          onChange={(e) => setFormData(prev => ({ ...prev, revision: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="documentName">Document Name</Label>
                      <Input
                        id="documentName"
                        value={formData.documentName}
                        onChange={(e) => setFormData(prev => ({ ...prev, documentName: e.target.value }))}
                        className="mt-1"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="clientDocNo">Client Document No.</Label>
                        <Input
                          id="clientDocNo"
                          value={formData.clientDocNo}
                          onChange={(e) => setFormData(prev => ({ ...prev, clientDocNo: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="internalDocNo">Internal Document No.</Label>
                        <Input
                          id="internalDocNo"
                          value={formData.internalDocNo}
                          onChange={(e) => setFormData(prev => ({ ...prev, internalDocNo: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="codeStatus">Code Status</Label>
                        <Select
                          value={formData.codeStatus}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, codeStatus: value }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select Code Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Code 1">Code 1: Critical</SelectItem>
                            <SelectItem value="Code 2">Code 2: Important</SelectItem>
                            <SelectItem value="Code 3">Code 3: Standard</SelectItem>
                            <SelectItem value="Code 4">Code 4: Reference</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="status">Status</Label>
                        <Select
                          value={formData.status}
                          onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="sent-for-approval">Sent for Approval</SelectItem>
                            <SelectItem value="received-for-comment">Received for Comment</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="remarks">Remarks</Label>
                      <Textarea
                        id="remarks"
                        value={formData.remarks}
                        onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
                        placeholder="Add any additional remarks..."
                        className="mt-1"
                        rows={3}
                      />
                    </div>
                  </div>

                  {/* Auto-generated Equipment Details */}
                  {selectedEquipments.length > 0 && (
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <h4 className="font-medium text-blue-800 mb-3">Selected Equipment Details</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-blue-700">Equipment Tags:</span>
                          <span className="font-medium">{selectedEquipments.join(', ')}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-blue-700">Mfg Serial Nos:</span>
                          <span className="font-medium">{autoGenerateMfgSerialNos().join(', ')}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-blue-700">Job Nos:</span>
                          <span className="font-medium">{autoGenerateJobNos().join(', ')}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 mt-8 pt-6 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={16} className="mr-2" />
                      {isAddingNew ? 'Add VDCR Record' : 'Save Changes'}
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Bulk Upload Modal */}
          <Dialog open={bulkUploadModal.isOpen} onOpenChange={(open) => setBulkUploadModal(prev => ({ ...prev, isOpen: open }))}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold text-gray-800">
                  Bulk Upload VDCR Records
                </DialogTitle>
                <p className="text-gray-600 mt-2">
                  Upload multiple VDCR records using predefined templates
                </p>
              </DialogHeader>

              <div className="space-y-6 mt-6">
                {/* Template Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800">VDCR Template</h3>
                  <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-800">{vdcrTemplate.name}</h4>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={downloadTemplate}
                        className="bg-blue-50 hover:bg-blue-100 border-blue-200 hover:border-blue-300 text-blue-700"
                      >
                        <Download size={14} className="mr-2" />
                        Download Sample Template
                      </Button>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">{vdcrTemplate.description}</p>
                    <div className="text-xs text-gray-500">
                      <p><strong>Columns:</strong> {vdcrTemplate.columns.join(', ')}</p>
                      <p><strong>Features:</strong></p>
                      <ul className="list-disc list-inside ml-2 space-y-1">
                        <li>Sr. No. → Use your own numbers or leave blank to continue from last entry</li>
                        <li>Equipment Tag No. → Auto-fills Mfg Serial No. & Job No. from database</li>
                        <li>Excel Format → Professional template with dropdowns and validation</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* File Upload */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-800">Upload Excel/CSV File</h3>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="bulkFileUpload">Select Excel or CSV File</Label>
                      <div className="mt-2">
                        <Input
                          id="bulkFileUpload"
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={handleFileUploadForBulk}
                          className="cursor-pointer"
                          disabled={bulkUploadModal.isProcessing}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Upload Excel file (.xlsx recommended) or CSV file (.csv) matching the template format
                        </p>
                      </div>
                    </div>

                    {bulkUploadModal.uploadedFile && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center space-x-2 text-green-700">
                          <FileText size={16} />
                          <span className="text-sm font-medium">
                            File uploaded: {bulkUploadModal.uploadedFile.name}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Data Preview */}
                {bulkUploadModal.previewData.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Data Preview</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              {Object.keys(bulkUploadModal.previewData[0]).map((header) => (
                                <th key={header} className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {bulkUploadModal.previewData.slice(0, 5).map((row, index) => (
                              <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                {Object.values(row).map((value, cellIndex) => (
                                  <td key={cellIndex} className="px-4 py-2 text-sm text-gray-600 border-b">
                                    {String(value) || '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {bulkUploadModal.previewData.length > 5 && (
                        <div className="p-3 bg-gray-50 text-center text-sm text-gray-600 border-t">
                          Showing first 5 rows of {bulkUploadModal.previewData.length} total rows
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Processing Status */}
                {bulkUploadModal.isProcessing && (
                  <div className="text-center py-6">
                    <div className="flex items-center justify-center space-x-3 text-blue-600">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <span className="text-lg font-medium">Processing bulk upload...</span>
                    </div>
                    <p className="text-gray-600 mt-2">Please wait while we import your VDCR records</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={() => setBulkUploadModal(prev => ({ ...prev, isOpen: false }))}
                  disabled={bulkUploadModal.isProcessing}
                >
                  Cancel
                </Button>
                {bulkUploadModal.previewData.length > 0 && !bulkUploadModal.isProcessing && (
                  <Button
                    onClick={processBulkUpload}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <FileText size={16} className="mr-2" />
                    Import {bulkUploadModal.previewData.length} Records
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Document Preview Modal */}
          <Dialog open={previewModal.isOpen} onOpenChange={(open) => setPreviewModal(prev => ({ ...prev, isOpen: open }))}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <FileText size={20} className="text-blue-600" />
                  <span>Document Preview: {previewModal.documentName}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="flex-1 overflow-hidden">
                {previewModal.document ? (
                  <div className="space-y-4">
                    {/* Document Info */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">File Name:</span>
                          <p className="text-gray-600">{previewModal.document.originalName}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">File Type:</span>
                          <p className="text-gray-600">{previewModal.document.fileType.toUpperCase()}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">File Size:</span>
                          <p className="text-gray-600">{(previewModal.document.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Uploaded By:</span>
                          <p className="text-gray-600">{previewModal.document.uploadedBy}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Upload Date:</span>
                          <p className="text-gray-600">{previewModal.document.uploadDate}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Document ID:</span>
                          <p className="text-gray-600">{previewModal.document.id}</p>
                        </div>
                      </div>
                    </div>

                    {/* Mock Document Content */}
                    <div className="bg-white border rounded-lg p-6 min-h-[400px]">
                      <div className="text-center space-y-4">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                          <FileText size={32} className="text-blue-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-800">{previewModal.documentName}</h3>
                        <p className="text-gray-600">
                          This is a preview of the document "{previewModal.document.originalName}"
                        </p>
                        <div className="text-sm text-gray-500">
                          <p>File Type: {previewModal.document.fileType.toUpperCase()}</p>
                          <p>Size: {(previewModal.document.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                        </div>

                        {/* PDF Preview with actual functionality */}
                        {previewModal.document.fileType === 'pdf' && (
                          <div className="bg-white border rounded-lg overflow-hidden">
                            {/* PDF Viewer Header */}
                            <div className="bg-gray-100 px-4 py-3 border-b flex items-center justify-between">
                              <div className="flex items-center space-x-4">
                                <h4 className="font-medium text-gray-800">PDF Document Preview</h4>
                                <div className="flex items-center space-x-2">
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleZoomOut}>
                                    <span className="mr-1">-</span> Zoom Out
                                  </Button>
                                  <span className="text-sm text-gray-600 px-2">{pdfViewerState.zoomLevel}%</span>
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleZoomIn}>
                                    <span className="mr-1">+</span> Zoom In
                                  </Button>
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handlePrevPage}>
                                  ← Prev
                                </Button>
                                <span className="text-sm text-gray-600 px-2">Page {pdfViewerState.currentPage} of {pdfViewerState.totalPages}</span>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleNextPage}>
                                  Next →
                                </Button>
                              </div>
                            </div>

                            {/* PDF Content Area - Real PDF Viewer */}
                            <div 
                              className="bg-gray-100 min-h-[500px] flex items-center justify-center relative overflow-hidden"
                              onWheel={(e) => {
                                // Horizontal scroll navigation for PDF pages
                                if (e.deltaX > 0) {
                                  // Scroll right - next page
                                  // console.log('PDF Scroll right detected');
                                  handleNextPage();
                                } else if (e.deltaX < 0) {
                                  // Scroll left - previous page  
                                  // console.log('PDF Scroll left detected');
                                  handlePrevPage();
                                }
                              }}
                              onKeyDown={(e) => {
                                // Keyboard navigation
                                if (e.key === 'ArrowRight') {
                                  // console.log('PDF Right arrow - next page');
                                  handleNextPage();
                                } else if (e.key === 'ArrowLeft') {
                                  // console.log('PDF Left arrow - previous page');
                                  handlePrevPage();
                                }
                              }}
                              tabIndex={0}
                            >
                              {isLoadingPdf ? (
                                <div className="flex items-center justify-center">
                                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                  <span className="ml-2 text-gray-600">Loading PDF...</span>
                                </div>
                              ) : pdfDocument ? (
                                <div className="w-full h-full flex items-center justify-center">
                                  <canvas
                                    id="pdf-canvas"
                                    className={`border shadow-lg ${pdfViewerState.isAnnotating ? 'cursor-crosshair' : 'cursor-default'}`}
                                    style={{
                                      transform: `scale(${pdfViewerState.zoomLevel / 100})`,
                                      transformOrigin: 'center center',
                                      transition: 'transform 0.3s ease',
                                      maxWidth: '100%',
                                      maxHeight: '100%'
                                    }}
                                    onClick={(e) => {
                                      if (pdfViewerState.isAnnotating) {
                                        // Get click position
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const x = e.clientX - rect.left;
                                        const y = e.clientY - rect.top;

                                        // Handle different annotation types
                                        if (annotationTools.selectedTool === 'text') {
                                          // Open text input modal
                                          setTextInputModal({
                                            isOpen: true,
                                            text: '',
                                            position: { x, y }
                                          });
                                        } else {
                                          // Show annotation feedback for other tools
                                          const feedback = document.createElement('div');
                                          feedback.className = 'absolute pointer-events-none z-50';
                                          feedback.style.left = `${x}px`;
                                          feedback.style.top = `${y}px`;
                                          feedback.style.color = annotationTools.color;
                                          feedback.style.fontSize = annotationTools.size === 'small' ? '12px' : annotationTools.size === 'medium' ? '16px' : '20px';
                                          feedback.style.fontWeight = 'bold';
                                          feedback.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
                                          feedback.style.animation = 'annotationPulse 0.5s ease-in-out';

                                          // Add CSS animation
                                          if (!document.getElementById('annotation-styles')) {
                                            const style = document.createElement('style');
                                            style.id = 'annotation-styles';
                                            style.textContent = `
                                              @keyframes annotationPulse {
                                                0% { transform: scale(0.5); opacity: 0; }
                                                50% { transform: scale(1.2); opacity: 1; }
                                                100% { transform: scale(1); opacity: 0.8; }
                                              }
                                            `;
                                            document.head.appendChild(style);
                                          }

                                          feedback.textContent = annotationTools.selectedTool === 'highlight' ? '🖍️' :
                                            annotationTools.selectedTool === 'pen' ? '✏️' :
                                              annotationTools.selectedTool === 'arrow' ? '➡️' : '⬜';

                                          e.currentTarget.parentElement?.appendChild(feedback);

                                          // Remove feedback after animation
                                          setTimeout(() => {
                                            feedback.remove();
                                          }, 2000);
                                        }
                                      }
                                    }}
                                  />
                                </div>
                              ) : previewModal.document?.fileType === 'pdf' ? (
                                <div className="text-center text-gray-500">
                                  <p>PDF not loaded</p>
                                </div>
                              ) : (
                                <div className="bg-white border-2 border-gray-400 shadow-2xl rounded-lg p-8">
                                  <div className="text-center">
                                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                      <FileText size={40} className="text-gray-600" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-gray-800 mb-2">{previewModal.documentName}</h2>
                                    <p className="text-gray-600 text-lg mb-4">Document Preview</p>
                                    <div className="bg-gray-50 p-4 rounded-lg border">
                                      <p className="text-gray-700">
                                        <strong>File Type:</strong> {(previewModal.document?.fileType as string)?.toUpperCase() || 'OTHER'}
                                      </p>
                                      <p className="text-gray-600 text-sm mt-2">
                                        <strong>File Size:</strong> {((previewModal.document?.fileSize || 0) / 1024 / 1024).toFixed(2)} MB
                                      </p>
                                      <p className="text-gray-600 text-sm mt-2">
                                        <strong>Uploaded By:</strong> {previewModal.document?.uploadedBy || 'Unknown'}
                                      </p>
                                      <p className="text-gray-600 text-sm mt-2">
                                        <strong>Upload Date:</strong> {previewModal.document?.uploadDate || 'N/A'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Search Results Display */}
                              {pdfViewerState.searchText && (
                                <div className="absolute top-4 left-4 bg-blue-100 border border-blue-300 rounded-lg px-4 py-2 text-sm z-10 max-w-xs">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <span>🔍</span>
                                      <span className="font-medium">Search: "{pdfViewerState.searchText}"</span>
                                    </div>
                                    <button
                                      onClick={clearSearch}
                                      className="text-blue-700 hover:text-blue-900 font-bold ml-2"
                                      title="Clear search"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  {pdfViewerState.searchResults.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      <div className="text-xs text-blue-600">
                                        Found {pdfViewerState.searchResults.reduce((sum, result) => sum + result.matches, 0)} results on {pdfViewerState.searchResults.length} pages
                                      </div>
                                      <div className="flex flex-wrap gap-1">
                                        {pdfViewerState.searchResults.slice(0, 5).map((result, index) => (
                                          <button
                                            key={index}
                                            onClick={() => {
                                              setPdfViewerState(prev => ({
                                                ...prev,
                                                currentPage: result.page
                                              }));
                                            }}
                                            className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded transition-colors"
                                          >
                                            Page {result.page} ({result.matches})
                                          </button>
                                        ))}
                                        {pdfViewerState.searchResults.length > 5 && (
                                          <span className="text-xs text-gray-500">
                                            +{pdfViewerState.searchResults.length - 5} more
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Zoom Indicator */}
                              <div className="absolute top-4 right-4 bg-blue-100 border border-blue-300 rounded px-3 py-1 text-sm font-medium z-10">
                                Zoom: {pdfViewerState.zoomLevel}%
                              </div>

                              {/* Annotation Mode Indicator */}
                              {pdfViewerState.isAnnotating && (
                                <div className="absolute top-4 left-4 bg-yellow-100 border border-yellow-300 rounded px-3 py-1 text-sm font-medium z-10">
                                  📝 Annotation Mode Active
                                </div>
                              )}

                              {/* Annotation Tools Panel */}
                              {annotationTools.isVisible && (
                                <div className="absolute top-16 left-4 bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-20 max-w-xs">
                                  <div className="flex items-center justify-between mb-3">
                                    <h4 className="font-medium text-gray-800">Annotation Tools</h4>
                                    <button
                                      onClick={() => setAnnotationTools(prev => ({ ...prev, isVisible: false }))}
                                      className="text-gray-500 hover:text-gray-700"
                                    >
                                      ✕
                                    </button>
                                  </div>

                                  {annotationTools.message ? (
                                    <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                                      {annotationTools.message}
                                    </div>
                                  ) : (
                                    <div className="space-y-3">
                                      {/* Tool Selection */}
                                      <div>
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">Tool</label>
                                        <div className="flex space-x-2">
                                          {['highlight', 'pen', 'arrow', 'text', 'rectangle'].map((tool) => (
                                            <button
                                              key={tool}
                                              onClick={() => setAnnotationTools(prev => ({ ...prev, selectedTool: tool }))}
                                              className={`px-2 py-1 text-xs rounded ${annotationTools.selectedTool === tool
                                                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            >
                                              {tool === 'highlight' && '🖍️'}
                                              {tool === 'pen' && '✏️'}
                                              {tool === 'arrow' && '➡️'}
                                              {tool === 'text' && '📝'}
                                              {tool === 'rectangle' && '⬜'}
                                            </button>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Color Selection */}
                                      <div>
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">Color</label>
                                        <div className="flex space-x-2">
                                          {['#ffff00', '#ff0000', '#00ff00', '#0000ff', '#ff00ff'].map((color) => (
                                            <button
                                              key={color}
                                              onClick={() => setAnnotationTools(prev => ({ ...prev, color }))}
                                              className={`w-6 h-6 rounded border-2 ${annotationTools.color === color
                                                  ? 'border-gray-400'
                                                  : 'border-gray-200'
                                                }`}
                                              style={{ backgroundColor: color }}
                                            />
                                          ))}
                                        </div>
                                      </div>

                                      {/* Size Selection */}
                                      <div>
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">Size</label>
                                        <div className="flex space-x-2">
                                          {['small', 'medium', 'large'].map((size) => (
                                            <button
                                              key={size}
                                              onClick={() => setAnnotationTools(prev => ({ ...prev, size }))}
                                              className={`px-2 py-1 text-xs rounded ${annotationTools.size === size
                                                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            >
                                              {size}
                                            </button>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Instructions */}
                                      <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded">
                                        <strong>Instructions:</strong><br />
                                        • Click and drag to {annotationTools.selectedTool}<br />
                                        • Use different colors for organization<br />
                                        • Click outside to finish annotation
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* PDF Footer */}
                            <div className="bg-gray-100 px-4 py-2 border-t flex items-center justify-between text-sm text-gray-600">
                              <div className="flex items-center space-x-4">
                                <span>📄 PDF Document</span>
                                <span>📏 {previewModal.document.fileSize} bytes</span>
                                <span>📅 {previewModal.document.uploadDate}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleSearch}>
                                  🔍 Search
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleAnnotate}>
                                  📝 Annotate
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleFullscreen}>
                                  📱 Fullscreen
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {previewModal.document.fileType === 'docx' && (
                          <div className="bg-gray-50 p-4 rounded-lg text-left">
                            <h4 className="font-medium text-gray-800 mb-2">Word Document Preview</h4>
                            <p className="text-sm text-gray-600 mb-2">This would show the actual Word document content with editing capabilities.</p>
                            <p className="text-sm text-gray-600">Features: Text editing, Formatting, Comments, Track changes, Download</p>
                          </div>
                        )}

                        {previewModal.document.fileType === 'image' && (
                          <div className="bg-gray-50 p-4 rounded-lg text-left">
                            <h4 className="font-medium text-gray-800 mb-2">Image Preview</h4>
                            <p className="text-sm text-gray-600 mb-2">This would show the actual image with zoom and pan capabilities.</p>
                            <p className="text-sm text-gray-600">Features: Zoom in/out, Pan, Rotate, Download, Full screen</p>
                          </div>
                        )}

                        {previewModal.document.fileType === 'other' && (
                          <div className="bg-gray-50 p-4 rounded-lg text-left">
                            <h4 className="font-medium text-gray-800 mb-2">Document Preview</h4>
                            <p className="text-sm text-gray-600 mb-2">This document type requires a compatible viewer.</p>
                            <p className="text-sm text-gray-600">Features: Download, File info, Compatibility check</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FileText size={32} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Document Preview Not Available</h3>
                    <p className="text-gray-600 mb-4">The document "{previewModal.documentName}" exists but preview is not available.</p>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <p className="text-blue-800 text-sm">
                        <strong>Document Name:</strong> {previewModal.documentName}
                      </p>
                      <p className="text-blue-700 text-sm mt-2">
                        This document is part of the VDCR record but the actual file may not be uploaded yet or the preview feature is not available for this file type.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                <Button
                  variant="outline"
                  onClick={downloadPDF}
                  className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                >
                  <Download size={16} className="mr-2" />
                  Download Document
                </Button>
                <Button onClick={() => setPreviewModal(prev => ({ ...prev, isOpen: false }))}>
                  Close Preview
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Search Modal */}
          <Dialog open={searchModal.isOpen} onOpenChange={(open) => setSearchModal(prev => ({ ...prev, isOpen: open }))}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <span>🔍</span>
                  <span>Search in PDF</span>
                </DialogTitle>
                <DialogDescription>
                  Enter text to search in "{previewModal.documentName}"
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Input
                    placeholder="Enter search term..."
                    value={searchModal.searchText}
                    onChange={(e) => {
                      setSearchModal(prev => ({ ...prev, searchText: e.target.value }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearchSubmit();
                      }
                    }}
                    onFocus={(e) => {
                      e.target.select();
                    }}
                    className="w-full"
                    autoFocus
                    tabIndex={0}
                    style={{ zIndex: 1000 }}
                  />
                </div>

                {pdfViewerState.searchResults.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2 text-blue-800">
                      <span>✅</span>
                      <span className="font-medium">
                        Found {pdfViewerState.searchResults.reduce((sum, result) => sum + result.matches, 0)} results
                      </span>
                    </div>
                    <div className="text-sm text-blue-600 mt-1">
                      Results found on {pdfViewerState.searchResults.length} pages
                    </div>

                    {/* Clickable page results */}
                    <div className="mt-3 space-y-2 max-h-32 overflow-y-auto">
                      {pdfViewerState.searchResults.map((result, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 bg-white rounded border cursor-pointer hover:bg-blue-50 transition-colors"
                          onClick={() => {
                            setPdfViewerState(prev => ({
                              ...prev,
                              currentPage: result.page
                            }));
                          }}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="text-blue-600 font-medium">Page {result.page}</span>
                            <span className="text-gray-500 text-sm">({result.matches} matches)</span>
                          </div>
                          <div className="text-xs text-gray-400 max-w-32 truncate">
                            {result.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pdfViewerState.searchText && pdfViewerState.searchResults.length === 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2 text-yellow-800">
                      <span>⚠️</span>
                      <span className="font-medium">No results found</span>
                    </div>
                    <div className="text-sm text-yellow-600 mt-1">
                      Try a different search term
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={() => setSearchModal(prev => ({ ...prev, isOpen: false }))}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSearchSubmit}
                  disabled={!searchModal.searchText.trim() || searchModal.isSearching}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {searchModal.isSearching ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Searching...
                    </>
                  ) : (
                    <>
                      <span>🔍</span>
                      <span className="ml-2">Search</span>
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Text Input Modal for Annotations */}
          <Dialog open={textInputModal.isOpen} onOpenChange={(open) => setTextInputModal(prev => ({ ...prev, isOpen: open }))}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <span>📝</span>
                  <span>Add Text Annotation</span>
                </DialogTitle>
                <DialogDescription>
                  Enter text to add as annotation on the PDF
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="annotation-text">Annotation Text</Label>
                  <Textarea
                    id="annotation-text"
                    placeholder="Enter your annotation text here..."
                    value={textInputModal.text}
                    onChange={(e) => setTextInputModal(prev => ({ ...prev, text: e.target.value }))}
                    className="w-full min-h-[100px]"
                    autoFocus
                  />
                </div>

                <div className="flex items-center space-x-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Color</Label>
                    <div className="flex space-x-2 mt-1">
                      {['#ffff00', '#ff0000', '#00ff00', '#0000ff', '#ff00ff'].map((color) => (
                        <button
                          key={color}
                          onClick={() => setAnnotationTools(prev => ({ ...prev, color }))}
                          className={`w-6 h-6 rounded border-2 ${annotationTools.color === color
                              ? 'border-gray-400'
                              : 'border-gray-200'
                            }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Size</Label>
                    <div className="flex space-x-2 mt-1">
                      {['small', 'medium', 'large'].map((size) => (
                        <button
                          key={size}
                          onClick={() => setAnnotationTools(prev => ({ ...prev, size }))}
                          className={`px-2 py-1 text-xs rounded ${annotationTools.size === size
                              ? 'bg-blue-100 text-blue-700 border border-blue-300'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {textInputModal.text && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="text-sm text-blue-800 font-medium mb-1">Preview:</div>
                    <div
                      className="text-sm"
                      style={{
                        color: annotationTools.color,
                        fontSize: annotationTools.size === 'small' ? '12px' : annotationTools.size === 'medium' ? '16px' : '20px'
                      }}
                    >
                      {textInputModal.text}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={() => setTextInputModal(prev => ({ ...prev, isOpen: false, text: '' }))}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (textInputModal.text.trim()) {
                      // Create text annotation element with enhanced styling
                      const textElement = document.createElement('div');
                      textElement.className = 'absolute pointer-events-none z-40';
                      textElement.style.left = `${textInputModal.position.x}px`;
                      textElement.style.top = `${textInputModal.position.y}px`;
                      textElement.style.color = annotationTools.color;
                      textElement.style.fontSize = annotationTools.size === 'small' ? '12px' : annotationTools.size === 'medium' ? '16px' : '20px';
                      textElement.style.fontWeight = 'bold';
                      textElement.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                      textElement.style.padding = '4px 8px';
                      textElement.style.borderRadius = '6px';
                      textElement.style.border = `2px solid ${annotationTools.color}`;
                      textElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                      textElement.style.textShadow = '1px 1px 2px rgba(0,0,0,0.3)';
                      textElement.style.maxWidth = '200px';
                      textElement.style.wordWrap = 'break-word';
                      textElement.style.animation = 'textAnnotationFadeIn 0.3s ease-in-out';
                      textElement.textContent = textInputModal.text;

                      // Add CSS animation for text annotations
                      if (!document.getElementById('text-annotation-styles')) {
                        const style = document.createElement('style');
                        style.id = 'text-annotation-styles';
                        style.textContent = `
                          @keyframes textAnnotationFadeIn {
                            0% { 
                              transform: scale(0.8) translateY(-10px); 
                              opacity: 0; 
                            }
                            100% { 
                              transform: scale(1) translateY(0); 
                              opacity: 1; 
                            }
                          }
                        `;
                        document.head.appendChild(style);
                      }

                      // Add to PDF canvas container
                      const canvasContainer = document.querySelector('#pdf-canvas')?.parentElement;
                      if (canvasContainer) {
                        canvasContainer.appendChild(textElement);

                        // Show success feedback
                        const successFeedback = document.createElement('div');
                        successFeedback.className = 'absolute pointer-events-none z-50';
                        successFeedback.style.left = `${textInputModal.position.x + 10}px`;
                        successFeedback.style.top = `${textInputModal.position.y - 30}px`;
                        successFeedback.style.color = '#10b981';
                        successFeedback.style.fontSize = '14px';
                        successFeedback.style.fontWeight = 'bold';
                        successFeedback.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
                        successFeedback.style.animation = 'annotationPulse 0.5s ease-in-out';
                        successFeedback.textContent = '✅ Text Added';

                        canvasContainer.appendChild(successFeedback);

                        // Remove success feedback
                        setTimeout(() => {
                          successFeedback.remove();
                        }, 1500);
                      }

                      // Close modal
                      setTextInputModal(prev => ({ ...prev, isOpen: false, text: '' }));
                    }
                  }}
                  disabled={!textInputModal.text.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Add Annotation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            size="sm"
            variant="outline"
            onClick={exportToExcel}
            className="bg-white hover:bg-gray-50 text-gray-700 border-gray-300 hover:border-gray-400 hover:text-gray-800"
          >
            <Download size={14} className="mr-2" />
            Export to Excel
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border-0 shadow-lg bg-gradient-to-br from-white to-gray-50/50">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="text-lg font-medium text-gray-600">Loading VDCR records...</span>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            <table className="w-full min-w-[1800px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 text-white shadow-lg">
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 bg-blue-600/90 sticky left-0 z-20 min-w-[60px] backdrop-blur-sm">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Sr. No.</span>
                    </div>
                  </th>
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 bg-blue-600/90 sticky left-[60px] z-20 min-w-[120px] backdrop-blur-sm">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Equipment Tag</span>
                    </div>
                  </th>
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 min-w-[140px]">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Mfg Serial</span>
                    </div>
                  </th>
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 min-w-[120px]">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Job No.</span>
                    </div>
                  </th>
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 min-w-[150px]">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Client Doc</span>
                    </div>
                  </th>
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 min-w-[150px]">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Internal Doc</span>
                    </div>
                  </th>
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 min-w-[200px]">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Document Name</span>
                    </div>
                  </th>
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 min-w-[80px]">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Rev</span>
                    </div>
                  </th>
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 min-w-[100px]">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Code</span>
                    </div>
                  </th>
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 min-w-[120px]">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Status</span>
                    </div>
                  </th>
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 min-w-[200px]">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Remarks</span>
                    </div>
                  </th>
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 min-w-[200px]">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Updated On</span>
                    </div>
                  </th>
                  <th className="px-3 sm:px-4 py-3 sm:py-4 text-left text-xs sm:text-sm font-semibold border-b border-blue-400/30 min-w-[100px]">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full"></div>
                      <span>Actions</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {vdcrData.map((record, index) => (
                  <tr
                    key={record.id}
                    className={`group hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50 transition-all duration-300 border-b border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                      }`}
                  >
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold sticky left-0 z-10 bg-inherit border-r border-blue-200/30">
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">
                          {record.srNo}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm sticky left-[60px] z-10 bg-inherit border-r border-blue-200/30">
                      <div className="flex flex-wrap gap-1 sm:gap-2">
                        {record.equipmentTagNo.map((tag, tagIndex) => (
                          <span key={tagIndex} className="text-xs bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-gray-200 whitespace-nowrap font-medium shadow-sm">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <div className="flex flex-wrap gap-1 sm:gap-2">
                        {record.mfgSerialNo.map((serial, serialIndex) => (
                          <span key={serialIndex} className="text-xs bg-gradient-to-r from-purple-50 to-purple-100 text-purple-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-purple-200 font-mono whitespace-nowrap shadow-sm">
                            {serial}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <div className="flex flex-wrap gap-1 sm:gap-2">
                        {record.jobNo.map((job, jobIndex) => (
                          <span key={jobIndex} className="text-xs bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-emerald-200 font-mono whitespace-nowrap shadow-sm">
                            {job}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <span className="text-xs bg-gradient-to-r from-red-50 to-red-100 text-red-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-red-200 font-mono whitespace-nowrap shadow-sm">
                        {record.clientDocNo}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <span className="text-xs bg-gradient-to-r from-orange-50 to-orange-100 text-orange-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-orange-200 font-mono whitespace-nowrap shadow-sm">
                        {record.internalDocNo}
                      </span>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <div className="flex items-center group-hover:scale-105 transition-transform duration-200">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center mr-2 sm:mr-3 shadow-md">
                          <FileText size={12} className="sm:w-4 sm:h-4 text-white" />
                        </div>
                        {record.documentUrl ? (
                          <button
                            onClick={() => openDocumentPreview(record.documentUrl!, record.documentName)}
                            className="truncate whitespace-nowrap font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors text-xs sm:text-sm"
                            title={`Click to preview: ${record.documentName}`}
                          >
                            {record.documentName}
                          </button>
                        ) : (
                          <span className="truncate whitespace-nowrap font-medium text-gray-800 text-xs sm:text-sm">{record.documentName}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <Badge variant="outline" className="text-xs whitespace-nowrap bg-white border-2 border-gray-300 shadow-sm">
                        {record.revision}
                      </Badge>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <Badge className={`text-xs whitespace-nowrap ${getCodeStatusColor(record.codeStatus)} shadow-md`}>
                        {record.codeStatus}
                      </Badge>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <Badge className={`text-xs whitespace-nowrap ${getStatusColor(record.status)} shadow-md`}>
                        {getStatusText(record.status)}
                      </Badge>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <div className="max-w-[200px]">
                        <span className="text-xs sm:text-sm text-gray-700 leading-relaxed">
                          {record.remarks || 'No remarks'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-gray-600 whitespace-nowrap">
                      <div className="flex items-center space-x-2 sm:space-x-3">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <span className="font-medium text-xs sm:text-sm">{record.lastUpdate}</span>
                        <div className="flex items-center space-x-1 sm:space-x-2">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs font-bold">
                              {record.updatedBy ? record.updatedBy.split(' ').map(n => n[0]).join('') : 'U'}
                            </span>
                          </div>
                          <span className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap">
                            {record.updatedBy || 'Unknown'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                      <div className="flex gap-1 sm:gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 sm:h-8 px-2 sm:px-3 text-xs bg-white hover:bg-blue-50 border-blue-200 hover:border-blue-300 transition-all duration-200 shadow-sm"
                          onClick={() => handleEditVDCR(record)}
                        >
                          <Edit size={10} className="sm:w-3 sm:h-3 mr-1" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 sm:h-8 px-2 sm:px-3 text-xs bg-white hover:bg-red-50 border-red-200 hover:border-red-300 transition-all duration-200 shadow-sm"
                          onClick={() => handleDeleteVDCR(record.id)}
                        >
                          <X size={10} className="sm:w-3 sm:h-3 mr-1" />
                          <span className="hidden sm:inline">Delete</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-center space-x-8">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
            <span className="text-sm text-gray-600">Code 1: Critical</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            <span className="text-sm text-gray-600">Code 2: Important</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-sm"></div>
            <span className="text-sm text-gray-600">Code 3: Standard</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-purple-500 rounded-sm"></div>
            <span className="text-sm text-gray-600">Code 4: Reference</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectsVDCR; 