import os
import json
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Header, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.security import OAuth2PasswordBearer
import jwt
import hashlib

from ..core.config import (
    USERS_FILE, REVIEW_REQUESTS_FILE, USERS_DATA_DIR,
    UPLOAD_DIR, SUBTITLE_DIR, LIBRARY_DIR, THUMBNAIL_DIR,
    SECRET_KEY, ALGORITHM, ADMIN_USERNAME,
    verify_password, get_password_hash, create_access_token
)
from ..services.video_service import process_video

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Helper functions for data loading
def load_json(path, default=None):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding='utf-8') as f:
                return json.load(f)
        except:
            return default if default is not None else {}
    return default if default is not None else {}

def save_json(path, data):
    with open(path, "w", encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

# Dependency to get user
async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(status_code=401, detail="Could not validate credentials")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None: raise credentials_exception
        return username
    except jwt.PyJWTError: raise credentials_exception

async def get_current_admin(token: str = Depends(oauth2_scheme)):
    user = await get_current_user(token)
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if not payload.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user

# --- AUTH ROUTES ---
@router.post("/register")
async def register(form_data: OAuth2PasswordRequestForm = Depends()):
    if not 0 < len(form_data.username) <= 20:
        raise HTTPException(status_code=400, detail="Invalid username length")
    if not 6 <= len(form_data.password) <= 20:
        raise HTTPException(status_code=400, detail="Invalid password length")

    users = load_json(USERS_FILE)
    if form_data.username in users:
        raise HTTPException(status_code=400, detail="Username already exists")

    users[form_data.username] = {
        "username": form_data.username,
        "password": get_password_hash(form_data.password)
    }
    save_json(USERS_FILE, users)

    user_dir = os.path.join(USERS_DATA_DIR, form_data.username)
    for sub in ["uploads", "subtitles", "thumbnails"]:
        os.makedirs(os.path.join(user_dir, sub), exist_ok=True)
    return {"message": "User created successfully"}

@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    users = load_json(USERS_FILE)
    user = users.get(form_data.username)
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    is_admin = (form_data.username == ADMIN_USERNAME)
    access_token = create_access_token(data={"sub": form_data.username, "is_admin": is_admin})
    return {"access_token": access_token, "token_type": "bearer", "is_admin": is_admin}

# --- VIDEO ROUTES ---
@router.post("/upload")
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    username: str = Depends(get_current_user),
    x_token: str = Header(None)
):
    api_token_env = os.getenv("API_TOKEN")
    if api_token_env and x_token != api_token_env:
        raise HTTPException(status_code=403, detail="Invalid API Token")

    file_content = await file.read()
    if len(file_content) > 500 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")

    file_hash = hashlib.sha256(file_content).hexdigest()
    file_id = file_hash
    ext = os.path.splitext(file.filename)[1]

    user_upload_dir = os.path.join(USERS_DATA_DIR, username, "uploads")
    os.makedirs(user_upload_dir, exist_ok=True)
    file_path = os.path.join(user_upload_dir, f"{file_id}{ext}")

    if not os.path.exists(file_path):
        with open(file_path, "wb") as buffer: buffer.write(file_content)
        background_tasks.add_task(process_video, file_id, file_path, username)

        user_sub_dir = os.path.join(USERS_DATA_DIR, username, "subtitles")
        os.makedirs(user_sub_dir, exist_ok=True)
        status_path = os.path.join(user_sub_dir, f"{file_id}_status.json")
        save_json(status_path, {"status": "processing", "progress": 1, "message": "Starting AI..."})

    return {"file_id": file_id, "status": "processing"}

@router.get("/subtitles/{file_id}")
async def get_subtitles(file_id: str, username: str = Depends(get_current_user)):
    # Private
    p_sub = os.path.join(USERS_DATA_DIR, username, "subtitles", f"{file_id}.json")
    if os.path.exists(p_sub): return {"status": "completed", "data": load_json(p_sub)}

    p_status = os.path.join(USERS_DATA_DIR, username, "subtitles", f"{file_id}_status.json")
    if os.path.exists(p_status): return load_json(p_status)

    # Public
    lib_sub = os.path.join(SUBTITLE_DIR, f"{file_id}.json")
    if os.path.exists(lib_sub): return {"status": "completed", "data": load_json(lib_sub)}

    return {"status": "processing", "progress": 0, "message": "Searching..."}

