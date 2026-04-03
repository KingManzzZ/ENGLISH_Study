import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ChevronLeft, ExternalLink, LogOut, User, X, Sparkles } from 'lucide-react';

import { Article, sectionBilingual } from '../types/article';

export interface ArticleDetailPageProps {
  username: string;
  onLogout: () => void;
}

type DictEntry = {
  phonetic?: string;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{
      definition?: string;
      translation?: string;
      example?: string;
      example_translation?: string;
    }>;
  }>;
};

type LookupState = {
  word: string;
  context: string;
  prevContext: string;
  nextContext: string;
};

function splitTokens(text: string): string[] {
  return text.split(/(\b[A-Za-z][A-Za-z'-]*\b)/g);
}

function sanitizeAiText(text: string): string {
  return (text || '').replace(/\*/g, '').trim();
}

function ArticleDetailPage({ username, onLogout }: ArticleDetailPageProps) {
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [dictData, setDictData] = useState<DictEntry[] | null>(null);
  const [dictError, setDictError] = useState('');
  const [dictLoading, setDictLoading] = useState(false);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiError, setAiError] = useState('');
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const wordAnchorRef = useRef<HTMLElement | null>(null);
  const [bubblePos, setBubblePos] = useState({ top: 0, left: 0 });
  const [bubbleTailLeft, setBubbleTailLeft] = useState(28);
  const [bubbleDirection, setBubbleDirection] = useState<'up' | 'down'>('down');
  const [bubbleMaxHeight, setBubbleMaxHeight] = useState(360);
  const BUBBLE_WIDTH = 380;
  const TAIL_MARGIN = 16;

  const getViewportHeight = () => {
    return window.visualViewport?.height || window.innerHeight;
  };

  useEffect(() => {
    const loadArticle = async () => {
      if (!id) {
        setError('文章不存在');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const res = await axios.get<Article>(`${API_BASE_URL}/news/articles/${id}`);
        setArticle(res.data);
      } catch (err: any) {
        setError(err?.response?.data?.detail || '文章加载失败');
      } finally {
        setLoading(false);
      }
    };

    loadArticle();
  }, [API_BASE_URL, id]);

  const paragraphs = useMemo(() => {
    if (!article?.content) return [];
    return article.content.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  }, [article]);

  const getBubbleWidth = () => {
    const hostWidth = Math.max(260, (mainRef.current?.offsetWidth || window.innerWidth) - 24);
    const renderedWidth = bubbleRef.current?.offsetWidth || 0;
    return renderedWidth > 0 ? renderedWidth : Math.min(BUBBLE_WIDTH, hostWidth);
  };

  const updateBubblePosition = useCallback(() => {
    if (!wordAnchorRef.current || !mainRef.current) return;

    const anchorRect = wordAnchorRef.current.getBoundingClientRect();
    const hostRect = mainRef.current.getBoundingClientRect();
    const hostStyles = window.getComputedStyle(mainRef.current);
    const hostPaddingTop = parseFloat(hostStyles.paddingTop || '0') || 0;
    const hostPaddingLeft = parseFloat(hostStyles.paddingLeft || '0') || 0;
    const hostPaddingRight = parseFloat(hostStyles.paddingRight || '0') || 0;

    const viewportPadding = 12;
    const bubbleGap = 2;
    const viewportHeight = getViewportHeight();
    const bubbleWidth = getBubbleWidth();

    const hostContentWidth = mainRef.current.clientWidth - hostPaddingLeft - hostPaddingRight;
    const anchorLeftInHost = anchorRect.left - hostRect.left - hostPaddingLeft;
    const clampedLeft = Math.max(0, Math.min(anchorLeftInHost, hostContentWidth - bubbleWidth));

    const anchorCenterInHost = anchorLeftInHost + anchorRect.width / 2;
    const tailLeft = Math.max(TAIL_MARGIN, Math.min(anchorCenterInHost - clampedLeft, bubbleWidth - TAIL_MARGIN));
    setBubbleTailLeft(tailLeft);

    const spaceAbove = anchorRect.top - viewportPadding;
    const spaceBelow = viewportHeight - anchorRect.bottom - viewportPadding;
    const openDown = anchorRect.top < viewportHeight / 2;

    const desiredHeight = Math.max(240, Math.min(520, openDown ? spaceBelow : spaceAbove));
    const nextMaxHeight = Math.max(220, desiredHeight);
    setBubbleMaxHeight(nextMaxHeight);
    setBubbleDirection(openDown ? 'down' : 'up');

    // Convert anchor to main content box coordinates (padding removed) to avoid Y drift.
    const anchorTopInHost = anchorRect.top - hostRect.top - hostPaddingTop;
    const preferredTop = openDown
      ? anchorTopInHost + anchorRect.height + bubbleGap
      : anchorTopInHost - nextMaxHeight - bubbleGap;

    const hostContentHeight = mainRef.current.scrollHeight - hostPaddingTop;
    const clampedTop = Math.max(0, Math.min(preferredTop, hostContentHeight - nextMaxHeight));

    setBubblePos({ top: clampedTop, left: clampedLeft });
  }, []);

  useEffect(() => {
    if (!lookup || !wordAnchorRef.current || !bubbleRef.current) return;

    const calibrateTail = () => {
      if (!wordAnchorRef.current || !bubbleRef.current) return;
      const anchorRect = wordAnchorRef.current.getBoundingClientRect();
      const bubbleRect = bubbleRef.current.getBoundingClientRect();
      const anchorCenterX = anchorRect.left + anchorRect.width / 2;
      const exactTailLeft = anchorCenterX - bubbleRect.left;
      const safeTailLeft = Math.max(TAIL_MARGIN, Math.min(exactTailLeft, bubbleRect.width - TAIL_MARGIN));
      setBubbleTailLeft(safeTailLeft);
    };

    calibrateTail();
    const raf = window.requestAnimationFrame(calibrateTail);
    return () => window.cancelAnimationFrame(raf);
  }, [lookup, bubblePos.left, bubblePos.top, bubbleMaxHeight, dictLoading, dictData, aiLoading, aiResult]);

  const clearLookup = () => {
    setLookup(null);
    setDictData(null);
    setDictError('');
    setDictLoading(false);
    setAiResult('');
    setAiError('');
    setAiLoading(false);
    wordAnchorRef.current = null;
  };

  useEffect(() => {
    if (!lookup) return;

    const relayout = () => updateBubblePosition();
    relayout();

    // Recalculate once DOM has painted updated bubble content.
    const raf = window.requestAnimationFrame(relayout);
    window.addEventListener('resize', relayout);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', relayout);
    };
  }, [lookup, dictLoading, dictData, dictError, aiResult, aiLoading, updateBubblePosition]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearLookup();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!lookup) return;
      const target = e.target as Node;
      if (bubbleRef.current?.contains(target)) return;
      if (wordAnchorRef.current?.contains(target)) return;
      clearLookup();
    };

    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [lookup]);

  const handleWordLookup = async (
    event: React.MouseEvent<HTMLButtonElement>,
    word: string,
    context: string,
    prevContext = '',
    nextContext = ''
  ) => {
    const cleanWord = word.replace(/[.,!?()[]"';:]/g, '').trim();
    if (!cleanWord || cleanWord.length < 2) return;

    wordAnchorRef.current = event.currentTarget;
    updateBubblePosition();

    setLookup({ word: cleanWord, context, prevContext, nextContext });
    setDictLoading(true);
    setDictError('');
    setDictData(null);
    setAiResult('');
    setAiError('');

    try {
      const res = await axios.post(`${API_BASE_URL}/lookup`, { word: cleanWord, context });
      if (res.data?.status === 'success') {
        setDictData(res.data.data || null);
      } else {
        setDictError(res.data?.message || 'Word lookup failed');
      }
    } catch (err: any) {
      setDictError(err?.response?.data?.detail || 'Word lookup failed');
    } finally {
      setDictLoading(false);
    }
  };

  const handleAiContext = async () => {
    if (!lookup) return;
    setAiLoading(true);
    setAiError('');

    try {
      const res = await axios.post(`${API_BASE_URL}/lookup/ai_context`, {
        word: lookup.word,
        context: lookup.context,
        prev_context: lookup.prevContext,
        next_context: lookup.nextContext,
      });
      setAiResult(sanitizeAiText(res.data?.explanation || '') || 'AI 暂未返回有效内容');
      if (bubbleRef.current) {
        bubbleRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: any) {
      setAiError(err?.response?.data?.detail || 'AI 语境分析失败');
    } finally {
      setAiLoading(false);
    }
  };

  const renderClickableText = (text: string, context: string, prevContext = '', nextContext = '') => {
    const tokens = splitTokens(text);
    return tokens.map((token, index) => {
      if (/^[A-Za-z][A-Za-z'-]*$/.test(token)) {
        return (
          <button
            key={`${token}-${index}`}
            type="button"
            onClick={(e) => handleWordLookup(e, token, context, prevContext, nextContext)}
            className="inline p-0 m-0 border-0 bg-transparent font-inherit leading-inherit align-baseline text-left hover:bg-sky-100 hover:text-sky-700 transition-colors"
          >
            {token}
          </button>
        );
      }
      return <span key={`${token}-${index}`}>{token}</span>;
    });
  };

  if (!id) {
    return <Navigate to="/read" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-sky-50/40 to-cyan-50/40 text-gray-900">
      <header className="sticky top-0 z-20 border-b border-sky-100 bg-white/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link
            to="/read"
            className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-black border border-gray-200 rounded-lg px-3 py-2 transition-colors"
          >
            <ChevronLeft size={16} />
            返回列表
          </Link>
          <div className="text-center min-w-0">
            <h1 className="text-lg md:text-xl font-black tracking-tight text-black">ENGLISH STUDY</h1>
            {article?.section && (
              <p className="text-xs text-gray-500 mt-1">{sectionBilingual(article.section)}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500">
              <User size={14} />
              {username.toUpperCase()}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="p-2 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-500 transition-colors"
              title="退出登录"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main ref={mainRef} className="max-w-7xl mx-auto px-4 py-8 relative">
        {loading && <div className="text-sm text-gray-500">正在加载文章...</div>}
        {!loading && error && <div className="text-sm text-red-600">{error}</div>}

        {!loading && !error && article && (
          <article className="rounded-3xl border border-sky-100 bg-white shadow-sm p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="inline-flex px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold">
                {sectionBilingual(article.section)}
              </span>
              {article.published_at && (
                <span className="text-xs text-gray-500">
                  {new Date(article.published_at).toLocaleString()}
                </span>
              )}
            </div>

            <h2 className="text-2xl md:text-3xl font-black leading-tight text-gray-900">{article.title}</h2>
            {article.title_zh && <p className="mt-2 text-lg text-gray-600">{article.title_zh}</p>}

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span>来源：{article.source || 'Unknown'}</span>
              {article.url && (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:text-sky-800"
                >
                  原文链接
                  <ExternalLink size={13} />
                </a>
              )}
            </div>

            {article.summary && (
              <section className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <h3 className="text-sm font-bold text-gray-700 mb-2">摘要</h3>
                <p className="text-[15px] leading-7 text-gray-700">
                  {renderClickableText(article.summary, article.summary, '', paragraphs[0] || '')}
                </p>
              </section>
            )}

            <section className="mt-7 space-y-2 text-[16px] leading-[1.55] text-gray-800">
              {paragraphs.map((paragraph, index) => (
                <p key={`paragraph-${index}`} className="indent-8 leading-[1.55]">
                  {renderClickableText(
                    paragraph,
                    paragraph,
                    paragraphs[index - 1] || '',
                    paragraphs[index + 1] || ''
                  )}
                </p>
              ))}
            </section>
          </article>
        )}

        {lookup && (
          <div
            ref={bubbleRef}
            className="absolute z-[120] w-[380px] max-w-[calc(100vw-24px)] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-visible"
            style={{ top: bubblePos.top, left: bubblePos.left }}
          >
            {bubbleDirection === 'down' ? (
              <svg
                className="absolute"
                style={{ left: `${bubbleTailLeft - 12}px`, top: '-16px' }}
                width="24"
                height="12"
                viewBox="0 0 24 12"
                aria-hidden="true"
              >
                <path d="M1 11 Q12 -1 23 11 Z" fill="#ffffff" stroke="#e5e7eb" strokeWidth="1.2" />
              </svg>
            ) : (
              <svg
                className="absolute"
                style={{ left: `${bubbleTailLeft - 12}px`, bottom: '-2px' }}
                width="24"
                height="12"
                viewBox="0 0 24 12"
                aria-hidden="true"
              >
                <path d="M1 1 Q12 13 23 1 Z" fill="#ffffff" stroke="#e5e7eb" strokeWidth="1.2" />
              </svg>
            )}

            <div className="px-3.5 pt-3 pb-2 flex items-center justify-between gap-2 bg-white/95 rounded-t-2xl">
              <div>
                <p className="dict-en text-xl font-black text-black tracking-tight uppercase">{lookup.word}</p>
                {dictData?.[0]?.phonetic && (
                  <p className="dict-en text-[11px] text-blue-600 mt-0.5">/{dictData[0].phonetic}/</p>
                )}
              </div>
              <button
                type="button"
                onClick={clearLookup}
                className="w-7 h-7 rounded-full border border-gray-300 bg-white/75 text-gray-500 hover:bg-white hover:text-gray-700 transition-all"
                title="关闭"
              >
                <X size={14} className="mx-auto" />
              </button>
            </div>

            <div
              className="px-3.5 pb-3 overflow-y-auto space-y-3 bg-gradient-to-br from-white to-sky-50 rounded-b-2xl"
              style={{ maxHeight: `${bubbleMaxHeight}px` }}
            >
              <button
                type="button"
                onClick={handleAiContext}
                disabled={aiLoading}
                className="w-full text-left p-2.5 bg-gradient-to-r from-blue-50 to-cyan-50 hover:from-blue-100 hover:to-cyan-100 text-blue-700 rounded-lg text-[11px] font-bold tracking-wide transition-all border border-blue-200 hover:border-blue-300 flex items-center justify-center gap-1.5"
              >
                {aiLoading ? (
                  <div className="w-2.5 h-2.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                ) : <Sparkles size={11} />}
                {aiLoading ? '正在分析...' : '还是不懂？点击试试ai语境分析'}
              </button>

              {aiError && <p className="text-xs text-red-600">{aiError}</p>}
              {aiResult && (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-2.5">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-700 mb-1">AI语境分析结果</p>
                  <p className="dict-zh text-[13px] leading-relaxed whitespace-pre-wrap text-gray-800">{aiResult}</p>
                </div>
              )}

              {dictLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : dictError ? (
                <p className="text-sm text-red-500">{dictError}</p>
              ) : dictData && dictData.length > 0 ? (
                <div className="space-y-5">
                  {dictData.map((entry, eIdx) => (
                    <div key={`entry-${eIdx}`} className="space-y-4">
                      {(entry.meanings || []).map((meaning, mIdx) => (
                        <div key={`meaning-${mIdx}`} className="space-y-2">
                          <div className="flex items-center gap-1.5">
                            <span className="bg-black text-white px-1.5 py-0.5 rounded text-[9px] font-black tracking-widest uppercase">
                              {meaning.partOfSpeech || 'n/a'}
                            </span>
                            <div className="h-px flex-1 bg-gray-100"></div>
                          </div>
                          {(meaning.definitions || []).slice(0, 5).map((def, dIdx) => (
                            <div key={`def-${dIdx}`} className="space-y-1.5 pl-1">
                              <p className="dict-en text-[13px] text-gray-900 leading-relaxed">
                                <span className="text-gray-600 mr-1.5">{dIdx + 1}.</span>
                                {def.definition}
                              </p>
                              {def.translation && (
                                <p className="dict-zh text-[13px] text-gray-700 bg-gray-50 rounded-lg px-2 py-1.5 border border-[#e2e8f0]">
                                  {def.translation}
                                </p>
                              )}
                              {def.example && (
                                <p className="dict-en text-[11px] text-gray-500 italic">&ldquo;{def.example}&rdquo;</p>
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
      </main>
    </div>
  );
}

export default ArticleDetailPage;
