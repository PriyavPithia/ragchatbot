'use client'

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useAuth } from '../components/AuthProvider';

const supabase = createClientComponentClient();

export function ApiKey({ onProviderChange }: { onProviderChange: (provider: 'gemini' | 'openai') => void }) {
  const [apiKey, setLocalApiKey] = useState('');
  const [message, setMessage] = useState('');
  const { user, apiKey: contextApiKey, setApiKey } = useAuth();
  const [existingKeyId, setExistingKeyId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'gemini' | 'openai'>('gemini');

  const fetchApiKey = async () => {
    if (!user) {
      setMessage('User not authenticated');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, gemini_key, openai_key, selected_provider')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSelectedProvider(data.selected_provider as 'gemini' | 'openai' || 'gemini');
        setLocalApiKey(data[`${data.selected_provider}_key` as 'gemini_key' | 'openai_key'] || '');
        setExistingKeyId(data.id);
        setMessage('API Key loaded from database');
      } else {
        setMessage('No API Key found');
      }
    } catch (error: any) {
      console.error('Error fetching API key:', error);
      setMessage(`Error fetching API Key: ${error.message}`);
    }
  };

  useEffect(() => {
    if (user) {
      fetchApiKey();
    }
  }, [user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setMessage('User not authenticated');
      return;
    }

    try {
      let result;
      const keyData = {
        [`${selectedProvider}_key`]: apiKey,
        selected_provider: selectedProvider
      };

      if (existingKeyId) {
        result = await supabase
          .from('api_keys')
          .update(keyData)
          .eq('id', existingKeyId)
          .eq('user_id', user.id)
          .select();
      } else {
        result = await supabase
          .from('api_keys')
          .insert({ user_id: user.id, ...keyData })
          .select();
      }

      const { data, error } = result;
      if (error) throw error;

      setMessage('API Key saved successfully');
      if (data && data[0]) {
        setExistingKeyId(data[0].id);
        setApiKey(apiKey);
        localStorage.setItem(`${selectedProvider}ApiKey`, apiKey);
        onProviderChange(selectedProvider); // Update the provider in the parent component
      }
    } catch (error: any) {
      console.error('Error saving API key:', error);
      setMessage(`Error saving API Key: ${error.message}`);
    }
  };

  return (
    <div className="p-4 h-full md:p-4 pt-[120px] md:pt-4">
      <h2 className="text-lg font-semibold mb-4">API Key</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <RadioGroup
          value={selectedProvider}
          onValueChange={(value) => setSelectedProvider(value as 'gemini' | 'openai')}
          className="flex space-x-4 mb-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="gemini" id="gemini" />
            <Label htmlFor="gemini">Gemini</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="openai" id="openai" />
            <Label htmlFor="openai">OpenAI</Label>
          </div>
        </RadioGroup>
        <Input
          type="password"
          placeholder={`Enter your ${selectedProvider === 'gemini' ? 'Gemini' : 'OpenAI'} API key`}
          value={apiKey}
          onChange={(e) => setLocalApiKey(e.target.value)}
          className="focus-visible:ring-transparent text-base md:text-sm"
        />
        <Button type="submit">Save API Key</Button>
      </form>
      {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
      {apiKey && <p className="mt-4 text-sm">Current API Key: {apiKey.substring(0, 5)}...</p>}
    </div>
  );
}
