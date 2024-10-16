import { supabase } from './supabaseClient';

// Function to add a new API key
export const addApiKey = async (key: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error('No user logged in');

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: user.id,
        key: key
      });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding API key:', error);
    throw error;
  }
};

// Function to get all API keys for the current user
export const getApiKeys = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error('No user logged in');

    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', user.id);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching API keys:', error);
    throw error;
  }
};

// Function to delete an API key
export const deleteApiKey = async (id: string) => {
  try {
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting API key:', error);
    throw error;
  }
};
