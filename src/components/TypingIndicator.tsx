import React from 'react';

export function TypingIndicator() {
  return (
    <div className="flex space-x-1 items-center justify-center w-8 h-4">
      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
    </div>
  );
}
