import os
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import shutil
import uuid
import subprocess
import json
import whisper
import torch
from moviepy import VideoFileClip
import dashscope
from http import HTTPStatus

# 加载环境变量
load_dotenv()

app = FastAPI()

# 允许跨域请求 - 正式部署应限制为具体的域名
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 使用环境变量获取路径，方便云端配置存储
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "data/uploads")
SUBTITLE_DIR = os.getenv("SUBTITLE_DIR", "data/subtitles")
LIBRARY_DIR = os.getenv("LIBRARY_DIR", "data/library")
THUMBNAIL_DIR = os.getenv("THUMBNAIL_DIR", "data/thumbnails")

# 确保目录存在
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(SUBTITLE_DIR, exist_ok=True)
os.makedirs(LIBRARY_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_DIR, exist_ok=True)

# 挂载静态文件目录，这样前端才能通过 URL 访问到视频文件
app.mount("/videos/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/videos/library", StaticFiles(directory=LIBRARY_DIR), name="library")
app.mount("/thumbnails", StaticFiles(directory=THUMBNAIL_DIR), name="thumbnails")

# 加载 Whisper 模型
# 修改：明确指定模型保存位置到项目根目录下的 models 文件夹
# 使用绝对路径以确保万无一失
ROOT_DIR = os.path.dirname(os.path.abspath(__file__)) # backend 目录
PROJECT_ROOT = os.path.dirname(ROOT_DIR) # 项目根目录
MODEL_ROOT = os.path.join(PROJECT_ROOT, "models")
os.makedirs(MODEL_ROOT, exist_ok=True)

# 检查 GPU 是否可用
env_device = os.getenv("WHISPER_DEVICE", "auto").lower()
if env_device == "cuda":
    device = "cuda"
elif env_device == "cpu":
    device = "cpu"
else:
    device = "cuda" if torch.cuda.is_available() else "cpu"

print("=" * 50)
print(f"DEVICE STATUS: {device.upper()}")
if device == "cuda":
    print(f"GPU Name: {torch.cuda.get_device_name(0)}")
    print(f"Memory Allocated: {torch.cuda.memory_allocated(0) / 1024**2:.2f} MB")
else:
    print("Running on CPU mode. Transcription will be slower.")
print("=" * 50)

print(f"Loading Whisper model to: {MODEL_ROOT}")
model = whisper.load_model("medium", download_root=MODEL_ROOT, device=device)

# 设置阿里云百炼 API KEY
dashscope.api_key = os.getenv("DASHSCOPE_API_KEY")

@app.get("/")
def read_root():
    return {"message": "Welcome to English Study API"}

@app.post("/upload")
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename)[1]
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_extension}")

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 将处理任务放入后台
    background_tasks.add_task(process_video, file_id, file_path)

    return {"file_id": file_id, "status": "processing"}

def translate_text(text: str) -> str:
    """
    使用阿里云百炼 qwen 模型进行翻译
    """
    try:
        messages = [
            {'role': 'system', 'content': 'You are a professional translator. Translate the following English sentence to Chinese. Only provide the translation text.'},
            {'role': 'user', 'content': text}
        ]
        response = dashscope.Generation.call(
            model='qwen-turbo',
            messages=messages,
            result_format='message',
        )
        if response.status_code == HTTPStatus.OK:
            return response.output.choices[0]['message']['content'].strip()
        else:
            print(f'Error: {response.code} - {response.message}')
            return f"[翻译失败: {text}]"
    except Exception as e:
        print(f"Translation Exception: {e}")
        return f"[翻译错误: {text}]"

def generate_thumbnail(video_path: str, thumbnail_path: str):
    """
    使用 FFmpeg 提取视频第一帧作为封面
    """
    try:
        command = [
            'ffmpeg', '-y', '-i', video_path,
            '-ss', '00:00:01', '-vframes', '1',
            thumbnail_path
        ]
        subprocess.run(command, check=True, capture_output=True)
    except Exception as e:
        print(f"Error generating thumbnail: {e}")

