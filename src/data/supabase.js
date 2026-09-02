import { createClient } from '@supabase/supabase-js'
import { trackSupabaseFetch } from './loadingTracker.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

trackSupabaseFetch(supabaseUrl)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
