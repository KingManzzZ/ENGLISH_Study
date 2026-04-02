"""
清空「听」模块相关资源目录下的文件（用于测试前清理），不删除账号与审核配置。

保留：
  - data/users.json
  - data/review_requests.json（如需一并清空审核队列，可手动删除或编辑）

会删除其中文件（保留目录）：
  - data/library/
  - data/uploads/
  - data/subtitles/
  - data/thumbnails/
  - data/users/<用户名>/uploads|subtitles|thumbnails/ 下的文件

用法（在 backend 目录下）:
  python scripts/clear_listening_media_data.py
"""
from __future__ import annotations

import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
USERS = os.path.join(DATA, "users")


def _clear_dir_files(path: str) -> int:
    if not os.path.isdir(path):
        return 0
    n = 0
    for name in os.listdir(path):
        p = os.path.join(path, name)
        try:
            if os.path.isfile(p) or os.path.islink(p):
                os.remove(p)
                n += 1
            elif os.path.isdir(p):
                shutil.rmtree(p)
                n += 1
        except OSError as e:
            print(f"Skip {p}: {e}", file=sys.stderr)
    return n


def main() -> None:
    total = 0
    for sub in ("library", "uploads", "subtitles", "thumbnails"):
        d = os.path.join(DATA, sub)
        c = _clear_dir_files(d)
        print(f"Cleared {c} items under {d}")
        total += c

    if os.path.isdir(USERS):
        for username in os.listdir(USERS):
            ud = os.path.join(USERS, username)
            if not os.path.isdir(ud):
                continue
            for sub in ("uploads", "subtitles", "thumbnails"):
                d = os.path.join(ud, sub)
                c = _clear_dir_files(d)
                if c:
                    print(f"Cleared {c} items under {d}")
                total += c

    print(f"Done. Total entries removed: {total}")


if __name__ == "__main__":
    main()
