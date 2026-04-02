import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User } from 'lucide-react';

import LearningHub from './pages/LearningHub';
import ListeningPage from './pages/ListeningPage';
import ReadingListPage from './pages/ReadingListPage';
import ArticleDetailPage from './pages/ArticleDetailPage';
import PlaceholderPage from './pages/PlaceholderPage';

function App() {
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const [token, setToken] = useState<string | null>(() => {
    const val = localStorage.getItem('token');
    return val && val !== 'null' && val !== 'undefined' ? val : null;
  });
  const [username, setUsername] = useState<string | null>(() => {
    const val = localStorage.getItem('username');
    return val && val !== 'null' && val !== 'undefined' ? val : null;
  });
  const [isAdmin, setIsAdmin] = useState<boolean>(localStorage.getItem('is_admin') === 'true');

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authFormData, setAuthFormData] = useState({ user: '', pass: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  const navigate = useNavigate();

  const handleLogout = () => {
    setToken(null);
    setUsername(null);
    setIsAdmin(false);
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('is_admin');
    navigate('/');
  };

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }

    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          handleLogout();
        }
        return Promise.reject(error);
      }
    );

    return () => axios.interceptors.response.eject(interceptor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (authFormData.user.length === 0 || authFormData.user.length > 20) {
      setAuthError('Username length must be 1-20');
      return;
    }
    if (authFormData.pass.length < 6 || authFormData.pass.length > 20) {
      setAuthError('Password length must be 6-20');
      return;
    }

    const params = new URLSearchParams();
    params.append('username', authFormData.user);
    params.append('password', authFormData.pass);

    try {
      if (authMode === 'login') {
        const res = await axios.post(`${API_BASE_URL}/login`, params);
        const newToken = res.data.access_token as string;
        const userIsAdmin = Boolean(res.data.is_admin);

        setToken(newToken);
        setUsername(authFormData.user);
        setIsAdmin(userIsAdmin);

        localStorage.setItem('token', newToken);
        localStorage.setItem('username', authFormData.user);
        localStorage.setItem('is_admin', String(userIsAdmin));

        navigate('/');
      } else {
        await axios.post(`${API_BASE_URL}/register`, params);
        setAuthMode('login');
        setAuthError('Account created, please login.');
      }
    } catch (err: any) {
      setAuthError(err.response?.data?.detail || 'Authentication failed');
    }
  };

  if (!token || !username) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in duration-300">
          <div className={`p-8 ${authMode === 'login' ? 'bg-white' : 'bg-gray-900 text-white'} transition-colors duration-500`}>
            <h1 className="text-3xl font-black tracking-tighter mb-2">ENGLISH STUDY</h1>
            <p className="text-xs font-bold uppercase tracking-widest opacity-60">
              {authMode === 'login' ? 'Welcome Back' : 'Join the Community'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="p-8 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-1">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    required
                    value={authFormData.user}
                    onChange={(e) => setAuthFormData({ ...authFormData, user: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all text-sm"
                    placeholder="Enter username"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={authFormData.pass}
                    onChange={(e) => setAuthFormData({ ...authFormData, pass: e.target.value })}
                    className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all text-sm"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            {authError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 animate-shake">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                <p className="text-[11px] font-bold text-red-600 uppercase tracking-tight">{authError}</p>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-4 bg-black text-white rounded-xl font-bold text-xs uppercase tracking-[0.2em] hover:bg-gray-800 active:scale-[0.98] transition-all shadow-lg shadow-black/10"
            >
              {authMode === 'login' ? 'Login Now' : 'Create Account'}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setAuthError('');
                  setShowPassword(false);
                }}
                className="text-[10px] font-bold text-gray-400 hover:text-black uppercase tracking-widest transition-colors border-b border-transparent hover:border-black"
              >
                {authMode === 'login' ? "Don't have an account? Register" : 'Already have an account? Login'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LearningHub username={username} onLogout={handleLogout} />} />
      <Route
        path="/listen"
        element={<ListeningPage username={username} isAdmin={isAdmin} onLogout={handleLogout} />}
      />
      <Route path="/read" element={<ReadingListPage username={username} onLogout={handleLogout} />} />
      <Route path="/read/:id" element={<ArticleDetailPage username={username} onLogout={handleLogout} />} />
      <Route path="/speak" element={<PlaceholderPage mode="speak" username={username} onLogout={handleLogout} />} />
      <Route path="/write" element={<PlaceholderPage mode="write" username={username} onLogout={handleLogout} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

