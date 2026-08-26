import 'express'

declare global {
  namespace Express {
    interface Request {
      userId: string
    }
    interface Response {
      flush?: () => void
    }
  }
}

export {}
