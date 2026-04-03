from __future__ import annotations

import hashlib
import json
import os
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import requests
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://content.guardianapis.com/search"
SECTIONS = [
    "lifeandstyle",
    "sport",
    "travel",
    "food",
    "film",
    "music",
    "technology",
    "culture",
    "education",
    "environment",
    "books",
    "science",
    "business",
    "law",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_FILE = PROJECT_ROOT / "backend" / "data" / "news_articles.json"
BAIDU_ENDPOINT = "http://api.fanyi.baidu.com/api/trans/vip/translate"

PAGE_SIZE = int(os.getenv("GUARDIAN_PAGE_SIZE", "20"))
TARGET_PER_SECTION = int(os.getenv("GUARDIAN_TARGET_PER_SECTION", "3"))
MAX_PAGES = int(os.getenv("GUARDIAN_MAX_PAGES", "3"))
MIN_CONTENT_CHARS = int(os.getenv("GUARDIAN_MIN_CONTENT_CHARS", "1200"))
REQUEST_INTERVAL_SECONDS = float(os.getenv("GUARDIAN_REQUEST_INTERVAL", "0.15"))


class GuardianNewsFetcher:
    def __init__(self, api_key: str):
        self.api_key = api_key

    @staticmethod
    def _pick_text(item: Dict[str, Any], *keys: str) -> str:
        for key in keys:
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return ""

    @staticmethod
    def _stable_id(title: str, url: str, published: str) -> str:
        raw = f"{title}|{url}|{published}"
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def _segment_text(text: str, sentences_per_para: int = 3) -> str:
        normalized = re.sub(r"\s+", " ", (text or "").strip())
        if not normalized:
            return ""

        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", normalized) if s.strip()]
        if len(sentences) <= 1:
            words = normalized.split()
            if len(words) > 90:
                return "\n\n".join(" ".join(words[i : i + 45]) for i in range(0, len(words), 45))
            return normalized

        paragraphs: List[str] = []
        for i in range(0, len(sentences), sentences_per_para):
            paragraphs.append(" ".join(sentences[i : i + sentences_per_para]))
        return "\n\n".join(paragraphs)

    @staticmethod
    def _md5(text: str) -> str:
        return hashlib.md5(text.encode("utf-8")).hexdigest()

    def _translate_titles_baidu(self, titles: List[str]) -> List[str]:
        appid = os.getenv("BAIDUAPPID", "")
        appkey = os.getenv("BAIDUSECRET", "")
        if not appid or not appkey:
            return [""] * len(titles)

        translated: List[str] = []
        for title in titles:
            q = (title or "").strip()
            if not q:
                translated.append("")
                continue

            salt = random.randint(32768, 65536)
            sign = self._md5(appid + q + str(salt) + appkey)
            params = {
                "appid": appid,
                "q": q,
                "from": "en",
                "to": "zh",
                "salt": salt,
                "sign": sign,
            }

            try:
                resp = requests.get(BAIDU_ENDPOINT, params=params, timeout=15)
                data = resp.json()
                trans_result = data.get("trans_result") or []
                if trans_result and trans_result[0].get("dst"):
                    translated.append(str(trans_result[0]["dst"]).strip())
                else:
                    translated.append("")
            except Exception:
                translated.append("")

            time.sleep(0.12)

        return translated

    def _add_zh_titles(self, articles: List[Dict[str, Any]]) -> None:
        titles = [article.get("title", "") for article in articles]
        translated = self._translate_titles_baidu(titles)
        for idx, article in enumerate(articles):
            article["title_zh"] = translated[idx].strip() if idx < len(translated) else ""

    def fetch_section_articles(self, section: str, target_count: int = TARGET_PER_SECTION) -> List[Dict[str, Any]]:
        collected: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()
        page = 1

        while len(collected) < target_count and page <= MAX_PAGES:
            params = {
                "section": section,
                "page-size": PAGE_SIZE,
                "page": page,
                "order-by": "newest",
                "show-fields": "bodyText,trailText",
                "show-tags": "keyword",
                "api-key": self.api_key,
            }

            response = requests.get(BASE_URL, params=params, timeout=20)
            response.raise_for_status()
            payload = response.json()
            results = payload.get("response", {}).get("results", []) or []
            if not results:
                break

            for item in results:
                fields = item.get("fields", {}) or {}
                title = self._pick_text(item, "webTitle")
                url = self._pick_text(item, "webUrl")
                published = self._pick_text(item, "webPublicationDate")
                body = self._pick_text(fields, "bodyText")
                summary = self._pick_text(fields, "trailText")

                content_raw = body or summary or title
                content = self._segment_text(content_raw)
                if len(content.replace("\n", " ").strip()) < MIN_CONTENT_CHARS:
                    continue

                article_id = self._stable_id(title, url, published)
                if article_id in seen_ids:
                    continue

                seen_ids.add(article_id)
                collected.append(
                    {
                        "id": article_id,
                        "title": title,
                        "title_zh": "",
                        "summary": summary or title,
                        "content": content,
                        "url": url,
                        "section": section,
                        "source": "The Guardian",
                        "published_at": published,
                        "language": "en",
                    }
                )

                if len(collected) >= target_count:
                    break

            page += 1
            time.sleep(REQUEST_INTERVAL_SECONDS)

        return collected

    def sync(self, sections: List[str]) -> List[Dict[str, Any]]:
        all_articles: List[Dict[str, Any]] = []

        for section in sections:
            print(f"📰 Fetching section: {section}")
            try:
                section_articles = self.fetch_section_articles(section)
                print(f"   -> collected {len(section_articles)} articles")
                all_articles.extend(section_articles)
            except Exception as exc:
                print(f"❌ Skip section {section}: {exc}")

        dedup: Dict[str, Dict[str, Any]] = {article["id"]: article for article in all_articles}
        articles = list(dedup.values())
        articles.sort(key=lambda item: item.get("published_at") or "", reverse=True)
        self._add_zh_titles(articles)
        return articles

    def save(self, articles: List[Dict[str, Any]]) -> None:
        payload = {
            "synced_at": datetime.now(timezone.utc).isoformat(),
            "source": "The Guardian",
            "language": "en",
            "sections": SECTIONS,
            "articles": articles,
        }
        OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✅ Saved {len(articles)} articles -> {OUTPUT_FILE}")


def main() -> None:
    api_key = os.getenv("NEWS_API_KEY")
    if not api_key:
        raise RuntimeError("NEWS_API_KEY is not configured")

    fetcher = GuardianNewsFetcher(api_key)
    articles = fetcher.sync(SECTIONS)
    fetcher.save(articles)


if __name__ == "__main__":
    main()

