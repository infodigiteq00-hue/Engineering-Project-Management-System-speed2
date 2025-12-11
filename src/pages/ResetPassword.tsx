import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const verifyToken = async () => {
      setError(null);
      try {
        // First, check if there's already an error in the URL hash (Supabase might have set it)
        const initialHash = window.location.hash;
        if (initialHash && initialHash.includes('error=')) {
          const hashParams = new URLSearchParams(initialHash.substring(1));
          const hashError = hashParams.get('error');
          const hashErrorCode = hashParams.get('error_code');
          const hashErrorDesc = hashParams.get('error_description');
          
          if (hashError || hashErrorCode) {
            console.error('❌ Error detected in URL hash on page load:', { 
              error: hashError, 
              error_code: hashErrorCode,
              description: hashErrorDesc 
            });
            
            if (hashErrorCode === 'otp_expired' || hashError === 'otp_expired' || hashErrorDesc?.includes('expired')) {
              setError('This password reset link has expired. Please request a new password reset link from the forgot password page.');
            } else {
              setError(hashErrorDesc || hashError || 'The reset link is invalid or has expired.');
            }
            return;
          }
        }

        const url = new URL(window.location.href);
        const code = url.searchParams.get('code'); // Code from Supabase redirect (preferred)
        const token = url.searchParams.get('token'); // Fallback for token parameter
        const tokenHash = url.searchParams.get('token_hash'); // Token hash from email template
        const type = url.searchParams.get('type');
        const email = decodeURIComponent(url.searchParams.get('email') || '');
        
        // Use token_hash if available, otherwise fall back to token
        const recoveryToken = tokenHash || token;
        
        console.log('🔍 Reset Password - Extracted params:', { 
          hasCode: !!code,
          hasToken: !!token,
          hasTokenHash: !!tokenHash,
          tokenPreview: recoveryToken ? `${recoveryToken.substring(0, 20)}...` : 'none',
          codePreview: code ? `${code.substring(0, 20)}...` : 'none',
          tokenLength: recoveryToken?.length,
          codeLength: code?.length,
          type, 
          email 
        });
        
        // If we have a code from Supabase redirect, use it directly
        if (code) {
          console.log('✅ Found code parameter from Supabase redirect, using exchangeCodeForSession...');
          try {
            const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(window.location.href);
            
            if (exchangeError) {
              console.error('❌ exchangeCodeForSession failed:', exchangeError);
              setError(exchangeError.message || 'Failed to verify reset code. The link may have expired.');
              return;
            }
            
            console.log('✅ exchangeCodeForSession succeeded');
            // Check for session
            await new Promise(resolve => setTimeout(resolve, 500));
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            
            if (sessionError || !session) {
              setError('Failed to create session. Please try again.');
              return;
            }
            
            console.log('✅ Session created successfully');
            setSessionReady(true);
            return;
          } catch (err: any) {
            console.error('💥 Error in code exchange:', err);
            setError(err?.message || 'Failed to process reset code.');
            return;
          }
        }
        
        // Validate all required parameters
        if (!recoveryToken && !code) {
          setError('Invalid reset link: token or code is missing');
          return;
        }

        if (type !== 'recovery') {
          setError('Invalid reset link: incorrect type');
          return;
        }

        if (!email) {
          setError('Invalid reset link: email is missing');
          return;
        }

        // If we have a code, we already handled it above, so we shouldn't reach here
        // But if we do have a recoveryToken, process it
        if (!recoveryToken) {
          return; // Should have been handled by code path above
        }

        // Check if token is a PKCE code (starts with "pkce_")
        const isPkceCode = recoveryToken.startsWith('pkce_');
        
        console.log('🔐 Verifying recovery token...', { 
          type: 'recovery', 
          email, 
          tokenLength: recoveryToken.length,
          tokenPreview: recoveryToken.substring(0, 15),
          isPkceCode,
          hasTokenHash: !!tokenHash
        });

        try {
          // Check URL hash for Supabase error messages first
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const hashError = hashParams.get('error');
          const hashErrorDesc = hashParams.get('error_description');
          const hashErrorCode = hashParams.get('error_code');
          
          if (hashError || hashErrorCode) {
            console.error('❌ Error in URL hash:', { error: hashError, error_code: hashErrorCode, description: hashErrorDesc });
            if (hashErrorCode === 'otp_expired' || hashError === 'otp_expired' || hashErrorDesc?.includes('expired')) {
              setError('This password reset link has expired. Please request a new password reset link.');
            } else {
              setError(hashErrorDesc || hashError || 'The reset link is invalid or has expired.');
            }
            return;
          }

          // For PKCE codes or token_hash, we need to redirect to Supabase's auth endpoint
          // Supabase will process the token_hash and redirect back with a code parameter
          if (isPkceCode || tokenHash) {
            console.log('🔄 Token hash detected - redirecting to Supabase auth endpoint...');
            
            // Extract the actual hash (remove pkce_ prefix if present)
            const actualTokenHash = recoveryToken.startsWith('pkce_') ? recoveryToken.substring(5) : recoveryToken;
            
            // Construct Supabase auth verify URL
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const redirectTo = `${window.location.origin}${window.location.pathname}`;
            
            // Use token_hash parameter (Supabase's expected parameter name)
            const verifyUrl = `${supabaseUrl}/auth/v1/verify?token_hash=${encodeURIComponent(actualTokenHash)}&type=recovery&redirect_to=${encodeURIComponent(redirectTo)}`;
            
            console.log('📍 Redirecting to Supabase verify endpoint...', { 
              tokenHashLength: actualTokenHash.length,
              redirectTo 
            });
            
            // Redirect - Supabase will process and redirect back with code parameter
            window.location.href = verifyUrl;
            return; // Component will unmount, new page load will handle the code
          } else {
            // For non-PKCE tokens, use verifyOtp
            console.log('🔄 Using verifyOtp for recovery token...');
            const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
              type: 'recovery',
              email: email,
              token: recoveryToken,
            });

            if (verifyError) {
              console.error('❌ verifyOtp failed:', verifyError);
              setError(verifyError.message || 'Failed to verify reset token. The link may have expired or is invalid.');
              return;
            }
            
            console.log('✅ verifyOtp succeeded');
          }

          // Wait a moment for Supabase to process the session
          await new Promise(resolve => setTimeout(resolve, 500));
          
          console.log('🔍 Checking for session...');
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError) {
            console.error('❌ Session check error:', sessionError);
            setError('Failed to create session. Please try again.');
            return;
          }

          if (!session) {
            console.error('❌ No session created after successful verification');
            // Try one more time after a short delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            
            if (retrySession) {
              console.log('✅ Session created on retry');
              setSessionReady(true);
              return;
            }
            
            setError('Failed to create session. Please request a new password reset link.');
            return;
          }

          console.log('✅ Token verified and session created successfully!');
          console.log('Session details:', { 
            user: session.user?.email, 
            expiresAt: session.expires_at,
            accessToken: session.access_token ? 'present' : 'missing'
          });
          setSessionReady(true);
        } catch (apiErr: any) {
          console.error('💥 API verification exception:', apiErr);
          
          // Check for existing session as fallback
          const { data: { session: fallbackSession } } = await supabase.auth.getSession();
          if (fallbackSession) {
            console.log('✅ Found existing session as fallback');
            setSessionReady(true);
            return;
          }
          
          // Check if error is about expired token
          if (apiErr?.message?.includes('expired') || apiErr?.message?.includes('CORS')) {
            // Check URL hash for Supabase error
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const hashError = hashParams.get('error');
            const hashErrorDesc = hashParams.get('error_description');
            
            if (hashError === 'otp_expired' || hashErrorDesc?.includes('expired')) {
              setError('This password reset link has expired. Please request a new password reset link from the forgot password page.');
            } else {
              setError('The reset link is invalid or has expired. Please request a new password reset link.');
            }
          } else {
            setError(apiErr?.message || 'Failed to verify reset token. Please check your connection and try again.');
          }
        }
      } catch (err: any) {
        console.error('💥 Reset password exception:', err);
        setError(err?.message || "Failed to verify reset link. Please check the console for details.");
      }
    };
    
    verifyToken();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionReady) return;
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) {
        setError(updErr.message);
        setLoading(false);
        return;
      }
      setMessage("Password updated successfully. Redirecting to login...");
      setTimeout(() => navigate('/login'), 1200);
    } catch (err: any) {
      setError(err?.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Reset Password</h1>
          <p className="text-sm sm:text-base text-gray-600">Enter a new password for your account</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-5 sm:p-8">
          {!sessionReady ? (
            <div>
              {error ? (
                <div className="text-red-600 text-xs sm:text-sm bg-red-50 p-2 sm:p-3 rounded-md">{error}</div>
              ) : (
                <div className="text-sm sm:text-base text-gray-600">Validating reset link...</div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
              <div>
                <Label htmlFor="password" className="text-xs sm:text-sm font-medium text-gray-700">
                  New Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter new password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-xs sm:text-sm font-medium text-gray-700">
                  Confirm New Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              {error && (
                <div className="text-red-600 text-xs sm:text-sm bg-red-50 p-2 sm:p-3 rounded-md">
                  {error}
                </div>
              )}

              {message && (
                <div className="text-green-700 text-xs sm:text-sm bg-green-50 p-2 sm:p-3 rounded-md">
                  {message}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 sm:px-4 rounded-md font-medium transition-colors text-sm"
              >
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          )}

          <div className="text-center mt-4 sm:mt-6">
            <button
              onClick={() => navigate('/login')}
              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              Back to Sign in
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;



