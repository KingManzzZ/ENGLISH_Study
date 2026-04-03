# English Study AI - 英语学习视频辅助平台

这是一个专为英语学习者设计的视频辅助学习网站。它支持通过本地 AI 模型（Whisper）自动识别视频语音，并结合阿里云百炼（通义千问）生成精准的中英双语字幕，提供极简的沉浸式学习体验。

## 核心功能
- **视频智能识别**：使用 OpenAI Whisper (medium 模型) 本地识别语音并提取精准时间戳。
- **AI 智能翻译**：集成阿里云百炼 (Qwen-Plus) 实现专业级视频全文中英对照翻译。
- **互动查词字典**：
  - 点击字幕中任何单词，右侧立即滑出**查词侧边栏**。
  - 接驳 Free Dictionary API，展示音标、多种词性释义及英文例句。
  - **自动中文化**：所有英文释义和例句均经过 AI 实时翻译，方便理解。
- **AI 语境辅助 (Contextual AI)**：
  - “一键深度分析”：当字典解释不够直观时，点击 AI 辅助按钮。
  - 模型会结合**当前句及上下句背景**，精准给出该单词在“本语境”下的唯一含义和用法。
- **账户与权限体系**：
  - 全功能的注册/登录模块，保障用户个人上传记录的独立性。
  - 内置**管理员审核机制**，支持知识共享与公共库建设。
- **GPU 加速**：深度优化 CUDA 渲染，确保视频处理与 AI 推理的高效率。

---

## 环境要求
- **Python 3.10+** (推荐 3.11)
- **Node.js 18+**
- **FFmpeg** (必须安装并添加到系统环境变量)
- **NVIDIA GPU** (可选，强烈推荐用于 Whisper 加速)

---

## 快速开始

#### 1. 后端配置 (Backend)

```bash
cd backend
pip install -r requirements.txt
```
在 `backend/.env` 中配置以下内容：
```env
DASHSCOPE_API_KEY=你的阿里云百炼API密钥
JWT_SECRET_KEY=自定义长字符串
API_TOKEN=管理系统密令
```
运行后端：
```bash
python main.py
```

#### 2. 前端配置 (Frontend)

```bash
cd frontend
npm install
```
在 `frontend/.env` 配置：
```env
REACT_APP_API_URL=http://localhost:8000
REACT_APP_API_TOKEN=管理系统密令
```
运行前端：
```bash
npm start
```

---

## 高级使用技巧

### 1. 深度学习单词
在观看过程中，遇到不认识的单词只需直接**鼠标点击**：
- 右侧会滑出字典，展示 API 返回的详尽释义。
- 界面会自动显示由 Qwen 翻译的中文意义。
- **进阶**：点击 **“还是不理解该单词在原句中的意思？”**，AI 会针对视频当前台词背景，为你提供一对一的导师级讲解。

### 2. 贡献公共资源库
1. 在 **HISTORY**（上传记录）中找到你上传的优质视频。
2. 鼠标悬停在视频卡片上，点击出现的 **UPLOAD** 图标申请同步到公共库。
3. 作为管理员（双击用户名进入面板），你可以审核并批准该请求，使其出现在 **LIBRARY** 中供所有用户查看。

---

## 目录结构说明

- `/backend`: FastAPI 后端核心。
  - `/backend/app/api`: 路由定义，包括新增的 `/lookup` (查词) 和 `/lookup/ai_context` (语境分析)。
- `/frontend`: React + Tailwind CSS 前端。
  - 字典侧边栏逻辑与多请求竞态控制 (Request-ID) 均集成于 `App.tsx`。
- `/models`: 存放 Whisper 离线模型文件。
- `/data/library`: 公共资源库视频存放地。
- `/backend/data/users`: 隔离的用户数据存储区（封面、私有视频、私有字幕）。

---

## 技术大纲
- **前端**: React, Tailwind CSS, Lucide Icons, Axios.
- **后端**: FastAPI (Python), MoviePy.
- **AI 模型**: OpenAI Whisper (Speech-to-Text).
- **翻译接口**: 阿里云百炼 - 通义千问 (LLM Translation).

---

## 新闻同步手动抓取

如需手动抓取最新新闻数据：

运行示例：

```bash
cd backend
python scripts/fetch_guardian_news.py
```

说明：
- 不启用定时自动抓取；每次运行脚本时抓取一次最新数据。
- 当前固定按 Guardian sections 抓取：`lifeandstyle,sport,travel,food,film,music,technology,culture,education,environment,books,science,business,law`。
- 不再按初级 / 中级 / 高级划分，前端直接按 `section` 展示与筛选。
- 脚本会抓取尽可能完整的正文、整理为分段文本，并写入 `backend/data/news_articles.json`。
- 前端通过后端接口读取该文件内容，展示文章列表与详情。
