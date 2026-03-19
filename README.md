# English Study AI - 英语学习视频辅助平台

这是一个专为英语学习者设计的视频辅助学习网站。它支持通过本地 AI 模型（Whisper）自动识别视频语音，并结合阿里云百炼（通义千问）生成精准的中英双语字幕，提供极简的沉浸式学习体验。

## 核心功能
- **视频智能识别**：使用 OpenAI Whisper (medium 模型) 本地识别语音并提取时间戳。
- **AI 智能翻译**：集成阿里云百炼 (Qwen-Turbo) 实现专业级中英对照翻译。
- **GPU 加速**：支持 CUDA 环境，大幅提升视频处理速度。
- **账号隔离体系**：支持用户注册登录，每个用户的上传历史和进度完全独立。
- **公共资源库贡献**：
  - 用户可将私有上传的视频提交审核。
  - 管理员通过后台审核后，视频将进入公共 `LIBRARY` 供所有人学习。
- **多功能播放器**：支持双语字幕开关、视频内嵌字幕预览、同步滚动等。

---

## 环境要求
- **Python 3.8+**
- **Node.js 16+**
- **FFmpeg** (必须安装并添加到系统环境变量)
- **CUDA** (推荐，用于 GPU 加速)

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
API_TOKEN=管理员验证秘钥(用于审核入口)
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
在 `frontend/.env` (或直接在系统环境) 配置：
```env
REACT_APP_API_URL=http://localhost:8000
REACT_APP_API_TOKEN=与后端一致的API_TOKEN
```
运行前端：
```bash
npm start
```

---

## 如何使用

### 方案 A：手动上传
1. 在浏览器打开 `http://localhost:3000`。
2. 点击右上角的 **UPLOAD** 按钮，选择你的英文视频文件。
3. 等待后台处理（处理进度取决于视频长度和显卡性能）。
4. 处理完成后，字幕会自动出现在侧边栏。

### 方案 B：使用本地资源库 (推荐)
1. 将你的所有英语视频（.mp4/.mkv等）放入项目根目录下的 `data/library` 文件夹中。
2. 在网页顶部点击 **LIBRARY** 按钮。
3. 在弹出的列表中直接点击你想要学习的视频。
4. 系统会自动检测并生成对应的双语字幕。

---

## 管理员操作指南
本项目内置了简易的**审核管理后台**：
1. **进入方式**：在登录后的主界面，**双击**顶部导航栏右侧显示的“用户名”。
2. **审核流程**：进入 `ADMIN REVIEW PANEL` 后，可查看所有用户提交的视频请求，点击 `Approve` 即可将其同步至公共库。

---

## 注意事项
- 单个视频上传限制为 **500MB**。
- 密码要求为 **6-20 位**。
- 如果切换了加密算法，请手动清理 `backend/data/users.json` 以重置数据库。

---

## 目录结构说明

- `/backend`: FastAPI 后端代码入口。
  - `/backend/app/core`: 核心配置、哈希工具、JWT 安全逻辑。
  - `/backend/app/api`: API 接口路由定义 (Auth, Video, Admin, Lookup)。
  - `/backend/app/services`: 核心业务逻辑 (Whisper 识别, 翻译处理)。
- `/frontend`: React 前端代码。
- `/data/uploads`: 存放用户手动上传的视频。
- `/data/library`: **【资源库】** 存放你自己的视频文件。
- `/data/subtitles`: 存放生成的 JSON 字幕数据。
- `/models`: 存放 Whisper AI 模型权重文件 (medium.pt)。

---

## 技术大纲
- **前端**: React, Tailwind CSS, Lucide Icons, Axios.
- **后端**: FastAPI (Python), MoviePy.
- **AI 模型**: OpenAI Whisper (Speech-to-Text).
- **翻译接口**: 阿里云百炼 - 通义千问 (LLM Translation).
