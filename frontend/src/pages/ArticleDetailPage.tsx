import React, { useState, useRef, useEffect } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ChevronLeft, LogOut, User, BookOpen } from 'lucide-react';
import articles from '../data/articles.json';
import type { Article } from '../types/article';

export interface ArticleDetailPageProps {
  username: string;
  onLogout: () => void;
}

function ArticleDetailPage({ username, onLogout }: ArticleDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const list = articles as Article[];
  const article = list.find((a) => a.id === id);
  const contentRef = useRef<HTMLDivElement>(null);
  const [readProgress, setReadProgress] = useState(0);

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
              {p}
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
    </div>
  );
}

export default ArticleDetailPage;
