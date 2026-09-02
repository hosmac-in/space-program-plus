// WHO IS SIGNED IN, AND ARE THEY AN ADMIN
// =======================================
//
// Two roles: everyone signed in can read the catalog and edit options; an admin
// can additionally create projects, groups and sections, and edit the tree
// itself.
//
// Admin is a row in `sp_user_role` (see sql/user_roles_setup.sql), read through
// the is_admin() database function. Nothing about who is an admin lives in this
// bundle.
//
//   >>> useIsAdmin() decides which BUTTONS are shown. It is not the security
//   >>> boundary. Enforcement is entirely in the database — the RLS policies
//   >>> and SECURITY DEFINER functions call the same is_admin(), so a tampered
//   >>> client can reveal controls but still cannot write anything.

import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

export function useSession() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))

    return () => subscription.unsubscribe()
  }, [])

  return { session, loading }
}

export function useIsAdmin(userId) {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false)
      return
    }

    let cancelled = false
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (!cancelled) setIsAdmin(!error && data === true)
    })

    return () => {
      cancelled = true
    }
  }, [userId])

  return isAdmin
}
