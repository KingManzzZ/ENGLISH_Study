import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { ChevronLeft, LogOut, Search, User } from 'lucide-react';

import { Article, NewsArticlesResponse, sectionBilingual } from '../types/article';

export interface ReadingListPageProps {
  username: string;
  onLogout: () => void;
}

function ReadingListPage({ username, onLogout }: ReadingListPageProps) {
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  const [articles, setArticles] = useState<Article[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadArticles = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get<NewsArticlesResponse>(`${API_BASE_URL}/news/articles`);
        const apiArticles = Array.isArray(res.data?.articles) ? res.data.articles : [];
        setArticles(apiArticles);

        const apiSections = Array.isArray(res.data?.sections) && res.data.sections.length > 0
          ? res.data.sections
          : Array.from(new Set(apiArticles.map((item) => item.section).filter(Boolean) as string[]));
        setSections(apiSections);
      } catch (err: any) {
        setError(err?.response?.data?.detail || '文章加载失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };

    loadArticles();
  }, [API_BASE_URL]);

  const filteredArticles = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return articles.filter((article) => {
      const matchesSection = selectedSection === 'all' ? true : article.section === selectedSection;
      const matchesSearch = !keyword
        || article.title.toLowerCase().includes(keyword)
        || (article.title_zh || '').toLowerCase().includes(keyword)
        || (article.summary || '').toLowerCase().includes(keyword);
      return matchesSection && matchesSearch;
    });
  }, [articles, searchQuery, selectedSection]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-cyan-50 text-gray-900">
      <header className="sticky top-0 z-20 border-b border-sky-100 bg-white/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 shrink-0 text-sm font-bold text-gray-600 hover:text-black border border-gray-200 rounded-lg px-3 py-2 transition-colors"
          >
            <ChevronLeft size={18} />
            首页
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-black">读 · 新闻阅读</h1>
            <p className="text-xs md:text-sm text-gray-500 mt-1">按 section 浏览文章，点进正文精读。</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <User size={16} className="text-sky-600" />
              {username.toUpperCase()}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="p-2 rounded-lg hover:bg-red-100 text-gray-500 hover:text-red-600 transition-colors"
              title="退出登录"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索标题、中文标题或摘要..."
              className="w-full pl-11 pr-4 py-3 rounded-2xl border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200 focus:border-sky-300 transition-all"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedSection('all')}
              className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
                selectedSection === 'all'
                  ? 'bg-black text-white border-black'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
              }`}
            >
              全部
            </button>
            {sections.map((section) => (
              <button
                key={section}
                type="button"
                onClick={() => setSelectedSection(section)}
                className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${
                  selectedSection === section
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-sky-300'
                }`}
              >
                {sectionBilingual(section)}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="text-sm text-gray-500">正在加载文章...</div>}
        {!loading && error && <div className="text-sm text-red-600">{error}</div>}

        {!loading && !error && filteredArticles.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white/80 p-10 text-center text-gray-500">
            暂时没有匹配的文章。
          </div>
        )}

        {!loading && !error && filteredArticles.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredArticles.map((article) => (
              <Link
                key={article.id}
                to={`/read/${article.id}`}
                className="group rounded-3xl border border-sky-100 bg-white p-5 shadow-sm hover:shadow-lg hover:border-sky-300 transition-all"
              >
                <div className="flex items-center justify-between gap-3 mb-3">
                  <span className="inline-flex px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 text-[11px] font-bold">
                    {sectionBilingual(article.section)}
                  </span>
                  <span className="text-[11px] text-gray-500">
                    {article.published_at ? new Date(article.published_at).toLocaleDateString() : ''}
                  </span>
                </div>

                <h2 className="text-xl font-black leading-snug text-gray-900 group-hover:text-sky-700 transition-colors">
                  {article.title}
                </h2>
                {article.title_zh && <p className="mt-1 text-sm text-gray-600">{article.title_zh}</p>}

                <p className="mt-3 text-sm leading-7 text-gray-600">
                  {article.summary || article.content.slice(0, 220)}
                </p>

                <div className="mt-4 text-xs font-bold text-sky-700 group-hover:text-sky-800 transition-colors">
                  进入阅读 →
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default ReadingListPage;
