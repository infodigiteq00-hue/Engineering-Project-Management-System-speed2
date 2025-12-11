import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fastAPI } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const SignUp = () => {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(""); // Clear error when user types
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long");
      setLoading(false);
      return;
    }

    try {
      // console.log('Starting sign up process...');
      
      // Create user in Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
          },
          emailRedirectTo: `${window.location.origin}/login`
        }
      });

      // console.log('Auth signup result:', { data, error: signUpError });

      if (signUpError) {
        console.error('Auth signup error:', signUpError);
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        // console.log('User created in auth, creating profile...');
        
        // Create user record in our users table
        // console.log('Attempting to insert user profile with data:', {
        //   id: data.user.id,
        //   email: formData.email,
        //   full_name: formData.fullName,
        //   role: 'viewer',
        //   firm_id: null,
        //   is_active: true
        // });

        // 🆕 NEW: Check invites table FIRST for pending invitations
        // console.log('🔍 Step 1: Checking invites table for pending invitation...');
        let inviteData = null;
        try {
          inviteData = await fastAPI.getInviteByEmail(formData.email);
          // console.log('🔍 Invite check result:', inviteData);
        } catch (inviteError) {
          console.log('⚠️ Error checking invites, will use fallback logic:', inviteError);
        }

        // If invite found, use that data and skip other checks
        if (inviteData) {
          // console.log('✅ Found valid invitation! Using role from invite:', inviteData.role);
          
          const userRole = inviteData.role;
          const firmId = inviteData.firm_id;
          const projectId = inviteData.project_id;
          const assignedBy = inviteData.invited_by;

          // Create user with role from invite
          // console.log('🆕 Creating new user with invite data...');
          const { data: profileData, error: profileError } = await supabase
            .from('users')
            .insert([
              {
                id: data.user.id,
                email: formData.email,
                full_name: formData.fullName,
                role: userRole,
                firm_id: firmId,
                project_id: projectId,
                assigned_by: assignedBy,
                is_active: true
              }
            ])
            .select();

          if (profileError) {
            console.error('❌ Error creating user profile:', profileError);
            setError(`Profile creation failed: ${profileError.message}`);
            setLoading(false);
            return;
          }

          // console.log('✅ User created successfully with invite role:', profileData);

          // Update project_members table if project_id exists
          if (projectId) {
            try {
              // console.log('🔗 Linking user to project_members...');
              const { error: linkError } = await supabase
                .from('project_members')
                .update({ user_id: data.user.id })
                .eq('email', formData.email)
                .eq('project_id', projectId);
              
              if (linkError) {
                console.log('⚠️ Could not link to project_members:', linkError);
              } else {
                console.log('✅ User linked to project_members successfully');
              }
            } catch (linkError) {
              console.log('⚠️ Error linking to project_members:', linkError);
            }
          }

          // Mark invite as accepted
          try {
            await fastAPI.updateInviteStatus(inviteData.id, 'accepted');
            // console.log('✅ Invite marked as accepted');
          } catch (updateError) {
            console.log('⚠️ Could not update invite status:', updateError);
          }

          // Show success message and redirect
          // console.log('Profile creation/update completed successfully!');
          // console.log('Sign up successful!');
          setLoading(false);
          
          const roleMessage = userRole 
            ? `🎯 Role: ${userRole.replace('_', ' ')}`
            : '⏳ Please wait for Super Admin to assign your role and company access.';
            
          toast({ title: 'Success', description: `Account created successfully!\n\n📧 Please check your email (${formData.email}) and click the confirmation link to verify your account.\n\n🔗 After email confirmation, you can login with your credentials.\n\n${roleMessage}` });
          
          // console.log('Redirecting to login...');
          window.location.href = '/login';
          return; // Exit here, don't run existing logic
        }

        // 🔄 EXISTING LOGIC: If no invite found, proceed with existing checks
        // console.log('ℹ️ No invite found, checking existing user/project_members tables...');
        
        // Check if user was invited by checking project_members table for existing role assignment
        // console.log('🔍 Checking if user was invited and has assigned role...');
        // console.log('🔍 Searching for email:', formData.email);
        
        // First check users table
        const { data: existingUserData, error: existingUserError } = await supabase
          .from('users')
          .select('id, role, firm_id, project_id, assigned_by')
          .eq('email', formData.email)
          .single();
          
        // Then check project_members table for invited users
        const { data: projectMemberData, error: projectMemberError } = await supabase
          .from('project_members')
          .select('role, project_id, user_id')
          .eq('email', formData.email)
          .single();
          
        // console.log('🔍 Existing user query result:', { existingUserData, existingUserError });
        // console.log('🔍 Project member query result:', { projectMemberData, projectMemberError });

        let userRole = 'viewer'; // Default role for non-invited users
        let firmId = null;
        let projectId = null;
        let assignedBy = null;

        if (existingUserData && !existingUserError) {
          // console.log('✅ User was invited! Found existing role assignment:', existingUserData);
          userRole = existingUserData.role;
          firmId = existingUserData.firm_id;
          projectId = existingUserData.project_id;
          assignedBy = existingUserData.assigned_by;
        } else if (projectMemberData && !projectMemberError) {
          // console.log('✅ User was invited as project member! Found role assignment:', projectMemberData);
          userRole = projectMemberData.role;
          projectId = projectMemberData.project_id;
          // Get firm_id from project
          const { data: projectData } = await supabase
            .from('projects')
            .select('firm_id')
            .eq('id', projectMemberData.project_id)
            .single();
          firmId = projectData?.firm_id || null;
        } else {
          console.log('ℹ️ User was not invited, assigning default viewer role');
        }

        // Update or create user with proper role assignment
        if (existingUserData && !existingUserError) {
          // console.log('✅ User already exists with role assignment, updating with auth ID...');
          // Update existing user with auth ID
          const { data: updateData, error: updateError } = await supabase
            .from('users')
            .update({
              id: data.user.id, // Update with auth user ID
              full_name: formData.fullName,
              is_active: true
            })
            .eq('email', formData.email)
            .select();

          if (updateError) {
            console.error('❌ Error updating user:', updateError);
            setError(`Failed to update user profile: ${updateError.message}`);
            setLoading(false);
            return;
          }

          // console.log('✅ User updated successfully with auth ID:', updateData);
        } else {
          console.log('🆕 Creating new user profile...');
          // Create new user
          const { data: profileData, error: profileError } = await supabase
            .from('users')
            .insert([
              {
                id: data.user.id,
                email: formData.email,
                full_name: formData.fullName,
                role: userRole,
                firm_id: firmId,
                project_id: projectId,
                assigned_by: assignedBy,
                is_active: true
              }
            ])
            .select();

          if (profileError) {
            console.error('❌ Error creating user profile:', profileError);
            setError(`Profile creation failed: ${profileError.message}`);
            setLoading(false);
            return;
          }

          // console.log('✅ User created successfully:', profileData);
        }

        // console.log('Profile creation/update completed successfully!');

        // console.log('Sign up successful!');
        
        // Reset loading state
        setLoading(false);
        
        // Show success message with email confirmation
        const roleMessage = userRole 
          ? `🎯 Role: ${userRole.replace('_', ' ')}`
          : '⏳ Please wait for Super Admin to assign your role and company access.';
          
        toast({ title: 'Success', description: `Account created successfully!\n\n📧 Please check your email (${formData.email}) and click the confirmation link to verify your account.\n\n🔗 After email confirmation, you can login with your credentials.\n\n${roleMessage}` });
        
        // Force redirect to login
        // console.log('Redirecting to login...');
        window.location.href = '/login';
      } else {
        console.error('No user data returned from auth signup');
        setError("Failed to create user account");
        setLoading(false);
      }
    } catch (err) {
      console.error('Sign up error:', err);
      setError("An error occurred during sign up");
      setLoading(false);
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
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">Create account</h2>
            <p className="text-sm sm:text-base text-gray-600">Set up your account to get started</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            {/* Full Name */}
            <div>
              <Label htmlFor="fullName" className="text-xs sm:text-sm font-medium text-gray-700">
                Full Name
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Enter your full name"
                value={formData.fullName}
                onChange={(e) => handleInputChange('fullName', e.target.value)}
                required
                className="mt-1"
              />
            </div>

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
                  placeholder="Create a password"
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

            {/* Confirm Password */}
            <div>
              <Label htmlFor="confirmPassword" className="text-xs sm:text-sm font-medium text-gray-700">
                Confirm Password
              </Label>
              <div className="relative mt-1">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff size={14} className="sm:w-4 sm:h-4" /> : <Eye size={14} className="sm:w-4 sm:h-4" />}
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
              {loading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          {/* Sign In Link */}
          <div className="text-center mt-4 sm:mt-6">
            <p className="text-sm sm:text-base text-gray-600">
              Already have an account?{" "}
              <button
                onClick={() => navigate('/login')}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Sign in
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUp;
