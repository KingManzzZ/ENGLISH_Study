import os
import time
import random
from datetime import datetime
from hashlib import md5
from threading import Lock
from typing import List, Dict, Tuple

import requests

from ..core.config import BAIDU_API_USAGE_LOG_FILE

FAIL_TRANSLATION_TEXT = "emmm，这句翻译好像出问题了，点击尝试ai协助翻译"

_ENDPOINT = "http://api.fanyi.baidu.com/api/trans/vip/translate"
_MAX_TEXTS_PER_REQUEST = 50
_MAX_CHARS_PER_REQUEST = 6000
_MIN_REQUEST_INTERVAL_SECONDS = 0.11  # <= 10 req/s

_rate_lock = Lock()
_last_request_ts = 0.0
_usage_lock = Lock()
_current_bucket_start = None
_current_bucket_chars = 0


def _make_md5(s: str, encoding: str = "utf-8") -> str:
    return md5(s.encode(encoding)).hexdigest()


def _rate_limit_sleep() -> None:
    global _last_request_ts
    with _rate_lock:
        now = time.time()
        elapsed = now - _last_request_ts
        if elapsed < _MIN_REQUEST_INTERVAL_SECONDS:
            time.sleep(_MIN_REQUEST_INTERVAL_SECONDS - elapsed)
        _last_request_ts = time.time()


def _get_credentials() -> Tuple[str, str]:
    appid = os.getenv("BAIDUAPPID", "")
    appkey = os.getenv("BAIDUSECRET", "")
    return appid, appkey


def _chunk_texts(texts: List[str]) -> List[List[str]]:
    chunks: List[List[str]] = []
    current: List[str] = []
    chars = 0

    for text in texts:
        t = (text or "").strip()
        if not t:
            t = " "
        # Single oversized sentence is trimmed to meet hard API limit.
        if len(t) > _MAX_CHARS_PER_REQUEST:
            t = t[: _MAX_CHARS_PER_REQUEST]

        next_chars = chars + len(t)
        if current and (len(current) >= _MAX_TEXTS_PER_REQUEST or next_chars > _MAX_CHARS_PER_REQUEST):
            chunks.append(current)
            current = []
            chars = 0

        current.append(t)
        chars += len(t)

    if current:
        chunks.append(current)
    return chunks


def _bucket_start(ts: float) -> int:
    return int(ts // 300) * 300


def _fmt_ts(ts: int) -> str:
    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")


def _append_usage_line(period_end_ts: int, chars: int) -> None:
    with open(BAIDU_API_USAGE_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{_fmt_ts(period_end_ts)}] {chars}\n")


def _record_chars(chars: int) -> None:
    global _current_bucket_start, _current_bucket_chars
    if chars <= 0:
        return

    now = time.time()
    now_bucket = _bucket_start(now)
    with _usage_lock:
        if _current_bucket_start is None:
            _current_bucket_start = now_bucket
            _current_bucket_chars = 0

        if now_bucket != _current_bucket_start:
            _append_usage_line(_current_bucket_start + 300, _current_bucket_chars)
            _current_bucket_start = now_bucket
            _current_bucket_chars = 0

        _current_bucket_chars += chars


def translate_batch(texts: List[str], from_lang: str = "en", to_lang: str = "zh") -> List[Dict[str, str]]:
    appid, appkey = _get_credentials()
    if not appid or not appkey:
        return [{"ok": False, "translation": FAIL_TRANSLATION_TEXT} for _ in texts]

    results: List[Dict[str, str]] = []
    for chunk in _chunk_texts(texts):
        # Record actual characters sent to Baidu in this request chunk.
        _record_chars(sum(len(x) for x in chunk))

        q = "\n".join(chunk)
        salt = random.randint(32768, 65536)
        sign = _make_md5(appid + q + str(salt) + appkey)

        payload = {
            "appid": appid,
            "q": q,
            "from": from_lang,
            "to": to_lang,
            "salt": salt,
            "sign": sign,
        }

        try:
            _rate_limit_sleep()
            r = requests.post(_ENDPOINT, params=payload, timeout=20)
            data = r.json()

            trans = data.get("trans_result") or []
            if not trans:
                results.extend({"ok": False, "translation": FAIL_TRANSLATION_TEXT} for _ in chunk)
                continue

            mapped = [item.get("dst", "").strip() for item in trans]
            # Keep alignment robust if API returns less rows.
            for i in range(len(chunk)):
                dst = mapped[i] if i < len(mapped) else ""
                if dst:
                    results.append({"ok": True, "translation": dst})
                else:
                    results.append({"ok": False, "translation": FAIL_TRANSLATION_TEXT})
        except Exception:
            results.extend({"ok": False, "translation": FAIL_TRANSLATION_TEXT} for _ in chunk)

    # Safety fallback if any mismatch happens.
    if len(results) < len(texts):
        results.extend({"ok": False, "translation": FAIL_TRANSLATION_TEXT} for _ in range(len(texts) - len(results)))
    return results[: len(texts)]
