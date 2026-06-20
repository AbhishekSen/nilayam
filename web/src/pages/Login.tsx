import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/authContext';

export default function LoginPage() {
  const { session, loading, signInWithGoogle } = useAuth();

  if (loading) return <div className="auth-page">Loading…</div>;
  if (session) return <Navigate to="/" replace />;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Sign in to Propsoch</h1>
        <p>Real-estate intelligence for Bengaluru.</p>
        <button type="button" className="auth-google-btn" onClick={signInWithGoogle}>
          Continue with Google
        </button>
        <p className="auth-fineprint">
          By signing in you agree to a free account. Upgrade anytime for unlimited chat.
        </p>
      </div>
    </div>
  );
}
