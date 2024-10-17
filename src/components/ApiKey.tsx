'use client'

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './AuthProvider';

export function ApiKey() {
  const [apiKey, setLocalApiKey] = useState('');
  const [message, setMessage] = useState('');
  const { user, apiKey: contextApiKey, setApiKey } = useAuth();
  const [existingKeyId, setExistingKeyId] = useState<string | null>(null);
  const [globalApiKey, setGlobalApiKey] = useState('');

  const fetchApiKey = async () => {
    if (!user) {
      setMessage('User not authenticated');
      return;
    }

    try {
      console.log('Fetching API key for user:', user.id);
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, key')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setApiKey(data.key);
        setExistingKeyId(data.id);
        setMessage('API Key loaded from database');
        console.log('API Key fetched successfully');
      } else {
        setMessage('No API Key found');
        console.log('No API Key found for user');
      }
    } catch (error: any) {
      console.error('Error fetching API key:', error);
      setMessage(`Error fetching API Key: ${error.message}`);
    }
  };

  useEffect(() => {
    if (user) {
      console.log('Current user ID:', user.id);
      setLocalApiKey(contextApiKey || globalApiKey);
      fetchApiKey();
    }
  }, [user, contextApiKey, globalApiKey]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setMessage('User not authenticated');
      return;
    }

    try {
      console.log('Current user:', JSON.stringify(user, null, 2));
      console.log('Attempting to save API key for user:', user.id);

      // Log the current RLS policies
      const { data: policies, error: policiesError } = await supabase.rpc('get_policies', { table_name: 'api_keys' });
      if (policiesError) {
        console.error('Error getting RLS policies:', policiesError);
      } else {
        console.log('RLS policies for api_keys table:', policies);
      }

      let result;
      if (existingKeyId) {
        console.log('Updating existing API key');
        result = await supabase
          .from('api_keys')
          .update({ key: apiKey })
          .eq('id', existingKeyId)
          .eq('user_id', user.id)
          .select();
      } else {
        console.log('Inserting new API key');
        result = await supabase
          .from('api_keys')
          .insert({ user_id: user.id, key: apiKey })
          .select();
      }

      const { data, error } = result;
      if (error) throw error;

      setMessage('API Key saved successfully');
      console.log('API Key saved successfully', data);
      if (data && data[0]) {
        setExistingKeyId(data[0].id);
        setApiKey(apiKey);
        setGlobalApiKey(apiKey);
        localStorage.setItem('geminiApiKey', apiKey);
      }
    } catch (error: any) {
      console.error('Error saving API key:', error);
      setMessage(`Error saving API Key: ${error.message}`);
      console.log('Full error object:', JSON.stringify(error, null, 2));

      // Log the current session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error('Error getting session:', sessionError);
      } else {
        console.log('Current session:', JSON.stringify(sessionData, null, 2));
      }
    }
  };

  return (
    <div className="p-4 h-full md:p-4 pt-[120px] md:pt-4"> {/* Adjusted padding for mobile and desktop */}
      <h2 className="text-lg font-semibold mb-4">API Key</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="password"
          placeholder="Enter your Gemini API key"
          value={apiKey}
          onChange={(e) => setLocalApiKey(e.target.value)}
          className="focus-visible:ring-transparent"
        />
        <Button type="submit">Save API Key</Button>
      </form>
      {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
      {apiKey && <p className="mt-4 text-sm">Current API Key: {apiKey.substring(0, 5)}...</p>}
    </div>
  );
}
