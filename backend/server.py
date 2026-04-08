from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import socketio
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import json
import asyncio
from urllib.parse import parse_qs
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'expertopinion_secret')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 168  # 7 days

# Platform Config
PLATFORM_COMMISSION = float(os.environ.get('PLATFORM_COMMISSION_PERCENT', 15)) / 100

# Create the main app
app = FastAPI(title="ExpertOpinion API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ===================
# MODELS
# ===================

class UserCreate(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    name: Optional[str] = None
    alias: str
    role: str = "client"  # client, expert, admin
    is_anonymous: bool = False
    city: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class GoogleLoginRequest(BaseModel):
    id_token: str
    role: str = "client"

class ExpertProfile(BaseModel):
    user_id: str
    expertise: List[str] = []
    experience_years: int = 0
    bio: str = ""
    hourly_rate: int = 500
    cities: List[str] = []
    whatsapp_number: str = ""
    is_verified: bool = False
    kyc_status: str = "pending"  # pending, submitted, approved, rejected
    total_consultations: int = 0
    avg_rating: float = 0.0

class IssueCreate(BaseModel):
    title: str
    description: str
    category: str
    city: str
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    urgency: str = "normal"  # low, normal, high, urgent

class OfferCreate(BaseModel):
    issue_id: str
    price: int
    message: str
    available_slots: List[Dict[str, str]] = []  # [{date, start_time, end_time}]

class BookingCreate(BaseModel):
    offer_id: str
    selected_slot: Dict[str, str]

class ChatMessage(BaseModel):
    booking_id: str
    content: str

class CallRequestCreate(BaseModel):
    booking_id: str
    call_type: str  # voice, video

class CallRequestAction(BaseModel):
    reason: Optional[str] = None

class CallSummaryCreate(BaseModel):
    content: str

class NotificationReadRequest(BaseModel):
    notification_ids: List[str] = []

class ReviewCreate(BaseModel):
    booking_id: str
    rating: int  # 1-5
    comment: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]

# ===================
# HELPERS
# ===================

def generate_id(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4().hex[:12]}"

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def ensure_default_admin():
    """Create the documented default admin account if it doesn't exist."""
    admin_email = os.environ.get("DEFAULT_ADMIN_EMAIL", "admin@expertopinion.com")
    admin_password = os.environ.get("DEFAULT_ADMIN_PASSWORD", "admin123")
    admin_name = os.environ.get("DEFAULT_ADMIN_NAME", "Platform Admin")
    admin_alias = os.environ.get("DEFAULT_ADMIN_ALIAS", "Admin")

    existing_admin = await db.users.find_one({"email": admin_email}, {"_id": 0})
    if existing_admin:
        return

    admin_user = {
        "user_id": generate_id("user_"),
        "email": admin_email,
        "password_hash": hash_password(admin_password),
        "name": admin_name,
        "alias": admin_alias,
        "role": "admin",
        "is_anonymous": False,
        "city": None,
        "picture": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True
    }

    await db.users.insert_one(admin_user)
    logger.info("Seeded default admin account for %s", admin_email)

async def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials if credentials else None
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_role(user: dict, roles: List[str]):
    if user.get("role") not in roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

async def get_user_from_token(token: str) -> Optional[dict]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0, "password_hash": 0})
        return user
    except Exception:
        return None

CALL_REQUEST_EXPIRE_SECONDS = 30
CALL_REQUEST_RETRY_COOLDOWN_SECONDS = 120
MAX_CALL_REQUESTS_PER_BOOKING = 3
BOOKING_CALL_ENABLED_STATUSES = {"confirmed", "in_progress"}
CALL_REQUEST_ACTIVE_STATUSES = {"requested", "ringing"}
CALL_REQUEST_TERMINAL_STATUSES = {"accepted", "rejected", "missed", "cancelled", "ended"}
NOTIFICATION_CATEGORIES = {
    "offer",
    "booking",
    "payment",
    "call",
    "call_reminder",
    "chat",
    "review",
    "system"
}

async def get_booking_for_call(booking_id: str, user: dict) -> dict:
    booking = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking["client_id"] != user["user_id"] and booking["expert_id"] != user["user_id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    if booking["status"] not in BOOKING_CALL_ENABLED_STATUSES:
        raise HTTPException(status_code=400, detail="Calls are only available for active consultations")

    if booking.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Calls are only available after payment is completed")

    return booking

async def expire_stale_call_requests(booking_id: str):
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=CALL_REQUEST_EXPIRE_SECONDS)
    stale_requests = await db.call_requests.find(
        {
            "booking_id": booking_id,
            "status": {"$in": list(CALL_REQUEST_ACTIVE_STATUSES)},
            "created_at_dt": {"$lte": cutoff}
        },
        {"_id": 0, "created_at_dt": 0}
    ).to_list(100)
    if not stale_requests:
        return

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.call_requests.update_many(
        {
            "booking_id": booking_id,
            "status": {"$in": list(CALL_REQUEST_ACTIVE_STATUSES)},
            "created_at_dt": {"$lte": cutoff}
        },
        {
            "$set": {
                "status": "missed",
                "resolved_at": now_iso,
                "resolution_reason": "No response from expert"
            }
        }
    )

    for stale in stale_requests:
        stale["status"] = "missed"
        stale["resolved_at"] = now_iso
        stale["resolution_reason"] = "No response from expert"
        await append_call_audit(
            booking_id=stale["booking_id"],
            event_type="call_missed",
            actor_user_id=stale.get("expert_id", ""),
            metadata={"call_id": stale["call_id"], "call_type": stale["call_type"]}
        )
        await emit_call_event(stale["booking_id"], "call_missed", stale)
        await create_notifications_bulk([
            {
                "user_id": stale["client_id"],
                "category": "call",
                "event_type": "call_missed",
                "title": "Call request missed",
                "body": "Your call request was not answered in time.",
                "booking_id": stale["booking_id"],
                "issue_id": stale.get("issue_id"),
                "call_id": stale["call_id"],
            },
            {
                "user_id": stale["expert_id"],
                "category": "call",
                "event_type": "call_missed",
                "title": "Missed client call request",
                "body": "A client call request expired before response.",
                "booking_id": stale["booking_id"],
                "issue_id": stale.get("issue_id"),
                "call_id": stale["call_id"],
            }
        ])