@router.get("/library")
async def list_library():
    videos = []
    valid_ext = ('.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv')
    if os.path.exists(LIBRARY_DIR):
        for f in os.listdir(LIBRARY_DIR):
            if f.lower().endswith(valid_ext):
                fid = os.path.splitext(f)[0]
                videos.append({
                    "id": fid, "title": f, "path": f"/videos/library/{f}",
                    "thumbnail": f"/thumbnails/{fid}.jpg"
                })
    return videos

@router.get("/uploads")
async def list_uploads(username: str = Depends(get_current_user)):
    videos = []
    u_dir = os.path.join(USERS_DATA_DIR, username, "uploads")
    requests = load_json(REVIEW_REQUESTS_FILE)
    if os.path.exists(u_dir):
        for f in os.listdir(u_dir):
            fid = os.path.splitext(f)[0]
            status = requests.get(fid, {}).get("status", "private")
            videos.append({
                "id": fid, "title": f"Upload - {fid[:8]}",
                "path": f"/videos/user_uploads/{username}/uploads/{f}",
                "thumbnail": f"/videos/user_uploads/{username}/thumbnails/{fid}.jpg",
                "status": status
            })
    return videos

@router.post("/admin/reject/{file_id}")
async def reject_video(file_id: str, username: str = Depends(get_current_admin)):
    requests = load_json(REVIEW_REQUESTS_FILE)
    if file_id in requests:
        requests[file_id]["status"] = "rejected"
        save_json(REVIEW_REQUESTS_FILE, requests)
    return {"message": "Video rejected"}

@router.post("/admin/approve/{file_id}")
async def approve_video(file_id: str, username: str = Depends(get_current_admin)):
    import shutil
    requests = load_json(REVIEW_REQUESTS_FILE)
    if file_id not in requests:
        raise HTTPException(status_code=404, detail="Review request not found")

    req = requests[file_id]
    user = req["username"]
    ext = req["extension"]

    user_video = os.path.join(USERS_DATA_DIR, user, "uploads", f"{file_id}{ext}")
    user_thumb = os.path.join(USERS_DATA_DIR, user, "thumbnails", f"{file_id}.jpg")
    user_sub = os.path.join(USERS_DATA_DIR, user, "subtitles", f"{file_id}.json")

    lib_video = os.path.join(LIBRARY_DIR, f"{file_id}{ext}")
    lib_thumb = os.path.join(THUMBNAIL_DIR, f"{file_id}.jpg")
    lib_sub = os.path.join(SUBTITLE_DIR, f"{file_id}.json")

    try:
        if os.path.exists(user_video): shutil.copy2(user_video, lib_video)
        if os.path.exists(user_thumb): shutil.copy2(user_thumb, lib_thumb)
        if os.path.exists(user_sub): shutil.copy2(user_sub, lib_sub)
        req["status"] = "approved"
        save_json(REVIEW_REQUESTS_FILE, requests)
        return {"message": "Approved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/pending")
async def list_pending_reviews(username: str = Depends(get_current_admin)):
    requests = load_json(REVIEW_REQUESTS_FILE)
    return [req for req in requests.values() if req["status"] == "pending"]

@router.post("/request_review/{file_id}")
async def request_review(file_id: str, username: str = Depends(get_current_user)):
    user_upload_dir = os.path.join(USERS_DATA_DIR, username, "uploads")
    found = False
    ext = ""
    for e in ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv']:
        if os.path.exists(os.path.join(user_upload_dir, f"{file_id}{e}")):
            found = True
            ext = e
            break
    if not found: raise HTTPException(status_code=404, detail="Not found")

    requests = load_json(REVIEW_REQUESTS_FILE)
    requests[file_id] = {
        "username": username, "file_id": file_id, "extension": ext,
        "status": "pending", "timestamp": datetime.now().isoformat()
    }
    save_json(REVIEW_REQUESTS_FILE, requests)
    return {"message": "Submitted"}

