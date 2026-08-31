// ============================================
// Detección de BD real para tests de integración.
//
// Los tests que golpean PostgreSQL (user.test.ts, database.test.ts) solo deben
// ejecutarse cuando hay una DATABASE_URL real. Con la plantilla sin rellenar
// (placeholders `REGION`, `xxxxx`, `[PASSWORD]`…) se saltan en lugar de fallar,
// así que `pre-push` y CI no se rompen en máquinas sin Supabase.
//
// Reusa la misma lista de placeholders que config/validateEnv.ts para no tener
// dos criterios distintos sobre lo que es una URL válida.
// ============================================
import dotenv from 'dotenv'

dotenv.config()

const value = process.env.DATABASE_URL || ''
const PLACEHOLDERS = ['REGION', 'xxxxx', 'xxxxxxx', 'TU-', 'YOUR-', '[PASSWORD]']
const isPlaceholder = PLACEHOLDERS.some((p) => value.toUpperCase().includes(p))

export const DB_AVAILABLE = /^postgres(ql)?:\/\//.test(value) && value.trim() !== '' && !isPlaceholder
