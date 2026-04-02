import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, BookOpen, LogOut, User, Search } from 'lucide-react';
import articles from '../data/articles.json';
import type { Article } from '../types/article';

export interface ReadingListPageProps {
  username: string;
  onLogout: () => void;
}

function ReadingListPage({ username, onLogout }: ReadingListPageProps) {
  const list = articles as Article[];
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);

  // 获取所有难度等级
  const levels = useMemo(() => {
    const uniqueLevels = Array.from(new Set(list.map(a => a.level)));
    return uniqueLevels.sort();
  }, [list]);

  // 筛选和搜索
  const filteredArticles = useMemo(() => {
    return list.filter(article => {
      const matchesSearch = article.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLevel = selectedLevel ? article.level === selectedLevel : true;
      return matchesSearch && matchesLevel;
    });
  }, [searchQuery, selectedLevel, list]);

  // 难度等级的颜色映射
  const levelColorMap: Record<string, { bg: string; text: string; border: string }> = {
    'Beginner': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
    'Intermediate': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
    'Upper intermediate': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
    'Advanced': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  };

  const getLevelColor = (level: string) => {
    return levelColorMap[level] || { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-emerald-50">
      <header className="border-b border-sky-100 bg-white/60 backdrop-blur-md sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="flex items-center gap-1.5 shrink-0 text-sm font-bold text-gray-600 hover:text-black border border-gray-200 rounded-lg px-3 py-2 transition-all hover:border-black"
            >
              <ChevronLeft size={18} />
              首页
            </Link>
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight text-black">
                阅读文章
              </h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mt-1">Reading</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-gray-700">
              <User size={16} className="text-blue-500" />
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

      <main className="max-w-5xl mx-auto px-4 py-10">
        {/* 搜索与筛选区 */}
        <div className="mb-10 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="搜索文章标题..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border-2 border-gray-200 rounded-2xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-gray-900"
            />
          </div>

          {/* 难度筛选标签 */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedLevel(null)}
              className={`px-4 py-2 rounded-full font-semibold text-sm transition-all ${
                selectedLevel === null
                  ? 'bg-black text-white'
                  : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-black'
              }`}
            >
              全部
            </button>
            {levels.map((level) => (
              <button
                key={level}
                onClick={() => setSelectedLevel(level)}
                className={`px-4 py-2 rounded-full font-semibold text-sm transition-all ${
                  selectedLevel === level
                    ? `${getLevelColor(level).bg} ${getLevelColor(level).text} border-2 ${getLevelColor(level).border}`
                    : 'bg-white border-2 border-gray-200 text-gray-700 hover:border-gray-400'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* 文章列表 */}
        {filteredArticles.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {filteredArticles.map((article) => {
              const levelColor = getLevelColor(article.level);
              const wordCount = article.content.split(/\s+/).length;
              const readTime = Math.ceil(wordCount / 150); // 假设每分钟150词

              return (
                <Link
                  key={article.id}
                  to={`/read/${article.id}`}
                  className="group relative overflow-hidden rounded-3xl border-2 border-white bg-white shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 p-6"
                >
                  {/* 背景装饰 */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-sky-100/50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-300"></div>

                  {/* 内容 */}
                  <div className="relative z-10">
                    {/* 难度标签 */}
                    <div className="mb-3 inline-block">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${levelColor.bg} ${levelColor.text}`}>
                        {article.level}
                      </span>
                    </div>

                    {/* 标题 */}
                    <h3 className="text-lg font-black text-gray-900 mb-3 line-clamp-2 group-hover:text-blue-600 transition-colors">
                      {article.title}
                    </h3>

                    {/* 元数据 */}
                    <div className="flex items-center justify-between text-xs text-gray-500 font-semibold">
                      <div className="flex items-center gap-1">
                        <BookOpen size={14} />
                        <span>{wordCount} 词</span>
                      </div>
                      <span>{readTime} 分钟阅读</span>
                    </div>

                    {/* 底部操作提示 */}
                    <div className="mt-4 pt-3 border-t border-gray-100 text-xs font-semibold text-gray-600 group-hover:text-blue-600 transition-colors">
                      开始阅读 →
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <BookOpen size={48} className="text-gray-300 mb-4" />
            <p className="text-gray-500 font-semibold">未找到匹配的文章</p>
            <p className="text-gray-400 text-sm mt-1">尝试调整搜索条件或难度筛选</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default ReadingListPage;
