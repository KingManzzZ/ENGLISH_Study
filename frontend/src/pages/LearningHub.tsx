import React from 'react';
import { Link } from 'react-router-dom';
import { Headphones, Mic, BookOpen, PenLine, LogOut, User } from 'lucide-react';

export interface LearningHubProps {
  username: string;
  onLogout: () => void;
}

const modes = [
  {
    key: 'listen',
    label: '听',
    sub: 'Listening',
    desc: '视频上传、双语字幕与词汇学习',
    to: '/listen',
    icon: Headphones,
    accent: 'from-indigo-500/20 to-indigo-400/20 border-indigo-300 hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-200/50',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
  },
  {
    key: 'speak',
    label: '说',
    sub: 'Speaking',
    desc: '口语练习（即将推出）',
    to: '/speak',
    icon: Mic,
    accent: 'from-emerald-500/20 to-teal-400/20 border-emerald-300 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-200/50',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  {
    key: 'read',
    label: '读',
    sub: 'Reading',
    desc: '精选英文文章阅读',
    to: '/read',
    icon: BookOpen,
    accent: 'from-amber-500/20 to-orange-400/20 border-amber-300 hover:border-amber-500 hover:shadow-lg hover:shadow-amber-200/50',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  {
    key: 'write',
    label: '写',
    sub: 'Writing',
    desc: '写作训练（即将推出）',
    to: '/write',
    icon: PenLine,
    accent: 'from-sky-500/20 to-blue-400/20 border-sky-300 hover:border-sky-500 hover:shadow-lg hover:shadow-sky-200/50',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
  },
] as const;

function LearningHub({ username, onLogout }: LearningHubProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-cyan-50 to-emerald-50 text-gray-900">
      <header className="border-b border-sky-100 bg-white/60 backdrop-blur-md sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-black">
              ENGLISH STUDY
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm font-semibold text-gray-700">
              <User size={16} className="text-blue-500" />
              {username.toUpperCase()}
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="p-2 rounded-lg hover:bg-red-100 text-gray-500 hover:text-red-600 transition-all duration-200"
              title="退出登录"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <p className="text-gray-600 text-lg font-light mb-2">开启你的英语学习之旅</p>
          <h2 className="text-4xl font-black text-black tracking-tight">
            选择你的学习方向
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {modes.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.key}
                to={m.to}
                className={`group relative overflow-hidden rounded-3xl border-2 bg-gradient-to-br ${m.accent} p-8 transition-all duration-300 hover:-translate-y-1`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3 mb-3">
                      <span className="text-4xl font-black tracking-tight text-gray-900">{m.label}</span>
                      <span className="text-sm font-bold uppercase tracking-widest text-gray-600">{m.sub}</span>
                    </div>
                    <p className="text-gray-700 text-base leading-relaxed font-light">{m.desc}</p>
                  </div>
                  <div className={`shrink-0 w-16 h-16 rounded-2xl ${m.iconBg} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300`}>
                    <Icon size={28} className={m.iconColor} />
                  </div>
                </div>
                <div className="mt-6 text-sm font-semibold uppercase tracking-widest text-gray-700 group-hover:text-gray-900 transition-colors duration-300">
                  进入模块 →
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}

export default LearningHub;
