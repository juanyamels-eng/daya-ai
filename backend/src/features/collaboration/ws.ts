import { Server as SocketServer, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { prisma } from '../../lib/prisma'
import { logger } from '../../services/logger'

const db = prisma as any

interface CursorPosition {
  userId: string
  userName: string
  color: string
  line: number
  ch: number
  selection?: { start: number; end: number }
}

interface CollaborationRoom {
  documentType: string
  documentId: string
  cursors: Map<string, CursorPosition>
  operations: Operation[]
}

interface Operation {
  type: 'insert' | 'delete' | 'replace'
  position: number
  content?: string
  length?: number
  userId: string
  timestamp: number
  version: number
}

// In-memory state (could be Redis for production)
const rooms = new Map<string, CollaborationRoom>()

const CURSOR_COLORS = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
]

let colorIndex = 0
function getNextColor(): string {
  const color = CURSOR_COLORS[colorIndex % CURSOR_COLORS.length]
  colorIndex++
  return color
}

export function setupCollaboration(io: SocketServer) {
  // Auth middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token
      if (!token) return next(new Error('Authentication required'))

      const decoded = jwt.verify(token as string, process.env.JWT_SECRET!) as { userId: string }
      const user = await db.user.findUnique({ where: { id: decoded.userId }, select: { id: true, name: true } })
      if (!user) return next(new Error('User not found'))

      ;(socket as any).userId = user.id
      ;(socket as any).userName = user.name
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId
    const userName = (socket as any).userName
    const userColor = getNextColor()

    logger.info(`[Collab] ${userName} connected (${socket.id})`)

    // Join a collaboration room
    socket.on('join', (documentType: string, documentId: string) => {
      const roomId = `${documentType}:${documentId}`
      socket.join(roomId)

      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          documentType,
          documentId,
          cursors: new Map(),
          operations: [],
        })
      }

      const room = rooms.get(roomId)!
      room.cursors.set(userId, {
        userId,
        userName,
        color: userColor,
        line: 0,
        ch: 0,
      })

      // Send current state to the new user
      socket.emit('state', {
        cursors: Array.from(room.cursors.values()),
        operations: room.operations.slice(-100), // Last 100 ops
      })

      // Notify others
      socket.to(roomId).emit('user:join', { userId, userName, color: userColor })

      logger.info(`[Collab] ${userName} joined ${roomId}`)
    })

    // Cursor movement
    socket.on('cursor', (data: { documentType: string; documentId: string; line: number; ch: number; selection?: { start: number; end: number } }) => {
      const roomId = `${data.documentType}:${data.documentId}`
      const room = rooms.get(roomId)
      if (!room) return

      const cursor = room.cursors.get(userId)
      if (cursor) {
        cursor.line = data.line
        cursor.ch = data.ch
        cursor.selection = data.selection
      }

      socket.to(roomId).emit('cursor', {
        userId,
        userName,
        color: userColor,
        line: data.line,
        ch: data.ch,
        selection: data.selection,
      })
    })

    // Text operations (CRDT-like)
    socket.on('operation', (data: { documentType: string; documentId: string; operation: Omit<Operation, 'userId' | 'timestamp'> }) => {
      const roomId = `${data.documentType}:${data.documentId}`
      const room = rooms.get(roomId)
      if (!room) return

      const op: Operation = {
        ...data.operation,
        userId,
        timestamp: Date.now(),
        version: room.operations.length,
      }

      room.operations.push(op)

      // Keep only last 1000 operations
      if (room.operations.length > 1000) {
        room.operations = room.operations.slice(-500)
      }

      // Broadcast to others
      socket.to(roomId).emit('operation', op)
    })

    // Selection update
    socket.on('selection', (data: { documentType: string; documentId: string; ranges: Array<{ start: number; end: number }> }) => {
      const roomId = `${data.documentType}:${data.documentId}`
      socket.to(roomId).emit('selection', {
        userId,
        userName,
        color: userColor,
        ranges: data.ranges,
      })
    })

    // Disconnect
    socket.on('disconnect', () => {
      // Remove from all rooms
      for (const [roomId, room] of rooms) {
        if (room.cursors.has(userId)) {
          room.cursors.delete(userId)
          io.to(roomId).emit('user:leave', { userId, userName })

          // Clean up empty rooms
          if (room.cursors.size === 0) {
            rooms.delete(roomId)
          }
        }
      }

      logger.info(`[Collab] ${userName} disconnected`)
    })
  })

  logger.info('[Collaboration] WebSocket server ready')
}