async def get_latest_call_requests(booking_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    await expire_stale_call_requests(booking_id)
    requests = await db.call_requests.find(
        {"booking_id": booking_id},
        {"_id": 0, "created_at_dt": 0}
    ).sort("created_at", -1).to_list(limit)
    return requests

def parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None

async def append_call_audit(booking_id: str, event_type: str, actor_user_id: str, metadata: Dict[str, Any]):
    audit_entry = {
        "event_id": generate_id("cae_"),
        "event_type": event_type,
        "actor_user_id": actor_user_id,
        "metadata": metadata,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.bookings.update_one(
        {"booking_id": booking_id},
        {"$push": {"call_audit": {"$each": [audit_entry], "$slice": -100}}}
    )

async def emit_call_event(booking_id: str, event_name: str, call_payload: Dict[str, Any]):
    payload = {
        "booking_id": booking_id,
        "event": event_name,
        "call": call_payload
    }
    await sio.emit("call_event", payload, room=f"booking_{booking_id}")
    target_user_id = call_payload.get("target_user_id")
    if target_user_id:
        await sio.emit("call_event", payload, room=f"user_{target_user_id}")

def parse_slot_datetime(selected_slot: Dict[str, Any]) -> Optional[datetime]:
    if not selected_slot:
        return None
    date_raw = selected_slot.get("date")
    time_raw = selected_slot.get("start_time")
    if not date_raw or not time_raw:
        return None

    for date_fmt in ("%Y-%m-%d", "%d-%m-%Y"):
        try:
            date_obj = datetime.strptime(date_raw, date_fmt).date()
            break
        except ValueError:
            date_obj = None
    if not date_obj:
        return None

    parsed_time = None
    for time_fmt in ("%H:%M", "%I:%M %p", "%I:%M%p"):
        try:
            parsed_time = datetime.strptime(time_raw.strip(), time_fmt).time()
            break
        except ValueError:
            continue
    if not parsed_time:
        return None

    return datetime.combine(date_obj, parsed_time, tzinfo=timezone.utc)

async def create_notification(
    user_id: str,
    category: str,
    event_type: str,
    title: str,
    body: str,
    booking_id: Optional[str] = None,
    issue_id: Optional[str] = None,
    offer_id: Optional[str] = None,
    call_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    dedupe_key: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if category not in NOTIFICATION_CATEGORIES:
        category = "system"

    if dedupe_key:
        existing = await db.notifications.find_one({"user_id": user_id, "dedupe_key": dedupe_key}, {"_id": 0})
        if existing:
            return None

    notification_doc = {
        "notification_id": generate_id("notif_"),
        "user_id": user_id,
        "category": category,
        "event_type": event_type,
        "title": title,
        "body": body,
        "booking_id": booking_id,
        "issue_id": issue_id,
        "offer_id": offer_id,
        "call_id": call_id,
        "metadata": metadata or {},
        "is_read": False,
        "read_at": None,
        "dedupe_key": dedupe_key,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification_doc)
    await sio.emit("notification_event", notification_doc, room=f"user_{user_id}")
    return notification_doc

async def create_notifications_bulk(notifications: List[Dict[str, Any]]):
    for notif in notifications:
        await create_notification(**notif)

async def sync_due_call_reminders_for_user(user: dict):
    now = datetime.now(timezone.utc)
    if user.get("role") == "client":
        query = {"client_id": user["user_id"], "status": {"$in": ["confirmed", "in_progress"]}, "payment_status": "paid"}
    elif user.get("role") == "expert":
        query = {"expert_id": user["user_id"], "status": {"$in": ["confirmed", "in_progress"]}, "payment_status": "paid"}
    else:
        return

    bookings = await db.bookings.find(query, {"_id": 0}).to_list(200)
    for booking in bookings:
        slot_dt = parse_slot_datetime(booking.get("selected_slot"))
        if not slot_dt:
            continue
        mins_to_slot = (slot_dt - now).total_seconds() / 60
        flags = booking.get("notification_flags", {})

        if 0 < mins_to_slot <= 60 and not flags.get("reminder_60m_sent"):
            await create_notification(
                user_id=user["user_id"],
                category="call_reminder",
                event_type="call_reminder_60m",
                title="Consultation starts soon",
                body=f"Your consultation for booking {booking['booking_id']} starts within 60 minutes.",
                booking_id=booking["booking_id"],
                issue_id=booking.get("issue_id"),
                metadata={"minutes_remaining": int(max(mins_to_slot, 1))},
                dedupe_key=f"reminder_60m:{booking['booking_id']}:{user['user_id']}"
            )
            flags["reminder_60m_sent"] = True

        if 60 < mins_to_slot <= 24 * 60 and not flags.get("reminder_24h_sent"):
            await create_notification(
                user_id=user["user_id"],
                category="call_reminder",
                event_type="call_reminder_24h",
                title="Consultation reminder",
                body=f"You have an upcoming consultation within 24 hours for booking {booking['booking_id']}.",
                booking_id=booking["booking_id"],
                issue_id=booking.get("issue_id"),
                metadata={"hours_remaining": round(mins_to_slot / 60, 1)},
                dedupe_key=f"reminder_24h:{booking['booking_id']}:{user['user_id']}"
            )
            flags["reminder_24h_sent"] = True

        if flags != booking.get("notification_flags", {}):
            await db.bookings.update_one({"booking_id": booking["booking_id"]}, {"$set": {"notification_flags": flags}})

@sio.event
async def connect(sid, environ, auth):
    token = None
    if isinstance(auth, dict):
        token = auth.get("token")

    if not token:
        query = parse_qs(environ.get("QUERY_STRING", ""))
        token_values = query.get("token")
        if token_values:
            token = token_values[0]

    if not token:
        auth_header = environ.get("HTTP_AUTHORIZATION", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.replace("Bearer ", "", 1)

    user = await get_user_from_token(token)
    if not user:
        raise ConnectionRefusedError("Unauthorized")

    await sio.save_session(sid, {"user_id": user["user_id"], "role": user.get("role")})
    await sio.enter_room(sid, f"user_{user['user_id']}")

@sio.event
async def join_booking(sid, data):
    session = await sio.get_session(sid)
    user_id = session.get("user_id")
    booking_id = (data or {}).get("booking_id")
    if not booking_id:
        return {"ok": False, "error": "booking_id is required"}

    booking = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not booking:
        return {"ok": False, "error": "Booking not found"}

    if booking["client_id"] != user_id and booking["expert_id"] != user_id:
        return {"ok": False, "error": "Not authorized"}

    await sio.enter_room(sid, f"booking_{booking_id}")
    return {"ok": True}

# ===================
# AI MODERATION
# ===================

async def moderate_content(text: str) -> Dict[str, Any]:
    """Placeholder moderation until a replacement provider is wired in."""
    return {"approved": True, "reason": "Moderation disabled"}

# ===================
# AUTH ROUTES
# ===================

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user: UserCreate):
    # Check if email exists (if provided)
    if user.email:
        existing = await db.users.find_one({"email": user.email}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = generate_id("user_")
    user_doc = {
        "user_id": user_id,
        "email": user.email,
        "password_hash": hash_password(user.password) if user.password else None,
        "name": user.name,
        "alias": user.alias or f"Anonymous_{user_id[:6]}",
        "role": user.role,
        "is_anonymous": user.is_anonymous,
        "city": user.city,
        "picture": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_active": True
    }
    
    await db.users.insert_one(user_doc)
    
    # Create expert profile if registering as expert
    if user.role == "expert":
        expert_profile = {
            "profile_id": generate_id("expert_"),
            "user_id": user_id,
            "expertise": [],
            "experience_years": 0,
            "bio": "",
            "hourly_rate": 500,
            "cities": [user.city] if user.city else [],
            "whatsapp_number": "",
            "is_verified": False,
            "kyc_status": "pending",
            "total_consultations": 0,
            "avg_rating": 0.0,
            "ratings_count": 0,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.expert_profiles.insert_one(expert_profile)
    
    token = create_token(user_id, user.role)
    
    # Fetch clean user doc without _id
    clean_user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    
    return TokenResponse(access_token=token, user=clean_user)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["user_id"], user["role"])
    user.pop("password_hash", None)
    
    return TokenResponse(access_token=token, user=user)

@api_router.post("/auth/google", response_model=TokenResponse)
async def google_login(payload: GoogleLoginRequest):
    google_client_id = os.environ.get("GOOGLE_CLIENT_ID")
    firebase_project_id = os.environ.get("FIREBASE_PROJECT_ID")
    token_info = None

    try:
        if google_client_id:
            token_info = id_token.verify_oauth2_token(
                payload.id_token,
                google_requests.Request(),
                google_client_id,
            )
    except Exception:
        token_info = None

    if token_info is None and firebase_project_id:
        try:
            token_info = id_token.verify_firebase_token(
                payload.id_token,
                google_requests.Request(),
                firebase_project_id,
            )
        except Exception:
            token_info = None

    if token_info is None:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    email = token_info.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google account email not found")

    requested_role = payload.role if payload.role in ["client", "expert"] else "client"
    user = await db.users.find_one({"email": email}, {"_id": 0})

    if not user:
        user_id = generate_id("user_")
        user = {
            "user_id": user_id,
            "email": email,
            "name": token_info.get("name", ""),
            "alias": token_info.get("name") or f"User_{user_id[:6]}",
            "picture": token_info.get("picture"),
            "role": requested_role,
            "is_anonymous": False,
            "city": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        }
        await db.users.insert_one(user)
    else:
        user_id = user["user_id"]
        updates = {
            "name": token_info.get("name", user.get("name")),
            "picture": token_info.get("picture", user.get("picture")),
        }
        if requested_role in ["client", "expert"] and requested_role != user.get("role") and user.get("role") != "admin":
            updates["role"] = requested_role
        await db.users.update_one({"user_id": user_id}, {"$set": updates})
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})

    if user["role"] == "expert":
        existing_profile = await db.expert_profiles.find_one({"user_id": user["user_id"]})
        if not existing_profile:
            await db.expert_profiles.insert_one({
                "profile_id": generate_id("expert_"),
                "user_id": user["user_id"],
                "expertise": [],
                "experience_years": 0,
                "bio": "",
                "hourly_rate": 500,
                "cities": [],
                "whatsapp_number": "",
                "is_verified": False,
                "kyc_status": "pending",
                "total_consultations": 0,
                "avg_rating": 0.0,
                "ratings_count": 0,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    token = create_token(user["user_id"], user["role"])
    user.pop("password_hash", None)
    return TokenResponse(access_token=token, user=user)

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    user.pop("password_hash", None)
    return user

@api_router.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"message": "Logged out"}

# ===================
# USER ROUTES
# ===================

@api_router.get("/users/profile")
async def get_user_profile(user: dict = Depends(get_current_user)):
    user.pop("password_hash", None)
    
    # Get expert profile if expert
    if user["role"] == "expert":
        expert_profile = await db.expert_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})
        user["expert_profile"] = expert_profile
    
    return user

@api_router.put("/users/profile")
async def update_user_profile(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    
    allowed_fields = ["alias", "name", "city", "picture"]
    update_data = {k: v for k, v in body.items() if k in allowed_fields}
    
    if update_data:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": update_data}
        )
    
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})

