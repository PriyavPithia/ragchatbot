'use client'

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

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
  const supabase = createClientComponentClient()

  useEffect(() => {
    const initializeAuth = async () => {
      console.log('Initializing auth')
      setIsLoading(true)
      const { data: { session } } = await supabase.auth.getSession()
      console.log('Session:', session)
      if (session) {
        setUser(session.user)
        setSession(session)
        await loadApiKey(session.user.id)
        console.log('User authenticated, redirecting to home')
        router.push('/')
      } else {
        console.log('No session, redirecting to auth page')
        router.push('/auth')
      }
      setIsLoading(false)
    }

    initializeAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event)
        setIsLoading(true)
        setSession(session)
        setUser(session?.user ?? null)
        if (event === 'SIGNED_IN') {
          if (session) {
            await loadApiKey(session.user.id)
            console.log('User signed in, redirecting to home')
            router.push('/')
          }
        } else if (event === 'SIGNED_OUT') {
          setApiKey('')
          localStorage.removeItem('geminiApiKey')
          console.log('User signed out, redirecting to auth page')
          router.push('/auth')
        }
        setIsLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [router, supabase.auth])

  const loadApiKey = async (userId: string) => {
    try {
      // First, try to get the API key from localStorage
      const storedApiKey = localStorage.getItem('geminiApiKey')
      if (storedApiKey) {
        setApiKey(storedApiKey)
        return
      }

      // If not in localStorage, fetch from the database
      const { data, error } = await supabase
        .from('api_keys')
        .select('key')
        .eq('user_id', userId)
        .single()

      if (error) throw error

      if (data && data.key) {
        setApiKey(data.key)
        localStorage.setItem('geminiApiKey', data.key)
      }
    } catch (error) {
      console.error('Error loading API key:', error)
    }
  }

  const signOut = async () => {
    setIsLoading(true)
    await supabase.auth.signOut()
    setApiKey('')
    localStorage.removeItem('geminiApiKey')
    router.push('/auth')
    setIsLoading(false)
  }

  return (
    <AuthContext.Provider value={{ user, session, signOut, apiKey, setApiKey, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
