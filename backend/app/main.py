import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.routes import router
from .core.config import UPLOAD_DIR, LIBRARY_DIR, THUMBNAIL_DIR, USERS_DATA_DIR

def create_app() -> FastAPI:
    app = FastAPI(title="English Study API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount static files
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(LIBRARY_DIR, exist_ok=True)
    os.makedirs(THUMBNAIL_DIR, exist_ok=True)
    os.makedirs(USERS_DATA_DIR, exist_ok=True)

    app.mount("/videos/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
    app.mount("/videos/library", StaticFiles(directory=LIBRARY_DIR), name="library")
    app.mount("/thumbnails", StaticFiles(directory=THUMBNAIL_DIR), name="thumbnails")
    app.mount("/videos/user_uploads", StaticFiles(directory=USERS_DATA_DIR), name="user_uploads")

    app.include_router(router)

    return app

