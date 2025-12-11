import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fastAPI } from "@/lib/api";
import { sendNotifications, getDashboardUrl } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import {
  Building,
  Users,
  Circle,
  Plus,
  Edit,
  Trash2,
  Grid,
  User,
  X,
  Check,
  AlertCircle,
  LogOut,
  Upload,
  Image as ImageIcon
} from "lucide-react";
import { useNavigate } from 'react-router-dom';

interface Company {
  id: string;
  name: string;
  subscription_plan: 'free' | 'basic' | 'premium' | 'enterprise';
  is_active: boolean;
  max_users: number;
  created_at: string;
  user_count: number;
  admin_name?: string;
  admin_email?: string;
  admin_phone?: string;
  admin_whatsapp?: string;
  logo_url?: string | null;
}

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  firm_id: string;
  is_active: boolean;
}

const SuperAdminDashboard = () => {
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't close if clicking on the logout button or inside the dropdown
      const target = event.target as HTMLElement;
      if (target.closest('.logout-button') || target.closest('.user-dropdown')) {
        return;
      }
      
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    // Use a slight delay to ensure click events on buttons inside dropdown fire first
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      // console.log('🚪 Logout initiated...');
      
      // IMMEDIATE: Clear ALL storage first (don't wait for async)
      localStorage.clear();
      sessionStorage.clear();
      
      // IMMEDIATE: Force redirect right away (don't wait for signOut)
      // console.log('✅ Clearing storage and redirecting immediately...');
      window.location.replace('/login');
      
      // Continue signOut in background (non-blocking)
      // We don't await this - redirect happens immediately
      (async () => {
        try {
          if (signOut && typeof signOut === 'function') {
            await signOut();
          } else {
            await supabase.auth.signOut();
          }
        } catch (signOutError) {
          console.warn('⚠️ SignOut error (non-fatal, already redirected):', signOutError);
        }
      })();
      
    } catch (error) {
      console.error('❌ Error during logout:', error);
      // Even if everything fails, clear storage and force redirect
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/login');
    }
  };
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [updatingCompany, setUpdatingCompany] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState<string | null>(null);
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [newCompany, setNewCompany] = useState({
    name: '',
    subscription_plan: 'basic' as const,
    is_active: true,
    max_users: 5,
    admin_name: '',
    admin_email: '',
    admin_phone: '',
    admin_whatsapp: ''
  });
  const [newCompanyLogo, setNewCompanyLogo] = useState<File | null>(null);
  const [newCompanyLogoPreview, setNewCompanyLogoPreview] = useState<string | null>(null);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editingCompanyLogo, setEditingCompanyLogo] = useState<File | null>(null);
  const [editingCompanyLogoPreview, setEditingCompanyLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch companies and users in parallel for speed
      const [companiesData, usersData] = await Promise.all([
        fastAPI.getCompanies(),
        fastAPI.getUsers()
      ]);

      // Process companies with user count and admin info
      const processedCompanies = companiesData?.map((company: any) => {
        const companyUsers = usersData?.filter((user: any) => user.firm_id === company.id) || [];
        const adminUser = companyUsers.find((user: any) => user.role === 'firm_admin');

        // If admin exists in users table, use that data, otherwise use company data
        const adminName = adminUser?.full_name || company.admin_name || '';
        const adminEmail = adminUser?.email || company.admin_email || '';

        return {
          id: company.id,
          name: company.name,
          subscription_plan: company.subscription_plan,
          is_active: company.is_active,
          max_users: company.max_users || 5,
          created_at: company.created_at,
          user_count: companyUsers.length,
          admin_name: adminName,
          admin_email: adminEmail,
          admin_phone: company.admin_phone || '',
          admin_whatsapp: company.admin_whatsapp || '',
          logo_url: company.logo_url || null
        };
      }) || [];

      setCompanies(processedCompanies);
      setUsers(usersData || []);

      // Data processed successfully
    } catch (error) {
      toast({ title: 'Error', description: 'Error loading data: ' + (error as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async () => {
    try {
      setCreatingCompany(true);
      // Create company in firms table
      const companyData = await fastAPI.createCompany({
        name: newCompany.name,
        subscription_plan: newCompany.subscription_plan,
        is_active: newCompany.is_active,
        max_users: newCompany.max_users,
        admin_name: newCompany.admin_name,
        admin_email: newCompany.admin_email,
        admin_phone: newCompany.admin_phone,
        admin_whatsapp: newCompany.admin_whatsapp
      });

      // console.log('✅ Company created:', companyData);
      const firmId = companyData[0]?.id || companyData.id;

      // Upload logo if provided
      if (newCompanyLogo) {
        try {
          const logoUrl = await fastAPI.uploadCompanyLogo(newCompanyLogo, firmId);
          // Update company with logo URL
          await fastAPI.updateCompany(firmId, { logo_url: logoUrl });
        } catch (logoError) {
          console.error('⚠️ Error uploading logo (company still created):', logoError);
          toast({ 
            title: 'Warning', 
            description: 'Company created successfully, but logo upload failed. You can add it later.', 
            variant: 'default' 
          });
        }
      }

      // 🆕 Skip user creation for now - just proceed with invite
      // console.log('🔍 Skipping user creation, proceeding with invite...');

      // 🆕 Test invites table first
      try {
        // console.log('🔍 Testing invites table...');
        const tableExists = await fastAPI.testInvitesTable();
        if (!tableExists) {
          console.error('❌ Invites table does not exist or is not accessible');
          return;
        }
      } catch (testError) {
        console.error('❌ Error testing invites table:', testError);
        return;
      }

      // 🆕 Create invite for firm admin
      try {
        // console.log('📧 Creating invite for firm admin...');
        await fastAPI.createInvite({
          email: newCompany.admin_email,
          full_name: newCompany.admin_name,
          role: 'firm_admin',
          firm_id: firmId,
          invited_by: user.id
        });
        // console.log('✅ Invite created for firm admin');
      } catch (inviteError) {
        console.error('❌ Error creating invite (company still created):', inviteError);
        // Don't fail the whole operation if invite creation fails
      }

      // Send notifications to admin
      try {
        // console.log('📧 Sending notifications to admin...');
        const notificationResult = await sendNotifications({
          company_name: newCompany.name,
          admin_name: newCompany.admin_name,
          admin_email: newCompany.admin_email,
          admin_phone: newCompany.admin_phone,
          admin_whatsapp: newCompany.admin_whatsapp,
          role: 'firm_admin',
          dashboard_url: getDashboardUrl('firm_admin')
        });

        // console.log('📊 Notification result:', notificationResult);

        if (notificationResult.success) {
          console.log('✅ Notifications sent successfully');
        } else {
          console.log('⚠️ Some notifications failed, but company was created');
        }
      } catch (notificationError) {
        console.error('❌ Notification error (company still created):', notificationError);
      }

      // Reset form and refresh data
      setNewCompany({
        name: '',
        subscription_plan: 'basic',
        is_active: true,
        max_users: 5,
        admin_name: '',
        admin_email: '',
        admin_phone: '',
        admin_whatsapp: ''
      });
      setNewCompanyLogo(null);
      setNewCompanyLogoPreview(null);
      setShowCreateCompany(false);
      await fetchData();

      toast({ title: 'Success', description: 'Company created successfully!' });
    } catch (error: any) {
      let errorMessage = 'Error creating company';

      if (error.response?.status === 409) {
        errorMessage = 'Company with this name or admin email already exists';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setCreatingCompany(false);
    }
  };

  const handleEditCompany = async (company: Company) => {
    setEditingCompany(company);
    setEditingCompanyLogo(null);
    setEditingCompanyLogoPreview(company.logo_url || null);
  };

  const handleUpdateCompany = async () => {
    if (!editingCompany) return;

    // Ensure loading state is always reset, even on early return
    try {
      setUpdatingCompany(true);
      console.log('🔄 Starting company update for:', editingCompany.id);

      // Upload new logo if provided - with timeout protection
      let logoUrl = editingCompany.logo_url;
      if (editingCompanyLogo) {
        try {
          console.log('📤 Uploading company logo...');
          const uploadStartTime = Date.now();
          
          // Add timeout wrapper
          const uploadWithTimeout = Promise.race([
            fastAPI.uploadCompanyLogo(editingCompanyLogo, editingCompany.id),
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                reject(new Error('Logo upload timed out. Please try again with a smaller file or check your connection.'));
              }, 35000); // 35 second timeout (slightly longer than API timeout)
            })
          ]);
          
          logoUrl = await uploadWithTimeout;
          const uploadTime = Date.now() - uploadStartTime;
          console.log(`✅ Logo uploaded successfully in ${uploadTime}ms:`, logoUrl);
        } catch (logoError: any) {
          console.error('⚠️ Error uploading logo:', logoError);
          const errorMessage = logoError?.message || 'Logo upload failed. Company will be updated without logo change.';
          toast({ 
            title: 'Warning', 
            description: errorMessage, 
            variant: 'default',
            duration: 5000
          });
          // Continue with existing logo URL - don't fail the whole update
          logoUrl = editingCompany.logo_url;
        }
      }

      // Update company in firms table - this should always complete
      console.log('💾 Updating company data...');
      const updateData = {
        name: editingCompany.name,
        subscription_plan: editingCompany.subscription_plan,
        is_active: editingCompany.is_active,
        max_users: editingCompany.max_users,
        admin_name: editingCompany.admin_name,
        admin_email: editingCompany.admin_email,
        admin_phone: editingCompany.admin_phone,
        admin_whatsapp: editingCompany.admin_whatsapp,
        logo_url: logoUrl,
        updated_at: new Date().toISOString()
      };
      
      try {
        await fastAPI.updateCompany(editingCompany.id, updateData);
        console.log('✅ Company data updated successfully');
      } catch (updateError: any) {
        console.error('❌ Error updating company data:', updateError);
        throw new Error(updateError?.response?.data?.message || updateError?.message || 'Failed to update company data');
      }

      // Update admin user if name or email changed (non-critical)
      if (editingCompany.admin_name || editingCompany.admin_email) {
        try {
          console.log('👤 Updating admin user...');
          const adminUser = users.find(user => user.firm_id === editingCompany.id && user.role === 'firm_admin');
          if (adminUser) {
            await fastAPI.updateUser(adminUser.id, {
              full_name: editingCompany.admin_name,
              email: editingCompany.admin_email
            });
            console.log('✅ Admin user updated successfully');
          }
        } catch (userError) {
          console.error('⚠️ Error updating admin user (non-critical):', userError);
          // Don't fail the whole operation if user update fails
        }
      }

      // Reset form state BEFORE refresh to avoid UI flicker
      setEditingCompany(null);
      setEditingCompanyLogo(null);
      setEditingCompanyLogoPreview(null);
      
      // Refresh data
      console.log('🔄 Refreshing company data...');
      try {
        await fetchData();
        console.log('✅ Data refreshed successfully');
      } catch (refreshError) {
        console.error('⚠️ Error refreshing data (non-critical):', refreshError);
        // Don't fail the whole operation if refresh fails
      }
      
      toast({ 
        title: 'Success', 
        description: 'Company updated successfully!', 
        duration: 3000
      });
      console.log('✅ Company update completed successfully');
    } catch (error: any) {
      console.error('❌ Error updating company:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Unknown error occurred';
      toast({ 
        title: 'Error', 
        description: `Error updating company: ${errorMessage}`, 
        variant: 'destructive',
        duration: 5000
      });
    } finally {
      // ALWAYS reset loading state, no matter what
      setUpdatingCompany(false);
      console.log('🏁 Update process finished - loading state reset');
    }
  };

  const handleDeleteCompany = async (companyId: string) => {
    if (window.confirm('⚠️ Are you sure you want to delete this company? This action cannot be undone and will delete all associated users.')) {
      try {
        setDeletingCompany(companyId);
        // Deleting company

        // First delete all users in this company
        await fastAPI.deleteUsersByFirm(companyId);

        // Then delete the company
        await fastAPI.deleteCompany(companyId);

        // Refresh data
        await fetchData();
        toast({ title: 'Success', description: 'Company deleted successfully!' });
      } catch (error) {
        toast({ title: 'Error', description: 'Error deleting company: ' + (error as Error).message, variant: 'destructive' });
      } finally {
        setDeletingCompany(null);
      }
    }
  };

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case 'premium':
        return 'bg-gradient-to-r from-purple-500 to-purple-600 text-white';
      case 'enterprise':
        return 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white';
      case 'basic':
        return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white';
      default:
        return 'bg-gradient-to-r from-gray-500 to-gray-600 text-white';
    }
  };

  const getStatusBadgeColor = (isActive: boolean) => {
    return isActive
      ? 'bg-blue-100 text-blue-800'
      : 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
          <p className="mt-2 text-sm text-gray-500">Please wait while we fetch your data...</p>
        </div>
      </div>
    );
  }

  const totalCompanies = companies.length;
  const totalUsers = users.length;
  const activeCompanies = companies.filter(c => c.is_active).length;

  // Dashboard rendering with data

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex-1">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold font-display bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
              Super Admin Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1 font-sans">Manage companies, users, and platform settings.</p>
          </div>

          {/* User Profile with Logout Dropdown */}
          <div className="flex items-center gap-2 sm:gap-3 ml-4 relative" ref={dropdownRef}>
            <div className="text-right">
              <p className="text-xs sm:text-sm font-medium font-display bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">Kirti Berekar</p>
              <p className="text-xs font-sans bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">Super Admin</p>
            </div>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs sm:text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              K
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
              <div 
                className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50 user-dropdown"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-2 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-900">Kirti Berekar</p>
                  <p className="text-xs text-gray-500">Super Admin</p>
                </div>
                <div
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // console.log('🔴 Logout clicked');
                    setShowDropdown(false);
                    await handleLogout();
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="logout-button w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer select-none"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
            <CardContent className="p-4 sm:p-5 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium uppercase tracking-wide font-sans">Total Companies</p>
                  <p className="text-3xl sm:text-4xl font-bold text-white mt-2 font-display">{totalCompanies}</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <Grid className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
            <CardContent className="p-4 sm:p-5 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium uppercase tracking-wide font-sans">Total Users</p>
                  <p className="text-3xl sm:text-4xl font-bold text-white mt-2 font-display">{totalUsers}</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <Users className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500 to-purple-600 text-white">
            <CardContent className="p-4 sm:p-5 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium uppercase tracking-wide font-sans">Active Companies</p>
                  <p className="text-3xl sm:text-4xl font-bold text-white mt-2 font-display">{activeCompanies}</p>
                </div>
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <Circle className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create Company Button */}
        <div className="mb-8">
          <Button
            onClick={() => setShowCreateCompany(true)}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
            disabled={loading}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Company
          </Button>
        </div>

        {/* Companies Overview */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2 font-display">Companies Overview</h2>
          <p className="text-gray-600 mb-6 font-sans">Manage all companies. Users are managed by their respective company admins.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {companies.map((company) => (
              <Card key={company.id} className="overflow-hidden">
                {/* Top Section - Blue to Purple Gradient */}
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-4 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Grid className="w-5 h-5" />
                      <h3 className="font-bold text-lg font-display truncate">{company.name}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditCompany(company)}
                        className="p-1 hover:bg-white/20 rounded transition-colors"
                        disabled={updatingCompany || deletingCompany}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCompany(company.id)}
                        className="p-1 hover:bg-white/20 rounded transition-colors"
                        disabled={updatingCompany || deletingCompany}
                      >
                        {deletingCompany === company.id ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom Section - Company Details */}
                <div className="p-4 bg-white">
                  <div className="flex items-center gap-2 mb-3">
                    <Building className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-700 font-sans">Company Details</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Plan:</span>
                      <Badge className={getPlanBadgeColor(company.subscription_plan)}>
                        {company.subscription_plan.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Status:</span>
                      <Badge className={getStatusBadgeColor(company.is_active)}>
                        {company.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Max Users:</span>
                      <span className="text-sm text-gray-900">{company.max_users || 5}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Created:</span>
                      <span className="text-sm text-gray-900">{formatDate(company.created_at)}</span>
                    </div>
                  </div>

                  {/* Company Admin Section */}
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center gap-2 mb-3">
                      <User className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-700 font-sans">Company Admin</span>
                    </div>

                    <div className="space-y-2">
                      {company.admin_name ? (
                        <>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                              {company.admin_name ? company.admin_name.charAt(0).toUpperCase() : 'A'}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 font-display">{company.admin_name}</p>
                              <p className="text-xs text-gray-500 font-sans">{company.admin_email}</p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-2">
                          <p className="text-sm text-gray-500">No admin user found</p>
                          <p className="text-xs text-gray-400">Admin will be created when company is set up</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Phone:</span>
                        <span className="text-sm text-gray-900">{company.admin_phone || 'Not provided'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">WhatsApp:</span>
                        <span className="text-sm text-gray-900">{company.admin_whatsapp || 'Not provided'}</span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{company.user_count}/{company.max_users || 5} Users</span>
                        <span className="text-gray-600">{company.admin_name ? '1' : '0'} Admins</span>
                        <span className="text-gray-600">{Math.max(0, company.user_count - (company.admin_name ? 1 : 0))} Members</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Create Company Modal */}
      {showCreateCompany && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Create New Company</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={newCompany.name}
                  onChange={(e) => setNewCompany(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter company name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Plan</label>
                <select
                  value={newCompany.subscription_plan}
                  onChange={(e) => setNewCompany(prev => ({ ...prev, subscription_plan: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="basic">Basic</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={newCompany.is_active ? 'true' : 'false'}
                  onChange={(e) => setNewCompany(prev => ({ ...prev, is_active: e.target.value === 'true' }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Users</label>
                <input
                  type="number"
                  value={newCompany.max_users}
                  onChange={(e) => setNewCompany(prev => ({ ...prev, max_users: parseInt(e.target.value) || 5 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="5"
                  min="1"
                  max="100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Name</label>
                <input
                  type="text"
                  value={newCompany.admin_name}
                  onChange={(e) => setNewCompany(prev => ({ ...prev, admin_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter admin name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                <input
                  type="email"
                  value={newCompany.admin_email}
                  onChange={(e) => setNewCompany(prev => ({ ...prev, admin_email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter admin email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Phone (Optional)</label>
                <input
                  type="tel"
                  value={newCompany.admin_phone}
                  onChange={(e) => setNewCompany(prev => ({ ...prev, admin_phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter admin phone"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin WhatsApp (Optional)</label>
                <input
                  type="tel"
                  value={newCompany.admin_whatsapp}
                  onChange={(e) => setNewCompany(prev => ({ ...prev, admin_whatsapp: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter admin WhatsApp"
                />
              </div>

              {/* Company Logo Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo (Optional)</label>
                <div className="space-y-3">
                  {newCompanyLogoPreview ? (
                    <div className="relative">
                      <div className="bg-white border-2 border-gray-200 rounded-lg p-4 flex items-center justify-center min-h-[120px]">
                        {newCompanyLogoPreview.toLowerCase().endsWith('.pdf') ? (
                          <div className="flex flex-col items-center">
                            <svg className="w-12 h-12 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                            </svg>
                            <span className="text-xs text-gray-600 mt-2">PDF Logo</span>
                          </div>
                        ) : (
                          <img 
                            src={newCompanyLogoPreview} 
                            alt="Logo preview" 
                            className="max-w-full max-h-[100px] object-contain"
                            style={{ width: 'auto', height: 'auto' }}
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewCompanyLogo(null);
                          setNewCompanyLogoPreview(null);
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-gray-400" />
                        <p className="mb-2 text-sm text-gray-500">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">PNG, JPG, PDF (MAX. 5MB)</p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            // Validate file size (5MB max)
                            if (file.size > 5 * 1024 * 1024) {
                              toast({ 
                                title: 'Error', 
                                description: 'File size too large. Maximum size is 5MB.', 
                                variant: 'destructive' 
                              });
                              return;
                            }
                            setNewCompanyLogo(file);
                            // Create preview
                            if (file.type.startsWith('image/')) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setNewCompanyLogoPreview(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            } else if (file.type === 'application/pdf') {
                              setNewCompanyLogoPreview('pdf');
                            }
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={handleCreateCompany}
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white flex-1"
                disabled={!newCompany.name || !newCompany.admin_name || !newCompany.admin_email || creatingCompany}
              >
                {creatingCompany ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Creating...
                  </>
                ) : (
                  'Create Company'
                )}
              </Button>
              <Button
                onClick={() => setShowCreateCompany(false)}
                variant="outline"
                className="flex-1"
                disabled={creatingCompany}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Company Modal */}
      {editingCompany && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Edit Company</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={editingCompany.name}
                  onChange={(e) => setEditingCompany(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Plan</label>
                <select
                  value={editingCompany.subscription_plan}
                  onChange={(e) => setEditingCompany(prev => prev ? { ...prev, subscription_plan: e.target.value as any } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="basic">Basic</option>
                  <option value="premium">Premium</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={editingCompany.is_active ? 'active' : 'inactive'}
                  onChange={(e) => setEditingCompany(prev => prev ? { ...prev, is_active: e.target.value === 'active' } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Users</label>
                <input
                  type="number"
                  value={editingCompany.max_users || 5}
                  onChange={(e) => setEditingCompany(prev => prev ? { ...prev, max_users: parseInt(e.target.value) || 5 } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Name</label>
                <input
                  type="text"
                  value={editingCompany.admin_name || ''}
                  onChange={(e) => setEditingCompany(prev => prev ? { ...prev, admin_name: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                <input
                  type="email"
                  value={editingCompany.admin_email || ''}
                  onChange={(e) => setEditingCompany(prev => prev ? { ...prev, admin_email: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin Phone</label>
                <input
                  type="tel"
                  value={editingCompany.admin_phone || ''}
                  onChange={(e) => setEditingCompany(prev => prev ? { ...prev, admin_phone: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin WhatsApp</label>
                <input
                  type="tel"
                  value={editingCompany.admin_whatsapp || ''}
                  onChange={(e) => setEditingCompany(prev => prev ? { ...prev, admin_whatsapp: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Company Logo Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Company Logo</label>
                <div className="space-y-3">
                  {(editingCompanyLogoPreview || editingCompany?.logo_url) ? (
                    <div className="relative">
                      <div className="bg-white border-2 border-gray-200 rounded-lg p-4 flex items-center justify-center min-h-[120px]">
                        {(editingCompanyLogoPreview && editingCompanyLogoPreview !== 'pdf' && !editingCompanyLogoPreview.startsWith('http')) ? (
                          // New logo preview (local file)
                          editingCompanyLogoPreview.toLowerCase().endsWith('.pdf') ? (
                            <div className="flex flex-col items-center">
                              <svg className="w-12 h-12 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                              </svg>
                              <span className="text-xs text-gray-600 mt-2">PDF Logo</span>
                            </div>
                          ) : (
                            <img 
                              src={editingCompanyLogoPreview} 
                              alt="Logo preview" 
                              className="max-w-full max-h-[100px] object-contain"
                              style={{ width: 'auto', height: 'auto' }}
                            />
                          )
                        ) : (
                          // Existing logo from database
                          editingCompany?.logo_url && (
                            editingCompany.logo_url.toLowerCase().endsWith('.pdf') ? (
                              <div className="flex flex-col items-center">
                                <svg className="w-12 h-12 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-xs text-gray-600 mt-2">PDF Logo</span>
                              </div>
                            ) : (
                              <img 
                                src={editingCompany.logo_url} 
                                alt="Company Logo" 
                                className="max-w-full max-h-[100px] object-contain"
                                style={{ width: 'auto', height: 'auto' }}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )
                          )
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCompanyLogo(null);
                          setEditingCompanyLogoPreview(null);
                          if (editingCompany) {
                            setEditingCompany({ ...editingCompany, logo_url: null });
                          }
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-gray-400" />
                        <p className="mb-2 text-sm text-gray-500">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">PNG, JPG, PDF (MAX. 5MB)</p>
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            // Validate file size (5MB max)
                            if (file.size > 5 * 1024 * 1024) {
                              toast({ 
                                title: 'Error', 
                                description: 'File size too large. Maximum size is 5MB.', 
                                variant: 'destructive' 
                              });
                              return;
                            }
                            setEditingCompanyLogo(file);
                            // Create preview
                            if (file.type.startsWith('image/')) {
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                setEditingCompanyLogoPreview(reader.result as string);
                              };
                              reader.readAsDataURL(file);
                            } else if (file.type === 'application/pdf') {
                              setEditingCompanyLogoPreview('pdf');
                            }
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={handleUpdateCompany}
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white flex-1"
                disabled={updatingCompany}
              >
                {updatingCompany ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Updating...
                  </>
                ) : (
                  'Update Company'
                )}
              </Button>
              <Button
                onClick={() => {
                  setEditingCompany(null);
                  setEditingCompanyLogo(null);
                  setEditingCompanyLogoPreview(null);
                }}
                variant="outline"
                className="flex-1"
                disabled={updatingCompany}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminDashboard;
