import json
import os
import subprocess

import torch
import whisper

from ..core.config import MODEL_ROOT, SUBTITLE_DIR, THUMBNAIL_DIR, UPLOAD_DIR, USERS_DATA_DIR
from .translation_service import FAIL_TRANSLATION_TEXT, translate_batch

# Check GPU
env_device = os.getenv("WHISPER_DEVICE", "auto").lower()
if env_device == "cuda":
    device = "cuda"
elif env_device == "cpu":
    device = "cpu"
else:
    device = "cuda" if torch.cuda.is_available() else "cpu"

print(f"Loading Whisper model to: {MODEL_ROOT} using {device}")
model = whisper.load_model("medium", download_root=MODEL_ROOT, device=device)


def generate_thumbnail(video_path: str, thumbnail_path: str) -> None:
    try:
        command = ["ffmpeg", "-y", "-i", video_path, "-ss", "00:00:01", "-vframes", "1", thumbnail_path]
        subprocess.run(command, check=True, capture_output=True)
    except Exception as e:
        print(f"Error generating thumbnail: {e}")


def process_video(file_id: str, file_path: str, username: str = None) -> None:
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

    def update_status(step: str, progress: int, message: str) -> None:
        with open(status_path, "w", encoding="utf-8") as f:
            json.dump({"step": step, "progress": progress, "message": message}, f)

    try:
        update_status("preparing", 5, "Preparing video...")
        generate_thumbnail(file_path, os.path.join(thumb_dir, f"{file_id}.jpg"))

        update_status("transcribe", 10, "Extracting audio...")
        audio_path = os.path.join(UPLOAD_DIR, f"{file_id}.wav")
        subprocess.run(
            ["ffmpeg", "-y", "-i", file_path, "-ar", "16000", "-ac", "1", "-vn", audio_path],
            check=True,
            capture_output=True,
        )

        update_status("transcribe", 15, "AI is transcribing...")
        result = model.transcribe(audio_path, verbose=False, fp16=(device == "cuda"), language="en", beam_size=5)

        segments = result["segments"]
        total = len(segments)
        source_texts = [seg["text"].strip() for seg in segments]

        update_status("translate", 50, "Batch translating...")
        translated = translate_batch(source_texts, from_lang="en", to_lang="zh")

        formatted = []
        for i, seg in enumerate(segments):
            progress = 50 + int(((i + 1) / max(total, 1)) * 45)
            update_status("translate", progress, f"Translating: {i + 1}/{total}")

            trans_item = translated[i] if i < len(translated) else {"ok": False, "translation": FAIL_TRANSLATION_TEXT}
            is_ok = bool(trans_item.get("ok"))
            translated_text = trans_item.get("translation", FAIL_TRANSLATION_TEXT) or FAIL_TRANSLATION_TEXT

            formatted.append(
                {
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"].strip(),
                    "translation": translated_text,
                    "translation_status": "ok" if is_ok else "failed",
                    "translation_source": "baidu" if is_ok else "baidu_failed",
                }
            )

        update_status("saving", 98, "Saving...")
        with open(os.path.join(sub_dir, f"{file_id}.json"), "w", encoding="utf-8") as f:
            json.dump(formatted, f, ensure_ascii=False)
        update_status("completed", 100, "Done")

        if os.path.exists(audio_path):
            os.remove(audio_path)
    except Exception as e:
        update_status("error", 0, str(e))
