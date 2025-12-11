import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ProjectHeaderProps {
  loading: boolean;
  userName: string;
  userRole: string;
  firmName?: string;
  firmLogo?: string | null;
}

// Header component with user profile and dashboard title
const ProjectHeader: React.FC<ProjectHeaderProps> = ({ loading, userName, userRole, firmName, firmLogo }) => {
  const { signOut } = useAuth();
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
      console.log('🚪 Logout initiated...');
      
      // IMMEDIATE: Clear ALL storage first (don't wait for async)
      localStorage.clear();
      sessionStorage.clear();
      
      // IMMEDIATE: Force redirect right away (don't wait for signOut)
      console.log('✅ Clearing storage and redirecting immediately...');
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

  return (
    <div className="flex items-center justify-between mb-6 sm:mb-8">
      <div className="flex-1 flex items-center gap-2 sm:gap-3">
        {/* Company Logo */}
        {firmLogo ? (
          <div className="flex-shrink-0 bg-white rounded-lg border border-gray-200 p-1.5 sm:p-2 shadow-sm flex items-center justify-center min-w-[48px] min-h-[48px] sm:min-w-[56px] sm:min-h-[56px] lg:min-w-[64px] lg:min-h-[64px] max-w-[200px] max-h-[64px] sm:max-h-[72px] lg:max-h-[80px]">
            {firmLogo.toLowerCase().endsWith('.pdf') ? (
              <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12">
                <svg className="w-full h-full text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
              </div>
            ) : (
              <img 
                src={firmLogo} 
                alt={firmName || 'Company Logo'} 
                className="max-w-[180px] max-h-[44px] sm:max-w-[190px] sm:max-h-[52px] lg:max-w-[200px] lg:max-h-[60px] w-auto h-auto object-contain"
                style={{ 
                  maxWidth: '100%', 
                  height: 'auto',
                  width: 'auto',
                  display: 'block'
                }}
                onError={(e) => {
                  // Hide image if it fails to load
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
          </div>
        ) : firmName ? (
          <div className="flex-shrink-0 w-[48px] h-[48px] sm:w-[56px] sm:h-[56px] lg:w-[64px] lg:h-[64px] bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
            <span className="text-white text-base sm:text-lg lg:text-xl font-bold">
              {firmName.charAt(0).toUpperCase()}
            </span>
          </div>
        ) : null}
        
        <div className="flex-1 min-w-0">
          {firmName ? (
            <>
              <h1 className="text-base sm:text-lg lg:text-xl font-bold font-display bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                {firmName}
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-1 font-sans">Project Management Dashboard</p>
            </>
          ) : (
            <>
              <h1 className="text-base sm:text-lg lg:text-xl font-bold font-display bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                Project Management Dashboard
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-1 font-sans">Monitor project progress, equipment status, and key activities at a glance</p>
            </>
          )}
        </div>
      </div>
      
      {/* User Profile with Logout Dropdown */}
      <div className="flex items-center gap-2 sm:gap-3 ml-4 relative" ref={dropdownRef}>
        {loading ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-full animate-pulse"></div>
            <div className="text-right">
              <div className="w-16 h-3 bg-gray-200 rounded animate-pulse mb-1"></div>
              <div className="w-12 h-2 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        ) : (
          <>
            <div className="text-right">
              <p className="text-xs sm:text-sm font-medium font-display bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                {userName || 'User'}
              </p>
              <p className="text-xs font-sans bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent capitalize">
                {userRole ? userRole.replace('_', ' ') : 'User'}
              </p>
            </div>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs sm:text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {userName ? userName.charAt(0).toUpperCase() : 'U'}
            </button>

            {/* Dropdown Menu */}
            {showDropdown && (
              <div 
                className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50 user-dropdown"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-2 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-900">{userName || 'User'}</p>
                  <p className="text-xs text-gray-500 capitalize">{userRole ? userRole.replace('_', ' ') : 'User'}</p>
                </div>
                <div
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔴 Logout clicked');
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
          </>
        )}
      </div>
    </div>
  );
};

export default ProjectHeader;
