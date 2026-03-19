import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Upload, Play, Settings, Languages, Folder, History, LogOut, User, Lock, Eye, EyeOff } from 'lucide-react';

interface Subtitle {
  start: number;
  end: number;
  text: string;
  translation: string;
}

interface VideoFile {
  id: string;
  title: string;
  path: string;
  thumbnail?: string; // 新增：封面 URL
  source: 'upload' | 'library';
  status?: 'private' | 'pending' | 'approved' | 'rejected'; // 新增：审核状态
}

function App() {
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  const API_TOKEN = process.env.REACT_APP_API_TOKEN || 'my_super_secret_token_123';

  // 1. 强化初始化逻辑：防止 localStorage 存储了 "null" 字符串导致的状态异常
  const [token, setToken] = useState<string | null>(() => {
    const val = localStorage.getItem('token');
    return (val === 'null' || val === 'undefined' || !val) ? null : val;
  });
  const [username, setUsername] = useState<string | null>(() => {
    const val = localStorage.getItem('username');
    return (val === 'null' || val === 'undefined' || !val) ? null : val;
  });
  const [isAdmin, setIsAdmin] = useState<boolean>(localStorage.getItem('is_admin') === 'true');

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authFormData, setAuthFormData] = useState({ user: '', pass: '' });
  const [showPassword, setShowPassword] = useState(false); // 新增：控制密码显隐
  const [authError, setAuthError] = useState('');
  const [uploadError, setUploadError] = useState(''); // 新增：上传错误状态

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [library, setLibrary] = useState<VideoFile[]>([]);
  const [uploads, setUploads] = useState<VideoFile[]>([]); // 新增：上传记录状态
  const [showLibrary, setShowLibrary] = useState(false);
  const [showUploads, setShowUploads] = useState(false); // 新增：上传记录显示控制
  const [isAdminMode, setIsAdminMode] = useState(false); // 新增：管理员模式开关
  const [pendingReviews, setPendingReviews] = useState<any[]>([]); // 新增：待审核列表
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState({ progress: 0, message: '' }); // 新增：处理状态详情
  const [showEnglish, setShowEnglish] = useState(true);
  const [showChinese, setShowChinese] = useState(true);
    const [showSubtitlesOnVideo, setShowSubtitlesOnVideo] = useState(true); // 控制视频画面上字幕显示的开关
    const [currentTime, setCurrentTime] = useState(0);
  const [lookupWord, setLookupWord] = useState<any>(null); // 新增：正在查看的单词详情
  const [isLookingUp, setIsLookingUp] = useState(false); // 新增：查词加载中状态
  const [aiExplanation, setAiExplanation] = useState<string | null>(null); // 新增：AI语境解释
  const [isAiLoading, setIsAiLoading] = useState(false); // 新增：AI解释加载状态

  const videoRef = useRef<HTMLVideoElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const pollIntervalRef = useRef<any>(null); // 改为 any 以兼容不同环境的定时器类型

    // 2. 增加状态自检：如果处于“半登录”状态（有 Token 没用户名），自动清理
    useEffect(() => {
    if (token && !username) {
      console.warn("Detection of inconsistent login state, resetting...");
      handleLogout();
    }
  }, [token, username]);

  // 3. 配置 Axios 默认 Head 和 401 自动登出响应
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }

    // 增加响应拦截器，处理 Token 过期情况
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.error("Session expired or invalid token, logging out...");
          handleLogout();
        }
        return Promise.reject(error);
      }
    );

    return () => axios.interceptors.response.eject(interceptor);
  }, [token]);

  // 获取资源库列表和上传记录
    useEffect(() => {
    if (!token) return;

    const fetchLibrary = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/library`);
        setLibrary(response.data.map((v: any) => ({ ...v, source: 'library' })));
      } catch (err) {
        console.error('Fetch library failed', err);
      }
    };
    const fetchUploads = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/uploads`);
        setUploads(response.data.map((v: any) => ({ ...v, source: 'upload' })));
      } catch (err) {
        console.error('Fetch uploads failed', err);
      }
    };
    fetchLibrary();
    fetchUploads();

    // 组件卸载时清除轮询
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
    }, [API_BASE_URL, token]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    // 前端预验证：取消账号名下限，严格对齐后端提示
    if (authFormData.user.length === 0) {
      setAuthError('Username cannot be empty');
      return;
    }
    if (authFormData.user.length > 20) {
      setAuthError('Username is too long (max 20)');
      return;
    }

    if (authFormData.pass.length < 6) {
      setAuthError('Password is too short (min 6)');
      return;
    }
    if (authFormData.pass.length > 20) {
      setAuthError('Password is too long (max 20)');
      return;
    }

    const params = new URLSearchParams();
    params.append('username', authFormData.user);
    params.append('password', authFormData.pass);

    try {
      if (authMode === 'login') {
        const res = await axios.post(`${API_BASE_URL}/login`, params);
        const newToken = res.data.access_token;
        const userIsAdmin = res.data.is_admin; // 从后端获取是否为管理员

        setToken(newToken);
        setUsername(authFormData.user);
        setIsAdmin(userIsAdmin);

        localStorage.setItem('token', newToken);
        localStorage.setItem('username', authFormData.user);
        localStorage.setItem('is_admin', String(userIsAdmin));
      } else {
        await axios.post(`${API_BASE_URL}/register`, params);
        setAuthMode('login');
        setAuthError('Account created! Please login.');
      }
    } catch (err: any) {
      setAuthError(err.response?.data?.detail || 'Authentication failed');
    }
  };

  const handleLogout = () => {
    console.log("Switching to logout sequence...");
    // 彻底清理轮询
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // 重置所有状态 - 必须在清除本地存储前或后都要确保状态被清空
    setToken(null);
    setUsername(null);
    setIsAdmin(false);
    setVideoUrl(null);
    setSubtitles([]);
    setIsProcessing(false);
    setIsUploading(false);
    setShowLibrary(false);
    setShowUploads(false);
    setIsAdminMode(false);
    setLibrary([]);
    setUploads([]);

    // 彻底清理本地存储
    localStorage.clear();

    console.log("Logged out successfully, redirecting...");
    // 强制页面重定向到首页并刷新，彻底解决状态残留问题
    window.location.href = window.location.origin;
  };

  // 渲染登录/注册页面
  if (!token) {
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
                    type={showPassword ? "text" : "password"}
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
                }}
                className="text-[10px] font-bold text-gray-400 hover:text-black uppercase tracking-widest transition-colors border-b border-transparent hover:border-black"
              >
                {authMode === 'login' ? "Don't have an account? Register" : "Already have an account? Login"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 检查文件大小 (500MB)
    const MAX_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('File is too large. Max limit is 500MB.');
      // 3秒后清除错误提示
      setTimeout(() => setUploadError(''), 3000);
      return;
    }

    setUploadError('');
    setIsUploading(true);

    // 立即预览视频并开启处理状态遮罩
    const localUrl = URL.createObjectURL(file);
    setVideoUrl(localUrl);
    setSubtitles([]);
    setIsProcessing(true);
    setProcessingStatus({ progress: 1, message: 'Initializing AI Engine...' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: {
          'X-Token': API_TOKEN
        }
        // 删除了 onUploadProgress，合并到统一的处理进度条中
      });

      const id = response.data.file_id;
      setFileId(id);

      const serverVideoUrl = `${API_BASE_URL}/videos/user_uploads/${username}/uploads/${id}${file.name.substring(file.name.lastIndexOf('.'))}`;
      setVideoUrl(serverVideoUrl);

      pollSubtitles(id);

      const updatedUploads = await axios.get(`${API_BASE_URL}/uploads`);
      setUploads(updatedUploads.data.map((v: any) => ({ ...v, source: 'upload' })));
    } catch (error: any) {
      console.error('Upload failed', error);
      setUploadError(error.response?.data?.detail || 'Upload failed. Please try again.');
      setTimeout(() => setUploadError(''), 5000);
      setIsProcessing(false);
    } finally {
      setIsUploading(false);
    }
  };

    const selectFromLibrary = async (video: VideoFile) => {
    setFileId(video.id);
    // 修正 URL 拼接逻辑，确保路径正确
    const finalVideoUrl = video.path.startsWith('http') ? video.path : `${API_BASE_URL}${video.path}`;
    setVideoUrl(finalVideoUrl);

    setSubtitles([]);
    setShowLibrary(false);
    setShowUploads(false); // 关闭上传记录面板
    setIsAdminMode(false); // 新增：选择视频时自动退出管理员面板，防止重叠
    setIsProcessing(true); // 设置处理状态

    try {
      const res = await axios.get(`${API_BASE_URL}/subtitles/${video.id}`);
      if (res.data.status === 'completed') {
        setSubtitles(res.data.data);
        setIsProcessing(false);
      } else {
        if (video.source === 'library') {
          await axios.post(`${API_BASE_URL}/library/process/${video.id}`);
        }
        pollSubtitles(video.id);
      }
    } catch (err) {
      console.error('Select library failed', err);
      pollSubtitles(video.id);
    }
    };

  const handleRequestReview = async (videoId: string) => {
    if (!window.confirm('Submit this video to public Library? It will be reviewed by admin.')) return;

    try {
      await axios.post(`${API_BASE_URL}/request_review/${videoId}`);
      alert('Submitted for review!');
      // 刷新列表
      const updatedUploads = await axios.get(`${API_BASE_URL}/uploads`);
      setUploads(updatedUploads.data.map((v: any) => ({ ...v, source: 'upload' })));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to submit review');
    }
  };

  const fetchPendingReviews = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/admin/pending`, {
        headers: { 'X-Token': API_TOKEN }
      });
      setPendingReviews(res.data);
    } catch (err) {
      console.error('Failed to fetch pending reviews', err);
    }
  };

  const handleAdminAction = async (videoId: string, action: 'approve' | 'reject') => {
    try {
      await axios.post(`${API_BASE_URL}/admin/${action}/${videoId}`, {}, {
        headers: { 'X-Token': API_TOKEN }
      });
      alert(`Video ${action}ed!`);
      fetchPendingReviews();
      // 同时刷新公共库
      const libRes = await axios.get(`${API_BASE_URL}/library`);
      setLibrary(libRes.data.map((v: any) => ({ ...v, source: 'library' })));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Action failed');
    }
  };

    const pollSubtitles = async (id: string) => {
    // 清除旧的 interval 避免叠加导致卡顿
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/subtitles/${id}`);

        if (response.data.status === 'completed') {
          setSubtitles(response.data.data);
          setIsProcessing(false);
          setProcessingStatus({ progress: 100, message: 'Done' });
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        } else {
          const apiProgress = response.data.progress;
          const apiMessage = response.data.message;

          setProcessingStatus(prev => {
            // 如果后端已经有了真实的转录或翻译进度（通常 > 15），则以真实进度为准
            if (apiProgress !== undefined && apiProgress > 15) {
              return { progress: Math.max(prev.progress, apiProgress), message: apiMessage || 'Processing...' };
            }

            // 1. 降速初始模拟 (前 50%)：采用更小的步长，让进度条爬升更平稳持久
            // 解决“卡在50”的问题：让模拟进度更慢到达 50，匹配 Whisper 的实际耗时
            if (prev.progress < 50) {
              // 第一下跳 2%，后面每秒持续跳 0.8% (原来是 4% 和 2%)
              const jump = apiProgress === 1 && prev.progress < 2 ? 2 : 0.8;
              return { progress: Math.min(49.2, prev.progress + jump), message: apiMessage || 'Analyzing audio...' };
            }

            return prev;
          });
        }
      } catch (error) {
        console.error('Failed to fetch subtitles', error);
        // 如果出错（例如 401），也应该停止轮询
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    }, 1000); // 轮询频率稍微降回到 1000ms，减轻浏览器负担

    pollIntervalRef.current = interval;
    };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);

      // 找到当前时间对应的字幕索引
      const activeIndex = subtitles.findIndex(sub => time >= sub.start && time <= sub.end);
      if (activeIndex !== -1) {
        const activeElement = document.getElementById(`sub-${activeIndex}`);
        if (activeElement && scrollRef.current) {
          // 计算滚动位置，使活动字幕居中
          const container = scrollRef.current;
          const scrollTarget = activeElement.offsetTop - (container.clientHeight / 2) + (activeElement.clientHeight / 2);

          container.scrollTo({
            top: scrollTarget,
            behavior: 'smooth'
          });
        }
      }
    }
  };

  const handleWordClick = async (word: string, context: string, index: number) => {
    // 清理单词
    const cleanWord = word.replace(/[.,!?()\[\]"']/g, "");
    if (!cleanWord || cleanWord.length < 2) return;

    // 立即重置相关状态，防止上一个单词的数据残留
    setIsLookingUp(true);
    setAiExplanation(null);
    setIsAiLoading(false);

    // 每个请求分配一个唯一的标识符，用于竞态控制
    const currentRequestId = Date.now().toString();
    (window as any).lastWordRequestId = currentRequestId;

    setLookupWord({
      word: cleanWord,
      data: null,
      context: context,
      prev_context: index > 0 ? subtitles[index - 1].text : "",
      next_context: index < subtitles.length - 1 ? subtitles[index + 1].text : ""
    });

    try {
      const res = await axios.post(`${API_BASE_URL}/lookup`, {
        word: cleanWord,
        context: context
      });

      // 检查当前请求是否仍是最新请求，如果不是则丢弃结果
      if ((window as any).lastWordRequestId !== currentRequestId) return;

      if (res.data.status === 'success') {
        setLookupWord((prev: any) => (prev && prev.word === cleanWord) ? { ...prev, data: res.data.data } : prev);
      } else {
        setLookupWord((prev: any) => (prev && prev.word === cleanWord) ? { ...prev, data: null, error: res.data.message } : prev);
      }
    } catch (err) {
      if ((window as any).lastWordRequestId !== currentRequestId) return;
      console.error("Word lookup failed", err);
      setLookupWord((prev: any) => (prev && prev.word === cleanWord) ? { ...prev, data: null, error: "Lookup failed" } : prev);
    } finally {
      if ((window as any).lastWordRequestId === currentRequestId) {
        setIsLookingUp(false);
      }
    }
  };

  const handleAiContextLookup = async () => {
    if (!lookupWord || !lookupWord.word) return;

    // 如果已经有针对当前单词的 AI 解释，且没有正在加载，则直接返回，不再请求
    if (aiExplanation && !isAiLoading) return;

    setIsAiLoading(true);
    setAiExplanation(null); // 清除旧的AI解释

    const currentWord = lookupWord.word;
    const currentRequestId = Date.now().toString();
    (window as any).lastAiRequestId = currentRequestId;

    try {
      const res = await axios.post(`${API_BASE_URL}/lookup/ai_context`, {
        word: lookupWord.word,
        context: lookupWord.context,
        prev_context: lookupWord.prev_context,
        next_context: lookupWord.next_context
      });

      if ((window as any).lastAiRequestId !== currentRequestId) return;

      if (res.data.status === 'success') {
        setAiExplanation(res.data.explanation);
      }
    } catch (err) {
      if ((window as any).lastAiRequestId !== currentRequestId) return;
      console.error("AI Context lookup failed", err);
      setAiExplanation("AI Analysis failed. Please try again.");
    } finally {
      if ((window as any).lastAiRequestId === currentRequestId) {
        setIsAiLoading(false);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white text-black font-sans relative overflow-hidden">
      {/* Header */}
      <header className="p-4 border-b border-gray-200 flex justify-between items-center bg-white shadow-sm z-10">
        <h1 className="text-xl font-bold tracking-tight text-black flex items-center gap-2">
          ENGLISH STUDY
          <span className="text-[10px] bg-black text-white px-2 py-0.5 rounded font-light tracking-tighter">CLOUD</span>
        </h1>
        <div className="flex gap-4 items-center">
          {/* 管理员入口：仅对管理员账号开放 */}
          {isAdmin && (
            <div
              onDoubleClick={() => {
                if (isAdminMode) {
                  setIsAdminMode(false);
                } else {
                  setIsAdminMode(true);
                  fetchPendingReviews();
                  setShowLibrary(false);
                  setShowUploads(false);
                }
              }}
              className="flex items-center gap-2 text-xs font-bold text-gray-400 mr-4 border-r border-gray-100 pr-4 cursor-pointer select-none group"
            >
              <User size={12} className={isAdminMode ? "text-red-500" : ""} />
              <span className={isAdminMode ? "text-red-500" : "group-hover:text-black"}>
                {username?.toUpperCase()}
              </span>
              {isAdminMode ? (
                <span className="ml-1 text-[8px] bg-red-500 text-white px-1 rounded animate-pulse">ADMIN MODE</span>
              ) : (
                <span className="ml-1 text-[8px] bg-gray-200 text-gray-500 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">ADMIN</span>
              )}
            </div>
          )}

          {!isAdmin && (
            <div className="hidden md:flex items-center gap-2 text-xs font-bold text-gray-400 mr-4 border-r border-gray-100 pr-4">
              <User size={12} />
              {username?.toUpperCase()}
            </div>
          )}

          <button
            onClick={() => { setShowLibrary(!showLibrary); setShowUploads(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-medium transition-all ${showLibrary ? 'bg-black text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
          >
            <Folder size={16} />
            LIBRARY
          </button>

          <button
            onClick={() => { setShowUploads(!showUploads); setShowLibrary(false); setIsAdminMode(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-medium transition-all ${showUploads ? 'bg-black text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
          >
            <History size={16} />
            HISTORY
          </button>

          {/* 视频字幕开关按钮 */}
          <button
            onClick={() => setShowSubtitlesOnVideo(!showSubtitlesOnVideo)}
            className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-medium transition-all ${showSubtitlesOnVideo ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
            title="Toggle On-Video Subtitles"
          >
            {showSubtitlesOnVideo ? <Eye size={16} /> : <EyeOff size={16} />}
            {showSubtitlesOnVideo ? 'SUB ON' : 'SUB OFF'}
          </button>


          <div className="flex bg-gray-100 rounded-md p-1 gap-1 border border-gray-200">
            <button
              onClick={() => setShowEnglish(!showEnglish)}
              className={`px-3 py-1 rounded text-xs transition-all font-medium ${showEnglish ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              EN
            </button>
            <button
              onClick={() => setShowChinese(!showChinese)}
              className={`px-3 py-1 rounded text-xs transition-all font-medium ${showChinese ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              CN
            </button>
          </div>

          <div className="relative group">
            <label className="cursor-pointer bg-black hover:bg-gray-800 text-white px-4 py-2 rounded flex items-center gap-2 transition-all font-medium active:scale-95">
              <Upload size={18} />
              {isUploading ? '...' : 'UPLOAD'}
              <input type="file" className="hidden" onChange={handleUpload} accept="video/*" title="Max size: 500MB" />
            </label>
            <div className="absolute top-full mt-2 right-0 bg-white border border-gray-100 shadow-xl rounded px-3 py-1.5 text-[10px] text-gray-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 font-bold uppercase tracking-tighter">
              MAX SIZE: 500MB
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-all"
            title="LOGOUT"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Upload Error Toast */}
      {uploadError && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-red-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
            <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center font-bold text-[10px]">!</div>
            <p className="text-xs font-bold tracking-widest uppercase">{uploadError}</p>
          </div>
        </div>
      )}


      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Library Overlay */}
        {showLibrary && (
          <div className="absolute inset-0 bg-black/40 z-50 flex justify-end">
            <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0">
                <h2 className="text-xl font-bold tracking-tighter">LOCAL LIBRARY</h2>
                <button onClick={() => setShowLibrary(false)} className="text-xs font-bold hover:underline py-2 px-4 border border-black rounded">CLOSE</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {library.length > 0 ? library.map((video) => (
                  <div
                    key={video.id}
                    onClick={() => selectFromLibrary(video)}
                    className="group border border-gray-200 p-4 rounded hover:border-black cursor-pointer transition-all hover:bg-gray-50 flex items-center gap-4"
                  >
                    <div className="w-24 aspect-video bg-gray-100 flex items-center justify-center rounded overflow-hidden relative">
                      {video.thumbnail ? (
                        <img
                          src={video.thumbnail.startsWith('http') ? video.thumbnail : `${API_BASE_URL}${video.thumbnail}`}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Play size={20} className="text-gray-300 group-hover:text-black transition-colors" />
                      )}
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play size={24} className="text-white fill-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm truncate uppercase tracking-tight">{video.title}</h3>
                      <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-medium">Analyze Video</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-center text-gray-400 py-20 font-light tracking-widest text-xs">LIBRARY IS EMPTY.<br/>PUT VIDEOS IN DATA/LIBRARY</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Uploads History Overlay */}
        {showUploads && (
          <div className="absolute inset-0 bg-black/40 z-50 flex justify-end">
            <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0">
                <h2 className="text-xl font-bold tracking-tighter">UPLOAD HISTORY</h2>
                <button onClick={() => setShowUploads(false)} className="text-xs font-bold hover:underline py-2 px-4 border border-black rounded">CLOSE</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {uploads.length > 0 ? uploads.map((video) => (
                  <div
                    key={video.id}
                    className="group relative border border-gray-200 p-4 rounded hover:border-black cursor-pointer transition-all hover:bg-gray-50 flex items-center gap-4"
                  >
                    <div className="w-24 aspect-video bg-gray-100 flex items-center justify-center rounded overflow-hidden relative" onClick={() => selectFromLibrary(video)}>
                      {video.thumbnail ? (
                        <img
                          src={video.thumbnail.startsWith('http') ? video.thumbnail : `${API_BASE_URL}${video.thumbnail}`}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Play size={20} className="text-gray-300 group-hover:text-black transition-colors" />
                      )}
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play size={24} className="text-white fill-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0" onClick={() => selectFromLibrary(video)}>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm truncate uppercase tracking-tight">{video.title}</h3>
                        {video.status === 'pending' && <span className="text-[8px] bg-yellow-100 text-yellow-700 px-1 rounded font-bold">审核中</span>}
                        {video.status === 'rejected' && <span className="text-[8px] bg-red-100 text-red-700 px-1 rounded font-bold">不通过</span>}
                        {video.status === 'approved' && <span className="text-[8px] bg-green-100 text-green-700 px-1 rounded font-bold">已同步</span>}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-medium">Recorded Upload</p>
                    </div>

                    {/* 悬浮上传按钮 */}
                    {video.status === 'private' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRequestReview(video.id); }}
                        className="absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full group-hover:-translate-x-4 opacity-0 group-hover:opacity-100 transition-all bg-black text-white p-2 rounded-full shadow-xl z-10"
                        title="Contribution to Library"
                      >
                        <Upload size={14} />
                      </button>
                    )}
                  </div>
                )) : (
                  <p className="text-center text-gray-400 py-20 font-light tracking-widest text-xs">NO UPLOAD HISTORY FOUND.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Admin Review Overlay */}
        {isAdminMode && (
          <div className="absolute inset-0 bg-black/40 z-50 flex justify-end">
            <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-red-100 flex justify-between items-center bg-gray-50 sticky top-0">
                <h2 className="text-xl font-bold tracking-tighter text-red-600">ADMIN REVIEW PANEL</h2>
                <button onClick={() => setIsAdminMode(false)} className="text-xs font-bold hover:underline py-2 px-4 border border-red-600 text-red-600 rounded">EXIT ADMIN</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {pendingReviews.length > 0 ? pendingReviews.map((req) => (
                  <div
                    key={req.file_id}
                    className="border-2 border-red-50 p-4 rounded bg-white flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-20 aspect-video bg-gray-100 rounded overflow-hidden">
                        <img src={`${API_BASE_URL}/videos/user_uploads/${req.username}/thumbnails/${req.file_id}.jpg`} alt="thumb" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">User: {req.username}</p>
                        <h3 className="font-bold text-xs truncate">ID: {req.file_id}</h3>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAdminAction(req.file_id, 'approve')}
                        className="flex-1 bg-green-600 text-white text-[10px] font-bold py-2 rounded uppercase tracking-widest hover:bg-green-700 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleAdminAction(req.file_id, 'reject')}
                        className="flex-1 bg-red-600 text-white text-[10px] font-bold py-2 rounded uppercase tracking-widest hover:bg-red-700 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )) : (
                  <p className="text-center text-gray-400 py-20 font-light tracking-widest text-xs uppercase">No pending reviews.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Left: Video Player */}
        <div className="flex-[3] bg-gray-50 flex flex-col items-center justify-center relative border-r border-gray-100">
          {videoUrl ? (
            <>
              <video
                ref={videoRef}
                key={videoUrl}
                src={videoUrl}
                className="w-full h-full object-contain"
                controls
                onTimeUpdate={handleTimeUpdate}
              />
              {/* Overlay Subtitles on Video */}
              {showSubtitlesOnVideo && (
                <div className="absolute bottom-24 left-0 right-0 flex flex-col items-center pointer-events-none px-10 text-center">
                  {isProcessing && subtitles.length === 0 && (
                    <div className="flex flex-col items-center bg-black/90 px-8 py-6 rounded-2xl shadow-2xl backdrop-blur-xl border border-white/10 w-full max-w-md">
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-4">
                        <div
                          className="h-full bg-blue-500 transition-all duration-500 ease-out shadow-[0_0_10px_#3b82f6]"
                          style={{ width: `${processingStatus.progress}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between w-full mb-1">
                        <p className="text-white font-bold tracking-widest text-xs uppercase">AI Analysis</p>
                        <p className="text-blue-400 font-mono text-xs">{Math.round(processingStatus.progress)}%</p>
                      </div>
                      <p className="text-white/60 text-[10px] uppercase tracking-[0.1em] text-center italic">
                        {processingStatus.message}
                      </p>
                    </div>
                  )}

                  {subtitles.map((sub, index) => {
                    const isActive = currentTime >= sub.start && currentTime <= sub.end;
                    if (!isActive) return null;
                    return (
                      <div key={index} className="bg-black/80 px-5 py-2 rounded shadow-2xl backdrop-blur-md">
                        {showEnglish && <p className="text-2xl font-bold text-white mb-1">{sub.text}</p>}
                        {showChinese && <p className="text-lg text-gray-300">{sub.translation}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="text-gray-300 flex flex-col items-center">
              <Play size={80} strokeWidth={1} className="mb-4 opacity-40" />
              <p className="text-lg font-light tracking-widest text-gray-400 uppercase">Select Source to Start</p>
            </div>
          )}
        </div>

        {/* Right: Subtitle Sidebar */}
        <div className="flex-1 border-l border-gray-100 flex flex-col bg-white z-0">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h2 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2 text-black">
              <Languages size={14} /> Transcript
              {isProcessing && <span className="ml-2 w-2 h-2 bg-blue-600 rounded-full animate-ping"></span>}
            </h2>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar relative"
          >
            {isProcessing && subtitles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full space-y-6 px-6 text-center">
                <div className="relative">
                  <div className="w-16 h-16 border-2 border-gray-100 border-t-blue-600 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-blue-600">
                    {Math.round(processingStatus.progress)}%
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-black">
                    {processingStatus.progress < 50 ? 'Recognizing' : 'Translating'}
                  </p>
                  <p className="text-[10px] text-gray-400 leading-relaxed uppercase tracking-widest px-4">
                    {processingStatus.message}
                  </p>
                </div>
                <div className="w-full max-w-[180px] h-[3px] bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-black transition-all duration-1000"
                    style={{ width: `${processingStatus.progress}%` }}
                  ></div>
                </div>
              </div>
            ) : subtitles.length > 0 ? (
              subtitles.map((sub, index) => {
                const isActive = currentTime >= sub.start && currentTime <= sub.end;
                return (
                  <div
                    key={index}
                    id={`sub-${index}`}
                    className={`p-4 rounded transition-all cursor-pointer ${
                      isActive ? 'bg-black text-white shadow-xl scale-[1.02]' : 'hover:bg-gray-100 text-gray-800'
                    }`}
                    onClick={() => {
                      if (videoRef.current) videoRef.current.currentTime = sub.start;
                    }}
                  >
                    {showEnglish && (
                      <div className={`text-base leading-relaxed font-medium flex flex-wrap gap-x-1.5 ${isActive ? 'text-white' : 'text-black'}`}>
                        {sub.text.split(' ').map((word, wIdx) => (
                          <span
                            key={wIdx}
                            className="hover:underline hover:text-blue-500 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleWordClick(word, sub.text, index);
                            }}
                          >
                            {word}
                          </span>
                        ))}
                      </div>
                    )}
                    {showChinese && (
                      <p className={`text-sm mt-2 leading-relaxed ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>
                        {sub.translation}
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full opacity-20">
                <Languages size={40} strokeWidth={1} className="mb-3 text-black" />
                <p className="text-xs uppercase tracking-widest font-bold text-black">Empty Script</p>
              </div>
            )}
          </div>
        </div>

        {/* Dictionary Sidebar (New) */}
        {lookupWord && (
          <div className="w-[400px] border-l border-gray-200 bg-gray-50 flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl z-20">
            <div className="p-5 border-b border-gray-200 bg-white space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="font-black text-xl tracking-tight uppercase">Dictionary</h2>
                <button
                  onClick={() => setLookupWord(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <div className="text-2xl font-light text-gray-400 leading-none">×</div>
                </button>
              </div>
              <button
                onClick={handleAiContextLookup}
                disabled={isAiLoading}
                className="w-full text-left p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border border-blue-100 flex items-center justify-center gap-2"
              >
                {isAiLoading ? (
                  <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                ) : <Settings size={12} />}
                {isAiLoading ? 'Analyzing Context...' : '还是不理解该单词在原句中的意思？点击使用AI帮助'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
              {/* AI Explanation Area */}
              {aiExplanation && (
                <div className="p-5 bg-blue-600 text-white rounded-2xl shadow-xl animate-in fade-in slide-in-from-top-4 duration-500 space-y-3">
                  <div className="flex items-center gap-2 border-b border-white/20 pb-2">
                    <Settings size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Contextual AI Analysis</span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">
                    {aiExplanation}
                  </p>
                </div>
              )}

              {isLookingUp ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4">
                  <div className="w-10 h-10 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Searching "{lookupWord.word}"...</p>
                </div>
              ) : lookupWord.data ? (
                lookupWord.data.map((entry: any, eIdx: number) => (
                  <div key={eIdx} className="space-y-6 pb-8 border-b border-gray-200 last:border-0">
                    <div>
                      <h3 className="text-3xl font-black text-black">{entry.word}</h3>
                      <p className="text-blue-600 font-mono text-lg mt-2">{entry.phonetic || "暂无音标"}</p>
                    </div>

                    {entry.meanings && entry.meanings.length > 0 ? entry.meanings.map((meaning: any, mIdx: number) => (
                      <div key={mIdx} className="space-y-4">
                        <span className="inline-block px-3 py-1 bg-black text-white text-xs font-black italic rounded">
                          {meaning.partOfSpeech || "n/a"}
                        </span>
                        <ul className="space-y-6">
                          {meaning.definitions.map((def: any, dIdx: number) => (
                            <li key={dIdx} className="text-base border-l-4 border-gray-200 pl-4 py-2 space-y-2">
                              {/* 英文解释 */}
                              <div className="flex gap-2">
                                <span className="font-black text-gray-300 shrink-0">DEF.</span>
                                <p className="text-gray-900 leading-relaxed font-medium">{def.definition || "暂无定义"}</p>
                              </div>

                              {/* 中文解释 (由后端通过百炼翻译注入) */}
                              {def.translation && (
                                <div className="flex gap-2">
                                  <span className="font-black text-blue-200 shrink-0">意义.</span>
                                  <p className="text-blue-700 leading-relaxed">{def.translation}</p>
                                </div>
                              )}

                              {/* 例句 */}
                              {def.example && (
                                <div className="mt-3 p-3 bg-white rounded-lg border border-gray-100 shadow-sm space-y-2">
                                  <div className="flex gap-2">
                                    <span className="font-black text-gray-300 shrink-0 text-sm">e.g.</span>
                                    <p className="text-gray-500 text-sm italic">"{def.example}"</p>
                                  </div>
                                  {def.example_translation && (
                                    <div className="flex gap-2">
                                      <span className="font-black text-blue-200 shrink-0 text-sm">例.</span>
                                      <p className="text-blue-500 text-sm">{def.example_translation}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )) : <p className="text-base text-gray-400">暂无释义资料</p>}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
                  <p className="text-4xl font-black opacity-10">404</p>
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                    {lookupWord.error || "Word Not Found"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <style>{`
        @keyframes progress {
          0% { transform: scaleX(0); }
          50% { transform: scaleX(0.7); }
          100% { transform: scaleX(1); }
        }
        .animate-progress {
          animation: progress 30s infinite linear;
        }
      `}</style>
    </div>
  );
}

export default App;

