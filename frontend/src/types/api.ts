// ============================================
// DAYA IA — Shared TypeScript types for the frontend
// Derived from the Prisma schema + API contracts
// ============================================

// ── Plans & Enums ──
export type Plan = 'FREE' | 'BETA' | 'PRO' | 'TEAM'
export type ChatMode = 'SINGLE' | 'COUNCIL' | 'BATTLE'
export type MessageRole = 'user' | 'assistant' | 'system'
export type ThemePref = 'light' | 'dark' | 'system'
export type ThinkLevel = 'fast' | 'normal' | 'deep'

// ── Auth ──
export interface User {
  id: string
  name: string
  email: string
  plan: Plan
  messagesUsed: number
  messagesLimit: number
  imagesUsed?: number
  searchesUsed?: number
  studioUsed?: number
  documentsUsed?: number
  avatarUrl?: string | null
  emailVerified?: boolean
}

export interface UserProfile {
  profession?: string | null
  interests: string[]
  language: string
  aiPersona: string
  tone?: string | null
  responseLength?: string | null
  avatarUrl?: string | null
}

export interface AuthResponse {
  token: string
  user: User
}

// ── Chat ──
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  model?: string | null
  tokens?: number | null
  createdAt: string
  images?: string[]
  files?: { name: string; type: string; fileId?: string; url?: string }[]
}

export interface Conversation {
  id: string
  title: string
  model: string
  mode: string
  pinned?: boolean
  updatedAt: string
  messages?: Message[]
  shared?: SharedConversation | null
}

export interface SharedConversation {
  id: string
  slug: string
  createdAt: string
}

// ── Notes & Tasks ──
export interface Note {
  id: string
  title: string
  content: string
  color: string
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  title: string
  done: boolean
  priority: 'low' | 'normal' | 'high'
  dueDate?: string | null
  createdAt: string
  updatedAt: string
}

// ── Calendar ──
export interface CalendarEvent {
  id: string
  title: string
  notes: string
  start: string
  end?: string | null
  allDay: boolean
  color: string
  createdAt: string
  updatedAt: string
}

// ── Notebooks ──
export interface Notebook {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  sources?: NotebookSource[]
}

export interface NotebookSource {
  id: string
  type: 'document' | 'url' | 'text'
  title: string
  content?: string
  docId?: string | null
  createdAt: string
}

// ── Email ──
export interface EmailAccount {
  imapHost: string
  imapPort: number
  imapSecure: boolean
  smtpHost?: string
  smtpPort?: number
  smtpSecure?: boolean
  username: string
  fromName?: string
}

export interface EmailMessage {
  uid: number
  subject: string
  from: string
  date: string
  preview?: string
}

// ── Documents / Library ──
export interface LibraryDocument {
  id: string
  fileName: string
  fileType: string
  content: string
  size: number
  category: string
  createdAt: string
  updatedAt: string
}

// ── Prompt Presets ──
export interface PromptPreset {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

// ── API Tokens ──
export interface ApiToken {
  id: string
  name: string
  prefix: string
  lastUsedAt?: string | null
  createdAt: string
}

// ── Generated Images ──
export interface GeneratedImage {
  id: string
  prompt: string
  model: string
  url: string
  messageId?: string | null
  createdAt: string
}

// ── Designs (Studio) ──
export interface Design {
  id: string
  title: string
  w: number
  h: number
  data: DesignData
  thumbnail?: string | null
  isTemplate: boolean
  shareToken?: string | null
  createdAt: string
  updatedAt: string
}

export interface DesignData {
  canvasW: number
  canvasH: number
  pages: DesignPage[]
}

export interface DesignPage {
  id: string
  name: string
  elements: DesignElement[]
  bg?: string
  bgGrad?: string
  bgPattern?: string
}

export interface DesignElement {
  id: string
  type: string
  x: number
  y: number
  w: number
  h: number
  fill?: string
  text?: string
  fontSize?: number
  fontFamily?: string
  rotation?: number
  [key: string]: unknown
}

export interface DesignVersion {
  id: string
  title: string
  data: DesignData
  thumbnail?: string | null
  createdAt: string
}

export interface DesignComment {
  id: string
  author: string
  body: string
  resolved: boolean
  isOwner: boolean
  createdAt: string
}

export interface DesignPayload {
  title: string
  w: number
  h: number
  data: DesignData
  thumbnail?: string | null
  isTemplate?: boolean
}

export interface BrandKit {
  colors: string[]
  fonts: string[]
  logoUrl?: string | null
}

// ── Workflows ──
export interface Workflow {
  id: string
  name: string
  description?: string
  steps: WorkflowStep[]
  createdAt: string
  updatedAt: string
}

export interface WorkflowStep {
  id: string
  type: string
  config: Record<string, unknown>
  [key: string]: unknown
}

// ── Plugins ──
export interface Plugin {
  id: string
  name: string
  description: string
  parameters: Record<string, unknown>
  code: string
  createdAt: string
  updatedAt: string
}

// ── Webhooks ──
export interface Webhook {
  id: string
  url: string
  events: string[]
  active: boolean
  createdAt: string
}

// ── MCP Servers ──
export interface McpServer {
  name: string
  command: string
  args: string[]
  status?: 'running' | 'stopped' | 'error'
}

// ── Health ──
export interface HealthStatus {
  status: string
  service: string
  version: string
  uptime?: number
  database?: string
}

// ── Analytics ──
export interface ToolUsage {
  tool: string
  count: number
  lastUsed?: string
}

export interface CacheStats {
  hits: number
  misses: number
  size: number
}

// ── AI Agents ──
export interface AiAgent {
  id: string
  name: string
  description: string
  systemPrompt: string
  model: string
  tools: string[]
  knowledge: string[]
  settings?: Record<string, unknown> | null
  isPublished: boolean
  createdAt: string
  updatedAt: string
}

export interface AgentTemplate {
  id: string
  name: string
  description: string
  systemPrompt: string
  model: string
  tools: string[]
}

// ── Payments ──
export interface PlanInfo {
  id: string
  name: string
  price: number
  currency: string
  features: string[]
  messagesLimit: number
  imageLimit?: number
  searchLimit?: number
  studioLimit?: number
}

export interface PaymentStatus {
  plan: Plan
  activatedAt?: string
  expiresAt?: string
  lastChargeId?: string
}

// ── Admin ──
export interface DailyMetric {
  date: string
  totalUsers: number
  activeUsers: number
  newSignups: number
  messagesSent: number
  revenue: number
  churnRate: number
}

// ── Stream Events (SSE) ──
export interface StreamChunk {
  chunk?: string
  conversationId?: string
  done?: boolean
  failed?: boolean
  title?: string
  error?: string
  model?: string
  tool?: string
  reasoning?: string
  imageRequest?: boolean
  prompt?: string
}

// ── API Response Wrappers ──
export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  cursor?: string
  hasMore: boolean
}

export interface ApiError {
  error: string
  message?: string
  statusCode?: number
}
