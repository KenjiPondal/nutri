import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!localStorage.getItem('token')) { setLoading(false); return; }
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch {
      localStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  const finish = (data) => { localStorage.setItem('token', data.token); setUser(data.user); };

  const login = async (email, password) => finish((await api.post('/auth/login', { email, password })).data);
  const register = async (name, email, password) => finish((await api.post('/auth/register', { name, email, password })).data);
  const loginWithToken = async (token) => { localStorage.setItem('token', token); setLoading(true); await loadMe(); };
  const logout = () => { localStorage.removeItem('token'); setUser(null); };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
