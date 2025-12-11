import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const Login = () => {
  // console.log('🔍 Login component loaded!');
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const isSubmittingRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear stale auth data on component mount - MORE AGGRESSIVE CLEANUP
  useEffect(() => {
    const clearStaleAuthData = async () => {
      try {
        // console.log('🧹 AGGRESSIVE: Clearing ALL stale auth data...');
        
        // 1. Force sign out from Supabase (clears session)
        try {
          await supabase.auth.signOut();
          // console.log('✅ Supabase session cleared');
        } catch (signOutError) {
          console.warn('⚠️ SignOut warning (non-fatal):', signOutError);
          // Continue with localStorage cleanup even if signOut fails
        }
        
        // 2. Clear ALL localStorage items (Supabase stores tokens here)
        const allKeys = Object.keys(localStorage);
        const supabaseKeys = allKeys.filter(key => 
          key.startsWith('sb-') || 
          key.includes('supabase') ||
          key.includes('auth') ||
          key === 'userData' || 
          key === 'userRole' || 
          key === 'userName' || 
          key === 'userEmail' || 
          key === 'firmId' || 
          key === 'userId' ||
          key === 'sb-access-token' ||
          key === 'sb-refresh-token'
        );
        
        supabaseKeys.forEach(key => {
          // console.log('🗑️ Removing localStorage key:', key);
          localStorage.removeItem(key);
        });
        
        // 3. Clear ALL sessionStorage
        sessionStorage.clear();
        // console.log('✅ SessionStorage cleared');
        
        // 4. Force Supabase to refresh its internal state
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            console.warn('⚠️ Session still exists after cleanup, forcing removal...');
            await supabase.auth.signOut();
            // Clear localStorage again
            supabaseKeys.forEach(key => localStorage.removeItem(key));
            // Wait for cleanup
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (e) {
          console.warn('⚠️ Session check failed (non-fatal):', e);
        }
        
        // console.log('✅ ALL stale auth data cleared');
      } catch (error) {
        console.error('❌ Error clearing stale auth data:', error);
        // Even if cleanup fails, clear localStorage manually
        try {
          const allKeys = Object.keys(localStorage);
          allKeys.filter(key => key.startsWith('sb-') || key.includes('auth')).forEach(key => {
            localStorage.removeItem(key);
          });
        } catch (e) {
          console.error('❌ Failed to clear localStorage:', e);
        }
      }
    };

    clearStaleAuthData();
    
    // Cleanup timeout on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(""); // Clear error when user types
  };

  const redirectBasedOnRole = (role: string) => {
    // console.log('🎯 Redirecting based on role:', role);
    
    // Small delay to ensure alert is shown
    setTimeout(() => {
      switch (role) {
        case 'super_admin':
          // console.log('🚀 Redirecting to super admin dashboard');
          navigate('/super-admin');
          break;
        case 'firm_admin':
          // console.log('🏢 Redirecting to company dashboard');
          navigate('/company-dashboard');
          break;
        case 'project_manager':
          // console.log('📋 Redirecting to company dashboard');
          navigate('/company-dashboard');
          break;
        case 'editor':
          // console.log('🔧 Redirecting to company dashboard');
          navigate('/company-dashboard');
          break;
        case 'viewer':
          // console.log('👁️ Redirecting to company dashboard');
          navigate('/company-dashboard');
          break;
        case 'vdcr_manager':
          // console.log('📋 Redirecting to company dashboard');
          navigate('/company-dashboard');
          break;
        default:
          // console.log('❌ Unknown role, redirecting to no permission');
          navigate('/no-permission');
          break;
      }
    }, 500); // 0.5 second delay
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent multiple simultaneous submissions
    if (isSubmittingRef.current) {
      // console.log('⚠️ Login already in progress, ignoring duplicate submission');
      return;
    }
    
    // console.log('🚀 Form submitted!');
    isSubmittingRef.current = true;
    setLoading(true);
    setError("");

    // Set timeout protection (30 seconds)
    timeoutRef.current = setTimeout(() => {
      if (isSubmittingRef.current) {
        console.error('⏱️ Login timeout - operation took too long');
        setError("Login timeout: The request took too long. Please check your connection and try again.");
        setLoading(false);
        isSubmittingRef.current = false;
      }
    }, 30000); // 30 seconds timeout

    try {
      // AGGRESSIVE session cleanup before new login
      // console.log('🧹 AGGRESSIVE: Cleaning up any existing sessions before login...');
      try {
        // Step 1: Clear localStorage first (remove tokens before signOut)
        const allKeys = Object.keys(localStorage);
        allKeys.filter(key => key.startsWith('sb-') || key.includes('supabase')).forEach(key => {
          localStorage.removeItem(key);
        });
        
        // Step 2: Force sign out (try both methods)
        try {
          await supabase.auth.signOut();
        } catch (signOutErr) {
          console.warn('⚠️ Standard signOut failed, trying alternate method:', signOutErr);
        }
        
        // Step 3: Clear sessionStorage
        sessionStorage.clear();
        
        // Step 4: Verify and force clear again if needed
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.warn('⚠️ Session still exists, forcing removal again...');
          // Clear localStorage again
          const remainingKeys = Object.keys(localStorage);
          remainingKeys.filter(key => key.startsWith('sb-') || key.includes('supabase')).forEach(key => {
            localStorage.removeItem(key);
          });
          // Try signOut again
          await supabase.auth.signOut();
          // Wait a bit for async cleanup
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Step 5: Final verification
        const { data: { session: finalSession } } = await supabase.auth.getSession();
        if (finalSession) {
          console.warn('⚠️ Session persists after cleanup, clearing localStorage one more time...');
          const finalKeys = Object.keys(localStorage);
          finalKeys.filter(key => key.startsWith('sb-')).forEach(key => {
            localStorage.removeItem(key);
          });
        }
        
        // console.log('✅ Existing session cleared completely');
        
        // Small delay to ensure cleanup completes
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (cleanupError) {
        console.warn('⚠️ Session cleanup warning (non-fatal):', cleanupError);
        // Manually clear localStorage anyway as fallback
        try {
          const allKeys = Object.keys(localStorage);
          allKeys.filter(key => key.startsWith('sb-')).forEach(key => {
            localStorage.removeItem(key);
          });
          sessionStorage.clear();
        } catch (e) {
          console.warn('⚠️ Manual cleanup failed:', e);
        }
      }
      // console.log('🔍 Attempting to sign in with:', formData.email);
      // console.log('🔍 Supabase client:', supabase);
      // console.log('🔍 Supabase auth:', supabase.auth);
      
      // Sign in with Supabase first
      // console.log('🔍 Calling supabase.auth.signInWithPassword...');
      
      let authData: any = null;
      let authError: any = null;

      try {
        // console.log('🔍 Waiting for authentication response...');
        
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        });
        
        authData = data;
        authError = error;
        
        // console.log('🔍 Sign in result:', { authData, authError });
        // console.log('🔍 Data user:', authData?.user);
        // console.log('🔍 Data session:', authData?.session);
        
        if (authError) {
          console.error('🚨 Sign in error:', authError);
          setError(`Login failed: ${authError.message}. Please check your credentials or create an account first.`);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setLoading(false);
          isSubmittingRef.current = false;
          return;
        }

        if (!authData || !authData.user) {
          console.error('🚨 No user data returned');
          setError("No user data returned. Please create an account first by going to the Sign Up page.");
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          setLoading(false);
          isSubmittingRef.current = false;
          return;
        }

        // console.log('✅ User authenticated successfully:', authData.user.id);
      } catch (error) {
        console.error('🚨 Login error:', error);
        setError("Login failed. Please check your credentials and try again.");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      // Get user role from our users table with proper error handling
      // console.log('🔍 Querying users table for role...');
      // console.log('🔍 User ID from auth:', authData.user.id);
      // console.log('🔍 User email from auth:', authData.user.email);
      
      let userData = null;
      let userError = null;

      try {
        // First try to find user by email (more reliable)
        // console.log('🔍 Searching user by email...');
        const { data: userByEmail, error: emailError } = await supabase
          .from('users')
          .select('id, role, full_name, firm_id, email, is_active')
          .eq('email', authData.user.email)
          .single();

        if (userByEmail && !emailError) {
          // console.log('✅ User found by email:', userByEmail);
          userData = userByEmail;
        } else {
          // console.log('🔍 User not found by email, trying by ID...');
          // Try by ID as fallback
          const { data: userById, error: idError } = await supabase
            .from('users')
            .select('id, role, full_name, firm_id, email, is_active')
            .eq('id', authData.user.id)
            .single();

          if (userById && !idError) {
            // console.log('✅ User found by ID:', userById);
            userData = userById;
          } else {
            // console.log('🔍 User not found in database, creating new record...');
            // Create user record with no role - no dashboard access
            const { data: newUser, error: createError } = await supabase
              .from('users')
              .insert([
                {
                  id: authData.user.id,
                  email: authData.user.email,
                  full_name: authData.user.user_metadata?.full_name || 'User',
                  role: null, // No role = No access
                  is_active: true
                }
              ])
              .select()
              .single();

            if (newUser && !createError) {
              // console.log('✅ User record created successfully:', newUser);
              userData = newUser;
            } else {
              console.error('🚨 Error creating user record:', createError);
              userError = createError;
            }
          }
        }
      } catch (error) {
        console.error('🚨 Database query error:', error);
        userError = error;
      }

      if (userError) {
        console.error('🚨 Error with user data:', userError);
        setError(`Database error: ${userError.message}. Please try again or contact support.`);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      if (!userData) {
        console.error('🚨 No user data available');
        setError("Unable to retrieve user information. Please contact your administrator.");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      if (!userData.is_active) {
        console.error('🚨 User account is inactive');
        setError("Your account has been deactivated. Please contact your administrator.");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLoading(false);
        isSubmittingRef.current = false;
        return;
      }

      // console.log('✅ Login successful, user data:', userData);
      
      // Clear timeout since we succeeded
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      // Store complete user info in localStorage for role-based routing and dashboard display
      const userInfo = {
        id: authData.user.id,
        email: userData.email,
        full_name: userData.full_name,
        role: userData.role,
        firm_id: userData.firm_id
      };
      
      // console.log('🎯 User role for redirect:', userData.role);
      // console.log('🎯 Firm ID:', userData.firm_id);
      
      // Store in localStorage with error handling
      try {
        localStorage.setItem('userData', JSON.stringify(userInfo));
        localStorage.setItem('userRole', userData.role);
        localStorage.setItem('userName', userData.full_name);
        localStorage.setItem('userEmail', userData.email);
        localStorage.setItem('firmId', userData.firm_id || '');
        localStorage.setItem('userId', authData.user.id);
      } catch (storageError) {
        console.error('⚠️ localStorage error (non-fatal):', storageError);
        // Continue with redirect even if localStorage fails
      }

      // Show success message
      // console.log('✅ Login successful! Redirecting to dashboard...');
      // console.log(`✅ Welcome back, ${userData.full_name}! Role: ${userData.role}`);
      
      // Show success toast
      toast({ title: 'Success', description: `Login successful!\n\n👤 Welcome back, ${userData.full_name}!\n🎯 Role: ${userData.role.replace('_', ' ')}\n🚀 Redirecting to dashboard...` });
      
      // Reset loading state before redirect
      setLoading(false);
      isSubmittingRef.current = false;
      
      // Redirect with error handling
      try {
        redirectBasedOnRole(userData.role);
      } catch (redirectError) {
        console.error('🚨 Redirect error:', redirectError);
        // If redirect fails, force navigation
        window.location.href = userData.role === 'super_admin' ? '/super-admin' : '/company-dashboard';
      }

    } catch (err) {
      console.error('🚨 Error during sign in:', err);
      setError("An error occurred during sign in. Please try again.");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Equipment Overview</h1>
          <p className="text-sm sm:text-base text-gray-600">Multi-tenant project management platform</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8">
          <div className="text-center mb-4 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">Welcome back</h2>
            <p className="text-sm sm:text-base text-gray-600">Enter your credentials to access your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {/* Email */}
            <div>
              <Label htmlFor="email" className="text-xs sm:text-sm font-medium text-gray-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                required
                className="mt-1"
              />
            </div>

            {/* Password */}
            <div>
              <Label htmlFor="password" className="text-xs sm:text-sm font-medium text-gray-700">
                Password
              </Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={14} className="sm:w-4 sm:h-4" /> : <Eye size={14} className="sm:w-4 sm:h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-red-600 text-xs sm:text-sm bg-red-50 p-2 sm:p-3 rounded-md">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 sm:px-4 rounded-md font-medium transition-colors text-sm"
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>

            {/* Forgot password link */}
            <div className="text-right">
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="text-blue-600 hover:text-blue-700 text-xs sm:text-sm font-medium"
              >
                Forgot password?
              </button>
            </div>
          </form>

          {/* Sign Up Link */}
          <div className="text-center mt-4 sm:mt-6">
            <p className="text-sm sm:text-base text-gray-600">
              Don't have an account?{" "}
              <button
                onClick={() => navigate('/signup')}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Sign up
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
