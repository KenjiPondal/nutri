import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function OAuthCallback() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', '/oauth-callback'); // drop token from URL
    if (!token) { navigate('/login?error=oauth', { replace: true }); return; }
    loginWithToken(token).then(() => navigate('/', { replace: true }));
  }, [loginWithToken, navigate]);

  return <div className="loading">Signing you in...</div>;
}
