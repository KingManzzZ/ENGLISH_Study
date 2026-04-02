import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Upload, Play, Languages, Folder, History, LogOut, User, Eye, EyeOff, Sparkles, ChevronLeft, Compass } from 'lucide-react';

interface Subtitle {
  start: number;
  end: number;
  text: string;
  translation: string;
  translation_status?: 'ok' | 'failed';
  translation_source?: string;
}

interface VideoFile {
  id: string;
  title: string;
  path: string;
  thumbnail?: string;
  source: 'upload' | 'library';
  status?: 'private' | 'pending' | 'approved' | 'rejected';
}

export interface ListeningPageProps {
  username: string;
  isAdmin: boolean;
  onLogout: () => void;
}

function ListeningPage({ username, isAdmin, onLogout }: ListeningPageProps) {
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  const API_TOKEN = process.env.REACT_APP_API_TOKEN || '';

  const [uploadError, setUploadError] = useState(''); // 新增：上传错误状态

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [library, setLibrary] = useState<VideoFile[]>([]);
  const [uploads, setUploads] = useState<VideoFile[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showUploads, setShowUploads] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
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
  const [repairingSubtitleIndex, setRepairingSubtitleIndex] = useState<number | null>(null);
  const [repairingExampleKey, setRepairingExampleKey] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dictionaryScrollRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<any>(null);
  const [followTranscript, setFollowTranscript] = useState(true);
  const ignoreTranscriptScrollRef = useRef(false);
  const lastTranscriptActiveIndexRef = useRef(-1);

  useEffect(() => {
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
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [API_BASE_URL]);

  useEffect(() => {
    lastTranscriptActiveIndexRef.current = -1;
    setFollowTranscript(true);
  }, [fileId]);

  useEffect(() => {
    if (!aiExplanation || !dictionaryScrollRef.current) return;
    dictionaryScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  }, [aiExplanation]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 检查文件大小 (500MB)
    const MAX_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('File is too large. Max limit is 500MB.');
      setTimeout(() => setUploadError(''), 3000);
      return;
    }

    setUploadError('');
    setIsUploading(true);

    // 先预览视频，AI 处理中状态由后端确认后再开启
    const localUrl = URL.createObjectURL(file);
    setVideoUrl(localUrl);
    setSubtitles([]);
    setProcessingStatus({ progress: 0, message: '' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: {
          ...(API_TOKEN ? { 'X-Token': API_TOKEN } : {})
        }
      });

      const id = response.data.file_id;
      setFileId(id);
      setIsProcessing(true);
      setProcessingStatus({ progress: 1, message: 'Initializing AI Engine...' });

      const serverVideoUrl = `${API_BASE_URL}/videos/user_uploads/${username}/uploads/${id}${file.name.substring(file.name.lastIndexOf('.'))}`;
      setVideoUrl(serverVideoUrl);

      pollSubtitles(id);

      const updatedUploads = await axios.get(`${API_BASE_URL}/uploads`);
      setUploads(updatedUploads.data.map((v: any) => ({ ...v, source: 'upload' })));
    } catch (error: any) {
      console.error('Upload failed', error);
      const detail = error.response?.data?.detail || 'Upload failed. Please try again.';

      if (error.response?.status === 403) {
        setUploadError(`Upload blocked: ${detail}`);
      } else if (error.response?.status === 401) {
        setUploadError('Session expired. Please login again.');
      } else {
        setUploadError(detail);
      }

      setTimeout(() => setUploadError(''), 6000);
      setIsProcessing(false);
      setProcessingStatus({ progress: 0, message: '' });
    } finally {
      setIsUploading(false);
    }
  };

  const pollSubtitles = async (id: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
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
            if (apiProgress !== undefined && apiProgress > 15) {
              return { progress: Math.max(prev.progress, apiProgress), message: apiMessage || 'Processing...' };
            }

            if (prev.progress < 50) {
              const jump = apiProgress === 1 && prev.progress < 2 ? 2 : 0.8;
              return { progress: Math.min(49.2, prev.progress + jump), message: apiMessage || 'Analyzing audio...' };
            }

            return prev;
          });
        }
      } catch (error) {
        console.error('Failed to fetch subtitles', error);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    }, 1000);
  };

  const selectFromLibrary = async (video: VideoFile) => {
    setFileId(video.id);
    const finalVideoUrl = video.path.startsWith('http') ? video.path : `${API_BASE_URL}${video.path}`;
    setVideoUrl(finalVideoUrl);
    setSubtitles([]);
    setShowLibrary(false);
    setShowUploads(false);
    setIsAdminMode(false);
    setIsProcessing(true);

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
      const updatedUploads = await axios.get(`${API_BASE_URL}/uploads`);
      setUploads(updatedUploads.data.map((v: any) => ({ ...v, source: 'upload' })));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to submit review');
    }
  };

  const fetchPendingReviews = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/admin/pending`, {
        headers: { ...(API_TOKEN ? { 'X-Token': API_TOKEN } : {}) }
      });
      setPendingReviews(res.data);
    } catch (err) {
      console.error('Failed to fetch pending reviews', err);
    }
  };

  const handleAdminAction = async (videoId: string, action: 'approve' | 'reject') => {
    try {
      await axios.post(`${API_BASE_URL}/admin/${action}/${videoId}`, {}, {
        headers: { ...(API_TOKEN ? { 'X-Token': API_TOKEN } : {}) }
      });
      alert(`Video ${action}ed!`);
      fetchPendingReviews();
      const libRes = await axios.get(`${API_BASE_URL}/library`);
      setLibrary(libRes.data.map((v: any) => ({ ...v, source: 'library' })));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Action failed');
    }
  };

  const scrollTranscriptToActive = (activeIndex: number) => {
    const activeElement = document.getElementById(`sub-${activeIndex}`);
    const container = scrollRef.current;
    if (!activeElement || !container) return;
    const scrollTarget =
      activeElement.offsetTop - container.clientHeight / 2 + activeElement.clientHeight / 2;
    ignoreTranscriptScrollRef.current = true;
    container.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
    window.setTimeout(() => {
      ignoreTranscriptScrollRef.current = false;
    }, 400);
  };

  const handleTranscriptScroll = () => {
    if (ignoreTranscriptScrollRef.current) return;
    setFollowTranscript(false);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    const activeIndex = subtitles.findIndex((sub) => time >= sub.start && time <= sub.end);
    if (activeIndex === -1) return;

    if (!followTranscript) return;
    if (activeIndex === lastTranscriptActiveIndexRef.current) return;

    lastTranscriptActiveIndexRef.current = activeIndex;
    scrollTranscriptToActive(activeIndex);
  };

  const handleCloseAiExplanation = () => {
    setAiExplanation(null);
  };

  const handleWordClick = async (word: string, context: string, index: number) => {
    // 清理单词
    const cleanWord = word.replace(/[.,!?()[\]"']/g, "");
    if (!cleanWord || cleanWord.length < 2) return;

    // 立即重置相关状态，防止上一个单词的数据残留
    setIsLookingUp(true);
    handleCloseAiExplanation();
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

  const sanitizeAiExplanation = (text: string) => {
    // Remove markdown-style '*' noise from model output.
    return text.replace(/\*/g, '').trim();
  };

  const handleAiContextLookup = async () => {
    if (!lookupWord || !lookupWord.word) return;

    // 已有结果时不重复请求
    if (aiExplanation && !isAiLoading) {
      return;
    }

    setIsAiLoading(true);
    setAiExplanation(null);

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
        const cleaned = sanitizeAiExplanation(res.data.explanation || '');
        setAiExplanation(cleaned);
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

  const handleSubtitleAiRepair = async (index: number) => {
    if (!fileId) {
      setUploadError('当前视频未绑定 file_id，无法AI修复。');
      return;
    }

    setRepairingSubtitleIndex(index);
    try {
      const res = await axios.post(`${API_BASE_URL}/subtitles/${fileId}/ai_repair`, {
        segment_index: index
      });

      if (res.data.status === 'success') {
        setSubtitles(prev => prev.map((s, i) => i === index
          ? { ...s, translation: res.data.translation, translation_status: 'ok', translation_source: 'ai_repair' }
          : s
        ));
      }
    } catch (err: any) {
      console.error('AI repair subtitle failed', err);
      setUploadError(err.response?.data?.detail || 'AI 修复失败，请稍后再试');
      setTimeout(() => setUploadError(''), 4000);
    } finally {
      setRepairingSubtitleIndex(null);
    }
  };

  const handleDictionaryExampleAiRepair = async (
    entryIdx: number,
    meaningIdx: number,
    defIdx: number,
    exampleText: string
  ) => {
    const key = `${entryIdx}-${meaningIdx}-${defIdx}`;
    setRepairingExampleKey(key);
    try {
      const res = await axios.post(`${API_BASE_URL}/lookup/ai_translate_text`, {
        text: exampleText
      });

      if (res.data.status === 'success') {
        setLookupWord((prev: any) => {
          if (!prev?.data) return prev;
          const nextData = [...prev.data];
          const target = nextData?.[entryIdx]?.meanings?.[meaningIdx]?.definitions?.[defIdx];
          if (!target) return prev;
          target.example_translation = res.data.translation;
          return { ...prev, data: nextData };
        });
      }
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'AI 例句翻译失败，请稍后再试');
      setTimeout(() => setUploadError(''), 4000);
    } finally {
      setRepairingExampleKey(null);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-emerald-50 text-black font-sans relative overflow-hidden">
      {/* Header */}
      <header className="border-b border-sky-100 flex justify-between items-center bg-white/60 backdrop-blur-md shadow-sm z-10 px-4 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="flex items-center gap-1.5 shrink-0 text-sm font-bold text-gray-600 hover:text-black border border-gray-300 rounded-lg px-3 py-2 transition-all hover:border-black hover:bg-white"
            title="返回学习首页"
          >
            <ChevronLeft size={18} />
            首页
          </Link>
          <h1 className="text-2xl font-black tracking-tight text-black flex items-center gap-2 truncate">
            <span className="hidden sm:inline">视频学习</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-medium tracking-tighter shrink-0">LISTEN</span>
          </h1>
        </div>
        <div className="flex gap-4 items-center flex-wrap justify-end">
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
              className="flex items-center gap-2 text-sm font-semibold text-gray-700 mr-4 border-r border-sky-100 pr-4 cursor-pointer select-none group hover:text-blue-600 transition-colors"
            >
              <User size={14} className={isAdminMode ? 'text-red-500' : 'text-blue-500'} />
              <span className={isAdminMode ? 'text-red-500' : ''}>
                {username.toUpperCase()}
              </span>
              {isAdminMode ? (
                <span className="ml-1 text-[8px] bg-red-500 text-white px-1 rounded animate-pulse">ADMIN</span>
              ) : (
                <span className="ml-1 text-[8px] bg-blue-100 text-blue-600 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">USER</span>
              )}
            </div>
          )}

          {!isAdmin && (
            <div className="hidden md:flex items-center gap-2 text-sm font-semibold text-gray-700 mr-4 border-r border-sky-100 pr-4">
              <User size={14} className="text-blue-500" />
              {username.toUpperCase()}
            </div>
          )}

          <button
            type="button"
            onClick={() => { setShowLibrary(!showLibrary); setShowUploads(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${showLibrary ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-white text-gray-700 border border-gray-200 hover:border-blue-200 hover:text-blue-600'}`}
          >
            <Folder size={16} />
            库
          </button>

          <button
            type="button"
            onClick={() => { setShowUploads(!showUploads); setShowLibrary(false); setIsAdminMode(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${showUploads ? 'bg-cyan-100 text-cyan-700 border border-cyan-200' : 'bg-white text-gray-700 border border-gray-200 hover:border-cyan-200 hover:text-cyan-600'}`}
          >
            <History size={16} />
            历史
          </button>

          {/* 视频字幕开关按钮 */}
          <button
            onClick={() => setShowSubtitlesOnVideo(!showSubtitlesOnVideo)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${showSubtitlesOnVideo ? 'bg-sky-100 text-sky-700 border border-sky-200' : 'bg-white text-gray-700 border border-gray-200 hover:border-sky-200'}`}
            title="切换视频字幕显示"
          >
            {showSubtitlesOnVideo ? <Eye size={16} /> : <EyeOff size={16} />}
            {showSubtitlesOnVideo ? '字幕' : '无字'}
          </button>

          {/* 移除原顶部“恢复跟随”文字按钮，改为字幕面板右上角指南针图标 */}

          <div className="flex bg-white rounded-lg p-1 gap-1 border border-gray-200 shadow-sm">
            <button
              onClick={() => setShowEnglish(!showEnglish)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${showEnglish ? 'bg-sky-100 text-sky-700 border border-sky-200' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              EN
            </button>
            <button
              onClick={() => setShowChinese(!showChinese)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${showChinese ? 'bg-sky-100 text-sky-700 border border-sky-200' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              CN
            </button>
          </div>

          <div className="relative group">
            <label className="cursor-pointer bg-sky-100 text-slate-700 border border-sky-200 hover:bg-sky-200 hover:border-sky-300 px-4 py-2 rounded-lg flex items-center gap-2 transition-all font-semibold active:scale-95 shadow-none">
              <Upload size={18} />
              {isUploading ? '...' : 'UPLOAD'}
              <input type="file" className="hidden" onChange={handleUpload} accept="video/*" title="Max size: 500MB" />
            </label>
            <div className="absolute top-full mt-2 right-0 bg-white border border-gray-100 shadow-xl rounded px-3 py-1.5 text-[10px] text-gray-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 font-bold uppercase tracking-tighter">
              MAX SIZE: 500MB
            </div>
          </div>

          <button
            onClick={onLogout}
            className="p-2 hover:bg-red-100 text-gray-500 hover:text-red-600 rounded-lg transition-all"
            title="退出登录"
          >
            <LogOut size={20} />
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
        {showLibrary && (
          <div className="absolute inset-0 bg-black/40 z-50 flex justify-end">
            <div className="w-full max-w-md bg-gradient-to-br from-white to-sky-50 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-sky-100 flex justify-between items-center bg-white/70 backdrop-blur-sm sticky top-0">
                <h2 className="text-xl font-bold tracking-tight text-black">视频库</h2>
                <button type="button" onClick={() => setShowLibrary(false)} className="text-xs font-bold text-gray-600 hover:text-black py-2 px-4 border border-gray-300 rounded-lg hover:border-black transition-all">关闭</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {library.length > 0 ? library.map((video) => (
                  <div
                    key={video.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectFromLibrary(video)}
                    onKeyDown={(e) => e.key === 'Enter' && selectFromLibrary(video)}
                    className="group border-2 border-white p-4 rounded-xl hover:border-blue-300 cursor-pointer transition-all hover:bg-white hover:shadow-md flex items-center gap-4 bg-white/80 backdrop-blur-sm"
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
                  <p className="text-center text-gray-400 py-20 font-light tracking-widest text-xs">LIBRARY IS EMPTY.<br />PUT VIDEOS IN DATA/LIBRARY</p>
                )}
              </div>
            </div>
          </div>
        )}

        {showUploads && (
          <div className="absolute inset-0 bg-black/40 z-50 flex justify-end">
            <div className="w-full max-w-md bg-gradient-to-br from-white to-cyan-50 h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-sky-100 flex justify-between items-center bg-white/70 backdrop-blur-sm sticky top-0">
                <h2 className="text-xl font-bold tracking-tight text-black">上传历史</h2>
                <button type="button" onClick={() => setShowUploads(false)} className="text-xs font-bold text-gray-600 hover:text-black py-2 px-4 border border-gray-300 rounded-lg hover:border-black transition-all">关闭</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {uploads.length > 0 ? uploads.map((video) => (
                  <div
                    key={video.id}
                    className="group relative border-2 border-white p-4 rounded-xl hover:border-cyan-300 cursor-pointer transition-all hover:shadow-md flex items-center gap-4 bg-white/80 backdrop-blur-sm"
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
                    {video.status === 'private' && (
                      <button
                        type="button"
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

        {isAdminMode && (
          <div className="absolute inset-0 bg-black/40 z-50 flex justify-end">
            <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-red-100 flex justify-between items-center bg-gray-50 sticky top-0">
                <h2 className="text-xl font-bold tracking-tighter text-red-600">ADMIN REVIEW PANEL</h2>
                <button type="button" onClick={() => setIsAdminMode(false)} className="text-xs font-bold hover:underline py-2 px-4 border border-red-600 text-red-600 rounded">EXIT ADMIN</button>
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
                        type="button"
                        onClick={() => handleAdminAction(req.file_id, 'approve')}
                        className="flex-1 bg-green-600 text-white text-[10px] font-bold py-2 rounded uppercase tracking-widest hover:bg-green-700 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
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
        <div className="flex-[3] bg-gradient-to-br from-gray-900 to-black flex flex-col items-center justify-center relative border-r border-sky-200/20">
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
                        {showEnglish && <p className="dict-en text-2xl font-bold text-white mb-1">{sub.text}</p>}
                        {showChinese && <p className="dict-zh text-lg text-gray-300">{sub.translation}</p>}
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
        <div className="flex-1 border-l border-sky-200/30 flex flex-col bg-gradient-to-br from-white to-sky-50/50 z-0">
          <div className="p-4 border-b border-sky-100/50 flex justify-between items-center bg-white/80 backdrop-blur-sm">
            <h2 className="font-bold text-sm uppercase tracking-widest flex items-center gap-2 text-black">
              <Languages size={14} className="text-blue-600" /> 字幕
              {isProcessing && <span className="ml-2 w-2 h-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full animate-ping"></span>}
            </h2>
            {!followTranscript && (
              <button
                type="button"
                onClick={() => {
                  setFollowTranscript(true);
                  const t = videoRef.current?.currentTime ?? 0;
                  const idx = subtitles.findIndex((sub) => t >= sub.start && t <= sub.end);
                  lastTranscriptActiveIndexRef.current = -1;
                  if (idx !== -1) scrollTranscriptToActive(idx);
                }}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-all"
                title="恢复跟随"
              >
                <Compass size={16} />
              </button>
            )}
          </div>

          <div
            ref={scrollRef}
            onScroll={handleTranscriptScroll}
            className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar relative overscroll-contain"
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
                    className={`p-4 rounded-2xl transition-all cursor-pointer ${
                      isActive ? 'bg-gray-700 text-white shadow-md scale-[1.02]' : 'hover:bg-white/60 text-gray-800 bg-white/40 backdrop-blur-sm'
                    }`}
                    onClick={() => {
                      setFollowTranscript(true);
                      lastTranscriptActiveIndexRef.current = index;
                      if (videoRef.current) videoRef.current.currentTime = sub.start;
                    }}
                  >
                    {showEnglish && (
                      <div className={`dict-en text-base leading-relaxed font-medium flex flex-wrap gap-x-1.5 ${isActive ? 'text-white' : 'text-gray-900'}`}>
                        {sub.text.split(' ').map((word, wIdx) => (
                          <span
                            key={wIdx}
                            className={isActive ? 'hover:underline hover:text-yellow-200 transition-colors cursor-pointer' : 'hover:underline hover:text-blue-600 transition-colors cursor-pointer'}
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
                      sub.translation_status === 'failed' ? (
                        <button
                          className={`mt-2 inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-all ${isActive ? 'border-gray-500 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSubtitleAiRepair(index);
                          }}
                          disabled={repairingSubtitleIndex === index}
                        >
                          <Sparkles size={12} className={repairingSubtitleIndex === index ? 'animate-pulse' : ''} />
                          {repairingSubtitleIndex === index ? 'AI 协助翻译中...' : 'emmm，这句翻译好像出问题了，点击尝试ai协助翻译'}
                        </button>
                      ) : (
                        <p className={`dict-zh text-sm mt-2 leading-relaxed ${isActive ? 'text-gray-300' : 'text-gray-500'}`}>
                          {sub.translation}
                        </p>
                      )
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
          <div className="w-[400px] border-l border-sky-200/30 bg-gradient-to-br from-white to-cyan-50 flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl z-20">
            <div className="p-5 border-b border-sky-100 bg-white/80 backdrop-blur-sm space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="font-black text-2xl tracking-tight text-black">词典</h2>
                <button
                  onClick={() => setLookupWord(null)}
                  className="p-2 hover:bg-red-100 rounded-full transition-colors text-gray-400 hover:text-red-500"
                >
                  <div className="text-2xl font-light leading-none">×</div>
                </button>
              </div>
              <button
                onClick={handleAiContextLookup}
                disabled={isAiLoading}
                className="w-full text-left p-3 bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100 text-blue-700 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border-2 border-blue-200 hover:border-blue-400 flex items-center justify-center gap-2"
              >
                {isAiLoading ? (
                  <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                ) : <Sparkles size={12} />}
                {isAiLoading ? '正在分析...' : '还是不懂？点击试试AI语境分析'}
              </button>
            </div>

            <div
              ref={dictionaryScrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gradient-to-br from-white to-sky-50"
            >
              {/* AI Explanation Card */}
              {aiExplanation && (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-200 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-blue-600" />
                      <span className="text-xs font-black uppercase tracking-widest text-gray-700">AI语境分析结果</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCloseAiExplanation}
                      className="w-7 h-7 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all"
                      title="关闭"
                    >
                      ×
                    </button>
                  </div>
                  <p className="dict-zh text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
                    {aiExplanation}
                  </p>
                </div>
              )}

              {isLookingUp ? (
                <div className="flex flex-col items-center justify-center h-full space-y-4 py-20">
                  <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Searching...</p>
                </div>
              ) : lookupWord.data ? (
                <div className="space-y-8">
                  {/* 只在最顶部显示一次单词和音标 */}
                  {lookupWord.data[0] && (
                    <div className="pb-6 border-b border-gray-100">
                      <h3 className="dict-en text-3xl font-black text-black tracking-tight uppercase">{lookupWord.data[0].word}</h3>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="dict-en text-blue-600 font-mono text-sm font-medium">
                          /{lookupWord.data[0].phonetic || "n/a"}/
                        </span>
                      </div>
                    </div>
                  )}

                  {lookupWord.data.map((entry: any, eIdx: number) => (
                    <div key={eIdx} className="space-y-8">
                      {entry.meanings && entry.meanings.length > 0 ? entry.meanings.map((meaning: any, mIdx: number) => (
                        <div key={mIdx} className="space-y-4">
                          <div className="flex items-center gap-2">
                            <span className="bg-black text-white px-2.5 py-0.5 rounded text-[10px] font-black font-mono tracking-widest uppercase">
                              {meaning.partOfSpeech || "n/a"}
                            </span>
                            <div className="h-[1px] flex-1 bg-gray-100"></div>
                          </div>

                          <div className="space-y-6">
                            {meaning.definitions.map((def: any, dIdx: number) => (
                              <div key={dIdx} className="group space-y-3">
                                <div className="space-y-1.5">
                                  <p className="dict-en text-gray-900 leading-relaxed font-medium text-base">
                                    <span className="text-gray-700 mr-2 font-mono text-xs">{dIdx + 1}.</span>
                                    {def.definition}
                                  </p>
                                  {def.translation && (
                                    <div className="bg-gray-50 border-l-2 border-gray-600 p-2.5 rounded-r-lg">
                                      <p className="dict-zh text-gray-700 font-semibold text-sm">{def.translation}</p>
                                    </div>
                                  )}
                                </div>

                                {def.example && (
                                  <div className="ml-5 pl-3 border-l border-gray-100 space-y-1.5">
                                    <p className="dict-en text-gray-500 text-sm italic leading-relaxed">
                                      &ldquo;{def.example}&rdquo;
                                    </p>
                                    {def.example_translation ? (
                                      <p className="dict-zh text-gray-600 text-xs leading-relaxed">
                                        <span className="font-bold mr-1">译</span>
                                        {def.example_translation}
                                      </p>
                                    ) : (
                                      <button
                                        className="inline-flex items-center gap-1.5 text-[11px] text-blue-600 border border-blue-200 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                                        onClick={() => handleDictionaryExampleAiRepair(eIdx, mIdx, dIdx, def.example)}
                                        disabled={repairingExampleKey === `${eIdx}-${mIdx}-${dIdx}`}
                                      >
                                        <Sparkles size={12} className={repairingExampleKey === `${eIdx}-${mIdx}-${dIdx}` ? 'animate-pulse' : ''} />
                                        {repairingExampleKey === `${eIdx}-${mIdx}-${dIdx}` ? 'AI翻译中...' : 'emm,翻译出现了点小问题~点击AI翻译例句'}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )) : null}
                    </div>
                  ))}
                </div>
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

export default ListeningPage;

