"use client";

import * as React from 'react'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { Send, Copy, RefreshCw, Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MobileSidebar } from '../components/MobileSidebar'
import { Sidebar } from '../components/Sidebar'
import { KnowledgeBase } from '../components/KnowledgeBase'
import { ApiKey } from '../components/ApiKey'
import ReactMarkdown from 'react-markdown'
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

  const [isMobile, setIsMobile] = useState(false)
  const [activeTab, setActiveTab] = useState('chat')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', content: 'Hello! How can I assist you today?' },
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [regeneratingIndexes, setRegeneratingIndexes] = useState<Set<number>>(new Set())
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [activeKnowledgeBase, setActiveKnowledgeBase] = useState<string | null>(null)
  const [chats, setChats] = useState<{ id: string; name: string }[]>([])
  const [geminiChat, setGeminiChat] = useState<ChatSession | null>(null)
  const [message, setMessage] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const fetchChats = useCallback(async () => {
    if (user) {
      try {
        console.log('Fetching chats for user:', user.id)
        const { data, error } = await supabase
          .from('chats')
          .select('id, name')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;

        console.log('Fetched chats:', data)
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
  }, [user, supabase]);

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

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/auth')
      } else {
        fetchChats()
      }
    }
  }, [user, authLoading, router, fetchChats])

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)

    const storedActiveKB = localStorage.getItem('activeKnowledgeBase');
    if (storedActiveKB) {
      setActiveKnowledgeBase(storedActiveKB);
    }

    const storedApiKey = localStorage.getItem('geminiApiKey');
    if (storedApiKey) {
      setApiKey(storedApiKey);
    }

    return () => window.removeEventListener('resize', checkMobile)
  }, [setApiKey]);

  useEffect(() => {
    if (activeChat) {
      fetchMessages(activeChat);
    }
  }, [activeChat, fetchMessages]);

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
      
     
      setMessages(prev => {
        const updatedMessages = prev.filter(msg => msg.chat_id !== currentChatId);
        return [...updatedMessages, newUserMessage, newBotMessage].sort((a, b) => 
          (a.chat_id === b.chat_id) ? 0 : (a.chat_id === currentChatId ? -1 : 1)
        );
      });
      
    
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
  }, [inputMessage, activeChat, apiKey, generateResponse, supabase]);

  const handleNewChat = async () => {
    console.log('handleNewChat called in Home component');
    if (!user) {
      console.log('No user found, cannot create new chat');
      return;
    }

    const newChatName = `New Chat ${chats.length + 1}`;
    try {
      console.log('Creating new chat:', newChatName);
      const { data, error } = await supabase
        .from('chats')
        .insert({ user_id: user.id, name: newChatName })
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      if (!data) {
        console.error('No data returned from insert operation');
        throw new Error('No data returned from insert operation');
      }

      console.log('New chat created:', data);
      setChats(prevChats => [data, ...prevChats]);
      setActiveChat(data.id);
      setActiveTab('chat');
      setMessages([]); 
      setGeminiChat(null);
    } catch (error) {
      console.error('Error creating new chat:', error);
      setMessage('Failed to create a new chat. Please try again.');
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatId);

      if (error) throw error;

      setChats((prevChats) => {
        const updatedChats = prevChats.filter((chat) => chat.id !== chatId);
        if (updatedChats.length === 0) {
          setActiveChat(null);
        } else if (activeChat === chatId) {
          setActiveChat(updatedChats[0].id);
          fetchMessages(updatedChats[0].id);
        }
        return updatedChats;
      });
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  };

  const handleRenameChat = async (chatId: string, newName: string) => {
    try {
      const { data, error } = await supabase
        .from('chats')
        .update({ name: newName })
        .eq('id', chatId)
        .select()
        .single();

      if (error) throw error;

      setChats(prevChats => 
        prevChats.map(chat => 
          chat.id === chatId ? { ...chat, name: newName } : chat
        )
      );
    } catch (error) {
      console.error('Error renaming chat:', error);
    }
  };

  const copyToClipboard = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const regenerateResponse = async (index: number) => {
    if (!activeChat) return;
    setRegeneratingIndexes(prev => new Set(prev).add(index));
    const userMessage = messages[index - 1].content;

    try {
      const response = await generateResponse(userMessage);
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[index] = { ...newMessages[index], content: response, id: newMessages[index].id };
        return newMessages;
      });


      if (messages[index].id) {
        await supabase.from('messages').update({
          content: response
        }).eq('chat_id', activeChat).eq('id', messages[index].id);
      }

    } catch (error) {
      console.error('Error regenerating response:', error);
    } finally {
      setRegeneratingIndexes(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'chat':
        return (
          <ScrollArea className="h-[90vh] p-4"> {/* Changed to 90vh for mobile */}
            {messages
              .filter(message => message.chat_id === activeChat)
              .map((message, index) => (
                <div
                  key={index}
                  className={`mb-6 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground ml-auto'
                      : 'chatbot-message mr-auto'
                  } max-w-[80%]`}
                >
                  <div className={`markdown-content text-base p-4 pb-2 ${  
                    message.role === 'user' ? 'text-primary-foreground pt-2' : ''
                  }`}>
                    <ReactMarkdown
                      components={{
                        p: ({ node, ...props }) => <p className="mb-2" {...props} />,
                        ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-3" {...props} />,
                        ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-3" {...props} />,
                        li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  {message.role === 'bot' && (
                    <div className="flex justify-end space-x-2 p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(message.content, index)}
                        className="h-10 w-10" // Increased size
                      >
                        {copiedIndex === index ? (
                          <Check className="h-5 w-5" /> // Increased icon size
                        ) : (
                          <Copy className="h-5 w-5" /> // Increased icon size
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => regenerateResponse(index)}
                        className="h-10 w-10" // Increased size
                        disabled={regeneratingIndexes.has(index)}
                      >
                        <RefreshCw className={`h-5 w-5 ${regeneratingIndexes.has(index) ? 'animate-spin' : ''}`} /> // Increased icon size
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            {isLoading && messages.filter(message => message.chat_id === activeChat).length > 0 && (
              <div className="mb-4 p-3 rounded-lg chatbot-message max-w-[80%] mr-auto">
                <LoadingDots />
              </div>
            )}
            <div ref={messagesEndRef} />
          </ScrollArea>
        );
      case 'knowledgebase':
        return <KnowledgeBase />;
      case 'apikey':
        return <ApiKey />;
      default:
        return null;
    }
  };

  if (authLoading) {
    return <div className="flex items-center justify-center h-screen"><LoadingDots /></div>
  }

  if (!user) {
    return null 
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between px-4 h-16 border-b">
        <h1 className="text-2xl font-bold">AI Chatbot</h1>
        <div className="flex items-center">
          {activeTab === 'chat' && (
            <Button
              variant="outline"
              size="default"
              className="mr-2 text-base"
              onClick={handleNewChat}
            >
              <Plus size={18} className="mr-2" />
              New Chat
            </Button>
          )}
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
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
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
          <main className="flex-1 overflow-hidden">
            {renderTabContent()}
          </main>
          {activeTab === 'chat' && chats.length > 0 && activeChat && (
            <footer className="p-2 sm:p-4 border-t">
              <form onSubmit={handleSendMessage} className="flex space-x-2">
                <Input
                  name="message"
                  placeholder="Type your message..."
                  className="flex-1 focus-visible:ring-0 focus-visible:ring-transparent focus:outline-none focus:ring-0 focus:ring-offset-0 text-base [--tw-ring-offset-width:0px]"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  disabled={isLoading}
                  autoComplete="off"
                />
                <Button type="submit" disabled={isLoading} className="px-4 py-2 text-base">
                  <Send className="h-5 w-5 mr-2" />
                  Send
                </Button>
              </form>
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}
