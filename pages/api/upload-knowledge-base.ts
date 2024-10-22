import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import pdfParse from 'pdf-parse';

export const config = {
  api: {
    bodyParser: false,
  },
};

let supabase: any;

try {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Key is missing');
  }

  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('Supabase client initialized successfully');
} catch (error) {
  console.error('Error initializing Supabase client:', error);
}

async function extractTextFromFile(file: formidable.File): Promise<string> {
  const buffer = await fs.promises.readFile(file.filepath);
  
  if (file.mimetype === 'application/pdf') {
    const pdfData = await pdfParse(buffer);
    return pdfData.text;
  } else {
    // Assume it's a text file
    return buffer.toString('utf-8');
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('Upload handler started');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    console.error('Supabase client not initialized. Check your environment variables.');
    return res.status(500).json({ error: 'Supabase client not initialized', details: 'Check server logs for more information' });
  }

  console.log('Parsing form data');
  const form = formidable({
    maxFileSize: 100 * 1024 * 1024, // 100 MB in bytes
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    console.log('Form parse started');
    if (err) {
      console.error('Error parsing form:', err);
      return res.status(500).json({ error: 'Error parsing form data', details: err.message });
    }

    console.log('Form parsed successfully');
    console.log('Fields:', fields);
    console.log('Files:', files);

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      console.log('Extracting file content');
      const content = await extractTextFromFile(file);
      console.log('File content extracted successfully');
      
      const userId = Array.isArray(fields.userId) ? fields.userId[0] : fields.userId;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      console.log('Inserting into Supabase');
      const { data, error } = await supabase
        .from('knowledgebases')
        .insert({
          user_id: userId,
          name: file.originalFilename || 'Unnamed File',
          content: content,
        })
        .select();

      if (error) {
        console.error('Supabase insert error:', error);
        throw error;
      }

      console.log('File uploaded successfully');
      await fs.promises.unlink(file.filepath); // Delete the temporary file

      res.status(200).json({ message: 'File uploaded successfully', data });
    } catch (error: any) {
      console.error('Error processing file:', error);
      res.status(500).json({ error: 'Error processing file', details: error.message, stack: error.stack });
    }
  });
}
