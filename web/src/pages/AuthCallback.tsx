import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/authContext';

export default function AuthCallbackPage() {
  const { session, loading } = useAuth();
  if (loading) return <div className="auth-page">Finishing sign-in…</div>;
  return <Navigate to={session ? '/' : '/login'} replace />;
}
