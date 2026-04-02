import json
import os
import time
import hashlib
from datetime import datetime
from typing import List

import jwt
import requests
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Header, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from openai import OpenAI

from ..core.config import (
    USERS_FILE,
    REVIEW_REQUESTS_FILE,
    USERS_DATA_DIR,
    SUBTITLE_DIR,
    LIBRARY_DIR,
    THUMBNAIL_DIR,
    SECRET_KEY,
    ALGORITHM,
    ADMIN_USERNAME,
    LOGIN_LOG_FILE,
    verify_password,
    get_password_hash,
    create_access_token,
)
from ..services.video_service import process_video
from ..services.translation_service import translate_batch, FAIL_TRANSLATION_TEXT

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# In-memory click limiter for AI assist operations.
_click_window_seconds = 30
_click_limit = 6
_click_records = {}


def _check_click_limit(username: str, action: str) -> None:
    now = time.time()
    key = f"{username}:{action}"
    timestamps = [t for t in _click_records.get(key, []) if now - t < _click_window_seconds]
    if len(timestamps) >= _click_limit:
        wait_seconds = int(_click_window_seconds - (now - timestamps[0])) + 1
        raise HTTPException(status_code=429, detail=f"点击过于频繁，请{wait_seconds}秒后再试")
    timestamps.append(now)
    _click_records[key] = timestamps


def _get_qwen_client() -> OpenAI:
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI API key not configured")
    return OpenAI(api_key=api_key, base_url="https://dashscope.aliyuncs.com/compatible-mode/v1")


# Helper functions for data loading
def load_json(path, default=None):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default if default is not None else {}
    return default if default is not None else {}


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)


# Dependency to get user
async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(status_code=401, detail="Could not validate credentials")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        return username
    except jwt.PyJWTError:
        raise credentials_exception


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
        "password": get_password_hash(form_data.password),
    }
    save_json(USERS_FILE, users)

    user_dir = os.path.join(USERS_DATA_DIR, form_data.username)
    for sub in ["uploads", "subtitles", "thumbnails"]:
        os.makedirs(os.path.join(user_dir, sub), exist_ok=True)
    return {"message": "User created successfully"}


def _append_login_log(username: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOGIN_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] {username}\n")


@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    users = load_json(USERS_FILE)
    user = users.get(form_data.username)
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(status_code=400, detail="Incorrect username or password")

    is_admin = form_data.username == ADMIN_USERNAME
    access_token = create_access_token(data={"sub": form_data.username, "is_admin": is_admin})
    _append_login_log(form_data.username)
    return {"access_token": access_token, "token_type": "bearer", "is_admin": is_admin}


# --- TRANSLATION ROUTES ---
@router.post("/translate/batch")
async def translate_batch_api(data: dict, username: str = Depends(get_current_user)):
    texts = data.get("texts") or []
    from_lang = data.get("from", "en")
    to_lang = data.get("to", "zh")

    if not isinstance(texts, list) or not texts:
        raise HTTPException(status_code=400, detail="texts must be a non-empty list")
    if len(texts) > 50:
        raise HTTPException(status_code=400, detail="Single request supports up to 50 sentences")
    total_chars = sum(len((t or "")) for t in texts)
    if total_chars > 6000:
        raise HTTPException(status_code=400, detail="Single request supports up to 6000 characters")

    result = translate_batch([str(t or "") for t in texts], from_lang=from_lang, to_lang=to_lang)
    return {"status": "success", "data": result}


# --- VIDEO ROUTES ---
@router.post("/upload")
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    username: str = Depends(get_current_user),
    x_token: str = Header(None),
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
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
        background_tasks.add_task(process_video, file_id, file_path, username)

        user_sub_dir = os.path.join(USERS_DATA_DIR, username, "subtitles")
        os.makedirs(user_sub_dir, exist_ok=True)
        status_path = os.path.join(user_sub_dir, f"{file_id}_status.json")
        save_json(status_path, {"status": "processing", "progress": 1, "message": "Starting AI..."})

    return {"file_id": file_id, "status": "processing"}


@router.get("/subtitles/{file_id}")
async def get_subtitles(file_id: str, username: str = Depends(get_current_user)):
    p_sub = os.path.join(USERS_DATA_DIR, username, "subtitles", f"{file_id}.json")
    if os.path.exists(p_sub):
        return {"status": "completed", "data": load_json(p_sub)}

    p_status = os.path.join(USERS_DATA_DIR, username, "subtitles", f"{file_id}_status.json")
    if os.path.exists(p_status):
        return load_json(p_status)

    lib_sub = os.path.join(SUBTITLE_DIR, f"{file_id}.json")
    if os.path.exists(lib_sub):
        return {"status": "completed", "data": load_json(lib_sub)}

    return {"status": "processing", "progress": 0, "message": "Searching..."}


