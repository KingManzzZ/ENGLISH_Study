import os
import jwt
import hashlib
import binascii
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Header, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import shutil
import subprocess
import json
import whisper
import torch
import dashscope
from http import HTTPStatus

# 加载环境变量
load_dotenv()

app = FastAPI()

# 安全配置
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-make-it-strong")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60  # 30 days for convenience

# --- 自定义哈希工具 (完全摆脱 passlib 和 bcrypt 的兼容性问题) ---

def hash_password(password: str) -> str:
    """使用 PBKDF2 算法加密密码 (Python 内置，极其稳定)"""
    salt = hashlib.sha256(os.urandom(60)).hexdigest().encode('ascii')
    pwdhash = hashlib.pbkdf2_hmac('sha512', password.encode('utf-8'), salt, 100000)
    pwdhash = binascii.hexlify(pwdhash)
    return (salt + pwdhash).decode('ascii')

def verify_password(plain_password: str, stored_password: str) -> bool:
    """验证密码是否匹配"""
    try:
        salt = stored_password[:64].encode('ascii')
        stored_hash = stored_password[64:].encode('ascii')
        pwdhash = hashlib.pbkdf2_hmac('sha512', plain_password.encode('utf-8'), salt, 100000)
        pwdhash = binascii.hexlify(pwdhash)
        return pwdhash == stored_hash
    except Exception:
        return False

# 修补原有的 get_password_hash 引用
def get_password_hash(password):
    return hash_password(password)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

USERS_FILE = "data/users.json"
REVIEW_REQUESTS_FILE = "data/review_requests.json"
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin") # 新增：从环境变量读取管理员账号

def load_users():
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, "r", encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_users(users):
    with open(USERS_FILE, "w", encoding='utf-8') as f:
        json.dump(users, f, ensure_ascii=False, indent=4)

def load_review_requests():
    if os.path.exists(REVIEW_REQUESTS_FILE):
        try:
            with open(REVIEW_REQUESTS_FILE, "r", encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_review_requests(requests):
    with open(REVIEW_REQUESTS_FILE, "w", encoding='utf-8') as f:
        json.dump(requests, f, ensure_ascii=False, indent=4)

# --- 身份验证支持函数 ---


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        return username
    except jwt.PyJWTError:
        raise credentials_exception

# --- 身份验证增强 ---

async def get_current_admin(token: str = Depends(oauth2_scheme)):
    """
    专门验证管理员权限的依赖
    """
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        is_admin = payload.get("is_admin", False)
        if username is None or not is_admin:
            raise HTTPException(status_code=403, detail="Admin privileges required")
        return username
    except jwt.PyJWTError:
        raise credentials_exception

# --- 路由处理器 ---

# 允许跨域请求 - 增强配置以支持自定义 Header 和云端部署
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"], # 必须允许所有头，否则自定义的 X-Token 和 Authorization 会被浏览器拦截
)

# 确保用户目录存在
USERS_DATA_DIR = "data/users"
os.makedirs(USERS_DATA_DIR, exist_ok=True)

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
# 挂载用户上传目录
app.mount("/videos/user_uploads", StaticFiles(directory=USERS_DATA_DIR), name="user_uploads")

# 加载 Whisper 模型
# 修改：明确指定模型保存位置到项目根目录下的 models 文件夹
# 使用绝对路径以确保万无一失
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_ROOT = os.path.join(BACKEND_DIR, "models")
os.makedirs(MODEL_ROOT, exist_ok=True)

# 检查 GPU 是否可用 (提前定义 device)
env_device = os.getenv("WHISPER_DEVICE", "auto").lower()
if env_device == "cuda":
    device = "cuda"
elif env_device == "cpu":
    device = "cpu"
else:
    device = "cuda" if torch.cuda.is_available() else "cpu"

# 全局模型变量，将在启动时加载
model = None

@app.on_event("startup")
async def startup_event():
    global model
    print("=" * 50)
    print(f"DEVICE STATUS: {device.upper()}")
    if device == "cuda":
        print(f"GPU Name: {torch.cuda.get_device_name(0)}")
        print(f"Memory Allocated: {torch.cuda.memory_allocated(0) / 1024**2:.2f} MB")
    else:
        print("Running on CPU mode. Transcription will be slower.")
    print("=" * 50)

    print(f"Loading Whisper model to: {MODEL_ROOT}")
    try:
        # 加上 download_root 确保它去你指定的文件夹找
        model = whisper.load_model("medium", device=device, download_root=MODEL_ROOT)
        print("Whisper model loaded successfully!")
    except Exception as e:
        print(f"Error loading Whisper model: {e}")

# 设置阿里云百炼 API KEY
dashscope.api_key = os.getenv("DASHSCOPE_API_KEY")