@api_router.put("/users/expert-profile")
async def update_expert_profile(request: Request, user: dict = Depends(get_current_user)):
    await require_role(user, ["expert"])
    body = await request.json()
    
    allowed_fields = ["expertise", "experience_years", "bio", "hourly_rate", "cities", "whatsapp_number"]
    update_data = {k: v for k, v in body.items() if k in allowed_fields}
    
    if update_data:
        await db.expert_profiles.update_one(
            {"user_id": user["user_id"]},
            {"$set": update_data}
        )
    
    return await db.expert_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})

# ===================
# NOTIFICATION ROUTES
# ===================

@api_router.get("/notifications")
async def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    user: dict = Depends(get_current_user)
):
    await sync_due_call_reminders_for_user(user)
    safe_limit = min(max(limit, 1), 100)
    query = {"user_id": user["user_id"]}
    if unread_only:
        query["is_read"] = False

    notifications = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).limit(safe_limit).to_list(safe_limit)
    return notifications

@api_router.get("/notifications/unread-count")
async def get_unread_notifications_count(user: dict = Depends(get_current_user)):
    await sync_due_call_reminders_for_user(user)
    unread = await db.notifications.count_documents({"user_id": user["user_id"], "is_read": False})
    return {"unread_count": unread}

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": user["user_id"]},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}

@api_router.put("/notifications/read")
async def mark_notifications_read(payload: NotificationReadRequest, user: dict = Depends(get_current_user)):
    if not payload.notification_ids:
        return {"message": "No notifications selected", "updated": 0}

    result = await db.notifications.update_many(
        {"notification_id": {"$in": payload.notification_ids}, "user_id": user["user_id"]},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "Notifications marked as read", "updated": result.modified_count}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read(user: dict = Depends(get_current_user)):
    result = await db.notifications.update_many(
        {"user_id": user["user_id"], "is_read": False},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "All notifications marked as read", "updated": result.modified_count}

# ===================
# ISSUE ROUTES
# ===================

@api_router.post("/issues")
async def create_issue(issue: IssueCreate, user: dict = Depends(get_current_user)):
    # Moderate content
    moderation = await moderate_content(f"{issue.title} {issue.description}")
    if not moderation.get("approved", True):
        raise HTTPException(status_code=400, detail=f"Content rejected: {moderation.get('reason', 'Policy violation')}")
    
    issue_id = generate_id("issue_")
    issue_doc = {
        "issue_id": issue_id,
        "user_id": user["user_id"],
        "user_alias": user.get("alias", "Anonymous"),
        "title": issue.title,
        "description": issue.description,
        "category": issue.category,
        "city": issue.city,
        "budget_min": issue.budget_min,
        "budget_max": issue.budget_max,
        "urgency": issue.urgency,
        "status": "open",  # open, in_progress, closed, resolved
        "offers_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "moderation_status": "approved"
    }
    
    await db.issues.insert_one(issue_doc)
    
    # Return clean document without _id
    return await db.issues.find_one({"issue_id": issue_id}, {"_id": 0})

@api_router.get("/issues")
async def list_issues(
    city: Optional[str] = None,
    category: Optional[str] = None,
    status: str = "open",
    page: int = 1,
    limit: int = 20
):
    query = {"status": status}
    if city:
        query["city"] = city
    if category:
        query["category"] = category
    
    skip = (page - 1) * limit
    issues = await db.issues.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.issues.count_documents(query)
    
    return {"issues": issues, "total": total, "page": page, "limit": limit}

