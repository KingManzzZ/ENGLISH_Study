# English Study AI - 英语学习视频辅助平台

这是一个专为英语学习者设计的视频辅助学习网站。它支持通过本地 AI 模型（Whisper）自动识别视频语音，并结合阿里云百炼（通义千问）生成精准的中英双语字幕，提供极简的沉浸式学习体验。

## 核心功能

- **双语同步字幕**：左侧播放视频，右侧实时显示同步脚本。
- **智能 AI 识别**：集成 OpenAI Whisper 模型，本地识别语音，无需科学上网。
- **通义千问翻译**：接入阿里云百炼 API，提供高质量的学术级中文翻译。
- **字幕自由切换**：支持独立开启/关闭英文原文或中文翻译。
- **交互式点播**：点击右侧任意字幕，视频自动跳转到对应时间点。
- **本地资源库**：支持直接从本地文件夹中批量载入视频资源。
- **极致黑白设计**：现代简约 UI，减少视觉干扰，专注于内容本身。

---

## 环境准备

在使用之前，请确保你的电脑已安装：
1. **Python 3.8+**
2. **Node.js 16+**
3. **FFmpeg** (必须安装并添加到系统环境变量，用于视频音频提取)

---

## 快速开始

### 1. 配置后端 (Backend)

1. 进入后端目录并安装依赖：
   ```powershell
   cd backend
   pip install fastapi uvicorn python-multipart openai-whisper moviepy dashscope -i https://pypi.tuna.tsinghua.edu.cn/simple
   ```
2. **填写 API Key**：
   打开 `backend/main.py`，找到以下行并填入你的阿里云百炼密钥：
   ```python
   dashscope.api_key = "你的密钥"
   ```
3. 启动后端服务：
   ```powershell
   python main.py
   ```
   *注意：首次启动会自动下载 Whisper 模型（约 140MB），请保持网络畅通。*

### 2. 配置前端 (Frontend)

1. 进入前端目录并安装依赖：
   ```powershell
   cd frontend
   npm install
   ```
2. 启动前端服务：
   ```powershell
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

## 目录结构说明

- `/backend`: FastAPI 后端代码。
- `/frontend`: React 前端代码。
- `/data/uploads`: 存放用户手动上传的视频。
- `/data/library`: **【资源库】** 存放你自己的视频文件。
- `/data/subtitles`: 存放生成的 JSON 字幕数据。

---

## 技术大纲
- **前端**: React, Tailwind CSS, Lucide Icons, Axios.
- **后端**: FastAPI (Python), MoviePy.
- **AI 模型**: OpenAI Whisper (Speech-to-Text).
- **翻译接口**: 阿里云百炼 - 通义千问 (LLM Translation).

