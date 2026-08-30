# 🔌 API Documentation

## Base URL

```
Development:  http://localhost:4000
Production:   https://api.daya-ai.com
```

## Authentication

All requests (except login/register) require a Bearer token:

```bash
Authorization: Bearer <jwt_token>
```

## Response Format

All responses are JSON:

```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "error": null,
  "timestamp": "2026-08-30T12:00:00Z"
}
```

---

## Authentication Endpoints

### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password",
  "name": "John Doe"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "token": "eyJhbG...",
    "user": {
      "id": "user_123",
      "name": "John Doe",
      "email": "user@example.com",
      "plan": "free"
    }
  }
}
```

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}
```

**Response (200):** Same as register

### Logout
```http
POST /api/auth/logout
Authorization: Bearer <token>
```

### Refresh Token
```http
POST /api/auth/refresh
Authorization: Bearer <token>
```

---

## Chat Endpoints

### Create Message
```http
POST /api/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Hello, how are you?",
  "conversationId": "conv_123" // optional
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "msg_456",
    "conversationId": "conv_123",
    "userId": "user_123",
    "role": "user",
    "content": "Hello, how are you?",
    "createdAt": "2026-08-30T12:00:00Z"
  }
}
```

### Stream Chat Response
```http
POST /api/chat/stream
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "What's the weather today?",
  "conversationId": "conv_123",
  "tools": ["web_search", "calculator"],
  "model": "gpt-4" // optional, auto-selected if omitted
}
```

**Response: Server-Sent Events (SSE) Stream**
```
data: {"type": "token", "content": "The"}
data: {"type": "token", "content": " weather"}
data: {"type": "token", "content": " today"}
data: {"type": "tool_call", "name": "web_search", "args": {"query": "weather today"}}
data: {"type": "done", "messageId": "msg_789"}
```

### Get Conversation History
```http
GET /api/chat/conversations/:conversationId
Authorization: Bearer <token>
```

### List Conversations
```http
GET /api/chat/conversations?limit=10&offset=0
Authorization: Bearer <token>
```

### Delete Message
```http
DELETE /api/chat/messages/:messageId
Authorization: Bearer <token>
```

---

## Document RAG Endpoints

### Upload Document
```http
POST /api/documents/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <binary_pdf_or_doc>
title: "Project Proposal" // optional
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "doc_123",
    "fileName": "proposal.pdf",
    "title": "Project Proposal",
    "chunks": 42,
    "embedding": "in_progress",
    "createdAt": "2026-08-30T12:00:00Z"
  }
}
```

### List User Documents
```http
GET /api/documents?limit=10&offset=0
Authorization: Bearer <token>
```

### Query Document (RAG)
```http
POST /api/documents/:documentId/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "What are the main objectives?",
  "limit": 5
}
```

### Delete Document
```http
DELETE /api/documents/:documentId
Authorization: Bearer <token>
```

---

## Image Generation Endpoints

### Generate Image
```http
POST /api/images/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "prompt": "A serene landscape with mountains and a lake",
  "model": "pollinations",
  "width": 1024,
  "height": 768,
  "quality": "high"
}
```

### Get Image History
```http
GET /api/images?limit=20&offset=0
Authorization: Bearer <token>
```

---

## Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "error": "Invalid email format",
  "code": "VALIDATION_ERROR"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "error": "Token expired or invalid",
  "code": "AUTH_ERROR"
}
```

### 429 Too Many Requests
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_ERROR",
  "retryAfter": 60
}
```

---

## Rate Limiting

- **Free plan:** 100 requests/hour
- **Pro plan:** 1000 requests/hour
- **Enterprise:** Custom limits

Headers returned:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1630000000
```

---

For more details, visit [docs.daya-ai.com](https://docs.daya-ai.com)
