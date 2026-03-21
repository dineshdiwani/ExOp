import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { processOAuthSession } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Use ref to prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processSession = async () => {
      try {
        // Extract session_id from URL fragment
        const hash = window.location.hash;
        const sessionId = hash.split('session_id=')[1]?.split('&')[0];

        if (!sessionId) {
          toast.error('Invalid session');
          navigate('/login');
          return;
        }

        // Process the OAuth session
        const user = await processOAuthSession(sessionId);
        toast.success('Welcome!');

        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);

        // Navigate based on role
        if (user.role === 'admin') navigate('/admin', { replace: true });
        else if (user.role === 'expert') navigate('/expert', { replace: true });
        else navigate('/dashboard', { replace: true });
      } catch (error) {
        console.error('Auth callback error:', error);
        toast.error('Authentication failed');
        navigate('/login');
      }
    };

    processSession();
  }, [navigate, processOAuthSession]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-600 mx-auto mb-4" />
        <p className="text-slate-600">Completing sign in...</p>
      </div>
    </div>
  );
}
