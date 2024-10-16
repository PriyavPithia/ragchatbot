import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation'
import { AuthForm } from '../src/components/AuthForm';
import { useAuth } from '../src/components/AuthProvider';
import { LoadingDots } from '@/components/LoadingDots';

export default function Auth() {
  const { user, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/')
    }
  }, [user, isLoading, router])

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen"><LoadingDots /></div>
  }

  if (user) {
    router.push('/')
    return null
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <AuthForm />
    </div>
  );
}
