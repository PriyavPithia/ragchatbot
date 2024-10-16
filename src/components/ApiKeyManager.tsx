import React, { useState, useEffect } from 'react';
import { addApiKey, getApiKeys, deleteApiKey } from '../lib/apiKeys';

const ApiKeyManager: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [newKey, setNewKey] = useState('');

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      const keys = await getApiKeys();
      setApiKeys(keys);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    }
  };

  const handleAddKey = async () => {
    try {
      await addApiKey(newKey);
      setNewKey('');
      loadApiKeys();
    } catch (error) {
      console.error('Failed to add API key:', error);
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      await deleteApiKey(id);
      loadApiKeys();
    } catch (error) {
      console.error('Failed to delete API key:', error);
    }
  };

  return (
    <div>
      <h2>API Keys</h2>
      <input 
        type="text" 
        value={newKey} 
        onChange={(e) => setNewKey(e.target.value)} 
        placeholder="Enter new API key"
      />
      <button onClick={handleAddKey}>Add Key</button>
      <ul>
        {apiKeys.map((key) => (
          <li key={key.id}>
            {key.key} 
            <button onClick={() => handleDeleteKey(key.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ApiKeyManager;
