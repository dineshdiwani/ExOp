# ExpertOpinion - Product Requirements Document

## Original Problem Statement
Build a scalable, production-ready web platform called "ExpertOpinion" - a city-based anonymous consultation marketplace where:
- Clients post problems/issues anonymously (without revealing identity)
- Verified experts respond with consultation offers (fee + time slots)
- Clients select an expert, pay securely, and attend consultation
- Platform takes a commission from each transaction

## User Choices
- **Payments**: Razorpay (mocked for MVP)
- **Communication**: Text chat only (no video/audio for MVP)
- **Authentication**: JWT + Google OAuth (Emergent-managed)
- **AI Moderation**: OpenAI GPT-5.2
- **Scope**: Full web platform MVP

## Architecture
- **Frontend**: React + Tailwind + Shadcn/UI
- **Backend**: FastAPI + Python
- **Database**: MongoDB
- **Authentication**: JWT tokens + Emergent Google OAuth
- **Real-time**: REST API with polling (WebSocket can be added later)

## User Personas

### 1. Client (Anonymous User)
- Signs up with minimal info, uses display alias
- Posts issues categorized by city and category
- Views and compares expert offers
- Books and pays for consultations
- Chats with experts, rates them anonymously

### 2. Expert (Verified Professional)
- Completes KYC verification (hidden from clients)
- Has public profile with name, expertise, ratings, pricing
- Browses issues by city & category
- Sends offers with price and time slots
- Conducts consultations via chat

### 3. Admin (Platform Owner)
- Manages users and experts
- Handles expert verification
- Controls commission settings
- Handles disputes and analytics

## Core Requirements (Static)

### Authentication System
- [x] JWT-based authentication
- [x] Google OAuth integration (Emergent-managed)
- [x] Role-based access (Client, Expert, Admin)
- [x] Anonymous user support with aliases

### Issue Posting System
- [x] City-based filtering
- [x] Category tagging (legal, medical, career, finance, etc.)
- [x] Anonymous posting with AI moderation
- [x] Urgency levels
- [x] Budget range support

### Offer & Bidding System
- [x] Experts submit offers on issues
- [x] Multiple offers per issue
- [x] Price, message, and time slots
- [x] Offer acceptance flow

### Booking System
- [x] Time slot selection
- [x] Booking confirmation system
- [x] Status tracking (pending, confirmed, in_progress, completed)

### Payment System
- [x] Razorpay integration (MOCKED for MVP)
- [x] Escrow-based payment concept
- [x] Platform commission (15%) auto-calculated
- [x] Expert payout calculation

### Chat System
- [x] REST-based messaging
- [x] Real-time updates via polling
- [x] Message history per booking
- [x] Sender identification (client alias vs expert name)

### Review & Rating System
- [x] Anonymous reviews from clients
- [x] Rating calculation for experts
- [x] Review display on expert profiles

### Admin Dashboard
- [x] User management
- [x] Expert verification queue
- [x] Platform statistics
- [x] Dispute handling interface

## What's Been Implemented (March 21, 2026)

### Backend (FastAPI)
- Complete API with 30+ endpoints
- JWT + OAuth authentication
- MongoDB models for all entities
- AI content moderation integration
- Payment order creation and verification (mocked)
- Chat messaging system
- Admin management APIs

### Frontend (React)
- Landing page with hero, features, categories
- Auth pages (Login, Register, OAuth callback)
- Client Dashboard with issue management
- Expert Dashboard with issue browsing and offers
- Admin Dashboard with stats and user management
- Issue detail with offer viewing and submission
- Booking page with payment flow
- Chat room for consultations
- Profile management

### Test Users Created
- Client: testclient2@example.com / password123
- Expert: testexpert@example.com / password123
- Admin: admin@expertopinion.com / admin123

## Prioritized Backlog

### P0 (Critical - Done)
- [x] User registration and login
- [x] Issue posting
- [x] Offer system
- [x] Booking creation
- [x] Basic chat
- [x] Payment simulation

### P1 (High Priority - Next)
- [ ] Real Razorpay integration with actual payments
- [ ] WebSocket for real-time chat
- [ ] File attachment support in chat
- [ ] Email notifications
- [ ] Push notifications

### P2 (Medium Priority)
- [ ] Expert KYC document upload
- [ ] Advanced search and filtering
- [ ] Booking calendar integration
- [ ] Refund handling
- [ ] Dispute resolution workflow

### P3 (Future)
- [ ] Mobile app (React Native)
- [ ] Video/Audio calls (WebRTC)
- [ ] Multi-language support
- [ ] Advanced analytics
- [ ] AI-powered expert matching

## Next Tasks

1. **Integrate Real Razorpay** - Replace mocked payment with actual Razorpay checkout
2. **Add WebSocket Chat** - Implement real-time messaging with Socket.io
3. **Email Notifications** - Add email alerts for offers, bookings, and messages
4. **Expert Verification Flow** - Complete KYC document upload and verification
5. **File Attachments** - Allow file sharing during consultations
