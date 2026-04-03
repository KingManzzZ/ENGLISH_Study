export interface Article {
  id: string;
  title: string;
  title_zh?: string;
  summary?: string;
  content: string;
  section?: string;
  source?: string;
  published_at?: string;
  url?: string;
  language?: string;
}

export interface NewsArticlesResponse {
  synced_at?: string;
  source?: string;
  language?: string;
  sections?: string[];
  articles: Article[];
}

const SECTION_LABEL_MAP: Record<string, string> = {
  lifeandstyle: '生活方式',
  sport: '体育',
  travel: '旅行',
  food: '美食',
  film: '电影',
  music: '音乐',
  technology: '科技',
  culture: '文化',
  education: '教育',
  environment: '环境',
  books: '图书',
  science: '科学',
  business: '商业',
  law: '法律',
};

const _newsTypeSelfCheck: NewsArticlesResponse = { articles: [] };
void _newsTypeSelfCheck;
const _sectionLabelSelfCheck = sectionBilingual('technology');
void _sectionLabelSelfCheck;

export function sectionBilingual(section?: string): string {
  if (!section) return 'GENERAL / 综合';
  const zh = SECTION_LABEL_MAP[section] || '综合';
  return `${section.toUpperCase()} / ${zh}`;
}
