import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Upload, Play, Settings, Languages, Folder, History } from 'lucide-react';

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
}

function App() {
  // 设置后端 API 地址，如果是部署在云端，请更改为云服务器 IP 或域名
  const API_BASE_URL = 'http://localhost:8000';

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [library, setLibrary] = useState<VideoFile[]>([]);
  const [uploads, setUploads] = useState<VideoFile[]>([]); // 新增：上传记录状态
  const [showLibrary, setShowLibrary] = useState(false);
  const [showUploads, setShowUploads] = useState(false); // 新增：上传记录显示控制
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState({ progress: 0, message: '' }); // 新增：处理状态详情
  const [showEnglish, setShowEnglish] = useState(true);
  const [showChinese, setShowChinese] = useState(true);
  const [showSubtitlesOnVideo, setShowSubtitlesOnVideo] = useState(true); // 控制视频画面上字幕显示的开关
  const [currentTime, setCurrentTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null); // 新增：侧边栏滚动容器引用

  // 获取资源库列表和上传记录
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
  }, [API_BASE_URL]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_BASE_URL}/upload`, formData);
      const id = response.data.file_id;
      setFileId(id);
      setVideoUrl(`${API_BASE_URL}/videos/uploads/${id}.mp4`);
      setSubtitles([]);
      setIsProcessing(true); // 设置处理状态
      pollSubtitles(id);

      // 刷新上传记录列表
      const updatedUploads = await axios.get(`${API_BASE_URL}/uploads`);
      setUploads(updatedUploads.data.map((v: any) => ({ ...v, source: 'upload' })));
    } catch (error) {
      console.error('Upload failed', error);
      setIsProcessing(false);
    } finally {
      setIsUploading(false);
    }
  };

  const selectFromLibrary = async (video: VideoFile) => {
    setFileId(video.id);
    setVideoUrl(`${video.thumbnail?.includes('http') ? '' : API_BASE_URL}${video.path.startsWith('http') ? '' : (video.path.startsWith('/') ? '' : '/')}${video.path}`);
    // 上面这行逻辑有点复杂，简化为统一处理：
    const finalVideoUrl = video.path.startsWith('http') ? video.path : `${API_BASE_URL}${video.path}`;
    setVideoUrl(finalVideoUrl);

    setSubtitles([]);
    setShowLibrary(false);
    setShowUploads(false); // 关闭上传记录面板
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

  const pollSubtitles = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/subtitles/${id}`);

        if (response.data.status === 'completed') {
          setSubtitles(response.data.data);
          setIsProcessing(false);
          setProcessingStatus({ progress: 100, message: 'Done' });
          clearInterval(interval);
        } else {
          // 更新处理进度
          setProcessingStatus({
            progress: response.data.progress || 0,
            message: response.data.message || 'Processing...'
          });
        }
      } catch (error) {
        console.error('Failed to fetch subtitles', error);
      }
    }, 2000); // 缩短轮询间隔，提升进度感
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

  return (
    <div className="flex flex-col h-screen bg-white text-black font-sans">
      {/* Header */}
      <header className="p-4 border-b border-gray-200 flex justify-between items-center bg-white shadow-sm z-10">
        <h1 className="text-xl font-bold tracking-tight text-black">ENGLISH STUDY</h1>
        <div className="flex gap-4 items-center">
          <button
            onClick={() => { setShowLibrary(!showLibrary); setShowUploads(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-medium transition-all ${showLibrary ? 'bg-black text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
          >
            <Folder size={16} />
            LIBRARY
          </button>

          <button
            onClick={() => { setShowUploads(!showUploads); setShowLibrary(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-medium transition-all ${showUploads ? 'bg-black text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
          >
            <History size={16} />
            HISTORY
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

          <button
            onClick={() => setShowSubtitlesOnVideo(!showSubtitlesOnVideo)}
            className={`flex items-center gap-2 px-4 py-2 rounded text-xs font-medium transition-all ${showSubtitlesOnVideo ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
            title={showSubtitlesOnVideo ? "关闭视频字幕" : "开启视频字幕"}
          >
            <Languages size={16} />
            {showSubtitlesOnVideo ? 'SUB ON' : 'SUB OFF'}
          </button>

          <label className="cursor-pointer bg-black hover:bg-gray-800 text-white px-4 py-2 rounded flex items-center gap-2 transition-all font-medium active:scale-95">
            <Upload size={18} />
            {isUploading ? '...' : 'UPLOAD'}
            <input type="file" className="hidden" onChange={handleUpload} accept="video/*" />
          </label>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden relative">
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
                        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
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
                    onClick={() => selectFromLibrary(video)}
                    className="group border border-gray-200 p-4 rounded hover:border-black cursor-pointer transition-all hover:bg-gray-50 flex items-center gap-4"
                  >
                    <div className="w-24 aspect-video bg-gray-100 flex items-center justify-center rounded overflow-hidden relative">
                      {video.thumbnail ? (
                        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
                      ) : (
                        <Play size={20} className="text-gray-300 group-hover:text-black transition-colors" />
                      )}
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play size={24} className="text-white fill-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm truncate uppercase tracking-tight">{video.title}</h3>
                      <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-medium">Recorded Upload</p>
                    </div>
                  </div>
                )) : (
                  <p className="text-center text-gray-400 py-20 font-light tracking-widest text-xs">NO UPLOAD HISTORY FOUND.</p>
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
                        <p className="text-blue-400 font-mono text-xs">{processingStatus.progress}%</p>
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
        <div className="flex-1 border-l border-gray-100 flex flex-col bg-white">
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
                    {processingStatus.progress}%
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-black">{processingStatus.progress < 30 ? 'Preparing' : 'Analyzing'}</p>
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
                      <p className={`text-base leading-relaxed font-medium ${isActive ? 'text-white' : 'text-black'}`}>
                        {sub.text}
                      </p>
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
