import os
import jwt
import hashlib
import binascii
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-make-it-strong")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60

USERS_FILE = "data/users.json"
REVIEW_REQUESTS_FILE = "data/review_requests.json"
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "data/uploads")
SUBTITLE_DIR = os.getenv("SUBTITLE_DIR", "data/subtitles")
LIBRARY_DIR = os.getenv("LIBRARY_DIR", "data/library")
THUMBNAIL_DIR = os.getenv("THUMBNAIL_DIR", "data/thumbnails")
USERS_DATA_DIR = "data/users"

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROJECT_ROOT = ROOT_DIR
MODEL_ROOT = os.path.join(PROJECT_ROOT, "models")
os.makedirs(MODEL_ROOT, exist_ok=True)

def hash_password(password: str) -> str:
    salt = hashlib.sha256(os.urandom(60)).hexdigest().encode('ascii')
    pwdhash = hashlib.pbkdf2_hmac('sha512', password.encode('utf-8'), salt, 100000)
    pwdhash = binascii.hexlify(pwdhash)
    return (salt + pwdhash).decode('ascii')

def verify_password(plain_password: str, stored_password: str) -> bool:
    try:
        salt = stored_password[:64].encode('ascii')
        stored_hash = stored_password[64:].encode('ascii')
        pwdhash = hashlib.pbkdf2_hmac('sha512', plain_password.encode('utf-8'), salt, 100000)
        pwdhash = binascii.hexlify(pwdhash)
        return pwdhash == stored_hash
    except Exception:
        return False

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_password_hash(password: str) -> str:
    return hash_password(password)
