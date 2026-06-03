import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente service role (server-side). Inicializacion lazy: solo se crea al
// usarlo en runtime (rutas API), nunca en build / collect-page-data.
let _admin: SupabaseClient | null = null

function getAdmin(): SupabaseClient {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase admin no configurado: faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  _admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  return _admin
}

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getAdmin()
    const value = (client as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value
  },
})
