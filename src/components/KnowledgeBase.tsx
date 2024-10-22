import React, { useState, useEffect } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from './AuthProvider';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB in bytes

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

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setMessage('Uploading file...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('userId', user?.id || '');

    try {
      console.log('Preparing to send file upload request');
      console.log('File name:', file.name);
      console.log('File size:', file.size);
      console.log('User ID:', user?.id);

      const response = await fetch('/api/upload-knowledge-base', {
        method: 'POST',
        body: formData,
      });

      console.log('Response received:', response.status, response.statusText);
      const contentType = response.headers.get("content-type");
      console.log('Response content type:', contentType);

      const responseText = await response.text();
      console.log('Response text:', responseText);

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Error parsing JSON:', parseError);
        throw new Error('Invalid JSON response from server');
      }

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      setMessage('File uploaded successfully');
      await fetchUploadedFiles();
    } catch (error) {
      console.error('Upload error:', error);
      setMessage(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        setMessage('File size exceeds the 100 MB limit.');
      } else if (file.type !== 'text/plain' && file.type !== 'application/pdf') {
        setMessage('Only .txt and .pdf files are allowed.');
      } else {
        handleFileUpload(file);
      }
    }
  };

  return (
    <div className="w-full p-4 md:p-4 pt-[120px] mb-[110px]  md:pt-4">
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
                  <p className="text-xs text-muted-foreground">TXT or PDF (MAX. 100MB)</p>
                </>
              )}
            </div>
            <Input 
              id="dropzone-file" 
              type="file" 
              className="hidden focus-visible:ring-transparent" 
              onChange={handleFileSelect} 
              disabled={isUploading} 
              accept=".txt,.pdf" 
            />
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
