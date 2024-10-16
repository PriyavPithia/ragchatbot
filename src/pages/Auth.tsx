import React from 'react';
import { SignIn } from '@/components/SignIn';
import { SignUp } from '@/components/SignUp';

export function Auth() {
  return (
    <div>
      <SignIn />
      <SignUp />
    </div>
  );
}
