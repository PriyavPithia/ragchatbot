"use client";

import * as React from 'react'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { Send, Copy, RefreshCw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MobileSidebar } from '../components/MobileSidebar'
import { Sidebar } from '../components/Sidebar'
import { KnowledgeBase } from '../components/KnowledgeBase'
import { ApiKey } from '../components/ApiKey'
import ReactMarkdown from 'react-markdown'
import { useState, useCallback, useRef } from 'react'
import { LoadingDots } from '@/components/LoadingDots'
import { GoogleGenerativeAI, GenerativeModel, ChatSession } from "@google/generative-ai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

const MODEL_NAME = "gemini-1.0-pro";

// Define a type for the message
type Message = {
  role: string;
  content: string;
  id?: string;
  chat_id?: string;
};

export default function Home() {
  const { user, isLoading: authLoading, apiKey, setApiKey } = useAuth()
  const router = useRouter()
  const supabase = createClientComponentClient()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth')
    }
  }, [user, authLoading, router])

  if (authLoading) {
    return <div className="flex items-center justify-center h-screen"><LoadingDots /></div>
  }

  if (!user) {
    return null // or a loading indicator
  }

  const [isMobile, setIsMobile] = useState(false)
  const [activeTab, setActiveTab] = useState('chat')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', content: 'Hello! How can I assist you today?' },
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [regeneratingIndexes, setRegeneratingIndexes] = useState<Set<number>>(new Set())
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [activeKnowledgeBase, setActiveKnowledgeBase] = useState<string | null>(null);
  const [chats, setChats] = useState<{ id: string; name: string }[]>([]);

  const [geminiChat, setGeminiChat] = useState<ChatSession | null>(null);

  const [message, setMessage] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)

    const storedActiveKB = localStorage.getItem('activeKnowledgeBase');
    if (storedActiveKB) {
      setActiveKnowledgeBase(storedActiveKB);
    }

    // Load API key from localStorage if it exists
    const storedApiKey = localStorage.getItem('geminiApiKey');
    if (storedApiKey) {
      setApiKey(storedApiKey);
    }

    // Fetch the user's chats
    if (user) {
      fetchChats();
    }

    return () => window.removeEventListener('resize', checkMobile)
  }, [user, setApiKey]);

  useEffect(() => {
    if (activeChat) {
      fetchMessages(activeChat);
    }
  }, [activeChat]);

  const fetchChats = async () => {
    if (user) {
      try {
        const { data, error } = await supabase
          .from('chats')
          .select('id, name')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        setChats(data || []);
        if (data && data.length > 0) {
          setActiveChat(data[0].id);
        } else {
          setActiveChat(null);
        }
      } catch (error) {
        console.error('Error fetching chats:', error);
      }
    }
  };

  const fetchMessages = async (chatId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }

      setMessages(data || []);
    } catch (error) {
      console.error('Error in fetchMessages:', error);
    }
  };

  const handleSetActiveChat = async (chatId: string) => {
    setActiveChat(chatId);
  };

  const fetchApiKey = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('key')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      if (data && data.key) {
        setApiKey(data.key);
        localStorage.setItem('geminiApiKey', data.key);
      }
    } catch (error) {
      console.error('Error fetching API key:', error);
    }
  };

  const generateResponse = async (prompt: string) => {
    console.log('Generating response...');
    console.log('API Key:', apiKey ? 'Set' : 'Not set');

    if (!apiKey) {
      console.error('API key is not set');
      throw new Error('API key is not set. Please add your API key in the settings.')
    }

    let context = "No specific context available.";
    if (activeKnowledgeBase) {
      try {
        console.log('Fetching knowledge base content...');
        const { data: knowledgebaseData, error: knowledgebaseError } = await supabase
          .from('knowledgebases')
          .select('content')
          .eq('id', activeKnowledgeBase)
          .single();

        if (knowledgebaseError) throw knowledgebaseError;

        if (knowledgebaseData && knowledgebaseData.content) {
          console.log('Knowledge base content fetched successfully');
          const text = knowledgebaseData.content;

          const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
          });
          const chunks = await splitter.createDocuments([text]);

          console.log('Creating embeddings...');
          const embeddings = new GoogleGenerativeAIEmbeddings({
            modelName: "embedding-001",
            apiKey: apiKey,
          });
          const vectorStore = await MemoryVectorStore.fromDocuments(chunks, embeddings);

          console.log('Performing similarity search...');
          const relevantDocs = await vectorStore.similaritySearch(prompt, 2);

          if (relevantDocs.length > 0) {
            context = relevantDocs.map(doc => doc.pageContent).join('\n\n');
            console.log('Context created from relevant documents');
          }
        }
      } catch (error) {
        console.error('Error processing knowledge base:', error);
      }
    }

    // Always initialize a new chat session
    console.log('Initializing Gemini chat...');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const chat = model.startChat({
      generationConfig: {
        maxOutputTokens: 2048,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
        },
      ],
    });
    setGeminiChat(chat);
    console.log('Gemini chat initialized');

    try {
      console.log('Sending message to Gemini...');
      const result = await chat.sendMessage(`Context: ${context}\n\nUser: ${prompt}`);
      const response = result.response;
      console.log('Response received from Gemini');
      return response.text();
    } catch (error) {
      console.error('Error generating response:', error);
      throw error;
    }
  }

  const handleSendMessage = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputMessage.trim() || !activeChat) return;
    if (!apiKey) {
      setMessages(prev => [...prev, { role: 'bot', content: 'Please set your API key in the settings before sending messages.' }]);
      return;
    }

    setIsLoading(true);
    const currentChatId = activeChat;
    const newUserMessage: Message = { role: 'user', content: inputMessage, chat_id: currentChatId };
    setMessages(prev => [...prev, newUserMessage]);
    setInputMessage('');

    try {
      console.log('Generating response for message:', inputMessage);
      const response = await generateResponse(inputMessage);
      console.log('Response generated successfully');
      const newBotMessage: Message = { role: 'bot', content: response, chat_id: currentChatId };
      
      // Update messages for the specific chat
      setMessages(prev => {
        const updatedMessages = prev.filter(msg => msg.chat_id !== currentChatId);
        return [...updatedMessages, newUserMessage, newBotMessage].sort((a, b) => 
          (a.chat_id === b.chat_id) ? 0 : (a.chat_id === currentChatId ? -1 : 1)
        );
      });
      
      // Save both messages to the database
      console.log('Saving messages to database...');
      const { data, error } = await supabase
        .from('messages')
        .insert([newUserMessage, newBotMessage]);

      if (error) {
        console.error('Error saving messages to database:', error);
        throw error;
      }

      console.log('Messages saved successfully', data);
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      setMessages(prev => [
        ...prev, 
        { role: 'bot', content: 'Sorry, I encountered an error. Please check your API key and try again.', chat_id: currentChatId }
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [inputMessage, activeChat, apiKey, generateResponse]);

  // ... rest of the component code (handleNewChat, handleDeleteChat, copyToClipboard, regenerateResponse, handleRenameChat, renderTabContent)

  return (
    <div className="flex h-screen bg-background">
      {!isMobile && (
        <div className="w-64 border-r">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            activeChat={activeChat}
            setActiveChat={handleSetActiveChat}
            chats={chats}
            onDeleteChat={handleDeleteChat}
            onNewChat={handleNewChat}
            onRenameChat={handleRenameChat}
            message={message}
          />
        </div>
      )}
      <div className="flex flex-col flex-1">
        <header className="flex items-center justify-between px-4 h-16 border-b">
          <h1 className="text-xl font-bold">AI Chatbot</h1>
          <MobileSidebar 
            activeTab={activeTab} 
            setActiveTab={setActiveTab}
            activeChat={activeChat}
            setActiveChat={handleSetActiveChat}
            chats={chats}
            onDeleteChat={handleDeleteChat}
            onNewChat={handleNewChat}
            onRenameChat={handleRenameChat}
          />
        </header>
        <main className="flex-1 overflow-hidden">
          {renderTabContent()}
        </main>
        {activeTab === 'chat' && chats.length > 0 && activeChat && (
          <footer className="p-2 sm:p-4 border-t">
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <Input
                name="message"
                placeholder="Type your message..."
                className="flex-1 focus-visible:ring-0 focus-visible:ring-transparent focus:outline-none focus:ring-0 focus:ring-offset-0 text-xs [--tw-ring-offset-width:0px]"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                disabled={isLoading}
                autoComplete="off"
              />
              <Button type="submit" disabled={isLoading} className="px-2 py-1 sm:px-3 sm:py-2 text-xs">
                <Send className="h-4 w-4" />
                <span className="sr-only">Send</span>
              </Button>
            </form>
          </footer>
        )}
      </div>
    </div>
  );
}
