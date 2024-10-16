import { supabase } from '../lib/supabaseClient';

const uploadKnowledgebase = async (file: File, name: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error('No user logged in');

    // Upload file to Storage
    const filePath = `knowledgebases/${user.id}/${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('your-bucket-name')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // Create record in knowledgebases table
    const { data, error } = await supabase
      .from('knowledgebases')
      .insert({
        user_id: user.id,
        file_path: filePath,
        name: name // If you decide to add the name column
      });

    if (error) throw error;
    console.log('Knowledgebase uploaded successfully', data);
    // Update UI or state to reflect the upload
  } catch (error) {
    console.error('Error uploading knowledgebase:', error);
    // Handle the error (e.g., show an error message to the user)
  }
};
