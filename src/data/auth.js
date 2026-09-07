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
  return useRoleFlag(userId, 'is_admin')
}

// A viewer reads everything and writes nothing — see sql/viewer_role.sql. The
// same caveat as above applies twice over: this hides controls, the RLS
// policies are what refuse the write.
//
// Viewer and admin are one column in sp_user_role, so they can never both be
// true and no caller has to resolve a conflict between them.
export function useIsViewer(userId) {
  return useRoleFlag(userId, 'is_viewer')
}

// Both roles are a boolean RPC answering about the current user, so they differ
// only in which function is called.
function useRoleFlag(userId, rpcName) {
  const [flag, setFlag] = useState(false)

  useEffect(() => {
    if (!userId) {
      setFlag(false)
      return
    }

    let cancelled = false
    supabase.rpc(rpcName).then(({ data, error }) => {
      if (!cancelled) setFlag(!error && data === true)
    })

    return () => {
      cancelled = true
    }
  }, [userId, rpcName])

  return flag
}
