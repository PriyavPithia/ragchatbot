import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { Fields, Files, IncomingForm } from 'formidable';
import fs from 'fs/promises';
import pdf from 'pdf-parse';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const supabase = createPagesServerClient({ req, res });

  const form = new IncomingForm();

  try {
    const [fields, files] = await new Promise<[Fields, Files]>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    const userId = Array.isArray(fields.userId) ? fields.userId[0] : fields.userId;

    if (!file || !userId) {
      return res.status(400).json({ error: 'Missing file or userId' });
    }

    let fileContent: string;

    if (file.mimetype === 'application/pdf') {
      const dataBuffer = await fs.readFile(file.filepath);
      const pdfData = await pdf(dataBuffer);
      fileContent = pdfData.text;
    } else {
      fileContent = await fs.readFile(file.filepath, 'utf8');
    }

    const { data: existingFile } = await supabase
      .from('knowledgebases')
      .select('id')
      .eq('user_id', userId)
      .eq('name', file.originalFilename)
      .single();

    let result;
    let newKnowledgeBaseId: string | null = null;

    if (existingFile) {
      result = await supabase
        .from('knowledgebases')
        .update({ content: fileContent })
        .eq('id', existingFile.id)
        .select();
    } else {
      result = await supabase
        .from('knowledgebases')
        .insert({
          user_id: userId,
          name: file.originalFilename,
          content: fileContent,
        })
        .select();
      
      if (result.data && result.data.length > 0) {
        newKnowledgeBaseId = result.data[0].id;
      }
    }

    if (result.error) {
      throw result.error;
    }

    res.status(200).json({ 
      success: true, 
      isUpdate: !!existingFile,
      newKnowledgeBaseId: newKnowledgeBaseId 
    });
  } catch (error: any) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: error.message });
  }
}