@api_router.get("/issues/{issue_id}")
async def get_issue(issue_id: str):
    issue = await db.issues.find_one({"issue_id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    # Get offers for this issue
    offers = await db.offers.find({"issue_id": issue_id}, {"_id": 0}).to_list(100)
    
    # Get expert info for each offer
    for offer in offers:
        expert = await db.users.find_one({"user_id": offer["expert_id"]}, {"_id": 0, "password_hash": 0})
        expert_profile = await db.expert_profiles.find_one({"user_id": offer["expert_id"]}, {"_id": 0})
        offer["expert"] = expert
        offer["expert_profile"] = expert_profile
    
    issue["offers"] = offers
    return issue

@api_router.get("/issues/my/list")
async def get_my_issues(user: dict = Depends(get_current_user), status: Optional[str] = None):
    query = {"user_id": user["user_id"]}
    if status:
        query["status"] = status
    
    issues = await db.issues.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return issues

@api_router.put("/issues/{issue_id}")
async def update_issue(issue_id: str, request: Request, user: dict = Depends(get_current_user)):
    issue = await db.issues.find_one({"issue_id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    if issue["user_id"] != user["user_id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    body = await request.json()
    allowed_fields = ["title", "description", "category", "city", "budget_min", "budget_max", "urgency", "status"]
    update_data = {k: v for k, v in body.items() if k in allowed_fields}
    
    if update_data:
        await db.issues.update_one({"issue_id": issue_id}, {"$set": update_data})
    
    return await db.issues.find_one({"issue_id": issue_id}, {"_id": 0})

# ===================
# OFFER ROUTES
# ===================

@api_router.post("/offers")
async def create_offer(offer: OfferCreate, user: dict = Depends(get_current_user)):
    await require_role(user, ["expert"])
    
    # Check issue exists
    issue = await db.issues.find_one({"issue_id": offer.issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    
    if issue["status"] != "open":
        raise HTTPException(status_code=400, detail="Issue is not accepting offers")
    
    # Check if already made offer
    existing = await db.offers.find_one({"issue_id": offer.issue_id, "expert_id": user["user_id"]}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="You have already made an offer")
    
    offer_id = generate_id("offer_")
    offer_doc = {
        "offer_id": offer_id,
        "issue_id": offer.issue_id,
        "expert_id": user["user_id"],
        "price": offer.price,
        "message": offer.message,
        "available_slots": offer.available_slots,
        "status": "pending",  # pending, accepted, rejected, expired
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.offers.insert_one(offer_doc)
    
    # Update issue offers count
    await db.issues.update_one({"issue_id": offer.issue_id}, {"$inc": {"offers_count": 1}})

    await create_notification(
        user_id=issue["user_id"],
        category="offer",
        event_type="offer_received",
        title="New offer received",
        body=f"An expert sent a new offer for your issue '{issue['title']}'.",
        issue_id=offer.issue_id,
        offer_id=offer_id,
        metadata={"expert_id": user["user_id"], "price": offer.price}
    )
    
    return await db.offers.find_one({"offer_id": offer_id}, {"_id": 0})

@api_router.get("/offers/my/list")
async def get_my_offers(user: dict = Depends(get_current_user)):
    await require_role(user, ["expert"])
    
    offers = await db.offers.find({"expert_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Get issue info for each offer
    for offer in offers:
        issue = await db.issues.find_one({"issue_id": offer["issue_id"]}, {"_id": 0})
        offer["issue"] = issue
    
    return offers

@api_router.put("/offers/{offer_id}/accept")
async def accept_offer(offer_id: str, user: dict = Depends(get_current_user)):
    offer = await db.offers.find_one({"offer_id": offer_id}, {"_id": 0})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    issue = await db.issues.find_one({"issue_id": offer["issue_id"]}, {"_id": 0})
    if issue["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Update offer status
    await db.offers.update_one({"offer_id": offer_id}, {"$set": {"status": "accepted"}})
    
    # Reject other offers
    await db.offers.update_many(
        {"issue_id": offer["issue_id"], "offer_id": {"$ne": offer_id}},
        {"$set": {"status": "rejected"}}
    )
    
    # Update issue status
    await db.issues.update_one({"issue_id": offer["issue_id"]}, {"$set": {"status": "in_progress"}})

    await create_notification(
        user_id=offer["expert_id"],
        category="offer",
        event_type="offer_accepted",
        title="Your offer was accepted",
        body="Client accepted your offer. You can proceed to booking and consultation.",
        issue_id=offer["issue_id"],
        offer_id=offer_id
    )

    rejected_offers = await db.offers.find(
        {"issue_id": offer["issue_id"], "offer_id": {"$ne": offer_id}},
        {"_id": 0, "offer_id": 1, "expert_id": 1}
    ).to_list(200)
    for rejected in rejected_offers:
        await create_notification(
            user_id=rejected["expert_id"],
            category="offer",
            event_type="offer_rejected",
            title="Offer not selected",
            body="Client selected a different offer for this issue.",
            issue_id=offer["issue_id"],
            offer_id=rejected["offer_id"]
        )
    
    return {"message": "Offer accepted"}

# ===================
# BOOKING ROUTES
# ===================

@api_router.post("/bookings")
async def create_booking(booking: BookingCreate, user: dict = Depends(get_current_user)):
    offer = await db.offers.find_one({"offer_id": booking.offer_id}, {"_id": 0})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    
    issue = await db.issues.find_one({"issue_id": offer["issue_id"]}, {"_id": 0})
    if issue["user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    booking_id = generate_id("book_")
    booking_doc = {
        "booking_id": booking_id,
        "offer_id": booking.offer_id,
        "issue_id": offer["issue_id"],
        "client_id": user["user_id"],
        "expert_id": offer["expert_id"],
        "price": offer["price"],
        "platform_fee": int(offer["price"] * PLATFORM_COMMISSION),
        "expert_payout": int(offer["price"] * (1 - PLATFORM_COMMISSION)),
        "selected_slot": booking.selected_slot,
        "status": "pending_payment",  # pending_payment, confirmed, in_progress, completed, cancelled, disputed
        "payment_status": "pending",  # pending, paid, refunded
        "call_audit": [],
        "call_summary": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.bookings.insert_one(booking_doc)
    
    # Accept the offer
    await db.offers.update_one({"offer_id": booking.offer_id}, {"$set": {"status": "accepted"}})
    
    # Reject other offers
    await db.offers.update_many(
        {"issue_id": offer["issue_id"], "offer_id": {"$ne": booking.offer_id}},
        {"$set": {"status": "rejected"}}
    )
    
    # Update issue status
    await db.issues.update_one({"issue_id": offer["issue_id"]}, {"$set": {"status": "in_progress"}})

    await create_notifications_bulk([
        {
            "user_id": user["user_id"],
            "category": "booking",
            "event_type": "booking_created",
            "title": "Booking created",
            "body": f"Your consultation booking {booking_id} is created. Complete payment to confirm.",
            "booking_id": booking_id,
            "issue_id": offer["issue_id"],
            "offer_id": booking.offer_id,
            "metadata": {"status": "pending_payment"}
        },
        {
            "user_id": offer["expert_id"],
            "category": "booking",
            "event_type": "booking_created",
            "title": "New consultation booking",
            "body": f"A client created booking {booking_id}. Waiting for payment confirmation.",
            "booking_id": booking_id,
            "issue_id": offer["issue_id"],
            "offer_id": booking.offer_id,
            "metadata": {"status": "pending_payment"}
        }
    ])
    
    return await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})

@api_router.get("/bookings")
async def get_bookings(user: dict = Depends(get_current_user), status: Optional[str] = None):
    query = {}
    if user["role"] == "client":
        query["client_id"] = user["user_id"]
    elif user["role"] == "expert":
        query["expert_id"] = user["user_id"]
    
    if status:
        query["status"] = status
    
    bookings = await db.bookings.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Enrich with issue and user info
    for booking in bookings:
        booking["call_audit"] = booking.get("call_audit", [])
        booking["call_summary"] = booking.get("call_summary")
        issue = await db.issues.find_one({"issue_id": booking["issue_id"]}, {"_id": 0})
        booking["issue"] = issue
        
        if user["role"] == "client":
            expert = await db.users.find_one({"user_id": booking["expert_id"]}, {"_id": 0, "password_hash": 0})
            expert_profile = await db.expert_profiles.find_one({"user_id": booking["expert_id"]}, {"_id": 0})
            booking["expert"] = expert
            booking["expert_profile"] = expert_profile
        else:
            client = await db.users.find_one({"user_id": booking["client_id"]}, {"_id": 0, "password_hash": 0})
            booking["client"] = {"alias": client.get("alias", "Anonymous")}  # Only show alias for privacy
    
    return bookings

@api_router.get("/bookings/{booking_id}")
async def get_booking(booking_id: str, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking["client_id"] != user["user_id"] and booking["expert_id"] != user["user_id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    booking["call_audit"] = booking.get("call_audit", [])
    booking["call_summary"] = booking.get("call_summary")
    
    # Get issue
    issue = await db.issues.find_one({"issue_id": booking["issue_id"]}, {"_id": 0})
    booking["issue"] = issue
    
    # Get expert info
    expert = await db.users.find_one({"user_id": booking["expert_id"]}, {"_id": 0, "password_hash": 0})
    expert_profile = await db.expert_profiles.find_one({"user_id": booking["expert_id"]}, {"_id": 0})
    booking["expert"] = expert
    booking["expert_profile"] = expert_profile
    
    return booking

@api_router.put("/bookings/{booking_id}/status")
async def update_booking_status(booking_id: str, request: Request, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    body = await request.json()
    new_status = body.get("status")
    
    # Validate status transitions
    valid_transitions = {
        "pending_payment": ["confirmed", "cancelled"],
        "confirmed": ["in_progress", "cancelled"],
        "in_progress": ["completed", "disputed"],
        "completed": [],
        "cancelled": [],
        "disputed": ["completed", "cancelled"]
    }
    
    current_status = booking["status"]
    if new_status not in valid_transitions.get(current_status, []):
        raise HTTPException(status_code=400, detail=f"Invalid status transition from {current_status} to {new_status}")

    if new_status in {"in_progress", "completed"} and booking["expert_id"] != user["user_id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Only the expert can update this consultation status")

    if new_status == "completed":
        accepted_call_count = await db.call_requests.count_documents({
            "booking_id": booking_id,
            "status": "accepted"
        })
        if accepted_call_count > 0 and not booking.get("call_summary"):
            raise HTTPException(status_code=400, detail="Post-call summary is required before marking consultation completed")

    await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"status": new_status}})
    
    # If completed, update issue and expert stats
    if new_status == "completed":
        await db.issues.update_one({"issue_id": booking["issue_id"]}, {"$set": {"status": "resolved"}})
        await db.expert_profiles.update_one(
            {"user_id": booking["expert_id"]},
            {"$inc": {"total_consultations": 1}}
        )

    recipient_id = booking["client_id"] if user["user_id"] == booking["expert_id"] else booking["expert_id"]
    await create_notification(
        user_id=recipient_id,
        category="booking",
        event_type="booking_status_updated",
        title="Consultation status updated",
        body=f"Booking {booking_id} status changed to {new_status.replace('_', ' ')}.",
        booking_id=booking_id,
        issue_id=booking["issue_id"],
        metadata={"status": new_status, "updated_by": user["user_id"]}
    )
    
    return {"message": f"Booking status updated to {new_status}"}

@api_router.post("/bookings/{booking_id}/call-summary")
async def add_call_summary(booking_id: str, summary: CallSummaryCreate, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if booking["expert_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the expert can submit summary")

    if booking.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Summary can be submitted only for paid consultations")

    content = (summary.content or "").strip()
    if len(content) < 20:
        raise HTTPException(status_code=400, detail="Summary must be at least 20 characters")

    summary_doc = {
        "content": content,
        "created_by": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"call_summary": summary_doc}})
    await append_call_audit(
        booking_id=booking_id,
        event_type="call_summary_submitted",
        actor_user_id=user["user_id"],
        metadata={"length": len(content)}
    )
    await create_notification(
        user_id=booking["client_id"],
        category="call",
        event_type="call_summary_submitted",
        title="Post-call summary available",
        body="Your expert submitted a written summary for this consultation.",
        booking_id=booking_id,
        issue_id=booking["issue_id"]
    )
    return {"message": "Call summary submitted", "call_summary": summary_doc}

# ===================
# PAYMENT ROUTES (Razorpay)
# ===================

@api_router.post("/payments/create-order")
async def create_payment_order(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    booking_id = body.get("booking_id")
    
    booking = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking["client_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Create Razorpay order (mock for now - actual integration requires Razorpay keys)
    order_id = generate_id("order_")
    
    payment_doc = {
        "payment_id": generate_id("pay_"),
        "order_id": order_id,
        "booking_id": booking_id,
        "user_id": user["user_id"],
        "amount": booking["price"],
        "currency": "INR",
        "status": "created",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.payments.insert_one(payment_doc)
    
    return {
        "order_id": order_id,
        "amount": booking["price"] * 100,  # Razorpay expects paise
        "currency": "INR",
        "booking_id": booking_id
    }

@api_router.post("/payments/verify")
async def verify_payment(request: Request, user: dict = Depends(get_current_user)):
    body = await request.json()
    order_id = body.get("order_id")
    razorpay_payment_id = body.get("razorpay_payment_id")
    razorpay_signature = body.get("razorpay_signature")
    
    # In production, verify signature with Razorpay
    # For MVP, we'll mark as paid
    
    payment = await db.payments.find_one({"order_id": order_id}, {"_id": 0})
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # Update payment status
    await db.payments.update_one(
        {"order_id": order_id},
        {"$set": {
            "status": "paid",
            "razorpay_payment_id": razorpay_payment_id,
            "razorpay_signature": razorpay_signature,
            "paid_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Update booking status
    await db.bookings.update_one(
        {"booking_id": payment["booking_id"]},
        {"$set": {"status": "confirmed", "payment_status": "paid"}}
    )

    paid_booking = await db.bookings.find_one({"booking_id": payment["booking_id"]}, {"_id": 0})
    await create_notifications_bulk([
        {
            "user_id": paid_booking["client_id"],
            "category": "payment",
            "event_type": "payment_success",
            "title": "Payment successful",
            "body": f"Payment confirmed for booking {paid_booking['booking_id']}.",
            "booking_id": paid_booking["booking_id"],
            "issue_id": paid_booking["issue_id"],
            "metadata": {"amount": paid_booking["price"]}
        },
        {
            "user_id": paid_booking["expert_id"],
            "category": "payment",
            "event_type": "payment_success",
            "title": "Client payment confirmed",
            "body": f"Client payment is confirmed for booking {paid_booking['booking_id']}.",
            "booking_id": paid_booking["booking_id"],
            "issue_id": paid_booking["issue_id"],
            "metadata": {"amount": paid_booking["price"]}
        }
    ])
    
    return {"message": "Payment verified", "status": "paid"}

# ===================
# CHAT ROUTES
# ===================

@api_router.post("/chat/messages")
async def send_chat_message(message: ChatMessage, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"booking_id": message.booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking["client_id"] != user["user_id"] and booking["expert_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Determine sender type
    sender_type = "client" if booking["client_id"] == user["user_id"] else "expert"
    
    msg_id = generate_id("msg_")
    msg_doc = {
        "message_id": msg_id,
        "booking_id": message.booking_id,
        "sender_id": user["user_id"],
        "sender_type": sender_type,
        "sender_alias": user.get("alias", "Anonymous") if sender_type == "client" else user.get("name", user.get("alias")),
        "content": message.content,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.chat_messages.insert_one(msg_doc)
    recipient_id = booking["expert_id"] if sender_type == "client" else booking["client_id"]
    await create_notification(
        user_id=recipient_id,
        category="chat",
        event_type="message_received",
        title="New message in consultation chat",
        body=f"You have a new message in booking {message.booking_id}.",
        booking_id=message.booking_id,
        issue_id=booking["issue_id"],
        metadata={"sender_type": sender_type, "message_id": msg_id}
    )
    return await db.chat_messages.find_one({"message_id": msg_id}, {"_id": 0})

@api_router.get("/chat/messages/{booking_id}")
async def get_chat_messages(booking_id: str, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking["client_id"] != user["user_id"] and booking["expert_id"] != user["user_id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    
    messages = await db.chat_messages.find({"booking_id": booking_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return messages

@api_router.post("/calls/request")
async def create_call_request(call_request: CallRequestCreate, user: dict = Depends(get_current_user)):
    if call_request.call_type not in {"voice", "video"}:
        raise HTTPException(status_code=400, detail="Invalid call type")

    booking = await get_booking_for_call(call_request.booking_id, user)
    if booking["client_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the client can initiate calls")

    total_attempts = await db.call_requests.count_documents({
        "booking_id": call_request.booking_id,
        "initiated_by": user["user_id"]
    })
    if total_attempts >= MAX_CALL_REQUESTS_PER_BOOKING:
        raise HTTPException(status_code=400, detail="Maximum call requests reached for this consultation")

    latest_attempt = await db.call_requests.find_one(
        {"booking_id": call_request.booking_id, "initiated_by": user["user_id"]},
        {"_id": 0},
        sort=[("created_at", -1)]
    )
    if latest_attempt:
        reference_time = parse_iso_datetime(latest_attempt.get("resolved_at")) or parse_iso_datetime(latest_attempt.get("created_at"))
        if reference_time:
            elapsed_seconds = (datetime.now(timezone.utc) - reference_time).total_seconds()
            if elapsed_seconds < CALL_REQUEST_RETRY_COOLDOWN_SECONDS:
                wait_seconds = int(CALL_REQUEST_RETRY_COOLDOWN_SECONDS - elapsed_seconds)
                raise HTTPException(status_code=400, detail=f"Please wait {wait_seconds}s before sending another call request")

    await expire_stale_call_requests(call_request.booking_id)
    existing_request = await db.call_requests.find_one(
        {
            "booking_id": call_request.booking_id,
            "status": {"$in": list(CALL_REQUEST_ACTIVE_STATUSES)}
        },
        {"_id": 0}
    )
    if existing_request:
        raise HTTPException(status_code=400, detail="A call request is already active for this consultation")

    now = datetime.now(timezone.utc)
    call_id = generate_id("call_")
    call_doc = {
        "call_id": call_id,
        "booking_id": call_request.booking_id,
        "issue_id": booking["issue_id"],
        "client_id": booking["client_id"],
        "expert_id": booking["expert_id"],
        "initiated_by": user["user_id"],
        "target_user_id": booking["expert_id"],
        "call_type": call_request.call_type,
        "status": "requested",
        "created_at": now.isoformat(),
        "created_at_dt": now,
        "expires_at": (now + timedelta(seconds=CALL_REQUEST_EXPIRE_SECONDS)).isoformat(),
        "accepted_at": None,
        "resolved_at": None,
        "resolution_reason": None
    }
    await db.call_requests.insert_one(call_doc)
    clean_call = await db.call_requests.find_one({"call_id": call_id}, {"_id": 0, "created_at_dt": 0})
    await append_call_audit(
        booking_id=call_request.booking_id,
        event_type="call_requested",
        actor_user_id=user["user_id"],
        metadata={"call_id": call_id, "call_type": call_request.call_type}
    )
    await emit_call_event(call_request.booking_id, "call_requested", clean_call)
    await create_notifications_bulk([
        {
            "user_id": booking["expert_id"],
            "category": "call",
            "event_type": "call_requested",
            "title": f"Incoming {call_request.call_type} call request",
            "body": "Client wants to start a consultation call.",
            "booking_id": call_request.booking_id,
            "issue_id": booking["issue_id"],
            "call_id": call_id,
            "metadata": {"call_type": call_request.call_type}
        },
        {
            "user_id": booking["client_id"],
            "category": "call",
            "event_type": "call_requested",
            "title": "Call request sent",
            "body": f"Your {call_request.call_type} call request was sent to expert.",
            "booking_id": call_request.booking_id,
            "issue_id": booking["issue_id"],
            "call_id": call_id,
            "metadata": {"call_type": call_request.call_type}
        }
    ])
    return clean_call

@api_router.get("/calls/{booking_id}")
async def list_call_requests(booking_id: str, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"booking_id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking["client_id"] != user["user_id"] and booking["expert_id"] != user["user_id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    return await get_latest_call_requests(booking_id)

@api_router.post("/calls/{call_id}/accept")
async def accept_call_request(call_id: str, action: Optional[CallRequestAction] = None, user: dict = Depends(get_current_user)):
    call_request = await db.call_requests.find_one({"call_id": call_id}, {"_id": 0})
    if not call_request:
        raise HTTPException(status_code=404, detail="Call request not found")

    booking = await get_booking_for_call(call_request["booking_id"], user)
    if booking["expert_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the expert can accept the call")

    await expire_stale_call_requests(call_request["booking_id"])
    refreshed = await db.call_requests.find_one({"call_id": call_id}, {"_id": 0})
    if refreshed["status"] not in CALL_REQUEST_ACTIVE_STATUSES:
        raise HTTPException(status_code=400, detail=f"Call request is already {refreshed['status']}")

    now = datetime.now(timezone.utc).isoformat()
    await db.call_requests.update_one(
        {"call_id": call_id},
        {
            "$set": {
                "status": "accepted",
                "accepted_at": now,
                "resolved_at": now,
                "resolution_reason": action.reason if action else None
            }
        }
    )
    clean_call = await db.call_requests.find_one({"call_id": call_id}, {"_id": 0, "created_at_dt": 0})
    await append_call_audit(
        booking_id=call_request["booking_id"],
        event_type="call_accepted",
        actor_user_id=user["user_id"],
        metadata={"call_id": call_id, "call_type": clean_call["call_type"]}
    )
    await emit_call_event(call_request["booking_id"], "call_accepted", clean_call)
    await create_notifications_bulk([
        {
            "user_id": call_request["client_id"],
            "category": "call",
            "event_type": "call_accepted",
            "title": "Call request accepted",
            "body": f"Expert accepted your {clean_call['call_type']} call request.",
            "booking_id": call_request["booking_id"],
            "issue_id": call_request["issue_id"],
            "call_id": call_id
        },
        {
            "user_id": call_request["expert_id"],
            "category": "call",
            "event_type": "call_accepted",
            "title": "Call accepted",
            "body": f"You accepted a client {clean_call['call_type']} call request.",
            "booking_id": call_request["booking_id"],
            "issue_id": call_request["issue_id"],
            "call_id": call_id
        }
    ])
    return clean_call

@api_router.post("/calls/{call_id}/reject")
async def reject_call_request(call_id: str, action: Optional[CallRequestAction] = None, user: dict = Depends(get_current_user)):
    call_request = await db.call_requests.find_one({"call_id": call_id}, {"_id": 0})
    if not call_request:
        raise HTTPException(status_code=404, detail="Call request not found")

    booking = await get_booking_for_call(call_request["booking_id"], user)
    if booking["expert_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the expert can reject the call")

    await expire_stale_call_requests(call_request["booking_id"])
    refreshed = await db.call_requests.find_one({"call_id": call_id}, {"_id": 0})
    if refreshed["status"] not in CALL_REQUEST_ACTIVE_STATUSES:
        raise HTTPException(status_code=400, detail=f"Call request is already {refreshed['status']}")

    now = datetime.now(timezone.utc).isoformat()
    await db.call_requests.update_one(
        {"call_id": call_id},
        {
            "$set": {
                "status": "rejected",
                "resolved_at": now,
                "resolution_reason": action.reason or "Expert declined the call"
            }
        }
    )
    clean_call = await db.call_requests.find_one({"call_id": call_id}, {"_id": 0, "created_at_dt": 0})
    await append_call_audit(
        booking_id=call_request["booking_id"],
        event_type="call_rejected",
        actor_user_id=user["user_id"],
        metadata={"call_id": call_id, "call_type": clean_call["call_type"], "reason": clean_call.get("resolution_reason")}
    )
    await emit_call_event(call_request["booking_id"], "call_rejected", clean_call)
    await create_notifications_bulk([
        {
            "user_id": call_request["client_id"],
            "category": "call",
            "event_type": "call_rejected",
            "title": "Call request declined",
            "body": clean_call.get("resolution_reason") or "Expert declined your call request.",
            "booking_id": call_request["booking_id"],
            "issue_id": call_request["issue_id"],
            "call_id": call_id
        },
        {
            "user_id": call_request["expert_id"],
            "category": "call",
            "event_type": "call_rejected",
            "title": "Call request rejected",
            "body": "You rejected the client call request.",
            "booking_id": call_request["booking_id"],
            "issue_id": call_request["issue_id"],
            "call_id": call_id
        }
    ])
    return clean_call

@api_router.post("/calls/{call_id}/cancel")
async def cancel_call_request(call_id: str, action: Optional[CallRequestAction] = None, user: dict = Depends(get_current_user)):
    call_request = await db.call_requests.find_one({"call_id": call_id}, {"_id": 0})
    if not call_request:
        raise HTTPException(status_code=404, detail="Call request not found")

    booking = await get_booking_for_call(call_request["booking_id"], user)
    if booking["client_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only the client can cancel the call")

    await expire_stale_call_requests(call_request["booking_id"])
    refreshed = await db.call_requests.find_one({"call_id": call_id}, {"_id": 0})
    if refreshed["status"] not in CALL_REQUEST_ACTIVE_STATUSES:
        raise HTTPException(status_code=400, detail=f"Call request is already {refreshed['status']}")

    now = datetime.now(timezone.utc).isoformat()
    await db.call_requests.update_one(
        {"call_id": call_id},
        {
            "$set": {
                "status": "cancelled",
                "resolved_at": now,
                "resolution_reason": action.reason or "Client cancelled the call request"
            }
        }
    )
    clean_call = await db.call_requests.find_one({"call_id": call_id}, {"_id": 0, "created_at_dt": 0})
    await append_call_audit(
        booking_id=call_request["booking_id"],
        event_type="call_cancelled",
        actor_user_id=user["user_id"],
        metadata={"call_id": call_id, "call_type": clean_call["call_type"], "reason": clean_call.get("resolution_reason")}
    )
    await emit_call_event(call_request["booking_id"], "call_cancelled", clean_call)
    await create_notifications_bulk([
        {
            "user_id": call_request["expert_id"],
            "category": "call",
            "event_type": "call_cancelled",
            "title": "Client cancelled call request",
            "body": "Client cancelled the pending call request.",
            "booking_id": call_request["booking_id"],
            "issue_id": call_request["issue_id"],
            "call_id": call_id
        },
        {
            "user_id": call_request["client_id"],
            "category": "call",
            "event_type": "call_cancelled",
            "title": "Call request cancelled",
            "body": "You cancelled your pending call request.",
            "booking_id": call_request["booking_id"],
            "issue_id": call_request["issue_id"],
            "call_id": call_id
        }
    ])
    return clean_call

# ===================
# REVIEW ROUTES
# ===================

@api_router.post("/reviews")
async def create_review(review: ReviewCreate, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"booking_id": review.booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking["client_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Only clients can review")
    
    if booking["status"] != "completed":
        raise HTTPException(status_code=400, detail="Can only review completed consultations")
    
    # Check if already reviewed
    existing = await db.reviews.find_one({"booking_id": review.booking_id}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Already reviewed")
    
    review_id = generate_id("rev_")
    review_doc = {
        "review_id": review_id,
        "booking_id": review.booking_id,
        "client_id": user["user_id"],
        "expert_id": booking["expert_id"],
        "rating": review.rating,
        "comment": review.comment,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.reviews.insert_one(review_doc)
    
    # Update expert rating
    expert_reviews = await db.reviews.find({"expert_id": booking["expert_id"]}, {"_id": 0}).to_list(1000)
    avg_rating = sum(r["rating"] for r in expert_reviews) / len(expert_reviews)
    
    await db.expert_profiles.update_one(
        {"user_id": booking["expert_id"]},
        {"$set": {"avg_rating": round(avg_rating, 2), "ratings_count": len(expert_reviews)}}
    )

    await create_notification(
        user_id=booking["expert_id"],
        category="review",
        event_type="review_received",
        title="New client review",
        body=f"You received a {review.rating}-star review.",
        booking_id=review.booking_id,
        issue_id=booking["issue_id"],
        metadata={"rating": review.rating}
    )
    
    return await db.reviews.find_one({"review_id": review_id}, {"_id": 0})

@api_router.get("/reviews/expert/{expert_id}")
async def get_expert_reviews(expert_id: str):
    reviews = await db.reviews.find({"expert_id": expert_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return reviews

# ===================
# EXPERT ROUTES
# ===================

@api_router.get("/experts")
async def list_experts(
    city: Optional[str] = None,
    category: Optional[str] = None,
    verified_only: bool = False,
    page: int = 1,
    limit: int = 20
):
    query = {}
    if city:
        query["cities"] = city
    if category:
        query["expertise"] = category
    if verified_only:
        query["is_verified"] = True
    
    skip = (page - 1) * limit
    profiles = await db.expert_profiles.find(query, {"_id": 0}).sort("avg_rating", -1).skip(skip).limit(limit).to_list(limit)
    
    # Get user info for each expert
    for profile in profiles:
        user = await db.users.find_one({"user_id": profile["user_id"]}, {"_id": 0, "password_hash": 0})
        profile["user"] = user
    
    total = await db.expert_profiles.count_documents(query)
    return {"experts": profiles, "total": total, "page": page, "limit": limit}

@api_router.get("/experts/{user_id}")
async def get_expert(user_id: str):
    profile = await db.expert_profiles.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Expert not found")
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    profile["user"] = user
    
    # Get reviews
    reviews = await db.reviews.find({"expert_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
    profile["recent_reviews"] = reviews
    
    return profile

# ===================
# ADMIN ROUTES
# ===================

@api_router.get("/admin/stats")
async def get_admin_stats(user: dict = Depends(get_current_user)):
    await require_role(user, ["admin"])
    
    total_users = await db.users.count_documents({})
    total_experts = await db.users.count_documents({"role": "expert"})
    total_issues = await db.issues.count_documents({})
    total_bookings = await db.bookings.count_documents({})
    completed_bookings = await db.bookings.count_documents({"status": "completed"})
    
    # Calculate revenue
    payments = await db.payments.find({"status": "paid"}, {"_id": 0}).to_list(10000)
    total_revenue = sum(p["amount"] for p in payments)
    platform_revenue = int(total_revenue * PLATFORM_COMMISSION)
    
    return {
        "total_users": total_users,
        "total_experts": total_experts,
        "total_issues": total_issues,
        "total_bookings": total_bookings,
        "completed_bookings": completed_bookings,
        "total_revenue": total_revenue,
        "platform_revenue": platform_revenue,
        "commission_rate": PLATFORM_COMMISSION * 100
    }

@api_router.get("/admin/users")
async def admin_list_users(user: dict = Depends(get_current_user), role: Optional[str] = None, page: int = 1, limit: int = 50):
    await require_role(user, ["admin"])
    
    query = {}
    if role:
        query["role"] = role
    
    skip = (page - 1) * limit
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).skip(skip).limit(limit).to_list(limit)
    total = await db.users.count_documents(query)
    
    return {"users": users, "total": total, "page": page, "limit": limit}

@api_router.get("/admin/experts/pending")
async def admin_pending_experts(user: dict = Depends(get_current_user)):
    await require_role(user, ["admin"])
    
    profiles = await db.expert_profiles.find({"kyc_status": {"$in": ["pending", "submitted"]}}, {"_id": 0}).to_list(100)
    
    for profile in profiles:
        user_doc = await db.users.find_one({"user_id": profile["user_id"]}, {"_id": 0, "password_hash": 0})
        profile["user"] = user_doc
    
    return profiles

@api_router.put("/admin/experts/{user_id}/verify")
async def admin_verify_expert(user_id: str, request: Request, user: dict = Depends(get_current_user)):
    await require_role(user, ["admin"])
    
    body = await request.json()
    action = body.get("action")  # approve, reject
    
    if action == "approve":
        await db.expert_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"is_verified": True, "kyc_status": "approved"}}
        )
        await create_notification(
            user_id=user_id,
            category="system",
            event_type="expert_verification_approved",
            title="Expert verification approved",
            body="Your expert profile is approved and now marked as verified."
        )
    elif action == "reject":
        await db.expert_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"kyc_status": "rejected"}}
        )
        await create_notification(
            user_id=user_id,
            category="system",
            event_type="expert_verification_rejected",
            title="Expert verification update",
            body="Your verification request was rejected. Please review profile details and resubmit."
        )
    
    return {"message": f"Expert {action}d"}

@api_router.get("/admin/disputes")
async def admin_get_disputes(user: dict = Depends(get_current_user)):
    await require_role(user, ["admin"])
    
    disputes = await db.bookings.find({"status": "disputed"}, {"_id": 0}).to_list(100)
    
    for dispute in disputes:
        issue = await db.issues.find_one({"issue_id": dispute["issue_id"]}, {"_id": 0})
        client = await db.users.find_one({"user_id": dispute["client_id"]}, {"_id": 0, "password_hash": 0})
        expert = await db.users.find_one({"user_id": dispute["expert_id"]}, {"_id": 0, "password_hash": 0})
        dispute["issue"] = issue
        dispute["client"] = client
        dispute["expert"] = expert
    
    return disputes

# ===================
# CATEGORIES & CITIES
# ===================

@api_router.get("/categories")
async def get_categories():
    return {
        "categories": [
            {"id": "legal", "name": "Legal", "icon": "Scale"},
            {"id": "medical", "name": "Medical", "icon": "Stethoscope"},
            {"id": "mental_health", "name": "Mental Health", "icon": "Brain"},
            {"id": "career", "name": "Career", "icon": "Briefcase"},
            {"id": "finance", "name": "Finance", "icon": "PiggyBank"},
            {"id": "relationships", "name": "Relationships", "icon": "Heart"},
            {"id": "technology", "name": "Technology", "icon": "Laptop"},
            {"id": "education", "name": "Education", "icon": "GraduationCap"},
            {"id": "other", "name": "Other", "icon": "HelpCircle"}
        ]
    }

@api_router.get("/cities")
async def get_cities():
    return {
        "cities": [
            "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai",
            "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Lucknow",
            "Chandigarh", "Kochi", "Indore", "Bhopal", "Nagpur"
        ]
    }

# Include router and add middleware
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_tasks():
    await ensure_default_admin()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Expose a single ASGI app that serves both REST (FastAPI) and Socket.IO.
app = socketio.ASGIApp(sio, app)
