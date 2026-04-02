import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, LogOut, User } from 'lucide-react';

export interface PlaceholderPageProps {
  mode: 'speak' | 'write';
  username: string;
  onLogout: () => void;
}

const copy: Record<PlaceholderPageProps['mode'], { title: string; label: string; hint: string }> = {
  speak: {
    title: '说 · 口语',
    label: 'Speaking',
    hint: '口语练习与跟读功能正在规划中，敬请期待。',
  },
  write: {
    title: '写 · 写作',
    label: 'Writing',
    hint: '写作批改与练习即将上线，敬请期待。',
  },
};

function PlaceholderPage({ mode, username, onLogout }: PlaceholderPageProps) {
  const c = copy[mode];

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-black border border-gray-200 rounded-lg px-3 py-2 transition-colors"
          >
            <ChevronLeft size={16} />
            首页
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-bold text-gray-400">
              <User size={12} />
              {username.toUpperCase()}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
              title="退出登录"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">{c.label}</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">{c.title}</h1>
        <p className="mt-4 text-center text-gray-600 max-w-md leading-relaxed">{c.hint}</p>
        <Link
          to="/"
          className="mt-10 text-sm font-bold bg-black text-white px-6 py-3 rounded-xl hover:bg-gray-800 transition-colors"
        >
          返回学习首页
        </Link>
      </main>
    </div>
  );
}

export default PlaceholderPage;
