from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import httpx
import json
import asyncio

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

class ExpertProfile(BaseModel):
    user_id: str
    expertise: List[str] = []
    experience_years: int = 0
    bio: str = ""
    hourly_rate: int = 500
    cities: List[str] = []
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

async def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
    # Check cookie first
    token = request.cookies.get("session_token")
    
    # Then check Authorization header
    if not token and credentials:
        token = credentials.credentials
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Try session token from Emergent Auth first
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if user:
            return user
    
    # Try JWT token
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

# ===================
# AI MODERATION
# ===================

async def moderate_content(text: str) -> Dict[str, Any]:
    """Use OpenAI GPT-5.2 to moderate content"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            return {"approved": True, "reason": "Moderation skipped - no API key"}
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"moderation_{generate_id()}",
            system_message="You are a content moderator. Analyze the text and respond with JSON: {\"approved\": true/false, \"reason\": \"reason if rejected\", \"category\": \"spam/abuse/inappropriate/ok\"}"
        ).with_model("openai", "gpt-5.2")
        
        response = await chat.send_message(UserMessage(text=f"Moderate this content: {text}"))
        
        # Parse response
        try:
            result = json.loads(response)
            return result
        except:
            return {"approved": True, "reason": "Could not parse moderation response"}
    except Exception as e:
        logger.error(f"Moderation error: {e}")
        return {"approved": True, "reason": f"Moderation error: {str(e)}"}

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

@api_router.post("/auth/session")
async def process_session(request: Request):
    """Process Emergent Auth session_id and create session"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth to get session data
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        
        session_data = response.json()
    
    # Check if user exists
    email = session_data["email"]
    user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if not user:
        # Create new user
        user_id = generate_id("user_")
        user = {
            "user_id": user_id,
            "email": email,
            "name": session_data.get("name", ""),
            "alias": session_data.get("name", f"User_{user_id[:6]}"),
            "picture": session_data.get("picture"),
            "role": "client",  # Default role for OAuth users
            "is_anonymous": False,
            "city": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True
        }
        await db.users.insert_one(user)
    else:
        user_id = user["user_id"]
        # Update user info
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": session_data.get("name", user.get("name")),
                "picture": session_data.get("picture", user.get("picture"))
            }}
        )
    
    # Store session
    session_token = session_data.get("session_token", generate_id("sess_"))
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    await db.user_sessions.update_one(
        {"user_id": user_id},
        {"$set": {
            "session_token": session_token,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    from fastapi.responses import JSONResponse
    response = JSONResponse(content={"user": user, "session_token": session_token})
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    return response

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    user.pop("password_hash", None)
    return user

@api_router.post("/auth/logout")
async def logout(request: Request, user: dict = Depends(get_current_user)):
    await db.user_sessions.delete_one({"user_id": user["user_id"]})
    from fastapi.responses import JSONResponse
    response = JSONResponse(content={"message": "Logged out"})
    response.delete_cookie("session_token")
    return response

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
    
    allowed_fields = ["expertise", "experience_years", "bio", "hourly_rate", "cities"]
    update_data = {k: v for k, v in body.items() if k in allowed_fields}
    
    if update_data:
        await db.expert_profiles.update_one(
            {"user_id": user["user_id"]},
            {"$set": update_data}
        )
    
    return await db.expert_profiles.find_one({"user_id": user["user_id"]}, {"_id": 0})

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
    
    await db.bookings.update_one({"booking_id": booking_id}, {"$set": {"status": new_status}})
    
    # If completed, update issue and expert stats
    if new_status == "completed":
        await db.issues.update_one({"issue_id": booking["issue_id"]}, {"$set": {"status": "resolved"}})
        await db.expert_profiles.update_one(
            {"user_id": booking["expert_id"]},
            {"$inc": {"total_consultations": 1}}
        )
    
    return {"message": f"Booking status updated to {new_status}"}

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
    elif action == "reject":
        await db.expert_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"kyc_status": "rejected"}}
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