@router.post("/subtitles/{file_id}/ai_repair")
async def ai_repair_subtitle(file_id: str, data: dict, username: str = Depends(get_current_user)):
    _check_click_limit(username, "subtitle_ai_repair")
    idx = data.get("segment_index")
    if idx is None:
        raise HTTPException(status_code=400, detail="segment_index is required")

    subtitle_path = os.path.join(USERS_DATA_DIR, username, "subtitles", f"{file_id}.json")
    if not os.path.exists(subtitle_path):
        raise HTTPException(status_code=404, detail="Subtitle file not found")

    subtitles = load_json(subtitle_path, default=[])
    if not isinstance(subtitles, list) or idx < 0 or idx >= len(subtitles):
        raise HTTPException(status_code=400, detail="Invalid segment_index")

    seg = subtitles[idx]
    text = (seg.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty segment text")

    client = _get_qwen_client()
    prompt = (
        "请将以下英文句子翻译成自然、准确、简洁的中文，只输出译文本身，不要解释：\n"
        f"{text}"
    )
    completion = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {"role": "system", "content": "你是专业英汉翻译助手。"},
            {"role": "user", "content": prompt},
        ],
    )
    translated = (completion.choices[0].message.content or "").strip()
    if not translated:
        raise HTTPException(status_code=500, detail="AI 翻译失败，请稍后重试")

    seg["translation"] = translated
    seg["translation_status"] = "ok"
    seg["translation_source"] = "qwen_ai_repair"
    save_json(subtitle_path, subtitles)
    return {"status": "success", "translation": translated}


@router.get("/library")
async def list_library():
    videos = []
    valid_ext = (".mp4", ".mkv", ".avi", ".mov", ".flv", ".wmv")
    if os.path.exists(LIBRARY_DIR):
        for f in os.listdir(LIBRARY_DIR):
            if f.lower().endswith(valid_ext):
                fid = os.path.splitext(f)[0]
                videos.append({
                    "id": fid,
                    "title": f,
                    "path": f"/videos/library/{f}",
                    "thumbnail": f"/thumbnails/{fid}.jpg",
                })
    return videos


@router.get("/uploads")
async def list_uploads(username: str = Depends(get_current_user)):
    videos = []
    u_dir = os.path.join(USERS_DATA_DIR, username, "uploads")
    requests_data = load_json(REVIEW_REQUESTS_FILE)
    if os.path.exists(u_dir):
        for f in os.listdir(u_dir):
            fid = os.path.splitext(f)[0]
            status = requests_data.get(fid, {}).get("status", "private")
            videos.append({
                "id": fid,
                "title": f"Upload - {fid[:8]}",
                "path": f"/videos/user_uploads/{username}/uploads/{f}",
                "thumbnail": f"/videos/user_uploads/{username}/thumbnails/{fid}.jpg",
                "status": status,
            })
    return videos


@router.post("/admin/reject/{file_id}")
async def reject_video(file_id: str, username: str = Depends(get_current_admin)):
    requests_data = load_json(REVIEW_REQUESTS_FILE)
    if file_id in requests_data:
        requests_data[file_id]["status"] = "rejected"
        save_json(REVIEW_REQUESTS_FILE, requests_data)
    return {"message": "Video rejected"}


@router.post("/admin/approve/{file_id}")
async def approve_video(file_id: str, username: str = Depends(get_current_admin)):
    import shutil

    requests_data = load_json(REVIEW_REQUESTS_FILE)
    if file_id not in requests_data:
        raise HTTPException(status_code=404, detail="Review request not found")

    req = requests_data[file_id]
    user = req["username"]
    ext = req["extension"]

    user_video = os.path.join(USERS_DATA_DIR, user, "uploads", f"{file_id}{ext}")
    user_thumb = os.path.join(USERS_DATA_DIR, user, "thumbnails", f"{file_id}.jpg")
    user_sub = os.path.join(USERS_DATA_DIR, user, "subtitles", f"{file_id}.json")

    lib_video = os.path.join(LIBRARY_DIR, f"{file_id}{ext}")
    lib_thumb = os.path.join(THUMBNAIL_DIR, f"{file_id}.jpg")
    lib_sub = os.path.join(SUBTITLE_DIR, f"{file_id}.json")

    try:
        if os.path.exists(user_video):
            shutil.copy2(user_video, lib_video)
        if os.path.exists(user_thumb):
            shutil.copy2(user_thumb, lib_thumb)
        if os.path.exists(user_sub):
            shutil.copy2(user_sub, lib_sub)
        req["status"] = "approved"
        save_json(REVIEW_REQUESTS_FILE, requests_data)
        return {"message": "Approved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/pending")
