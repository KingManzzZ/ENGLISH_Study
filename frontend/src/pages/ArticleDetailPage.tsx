import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ChevronLeft, LogOut, User, BookOpen, Sparkles } from 'lucide-react';
import articles from '../data/articles.json';
import type { Article } from '../types/article';

export interface ArticleDetailPageProps {
  username: string;
  onLogout: () => void;
}

function ArticleDetailPage({ username, onLogout }: ArticleDetailPageProps) {
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  const { id } = useParams<{ id: string }>();
  const list = articles as Article[];
  const article = list.find((a) => a.id === id);
  const contentRef = useRef<HTMLDivElement>(null);
  const [readProgress, setReadProgress] = useState(0);
  const [lookupWord, setLookupWord] = useState<string | null>(null);
  const [lookupData, setLookupData] = useState<any[] | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [bubblePos, setBubblePos] = useState({ top: 0, left: 0 });
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [lookupContext, setLookupContext] = useState({ context: '', prev: '', next: '' });
  const bubbleRef = useRef<HTMLDivElement>(null);
  const wordAnchorRef = useRef<HTMLElement | null>(null);
  const BUBBLE_WIDTH = 340;

  const updateBubblePosition = () => {
    if (!wordAnchorRef.current) return;
    const rect = wordAnchorRef.current.getBoundingClientRect();
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - BUBBLE_WIDTH - 12));
    setBubblePos({ top: rect.bottom + 10, left });
  };

  const closeWordBubble = () => {
    setLookupWord(null);
    setLookupData(null);
    setLookupError(null);
    setAiExplanation(null);
    setIsAiLoading(false);
    wordAnchorRef.current = null;
  };

  const sanitizeAiExplanation = (text: string) => text.replace(/\*/g, '').trim();

  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current) return;
      const element = contentRef.current;
      const scrollTop = window.scrollY;
      const docHeight = element.offsetHeight;
      const winHeight = window.innerHeight;
      const totalScroll = docHeight - winHeight;
      const scrolled = (scrollTop / totalScroll) * 100;
      setReadProgress(Math.min(scrolled, 100));
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!lookupWord) return;
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        closeWordBubble();
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [lookupWord]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeWordBubble();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  useEffect(() => {
    if (!lookupWord) return;

    const handleRelayout = () => updateBubblePosition();
    handleRelayout();

    window.addEventListener('scroll', handleRelayout, { passive: true });
    window.addEventListener('resize', handleRelayout);
    return () => {
      window.removeEventListener('scroll', handleRelayout);
      window.removeEventListener('resize', handleRelayout);
    };
  }, [lookupWord]);

  const handleWordLookup = async (
    e: React.MouseEvent<HTMLSpanElement>,
    rawWord: string,
    context: string,
    prevContext: string,
    nextContext: string
  ) => {
    const cleanWord = rawWord.replace(/[.,!?()[]"';:]/g, '').trim();
    if (!cleanWord || cleanWord.length < 2) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const bubbleWidth = 340;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - bubbleWidth - 12));
    setBubblePos({ top: rect.bottom + 10, left });
    wordAnchorRef.current = e.currentTarget as HTMLElement;
    updateBubblePosition();

    setLookupWord(cleanWord);
    setLookupData(null);
    setLookupError(null);
    setAiExplanation(null);
    setIsAiLoading(false);
    setLookupContext({ context, prev: prevContext, next: nextContext });
    setIsLookingUp(true);

    try {
      const res = await axios.post(`${API_BASE_URL}/lookup`, { word: cleanWord, context });
      if (res.data.status === 'success') {
        setLookupData(res.data.data || []);
      } else {
        setLookupError(res.data.message || 'Word lookup failed');
      }
    } catch (err) {
      console.error('Word lookup failed', err);
      setLookupError('Word lookup failed');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleAiContextLookup = async () => {
    if (!lookupWord || !lookupContext.context) return;
    if (aiExplanation && !isAiLoading) return;

    setIsAiLoading(true);
    setAiExplanation(null);
    try {
      const res = await axios.post(`${API_BASE_URL}/lookup/ai_context`, {
        word: lookupWord,
        context: lookupContext.context,
        prev_context: lookupContext.prev,
        next_context: lookupContext.next,
      });
      if (res.data.status === 'success') {
        setAiExplanation(sanitizeAiExplanation(res.data.explanation || ''));
      }
    } catch (err) {
      console.error('AI context lookup failed', err);
      setAiExplanation('AI Analysis failed. Please try again.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const renderInteractiveParagraph = (text: string, idx: number) => {
    const tokens = text.split(/(\s+)/);
    const prevContext = idx > 0 ? paragraphs[idx - 1] : '';
    const nextContext = idx < paragraphs.length - 1 ? paragraphs[idx + 1] : '';

    return tokens.map((token, tokenIdx) => {
      if (/^\s+$/.test(token)) return <React.Fragment key={`${idx}-${tokenIdx}`}>{token}</React.Fragment>;
      const clean = token.replace(/[.,!?()[]"';:]/g, '').trim();
      if (clean.length < 2) return <React.Fragment key={`${idx}-${tokenIdx}`}>{token}</React.Fragment>;

      return (
        <span
          key={`${idx}-${tokenIdx}`}
          className="cursor-pointer rounded px-0.5 hover:bg-blue-100 hover:text-blue-700 transition-colors"
          onClick={(e) => handleWordLookup(e, token, text, prevContext, nextContext)}
        >
          {token}
        </span>
      );
    });
  };

  if (!id || !article) {
    return <Navigate to="/read" replace />;
  }

  const paragraphs = article.content.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const wordCount = article.content.split(/\s+/).length;
  const readTime = Math.ceil(wordCount / 150);

  // 难度等级的颜色映射
  const levelColorMap: Record<string, { bg: string; text: string; badge: string }> = {
    'Beginner': { bg: 'from-emerald-50 to-teal-50', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
    'Intermediate': { bg: 'from-amber-50 to-orange-50', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
    'Upper intermediate': { bg: 'from-orange-50 to-red-50', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700' },
    'Advanced': { bg: 'from-red-50 to-pink-50', text: 'text-red-700', badge: 'bg-red-100 text-red-700' },
  };

  const levelColor = levelColorMap[article.level] || { bg: 'from-gray-50 to-gray-100', text: 'text-gray-700', badge: 'bg-gray-100 text-gray-700' };

  return (
    <div className={`min-h-screen bg-gradient-to-br ${levelColor.bg}`}>
      {/* 阅读进度条 */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gray-200/30 z-50">
        <div
          className={`h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-300`}
          style={{ width: `${readProgress}%` }}
        ></div>
      </div>

      <header className="border-b border-white/30 bg-white/60 backdrop-blur-md sticky top-0 z-40 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link
            to="/read"
            className="flex items-center gap-1.5 shrink-0 text-sm font-bold text-gray-600 hover:text-black border border-gray-300 rounded-lg px-3 py-2 transition-all hover:border-black hover:bg-white"
          >
            <ChevronLeft size={18} />
            文章列表
          </Link>
          <div className="flex-1 text-center min-w-0">
            <p className={`text-xs font-bold uppercase tracking-widest ${levelColor.text}`}>
              {article.level}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <User size={16} className="text-indigo-500" />
              {username.toUpperCase()}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="p-2 rounded-lg hover:bg-red-100 text-gray-500 hover:text-red-600 transition-all"
              title="退出登录"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <article className="max-w-4xl mx-auto px-4 py-12" ref={contentRef}>
        {/* 文章头部 */}
        <div className="mb-12 text-center space-y-4">
          <div className="inline-block">
            <span className={`px-4 py-2 rounded-full text-sm font-bold ${levelColor.badge}`}>
              {article.level}
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 leading-tight">
            {article.title}
          </h1>
          <div className="flex items-center justify-center gap-6 text-gray-600 font-semibold">
            <div className="flex items-center gap-2">
              <BookOpen size={18} className="text-indigo-500" />
              <span>{wordCount} 词</span>
            </div>
            <span className="text-gray-400">•</span>
            <span>约 {readTime} 分钟阅读</span>
          </div>
        </div>

        {/* 分割线 */}
        <div className="w-12 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full mx-auto mb-12"></div>

        {/* 文章内容 */}
        <div className="prose prose-lg max-w-none space-y-8 text-gray-800 leading-relaxed">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-lg leading-8 text-gray-700 rounded-2xl p-6 bg-white/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300">
              {renderInteractiveParagraph(p, i)}
            </p>
          ))}
        </div>

        {/* 底部操作区 */}
        <div className="mt-16 pt-12 border-t-2 border-white/40 flex items-center justify-between gap-6">
          <div>
            <p className="text-sm text-gray-600 mb-2">继续你的学习</p>
            <h3 className="text-lg font-bold text-gray-900">已完成此篇文章</h3>
          </div>
          <Link
            to="/read"
            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
          >
            返回文章列表
          </Link>
        </div>
      </article>

      {/* 顶部快速返回按钮（浮动） */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 p-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 opacity-0 hover:opacity-100 z-40"
        style={{
          opacity: readProgress > 30 ? 1 : 0,
          pointerEvents: readProgress > 30 ? 'auto' : 'none',
        }}
        title="返回顶部"
      >
        <ChevronLeft size={24} className="rotate-90" />
      </button>

      {lookupWord && (
        <div
          ref={bubbleRef}
          className="fixed z-[120] w-[340px] max-w-[calc(100vw-20px)] bg-white border border-gray-200 rounded-xl shadow-2xl"
          style={{ top: bubblePos.top, left: bubblePos.left }}
        >
          <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
            <div>
              <p className="dict-en text-lg font-black text-gray-900">{lookupWord}</p>
              {lookupData?.[0]?.phonetic && (
                <p className="dict-en text-[11px] text-blue-600 mt-0.5">/{lookupData[0].phonetic}/</p>
              )}
            </div>
            <button
              type="button"
              onClick={closeWordBubble}
              className="w-6 h-6 rounded-full border border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all"
              title="关闭"
            >
              ×
            </button>
          </div>

          <div className="p-3 max-h-[56vh] overflow-y-auto space-y-3">
            <button
              type="button"
              onClick={handleAiContextLookup}
              disabled={isAiLoading}
              className="w-full text-left p-2 bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100 text-blue-700 rounded-lg text-[11px] font-bold tracking-wide transition-all border border-blue-200 hover:border-blue-300 flex items-center justify-center gap-1.5"
            >
              {isAiLoading ? (
                <div className="w-2.5 h-2.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              ) : <Sparkles size={11} />}
              {isAiLoading ? '正在分析...' : '还是不懂？点击试试AI语境分析'}
            </button>

            {aiExplanation && (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-2.5">
                <p className="dict-zh text-[13px] leading-relaxed whitespace-pre-wrap text-gray-800">{aiExplanation}</p>
              </div>
            )}

            {isLookingUp ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : lookupError ? (
              <p className="text-sm text-red-500">{lookupError}</p>
            ) : lookupData && lookupData.length > 0 ? (
              <div className="space-y-5">
                {lookupData.map((entry: any, entryIdx: number) => (
                  <div key={entryIdx} className="space-y-4">
                    {(entry.meanings || []).map((meaning: any, mIdx: number) => (
                      <div key={mIdx} className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-black text-white px-1.5 py-0.5 rounded text-[9px] font-black tracking-widest uppercase">
                            {meaning.partOfSpeech || 'n/a'}
                          </span>
                          <div className="h-px flex-1 bg-gray-100"></div>
                        </div>
                        {(meaning.definitions || []).map((def: any, dIdx: number) => (
                          <div key={dIdx} className="space-y-1.5 pl-1">
                            <p className="dict-en text-[13px] text-gray-900 leading-relaxed">
                              <span className="text-gray-600 mr-1.5">{dIdx + 1}.</span>{def.definition}
                            </p>
                            {def.translation && (
                              <p className="dict-zh text-[13px] text-gray-700 bg-gray-50 rounded-lg px-2 py-1.5">
                                {def.translation}
                              </p>
                            )}
                            {def.example && (
                              <p className="dict-en text-[11px] text-gray-500 italic">"{def.example}"</p>
                            )}
                            {def.example_translation && (
                              <p className="dict-zh text-[11px] text-gray-600">译：{def.example_translation}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">未找到词典结果</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ArticleDetailPage;
