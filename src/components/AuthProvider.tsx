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

  const loadApiKey = async (userId: string) => {
    try {
      const storedApiKey = localStorage.getItem('geminiApiKey')
      if (storedApiKey) {
        setApiKey(storedApiKey)
        return
      }

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

  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          setUser(session.user)
          setSession(session)
          await loadApiKey(session.user.id)
        }
      } catch (error) {
        console.error('Error during auth initialization:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initializeAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        setSession(session)
        if (event === 'SIGNED_IN') {
          if (session) {
            await loadApiKey(session.user.id)
            router.push('/')
          }
        } else if (event === 'SIGNED_OUT') {
          setApiKey('')
          localStorage.removeItem('geminiApiKey')
          router.push('/auth')
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [router])

  // Add a periodic check for authentication status
  useEffect(() => {
    const checkAuthStatus = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session && !isLoading) {
        console.log('User is authenticated, ensuring they are on the home page')
        router.push('/')
      }
    }

    const interval = setInterval(checkAuthStatus, 5000) // Check every 5 seconds

    return () => clearInterval(interval)
  }, [supabase.auth, router, isLoading])

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