async def list_pending_reviews(username: str = Depends(get_current_admin)):
    requests_data = load_json(REVIEW_REQUESTS_FILE)
    return [req for req in requests_data.values() if req["status"] == "pending"]


@router.post("/request_review/{file_id}")
async def request_review(file_id: str, username: str = Depends(get_current_user)):
    user_upload_dir = os.path.join(USERS_DATA_DIR, username, "uploads")
    found = False
    ext = ""
    for e in [".mp4", ".mkv", ".avi", ".mov", ".flv", ".wmv"]:
        if os.path.exists(os.path.join(user_upload_dir, f"{file_id}{e}")):
            found = True
            ext = e
            break
    if not found:
        raise HTTPException(status_code=404, detail="Not found")

    requests_data = load_json(REVIEW_REQUESTS_FILE)
    requests_data[file_id] = {
        "username": username,
        "file_id": file_id,
        "extension": ext,
        "status": "pending",
        "timestamp": datetime.now().isoformat(),
    }
    save_json(REVIEW_REQUESTS_FILE, requests_data)
    return {"message": "Submitted"}


# --- LOOKUP ROUTES ---
@router.post("/lookup/ai_context")
async def lookup_word_ai_context(data: dict):
    word = data.get("word", "").strip().strip('.,!?()[]"')
    context = data.get("context", "")
    prev_context = data.get("prev_context", "")
    next_context = data.get("next_context", "")

    if not word:
        raise HTTPException(status_code=400, detail="Word is required")

    client = _get_qwen_client()
    full_context = f"{prev_context}\n{context}\n{next_context}".strip()
    prompt = (
        f"单词: {word}\n"
        f"所在句子: {context}\n"
        f"上下句背景:\n{full_context}\n\n"
        "任务：结合语境，给出该单词在此处的唯一含义。"
    )

    completion = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {"role": "system", "content": "你是专业英语老师，擅长语境释义。"},
            {"role": "user", "content": prompt},
        ],
    )
    return {"status": "success", "explanation": completion.choices[0].message.content}


@router.post("/lookup/ai_translate_text")
async def ai_translate_text(data: dict, username: str = Depends(get_current_user)):
    _check_click_limit(username, "lookup_ai_translate_text")
    text = (data.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    client = _get_qwen_client()
    completion = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {"role": "system", "content": "你是专业翻译助手，只输出中文译文。"},
            {"role": "user", "content": f"请将这句英文翻译成中文，仅输出译文：\n{text}"},
        ],
    )
    translated = (completion.choices[0].message.content or "").strip()
    if not translated:
        raise HTTPException(status_code=500, detail="AI翻译失败，请稍后重试")
    return {"status": "success", "translation": translated}


@router.post("/lookup")
async def lookup_word(data: dict):
    word = data.get("word", "").strip().strip('.,!?()[]"')
    if not word:
        raise HTTPException(status_code=400, detail="Word is required")

    dict_data = None
    try:
        r = requests.get(f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}", timeout=5)
        if r.status_code == 200:
            dict_data = r.json()
    except Exception:
        pass

    if not dict_data:
        return {"status": "error", "message": "Word not found", "data": None}

    # Collect all definition/example texts for one batched Baidu request.
    english_texts: List[str] = []
    pointers = []
    for ei, entry in enumerate(dict_data):
        for mi, meaning in enumerate(entry.get("meanings", [])):
            for di, definition in enumerate(meaning.get("definitions", [])):
                src_def = definition.get("definition") or ""
                if src_def:
                    pointers.append((ei, mi, di, "translation"))
                    english_texts.append(src_def)
                src_ex = definition.get("example") or ""
                if src_ex:
                    pointers.append((ei, mi, di, "example_translation"))
                    english_texts.append(src_ex)

    translated_items = translate_batch(english_texts, from_lang="en", to_lang="zh") if english_texts else []

    for idx, ptr in enumerate(pointers):
        ei, mi, di, field = ptr
        translated = translated_items[idx]["translation"] if idx < len(translated_items) else ""
        if translated == FAIL_TRANSLATION_TEXT:
            translated = ""
        dict_data[ei]["meanings"][mi]["definitions"][di][field] = translated

    return {"status": "success", "data": dict_data}