@app.get("/")
def read_root():
    return {"message": "Welcome to English Study API"}

# --- 登录与注册接口 ---

@app.post("/register")
async def register(form_data: OAuth2PasswordRequestForm = Depends()):
    # 账号名取消下限，仅保留上限 20 字符
    if len(form_data.username) > 20:
        raise HTTPException(status_code=400, detail="Username is too long (max 20 characters)")
    if len(form_data.username) == 0:
        raise HTTPException(status_code=400, detail="Username cannot be empty")

    # 密码长度验证：6-20 字符
    if len(form_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password is too short (min 6 characters)")
    if len(form_data.password) > 20:
        raise HTTPException(status_code=400, detail="Password is too long (max 20 characters)")

    users = load_users()
    # 防止账户名重复机制
    if form_data.username in users:
        raise HTTPException(status_code=400, detail="Username already exists, please choose another one")

    users[form_data.username] = {
        "username": form_data.username,
        "password": get_password_hash(form_data.password)
    }
    save_users(users)

    # 为新用户创建专属目录
    user_dir = os.path.join(USERS_DATA_DIR, form_data.username)
    os.makedirs(os.path.join(user_dir, "uploads"), exist_ok=True)
    os.makedirs(os.path.join(user_dir, "subtitles"), exist_ok=True)
    os.makedirs(os.path.join(user_dir, "thumbnails"), exist_ok=True)

    return {"message": "User created successfully"}

@app.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    if len(form_data.username) > 20:
        raise HTTPException(status_code=400, detail="Username exceeded 20 characters")
    if len(form_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if len(form_data.password) > 20:
        raise HTTPException(status_code=400, detail="Password exceeded 20 characters")

    users = load_users()
    user = users.get(form_data.username)
    if not user or not verify_password(form_data.password, user["password"]):
        # 登录失败保持稍微模糊一点，防止账户名枚举探测，但给明确提示
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    is_admin = (form_data.username == ADMIN_USERNAME) # 检查是否为预设管理员
    access_token = create_access_token(data={"sub": form_data.username, "is_admin": is_admin})
    return {"access_token": access_token, "token_type": "bearer", "is_admin": is_admin}

# 设置最大上传大小 (例如 500MB)
MAX_UPLOAD_SIZE = 500 * 1024 * 1024 # 500MB

@app.post("/upload")
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    username: str = Depends(get_current_user),
    x_token: str = Header(None)
):
    # 1. 验证 Token
    api_token_env = os.getenv("API_TOKEN")
    if api_token_env and x_token != api_token_env:
        raise HTTPException(status_code=403, detail="Invalid API Token")

    # 2. 验证文件大小
    content = await file.read(1024)
    file.file.seek(0, os.SEEK_END)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {MAX_UPLOAD_SIZE/1024/1024}MB")

    if not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Only video files are allowed")

    # --- 新增：内容哈希校验，防止同一视频重复占用空间 ---
    file_content = file.file.read()
    file_hash = hashlib.sha256(file_content).hexdigest()
    file.file.seek(0) # 重置指针用于后续保存

    file_extension = os.path.splitext(file.filename)[1]
    file_id = file_hash # 使用哈希值作为文件 ID，实现去重

    user_upload_dir = os.path.join(USERS_DATA_DIR, username, "uploads")
    os.makedirs(user_upload_dir, exist_ok=True)
    file_path = os.path.join(user_upload_dir, f"{file_id}{file_extension}")

    # 检查物理文件是否已存在
    if os.path.exists(file_path):
        # 如果文件已存在，检查字幕是否也已完成
        user_sub_dir = os.path.join(USERS_DATA_DIR, username, "subtitles")
        subtitle_path = os.path.join(user_sub_dir, f"{file_id}.json")
        if os.path.exists(subtitle_path):
            return {"file_id": file_id, "status": "completed", "message": "Video already processed"}

    # 保存文件
    with open(file_path, "wb") as buffer:
        buffer.write(file_content)

    # 将处理任务放入后台
    background_tasks.add_task(process_video, file_id, file_path, username)

    # 预先创建一个 status 文件
    user_sub_dir = os.path.join(USERS_DATA_DIR, username, "subtitles")
    os.makedirs(user_sub_dir, exist_ok=True)
    status_path = os.path.join(user_sub_dir, f"{file_id}_status.json")
    with open(status_path, "w", encoding='utf-8') as f:
        json.dump({"status": "processing", "progress": 1, "message": "File received, starting AI engine..."}, f)

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

def process_video(file_id: str, file_path: str, username: str = None):
    """
    使用 Whisper 模型进行语音识别并利用阿里云百炼进行翻译。
    增加了处理状态的实时保存，以便前端轮询精度。
    """
    # 确定保存路径
    if username:
        base_dir = os.path.join(USERS_DATA_DIR, username)
        sub_dir = os.path.join(base_dir, "subtitles")
        thumb_dir = os.path.join(base_dir, "thumbnails")
    else:
        sub_dir = SUBTITLE_DIR
        thumb_dir = THUMBNAIL_DIR

    os.makedirs(sub_dir, exist_ok=True)
    os.makedirs(thumb_dir, exist_ok=True)

    status_path = os.path.join(sub_dir, f"{file_id}_status.json")

    def update_status(step, progress, message):
        with open(status_path, "w", encoding='utf-8') as f:
            json.dump({"step": step, "progress": progress, "message": message}, f)

    try:
        print(f"Processing video for {username or 'public'}: {file_id}")
        update_status("preparing", 5, "Preparing video...")

        # 0. 生成封面
        thumbnail_path = os.path.join(thumb_dir, f"{file_id}.jpg")
        generate_thumbnail(file_path, thumbnail_path)

        # 1. 提取音频
        update_status("transcribe", 10, "Extracting audio...")
        audio_path = os.path.join(UPLOAD_DIR, f"{file_id}.wav")

        command = [
            'ffmpeg', '-y', '-i', file_path,
            '-ar', '16000', '-ac', '1', '-vn',
            audio_path
        ]
        subprocess.run(command, check=True, capture_output=True)

        # 2. 使用 Whisper 识别 (占用 10% - 50% 进度)
        update_status("transcribe", 15, "AI is transcribing English speech...")

        # 为了模拟转录进度，我们这里保持一个基础百分比，因为 Whisper transcribe 是原子操作
        # 后续如果需要更细粒度，需要改用 whisper 内部 hook，目前先给一个稳定的处理中状态
        result = model.transcribe(
            audio_path,
            verbose=False,
            fp16=True if device == "cuda" else False,
            language='en',
            beam_size=5
        )
        update_status("translate", 50, "Transcription finished, starting translation...")

        # 3. 格式化字幕并翻译 (占用 50% - 100% 进度)
        segments = result['segments']
        total_segments = len(segments)
        formatted_subtitles = []

        for i, segment in enumerate(segments):
            # 翻译进度在 50% 到 95% 之间均匀分布
            progress_val = 50 + int((i / total_segments) * 45)
            update_status("translate", progress_val, f"Translating: {i+1}/{total_segments} segments")

            original_text = segment['text'].strip()
            translated_text = translate_text(original_text)

            formatted_subtitles.append({
                "start": segment['start'],
                "end": segment['end'],
                "text": original_text,
                "translation": translated_text
            })

        # 4. 保存 JSON
        update_status("saving", 98, "Rounding up...")
        subtitle_path = os.path.join(sub_dir, f"{file_id}.json")
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
async def get_subtitles(file_id: str, username: str = Depends(get_current_user)):
    # 优先查找用户私有目录
    user_sub_dir = os.path.join(USERS_DATA_DIR, username, "subtitles")
    subtitle_path = os.path.join(user_sub_dir, f"{file_id}.json")
    status_path = os.path.join(user_sub_dir, f"{file_id}_status.json")

    # 如果私有目录没有，则尝试公共库（兼容 Library）
    if not os.path.exists(subtitle_path):
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
                    # 移除 localhost 硬编码，由前端决定完整的 URL
                    "thumbnail": f"/thumbnails/{file_id}.jpg" if os.path.exists(thumbnail_path) else None
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
async def list_uploads(username: str = Depends(get_current_user)):
    """
    列出当前用户已上传的视频记录，并包含审核状态
    """
    videos = []
    user_upload_dir = os.path.join(USERS_DATA_DIR, username, "uploads")
    user_thumb_dir = os.path.join(USERS_DATA_DIR, username, "thumbnails")

    review_requests = load_review_requests()

    valid_extensions = ('.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv')
    try:
        if os.path.exists(user_upload_dir):
            files = os.listdir(user_upload_dir)
            for filename in files:
                ext = os.path.splitext(filename)[1].lower()
                if ext in valid_extensions:
                    file_id = os.path.splitext(filename)[0]
                    thumbnail_filename = f"{file_id}.jpg"
                    thumbnail_path = os.path.join(user_thumb_dir, thumbnail_filename)

                    if not os.path.exists(thumbnail_path):
                        video_path = os.path.join(user_upload_dir, filename)
                        generate_thumbnail(video_path, thumbnail_path)

                    # 确定审核状态
                    status = "private"
                    if file_id in review_requests:
                        status = review_requests[file_id].get("status", "pending")

                    videos.append({
                        "id": file_id,
                        "title": f"Upload - {file_id[:8]}",
                        "path": f"/videos/user_uploads/{username}/uploads/{filename}",
                        "thumbnail": f"/videos/user_uploads/{username}/thumbnails/{thumbnail_filename}" if os.path.exists(thumbnail_path) else None,
                        "status": status
                    })
    except Exception as e:
        print(f"Error listing uploads for {username}: {e}")
    return videos

@app.post("/request_review/{file_id}")
async def request_review(file_id: str, username: str = Depends(get_current_user)):
    """
    用户请求将视频提交至公共库审核
    """
    user_upload_dir = os.path.join(USERS_DATA_DIR, username, "uploads")

    # 检查文件是否存在且属于该用户
    found = False
    file_ext = ""
    for ext in ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv']:
        if os.path.exists(os.path.join(user_upload_dir, f"{file_id}{ext}")):
            found = True
            file_ext = ext
            break

    if not found:
        raise HTTPException(status_code=404, detail="Video not found in your uploads")

    requests = load_review_requests()
    if file_id in requests and requests[file_id]["status"] == "pending":
        raise HTTPException(status_code=400, detail="Already pending review")

    requests[file_id] = {
        "username": username,
        "file_id": file_id,
        "extension": file_ext,
        "status": "pending",
        "timestamp": datetime.now().isoformat()
    }
    save_review_requests(requests)
    return {"message": "Submitted for review. Admin will check it soon."}

# --- 管理员接口 (更新为账号权限验证) ---

@app.get("/admin/pending")
async def list_pending_reviews(username: str = Depends(get_current_admin)):
    """
    获取待审核列表 (依赖当前登录的管理员账号)
    """
    requests = load_review_requests()
    pending = [req for req in requests.values() if req["status"] == "pending"]
    return pending

@app.post("/admin/approve/{file_id}")
async def approve_video(file_id: str, username: str = Depends(get_current_admin)):
    """
    管理员审核通过：将视频、封面、字幕移动到公共库
    """
    requests = load_review_requests()
    if file_id not in requests:
        raise HTTPException(status_code=404, detail="Review request not found")

    req = requests[file_id]
    username = req["username"]
    ext = req["extension"]

    # 路径准备
    user_video = os.path.join(USERS_DATA_DIR, username, "uploads", f"{file_id}{ext}")
    user_thumb = os.path.join(USERS_DATA_DIR, username, "thumbnails", f"{file_id}.jpg")
    user_sub = os.path.join(USERS_DATA_DIR, username, "subtitles", f"{file_id}.json")

    # 公共路径
    lib_video = os.path.join(LIBRARY_DIR, f"{file_id}{ext}")
    lib_thumb = os.path.join(THUMBNAIL_DIR, f"{file_id}.jpg")
    lib_sub = os.path.join(SUBTITLE_DIR, f"{file_id}.json")

    # 移动文件 (复制并保留原件，或者移动，这里选择复制以防万一)
    try:
        if os.path.exists(user_video):
            shutil.copy2(user_video, lib_video)
        if os.path.exists(user_thumb):
            shutil.copy2(user_thumb, lib_thumb)
        if os.path.exists(user_sub):
            shutil.copy2(user_sub, lib_sub)

        # 更新状态
        req["status"] = "approved"
        save_review_requests(requests)
        return {"message": "Video approved and moved to library"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error moving files: {str(e)}")

@app.post("/admin/reject/{file_id}")
async def reject_video(file_id: str, username: str = Depends(get_current_admin)):
    """
    管理员审核拒绝
    """

    requests = load_review_requests()
    if file_id in requests:
        requests[file_id]["status"] = "rejected"
        save_review_requests(requests)
    return {"message": "Video rejected"}

@app.post("/lookup")
async def lookup_word(data: dict, username: str = Depends(get_current_user)):
    word = data.get("word", "").strip().strip('.,!?()[]"')

    if not word:
        raise HTTPException(status_code=400, detail="Word is required")

    import requests
    try:
        # 使用 Free Dictionary API
        response = requests.get(f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}")
        if response.status_code == 200:
            result = response.json()[0]
            phonetic = result.get("phonetic") or result.get("phonetics", [{}])[0].get("text", "n/a")
            # 获取第一个定义和词性
            meanings = result.get("meanings", [])
            pos = meanings[0].get("partOfSpeech", "n/a") if meanings else "n/a"
            definitions = meanings[0].get("definitions", []) if meanings else []
            definition = definitions[0].get("definition", "No definition found") if definitions else "No definition found"

            return {
                "word": word,
                "phonetic": phonetic,
                "translation": definition, # 这里返回英文定义
                "pos": pos
            }
        else:
            raise Exception("API error or word not found")
    except Exception as e:
        print(f"Lookup Error: {e}")
        return {
            "word": word,
            "phonetic": "n/a",
            "translation": "Service unavailable or word not found",
            "pos": "n/a"
        }

import uvicorn
import os
import sys

# Add the backend directory to sys.path so we can import 'app'
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.main import create_app

app = create_app()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

