import React from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/lib/supabaseClient';

export function AuthForm() {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '';

  return (
    <div>
      <Auth
        supabaseClient={supabase}
        appearance={{ theme: ThemeSupa }}
        theme="dark"
        providers={['google']}
        redirectTo={redirectTo}
        view="sign_in"
        showLinks={false}
        socialLayout="horizontal"
      />
    </div>
  );
}