@router.post("/lookup/ai_context")
async def lookup_word_ai_context(data: dict):
    word = data.get("word", "").strip().strip('.,!?()[]"')
    context = data.get("context", "")
    prev_context = data.get("prev_context", "")
    next_context = data.get("next_context", "")

    if not word:
        raise HTTPException(status_code=400, detail="Word is required")

    import os
    from openai import OpenAI

    try:
        api_key = os.getenv("DASHSCOPE_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI API key not configured")

        client = OpenAI(
            api_key=api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )

        full_context = f"{prev_context}\n{context}\n{next_context}".strip()

        prompt = (
            f"单词: {word}\n"
            f"所在句子: {context}\n"
            f"上下句背景: \n{full_context}\n\n"
            f"任务：结合上述具体语境，直接给出该单词在‘此处’的唯一意思。禁止列举多个序号，禁止输出词典项，禁止输出免责声明。\n"
            f"输出格式（严格执行）：\n"
            f"该单词在原句中的意思应该是：[这里直接写出该单词在当前语境下的具体含义、中文翻译以及在句子中扮演的角色，确保回答合乎逻辑且简洁专业]\n"
            f"注意：不要输出任何前言、后记或多余说明。直接从‘该单词在原句中的意思应该是：’开始。"
        )

        completion = client.chat.completions.create(
            model="qwen-plus",
            messages=[
                {"role": "system", "content": "你是一个专业的英语老师，擅长结合语境解释词义。"},
                {"role": "user", "content": prompt}
            ]
        )

        return {"status": "success", "explanation": completion.choices[0].message.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/lookup")
async def lookup_word(data: dict):
    word = data.get("word", "").strip().strip('.,!?()[]"')
    context = data.get("context", "")
    if not word:
        raise HTTPException(status_code=400, detail="Word is required")

    import requests
    import os
    from openai import OpenAI

    # Get dictionary data
    dict_data = None
    try:
        r = requests.get(f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}", timeout=5)
        if r.status_code == 200:
            dict_data = r.json()
    except:
        pass

    # Use LLM (Aliyun Bailian) to translate definitions and examples
    # This is a fallback/enhancement to provide Chinese translations
    try:
        api_key = os.getenv("DASHSCOPE_API_KEY")
        if api_key and dict_data:
            client = OpenAI(
                api_key=api_key,
                base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            )

            # Prepare a simplified version of dict_data for translation to save tokens
            simplified_data = []
            for entry in dict_data:
                meanings = []
                for m in entry.get("meanings", []):
                    defs = []
                    for d in m.get("definitions", []): # Removed [:2] limit to translate all definitions
                        defs.append({"def": d.get("definition"), "ex": d.get("example")})
                    meanings.append({"pos": m.get("partOfSpeech"), "defs": defs})
                simplified_data.append({"word": entry.get("word"), "meanings": meanings})

            prompt = f"Translate the following English dictionary definitions and examples into Chinese. Return ONLY a JSON object mapping the English text to its Chinese translation. Word: {word}. Context: {context}\nData: {json.dumps(simplified_data)}"

            completion = client.chat.completions.create(
                model="qwen-plus",
                messages=[
                    {"role": "system", "content": "You are a helpful translation assistant. Return only JSON mapping English strings to Chinese strings."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )
            translations = json.loads(completion.choices[0].message.content)

            # Inject translations back into dict_data
            for entry in dict_data:
                for m in entry.get("meanings", []):
                    for d in m.get("definitions", []):
                        d["translation"] = translations.get(d.get("definition"), "")
                        if d.get("example"):
                            d["example_translation"] = translations.get(d.get("example"), "")
    except Exception as e:
        print(f"Translation error: {e}")

    if dict_data:
        return {"status": "success", "data": dict_data}
    else:
        return {"status": "error", "message": "Word not found", "data": None}
