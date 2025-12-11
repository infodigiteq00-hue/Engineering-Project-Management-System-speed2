import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";

const getCodeFromUrl = (): string | null => {
  try {
    const url = new URL(window.location.href);
    // Supabase recovery uses `code` as a search param; also handle hash fragment just in case
    const codeParam = url.searchParams.get("code");
    if (codeParam) return codeParam;
    if (url.hash) {
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const hashCode = hash.get("code");
      if (hashCode) return hashCode;
    }
    return null;
  } catch {
    return null;
  }
};

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const exchange = async () => {
      setError(null);
      try {
        // More compatible: pass full URL containing the recovery code and type
        let { error: exErr } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (exErr) {
          // Fallback for SDKs that expect only the code string
          const url = new URL(window.location.href);
          const codeOnly = url.searchParams.get('code') || '';
          if (codeOnly) {
            ({ error: exErr } = await supabase.auth.exchangeCodeForSession(codeOnly));
          }
          if (exErr) {
            console.error('ResetPassword exchange error:', exErr);
            setError(exErr.message);
            return;
          }
        }
        setSessionReady(true);
      } catch (err: any) {
        setError(err?.message || "Failed to verify reset link");
      }
    };
    exchange();
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



