from datetime import UTC, datetime, timedelta

import jwt
from bcrypt import checkpw, hashpw, gensalt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return hashpw(password.encode(), gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    return checkpw(password.encode(), password_hash.encode())


def create_token(username: str, account_type: str = "admin") -> str:
    """Create JWT token with account type (admin or team)."""
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {
        "sub": username,
        "type": account_type,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def verify_admin_credentials(username: str, password: str) -> bool:
    return username == settings.admin_username and password == settings.admin_password


def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """Require admin token."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    username = payload.get("sub")
    account_type = payload.get("type", "admin")
    
    if account_type != "admin" or username != settings.admin_username:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    return username


def require_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> tuple[str, str]:
    """Require any valid token (admin or team). Returns (username, account_type)."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    username = payload.get("sub")
    account_type = payload.get("type", "admin")
    
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return username, account_type
