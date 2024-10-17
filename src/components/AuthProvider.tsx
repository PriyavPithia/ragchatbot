'use client'

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const supabase = createClientComponentClient()

type AuthContextType = {
  user: User | null
  session: Session | null
  signOut: () => Promise<void>
  apiKey: string
  setApiKey: (key: string) => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  session: null, 
  signOut: async () => {}, 
  apiKey: '',
  setApiKey: () => {},
  isLoading: true
})

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [apiKey, setApiKey] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      console.log('Initial session:', session)
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)

      if (session) {
        router.push('/')
      }
    }

    initializeAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session)
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)

      if (event === 'SIGNED_IN') {
        router.push('/')
      } else if (event === 'SIGNED_OUT') {
        setApiKey('')
        localStorage.removeItem('geminiApiKey')
        router.push('/auth')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setApiKey('');
    localStorage.removeItem('geminiApiKey');
    router.push('/auth');
  }

  return (
    <AuthContext.Provider value={{ user, session, signOut, apiKey, setApiKey, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
