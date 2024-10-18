import React, { useState, useEffect } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './AuthProvider';

export function KnowledgeBase() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ id: string; name: string; content: string }[]>([]);
  const [activeKnowledgeBase, setActiveKnowledgeBase] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const { user } = useAuth();

  const fetchUploadedFiles = async () => {
    try {
      const { data, error } = await supabase
        .from('knowledgebases')
        .select('id, name, content')
        .eq('user_id', user?.id);

      if (error) throw error;

      if (data) {
        setUploadedFiles(data);
        setMessage('Knowledge bases loaded');
      } else {
        setMessage('No knowledge bases found');
      }
    } catch (error: any) {
      console.error('Error fetching knowledge bases:', error);
      setMessage(`Error loading knowledge bases: ${error.message}`);
    }
  };

  const fetchActiveKnowledgeBase = async () => {
    const storedActiveKB = localStorage.getItem('activeKnowledgeBase');
    if (storedActiveKB) {
      setActiveKnowledgeBase(storedActiveKB);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUploadedFiles();
      fetchActiveKnowledgeBase();
    } else {
      setMessage('Please log in to manage knowledge bases');
    }
  }, [user]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) {
      setMessage('No file selected or user not authenticated');
      return;
    }

    setIsUploading(true);
    setMessage('Uploading file...');

    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File size exceeds 10MB limit');
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user.id);

      const response = await fetch('/api/upload-knowledge-base', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload file');
      }

      const result = await response.json();

      setMessage(`File ${result.isUpdate ? 'updated' : 'uploaded'} successfully`);
      
      // If it's a new knowledge base or an update, set it as active and load its content
      if (result.newKnowledgeBaseId || result.updatedKnowledgeBaseId) {
        const newActiveId = result.newKnowledgeBaseId || result.updatedKnowledgeBaseId;
        await setAsActiveKnowledgeBase(newActiveId);
      }

      await fetchUploadedFiles();
    } catch (error: any) {
      console.error('Error processing file:', error);
      setMessage(`Error uploading file: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = async (fileId: string) => {
    setMessage('Removing file...');
    try {
      const { error: dbError } = await supabase
        .from('knowledgebases')
        .delete()
        .eq('id', fileId);

      if (dbError) {
        throw new Error(`Error removing knowledgebase entry: ${dbError.message}`);
      }

      setMessage('File removed successfully');
      await fetchUploadedFiles();

      // If the removed file was the active knowledge base, clear it
      if (activeKnowledgeBase === fileId) {
        setActiveKnowledgeBase(null);
        localStorage.removeItem('activeKnowledgeBase');
      }
    } catch (error: any) {
      console.error('Error removing file:', error);
      setMessage(`Error removing file: ${error.message}`);
    }
  };

  const setAsActiveKnowledgeBase = async (fileId: string) => {
    setMessage('Setting active knowledge base...');
    try {
      setActiveKnowledgeBase(fileId);
      localStorage.setItem('activeKnowledgeBase', fileId);

      // Fetch the content of the active knowledge base
      const { data, error } = await supabase
        .from('knowledgebases')
        .select('content')
        .eq('id', fileId)
        .single();

      if (error) throw error;

      if (data) {
        // Store the content in localStorage for immediate access
        localStorage.setItem('activeKnowledgeBaseContent', data.content);
        
        // Dispatch a custom event to notify the Home component
        const event = new CustomEvent('activeKnowledgeBaseChanged', { 
          detail: { content: data.content, id: fileId }
        });
        window.dispatchEvent(event);

        setMessage('Active knowledge base set and loaded');
      }
    } catch (error) {
      console.error('Error setting active knowledge base:', error);
      setMessage('Error setting active knowledge base');
    }
  };

  return (
    <div className="w-full p-4 md:p-4 pt-[120px] mb-[110px]  md:pt-4"> {/* Adjusted padding for mobile and desktop */}
      <h2 className="text-2xl font-bold mb-4">Knowledge Base</h2>
      <p className="text-muted-foreground mb-6">Upload and manage your knowledge base files</p>
      
      <div className="space-y-6">
        <div className="flex items-center justify-center w-full">
          <Label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-secondary hover:bg-secondary/80">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {isUploading ? (
                <div className="mb-4">Uploading...</div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mb-4 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">TXT or PDF (MAX. 10MB)</p>
                </>
              )}
            </div>
            <Input id="dropzone-file" type="file" className="hidden focus-visible:ring-transparent" onChange={handleFileUpload} disabled={isUploading} accept=".txt,.pdf" />
          </Label>
        </div>
        
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
        
        {uploadedFiles.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Uploaded Files:</h3>
            <RadioGroup value={activeKnowledgeBase || ''} onValueChange={setAsActiveKnowledgeBase} className="space-y-2">
              {uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between py-2 px-4 bg-secondary rounded-lg">
                  <div className="flex items-center">
                    <RadioGroupItem value={file.id} id={file.id} />
                    <Label htmlFor={file.id} className="ml-2">
                      {file.name}
                    </Label>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removeFile(file.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </RadioGroup>
          </div>
        )}
        
        {activeKnowledgeBase && (
          <p className="text-sm text-muted-foreground mb-8">
            Active Knowledge Base: {uploadedFiles.find(f => f.id === activeKnowledgeBase)?.name}
          </p>
        )}
      </div>
    </div>
  );
}