def process_video(file_id: str, file_path: str):
    """
    使用 Whisper 模型进行语音识别并利用阿里云百炼进行翻译。
    增加了处理状态的实时保存，以便前端轮询精度。
    """
    status_path = os.path.join(SUBTITLE_DIR, f"{file_id}_status.json")

    def update_status(step, progress, message):
        with open(status_path, "w", encoding='utf-8') as f:
            json.dump({"step": step, "progress": progress, "message": message}, f)

    try:
        print(f"Processing video: {file_id}")
        update_status("thumbnail", 5, "Generating video thumbnail...")

        # 0. 生成封面
        thumbnail_path = os.path.join(THUMBNAIL_DIR, f"{file_id}.jpg")
        generate_thumbnail(file_path, thumbnail_path)

        # 1. 提取音频
        update_status("audio", 15, "Extracting audio track...")
        audio_path = os.path.join(UPLOAD_DIR, f"{file_id}.wav")

        # 识别失败调优：增加 -af "highpass=f=200, lowpass=f=3000" 可以过滤背景音，提高质量
        command = [
            'ffmpeg', '-y', '-i', file_path,
            '-ar', '16000', '-ac', '1', '-vn',
            audio_path
        ]
        
        print("Extracting synchronized audio via FFmpeg...")
        subprocess.run(command, check=True, capture_output=True)

        # 2. 使用 Whisper 识别
        update_status("transcribe", 30, "AI is transcribing English speech (this takes the longest)...")
        print(f"Transcribing audio with 'medium' model on {device}...")
        # 增加 beam_size=5 和 best_of=5 可以提高准确率，但会变慢
        result = model.transcribe(
            audio_path,
            verbose=False,
            fp16=True if device == "cuda" else False, # GPU 下开启 fp16 加速
            # 指定语言为英语可以进一步减少杂音误识别为其他语言的情况
            language='en',
            beam_size=5
        )

        # 3. 格式化字幕并翻译
        segments = result['segments']
        total_segments = len(segments)
        formatted_subtitles = []

        print(f"Translating {total_segments} segments...")
        for i, segment in enumerate(segments):
            progress_val = 30 + int((i / total_segments) * 65)
            update_status("translate", progress_val, f"Translating segments: {i+1}/{total_segments}")

            original_text = segment['text'].strip()
            translated_text = translate_text(original_text)

            formatted_subtitles.append({
                "start": segment['start'],
                "end": segment['end'],
                "text": original_text,
                "translation": translated_text
            })

        # 4. 保存 JSON
        update_status("saving", 95, "Saving processed subtitles...")
        subtitle_path = os.path.join(SUBTITLE_DIR, f"{file_id}.json")
        with open(subtitle_path, "w", encoding='utf-8') as f:
            json.dump(formatted_subtitles, f, ensure_ascii=False)

        update_status("completed", 100, "Processing finished")
        print(f"Processing finished for {file_id}")

        # 清理临时音频文件
        if os.path.exists(audio_path):
            os.remove(audio_path)

    except Exception as e:
        update_status("error", 0, f"Error: {str(e)}")
        print(f"Error processing video {file_id}: {e}")

@app.get("/subtitles/{file_id}")
async def get_subtitles(file_id: str):
    subtitle_path = os.path.join(SUBTITLE_DIR, f"{file_id}.json")
    status_path = os.path.join(SUBTITLE_DIR, f"{file_id}_status.json")

    if os.path.exists(subtitle_path):
        with open(subtitle_path, "r", encoding='utf-8') as f:
            return {"status": "completed", "data": json.load(f)}

    if os.path.exists(status_path):
        with open(status_path, "r", encoding='utf-8') as f:
            status_data = json.load(f)
            return status_data

    return {"status": "processing", "progress": 0, "message": "Starting engine..."}

@app.get("/library")
async def list_library():
    """
    列出资源库中的所有视频文件
    """
    videos = []
    # 扩大支持的扩展名
    valid_extensions = ('.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv')
    try:
        if not os.path.exists(LIBRARY_DIR):
            os.makedirs(LIBRARY_DIR)

        print(f"Scanning library: {os.path.abspath(LIBRARY_DIR)}")
        files = os.listdir(LIBRARY_DIR)

        for filename in files:
            ext = os.path.splitext(filename)[1].lower()
            if ext in valid_extensions:
                file_id = os.path.splitext(filename)[0]
                thumbnail_path = os.path.join(THUMBNAIL_DIR, f"{file_id}.jpg")

                # 如果封面不存在，尝试生成
                if not os.path.exists(thumbnail_path):
                    video_path = os.path.join(LIBRARY_DIR, filename)
                    generate_thumbnail(video_path, thumbnail_path)

                videos.append({
                    "id": file_id,
                    "title": filename,
                    "path": f"/videos/library/{filename}",
                    "thumbnail": f"http://localhost:8000/thumbnails/{file_id}.jpg" if os.path.exists(thumbnail_path) else None
                })
        print(f"Found {len(videos)} videos in library")
    except Exception as e:
        print(f"Error listing library: {e}")
    return videos

@app.post("/library/process/{file_id}")
async def process_library_video(file_id: str, background_tasks: BackgroundTasks):
    """
    手动触发资源库视频的字幕处理
    """
    valid_extensions = ('.mp4', '.mkv', '.avi', '.mov')
    file_path = None
    for ext in valid_extensions:
        temp_path = os.path.join(LIBRARY_DIR, f"{file_id}{ext}")
        if os.path.exists(temp_path):
            file_path = temp_path
            break

    if not file_path:
        return {"error": "Video not found"}

    background_tasks.add_task(process_video, file_id, file_path)
    return {"status": "processing", "file_id": file_id}

@app.get("/uploads")
async def list_uploads():
    """
    列出所有已上传的视频记录
    """
    videos = []
    valid_extensions = ('.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv')
    try:
        if os.path.exists(UPLOAD_DIR):
            files = os.listdir(UPLOAD_DIR)
            for filename in files:
                ext = os.path.splitext(filename)[1].lower()
                if ext in valid_extensions:
                    file_id = os.path.splitext(filename)[0]
                    thumbnail_path = os.path.join(THUMBNAIL_DIR, f"{file_id}.jpg")

                    # 如果封面不存在，尝试生成
                    if not os.path.exists(thumbnail_path):
                        video_path = os.path.join(UPLOAD_DIR, filename)
                        generate_thumbnail(video_path, thumbnail_path)

                    videos.append({
                        "id": file_id,
                        "title": f"Upload - {file_id[:8]}",
                        "path": f"/videos/uploads/{filename}",
                        "thumbnail": f"http://localhost:8000/thumbnails/{file_id}.jpg" if os.path.exists(thumbnail_path) else None
                    })
    except Exception as e:
        print(f"Error listing uploads: {e}")
    return videos

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)