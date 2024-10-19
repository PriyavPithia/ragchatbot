"use client";

import * as React from 'react'
import { useEffect, useState, useCallback, useRef, useMemo, useReducer, memo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { Send, Copy, Check, ArrowDown, LogOut, Plus, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MobileSidebar } from '../components/MobileSidebar'
import { Sidebar } from '../components/Sidebar'
import { KnowledgeBase } from '../components/KnowledgeBase'
import { ApiKey } from '../components/ApiKey'
import ReactMarkdown from 'react-markdown'
import { LoadingDots } from '@/components/LoadingDots'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "langchain/document";
import { PromptTemplate } from "@langchain/core/prompts";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

const MODEL_NAME = "gemini-1.0-pro";
const EMBEDDING_MODEL_NAME = "embedding-001";

type Message = {
  role: string;
  content: string;
  id?: string;
  chat_id?: string;
  isLoading?: boolean;
};

// Define ChatSession type or use any if structure is unknown
type ChatSession = any;

type MessagesState = Message[];

type MessagesAction = 
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'UPDATE_LAST_MESSAGE'; payload: Message };

const messagesReducer = (state: MessagesState, action: MessagesAction): MessagesState => {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return [...state, action.payload];
    case 'SET_MESSAGES':
      return action.payload;
    case 'CLEAR_MESSAGES':
      return [];
    case 'UPDATE_LAST_MESSAGE':
      return state.map((message, index) => 
        index === state.length - 1 ? { ...message, ...action.payload, isLoading: false } : message
      );
    default:
      return state;
  }
};

const MemoizedMessage = memo(({ message, isLast, lastMessageRef, index, copyToClipboard, copiedIndex }: {
  message: Message;
  isLast: boolean;
  lastMessageRef?: React.RefObject<HTMLDivElement>;
  index: number;
  copyToClipboard: (content: string, index: number) => void;
  copiedIndex: number | null;
}) => {
  if (message.isLoading) {
    return (
      <div className="py-2 px-4 bg-secondary text-secondary-foreground rounded-lg max-w-[80%] mr-auto relative">
        <LoadingDots />
      </div>
    );
  }

  return (
    <div className={`mb-4 ${message.role === 'user' ? 'ml-auto text-right' : 'mr-auto'}`}>
      <div className={`rounded-lg ${
        message.role === 'user'
          ? 'bg-primary text-primary-foreground ml-auto inline-block max-w-[80%] py-2 px-3'
          : 'bg-secondary text-secondary-foreground w-full max-w-[80%] p-4'
      }`}>
        <ReactMarkdown
          components={{
            p: ({ node, ...props }) => <p className="mb-1 text-sm md:text-base" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 text-sm md:text-base" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 text-sm md:text-base" {...props} />,
            li: ({ node, ...props }) => <li className="mb-1 text-sm md:text-base" {...props} />,
          }}
        >
          {message.content}
        </ReactMarkdown>
        {message.role === 'bot' && (
          <div className="flex justify-start space-x-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(message.content, index)}
              className="h-9 w-9"
            >
              {copiedIndex === index ? (
                <Check className="h-5 w-5" />
              ) : (
                <Copy className="h-5 w-5" />
              )}
            </Button>
          </div>
        )}
      </div>
      {isLast && <div ref={lastMessageRef} style={{ height: '1px' }} />}
    </div>
  );
}, (prevProps, nextProps) => 
  prevProps.message.id === nextProps.message.id && 
  prevProps.isLast === nextProps.isLast &&
  prevProps.copiedIndex === nextProps.copiedIndex
);

MemoizedMessage.displayName = 'MemoizedMessage';

type ChatSessionProps = {
  chat: { id: string; name: string };
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
};

const MemoizedChatSession = memo(({ chat, isActive, onSelect, onDelete, onRename }: ChatSessionProps) => (
  <div className={`p-2 ${isActive ? 'bg-secondary' : ''}`}>
    <div>{chat.name}</div>
    <Button onClick={() => onSelect(chat.id)}>Select</Button>
    <Button onClick={() => onDelete(chat.id)}>Delete</Button>
    <Button onClick={() => onRename(chat.id, 'New Name')}>Rename</Button>
  </div>
));

MemoizedChatSession.displayName = 'MemoizedChatSession';

const AIResponseLoading = () => (
  <div className="py-2 px-4 bg-secondary text-secondary-foreground rounded-lg max-w-[80%] mr-auto relative">
    <LoadingDots />
  </div>
);

export default function Home() {
  const { user, isLoading: authLoading, apiKey, setApiKey } = useAuth()
  const router = useRouter()
  const supabase = createClientComponentClient()

  const [isMobile, setIsMobile] = useState(false)
  const [activeTab, setActiveTab] = useState('chat')
  const [messages, dispatchMessages] = useReducer(messagesReducer, [] as MessagesState);
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [activeKnowledgeBase, setActiveKnowledgeBase] = useState<string | null>(null)
  const [chats, setChats] = useState<{ id: string; name: string }[]>([])
  const [geminiChat, setGeminiChat] = useState<ChatSession | null>(null)
  const [message, setMessage] = useState('')
  const [activeKnowledgeBaseContent, setActiveKnowledgeBaseContent] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState<Set<string>>(new Set());
  const [shouldScroll, setShouldScroll] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | undefined>(undefined);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);

  const [globalApiKey, setGlobalApiKey] = useState('');
  const [globalKnowledgeBases, setGlobalKnowledgeBases] = useState<{ id: string; name: string; content: string }[]>([]);
  const [globalActiveKnowledgeBase, setGlobalActiveKnowledgeBase] = useState<string | null>(null);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Use useMemo to combine local and global messages
  const allMessages = useMemo(() => {
    return [...localMessages, ...messages.filter(m => m.chat_id === activeChat)];
  }, [localMessages, messages, activeChat]);

  const scrollToBottom = useCallback(() => {
    if (shouldScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setShouldScroll(false);
    }
  }, [shouldScroll]);

  const triggerScroll = useCallback(() => {
    setShouldScroll(true);
  }, []);

  const cosineSimilarity = (a: number[], b: number[]): number => {
    const dotProduct = a.reduce((sum, _, i) => sum + a[i] * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  };

  const vectorizeAndProcessKnowledgeBase = async (prompt: string): Promise<string> => {
    if (!apiKey) {
      throw new Error("API key is not set");
    }

    if (!activeKnowledgeBaseContent) {
      console.log("No active knowledge base content");
      return generateResponse(prompt);
    }

    console.log("Active Knowledge Base Content (first 500 chars):", activeKnowledgeBaseContent.substring(0, 500));

    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 100,
    });

    const chunks = await textSplitter.createDocuments([activeKnowledgeBaseContent]);
    console.log(`Number of chunks: ${chunks.length}`);

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: apiKey,
      modelName: EMBEDDING_MODEL_NAME,
    });

    const chunkEmbeddings = await embeddings.embedDocuments(chunks.map(chunk => chunk.pageContent));
    const promptEmbedding = await embeddings.embedQuery(prompt);

    const similarities = chunkEmbeddings.map(embedding => 
      cosineSimilarity(embedding, promptEmbedding)
    );

    const mostSimilarIndex = similarities.indexOf(Math.max(...similarities));
    const mostSimilarChunk = chunks[mostSimilarIndex].pageContent;
    const highestSimilarity = similarities[mostSimilarIndex];

    console.log("Most similar chunk:", mostSimilarChunk);
    console.log("Highest similarity score:", highestSimilarity);

    const similarityThreshold = 0.3;

    let fullPrompt: string;

    if (highestSimilarity >= similarityThreshold) {
      fullPrompt = `You are an intelligent AI assistant. Use the following context to answer the user's question in detail. If the context is relevant, base your answer on it. If it's not relevant, clearly state that the context doesn't contain relevant information and then try to answer based on your general knowledge.

Context:
${mostSimilarChunk}

User's question: ${prompt}

Your response:`;
    } else {
      fullPrompt = `You are an intelligent AI assistant. The knowledge base doesn't contain relevant information to answer the following question. Please clearly state this and then try to answer based on your general knowledge.

User's question: ${prompt}

Your response:`;
    }

    return generateResponse(fullPrompt);
  };

  const generateResponse = useCallback(async (prompt: string): Promise<string> => {
    if (!apiKey) {
      throw new Error("API key is not set");
    }

    const model = new ChatGoogleGenerativeAI({ apiKey, modelName: MODEL_NAME });

    try {
      const result = await model.invoke([
        ["human", prompt],
      ]);
      console.log("AI Response:", result.content);
      return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    } catch (error) {
      console.error('Error generating response:', error);
      throw new Error('Failed to fetch response from Gemini API');
    }
  }, [apiKey]);

  const handleNewChat = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('chats')
        .insert({ user_id: user?.id, name: 'New Chat' })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setChats(prevChats => [data, ...prevChats]);
        setActiveChat(data.id);
        dispatchMessages({ type: 'CLEAR_MESSAGES' });
        triggerScroll();
      } else {
        throw new Error('No data returned from database');
      }
    } catch (error) {
      console.error('Error creating new chat:', error);
      // You might want to show an error message to the user here
    }
  }, [user, supabase, setActiveChat, dispatchMessages, triggerScroll]);

  // New function to add user message immediately
  const addUserMessage = useCallback((message: string) => {
    if (message.trim() && activeChat) {
      const userMessage = { role: 'user', content: message, chat_id: activeChat };
      dispatchMessages({ type: 'ADD_MESSAGE', payload: userMessage });
    }
  }, [activeChat, dispatchMessages]);

  // Effect to handle immediate user message display
  useEffect(() => {
    if (pendingUserMessage && activeChat) {
      const userMessage: Message = { 
        role: 'user', 
        content: pendingUserMessage, 
        chat_id: activeChat 
      };
      setLocalMessages(prev => [...prev, userMessage]);
      setPendingUserMessage(undefined);
      triggerScroll();
    }
  }, [pendingUserMessage, activeChat, triggerScroll]);

  // Effect to handle AI response generation
  useEffect(() => {
    const generateAIResponse = async () => {
      if (!pendingUserMessage || !activeChat) return;

      setIsLoading(true);

      try {
        const aiResponse = await generateResponse(pendingUserMessage);
        
        dispatchMessages({ 
          type: 'ADD_MESSAGE', 
          payload: { role: 'user', content: pendingUserMessage, chat_id: activeChat }
        });
        dispatchMessages({ 
          type: 'ADD_MESSAGE', 
          payload: { role: 'bot', content: aiResponse, chat_id: activeChat }
        });
        
        setLocalMessages(prev => prev.filter(m => m.content !== pendingUserMessage));
        
        triggerScroll();
      } catch (error) {
        console.error('Error generating response:', error);
        dispatchMessages({ 
          type: 'ADD_MESSAGE', 
          payload: { role: 'error', content: 'Failed to get AI response. Please try again.', chat_id: activeChat }
        });
      } finally {
        setIsLoading(false);
        triggerScroll();
      }
    };

    generateAIResponse();
  }, [pendingUserMessage, activeChat, generateResponse, dispatchMessages, triggerScroll]);

  const saveMessageToSupabase = async (message: Message) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert([message])
        .select();

      if (error) throw error;
      console.log('Message saved to Supabase:', data);
    } catch (error) {
      console.error('Error saving message to Supabase:', error);
      throw error;
    }
  };

  const fetchMessages = useCallback(async (chatId: string) => {
    setIsMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      dispatchMessages({ type: 'SET_MESSAGES', payload: data || [] });
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setIsMessagesLoading(false);
    }
  }, [supabase, dispatchMessages]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputMessage.trim() || !activeChat) return;

    const userMessage: Message = {
      role: 'user',
      content: inputMessage,
      chat_id: activeChat
    };

    dispatchMessages({ type: 'ADD_MESSAGE', payload: userMessage });
    setInputMessage('');
    triggerScroll();

    await saveMessageToSupabase(userMessage);

    setIsLoading(true);
    try {
      const aiResponse = await vectorizeAndProcessKnowledgeBase(inputMessage);
      const aiMessage: Message = { 
        role: 'bot', 
        content: aiResponse, 
        chat_id: activeChat
      };
      dispatchMessages({ type: 'ADD_MESSAGE', payload: aiMessage });
      await saveMessageToSupabase(aiMessage);
    } catch (error) {
      console.error('Error generating response:', error);
      dispatchMessages({ 
        type: 'ADD_MESSAGE', 
        payload: { role: 'error', content: 'Failed to get AI response. Please try again.', chat_id: activeChat }
      });
    } finally {
      setIsLoading(false);
      triggerScroll();
    }
  };

  const handleSetActiveChat = useCallback(async (chatId: string) => {
    console.log('Setting active chat:', chatId);
    setActiveChat(chatId);
    setIsInitialLoad(true);
    setLoadingChats(prev => new Set(prev).add(chatId));
    dispatchMessages({ type: 'CLEAR_MESSAGES' });

    try {
      console.log('Fetching messages for chat:', chatId);
      const startTime = performance.now();
      await fetchMessages(chatId);
      const endTime = performance.now();
      console.log(`Fetched messages in ${endTime - startTime}ms`);
      
      triggerScroll();
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingChats(prev => {
        const newSet = new Set(prev);
        newSet.delete(chatId);
        return newSet;
      });
      setIsInitialLoad(false);
      console.log('Finished setting active chat');
    }
  }, [fetchMessages, dispatchMessages, triggerScroll]);

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

  const copyToClipboard = useCallback((content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  const memoizedMessages = useMemo(() => {
    const filteredMessages = messages.filter(message => message.chat_id === activeChat);
    return filteredMessages.map((message, index) => (
      <MemoizedMessage 
        key={message.id || `${message.chat_id}-${index}`}
        message={message} 
        isLast={index === filteredMessages.length - 1}
        lastMessageRef={index === filteredMessages.length - 1 ? messagesEndRef : undefined}
        index={index}
        copyToClipboard={copyToClipboard}
        copiedIndex={copiedIndex}
      />
    ));
  }, [messages, activeChat, copyToClipboard, copiedIndex, messagesEndRef]);

  const renderTabContent = useMemo(() => {
    switch (activeTab) {
      case 'chat':
        if (chats.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center h-full">
              <h2 className="text-2xl font-bold mb-4">Start Chatting</h2>
              <p className="text-muted-foreground mb-6">Begin a new conversation with AI</p>
              <Button onClick={handleNewChat} className="flex items-center">
                <Plus className="mr-2 h-4 w-4" />
                New Chat
              </Button>
            </div>
          );
        } else if (activeChat) {
          return (
            <div className="flex flex-col h-full">
              <div 
                className={`flex-grow overflow-y-auto py-4 ${
                  isMobile ? 'px-2 pt-[120px]' : 'px-4'
                } scrollable-area pb-[25px]`} // Added pb-24 here
                ref={scrollAreaRef}
              >
                {isInitialLoad ? (
                  <div className="flex justify-center items-center h-full">
                    <LoadingDots />
                  </div>
                ) : (
                  <>
                    {memoizedMessages}
                    {isLoading && <AIResponseLoading />}
                  </>
                )}
              </div>
            </div>
          );
        } else {
          return (
            <div className="flex flex-col items-center justify-center h-full">
              <p className="text-muted-foreground">Select a chat or start a new one</p>
            </div>
          );
        }
      case 'knowledgebase':
        return <KnowledgeBase />;
      case 'apikey':
        return <ApiKey />;
      default:
        return null;
    }
  }, [activeTab, chats, activeChat, memoizedMessages, isLoading, isMobile, handleNewChat, scrollAreaRef, isInitialLoad]);

  console.log('Rendering messages:', { localMessages, globalMessages: messages, allMessages });

  const fetchChats = useCallback(async () => {
    if (user) {
      setIsInitialLoad(true);
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
          await fetchMessages(data[0].id);
        } else {
          setActiveChat(null);
        }
      } catch (error) {
        console.error('Error fetching chats:', error);
      } finally {
        setIsInitialLoad(false);
      }
    }
  }, [user, supabase, fetchMessages]);

  const fetchActiveKnowledgeBaseContent = useCallback(async () => {
    const storedActiveKB = localStorage.getItem('activeKnowledgeBase');
    if (storedActiveKB && user) {
      try {
        // First, try to get the content from localStorage
        const storedContent = localStorage.getItem('activeKnowledgeBaseContent');
        if (storedContent) {
          setActiveKnowledgeBaseContent(storedContent);
        } else {
          // If not in localStorage, fetch from the database
          const { data, error } = await supabase
            .from('knowledgebases')
            .select('content')
            .eq('id', storedActiveKB)
            .eq('user_id', user.id)
            .single();

          if (error) throw error;
          if (data) {
            setActiveKnowledgeBaseContent(data.content);
            // Store the content in localStorage for future use
            localStorage.setItem('activeKnowledgeBaseContent', data.content);
          }
        }
      } catch (error) {
        console.error('Error fetching active knowledge base content:', error);
      }
    }
  }, [user, supabase]);

  useEffect(() => {
    console.log('Home component effect', { authLoading, user })
    if (!authLoading) {
      if (user) {
        console.log('User authenticated:', user.id)
        fetchChats()
        fetchActiveKnowledgeBaseContent()
      } else {
        console.log('No user found, redirecting to auth page')
        router.push('/auth')
      }
    }
  }, [user, authLoading, router, fetchChats, fetchActiveKnowledgeBaseContent])

  useEffect(() => {
    const checkMobile = () => {
      const isMobile = window.innerWidth < 768;
      console.log('Is mobile:', isMobile);
      setIsMobile(isMobile);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const storedActiveKB = localStorage.getItem('activeKnowledgeBase');
    if (storedActiveKB) {
      setActiveKnowledgeBase(storedActiveKB);
    }

    const storedApiKey = localStorage.getItem('geminiApiKey');
    if (storedApiKey) {
      setApiKey(storedApiKey);
    }
  }, [setApiKey]);

  useEffect(() => {
    if (activeChat && isInitialLoad) {
      fetchMessages(activeChat);
      // Scroll to bottom after loading messages
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [activeChat, fetchMessages, scrollToBottom, isInitialLoad]);

  const saveMessage = async (message: Message) => {
    try {
      await supabase.from('messages').insert([message]);
    } catch (error) {
      console.error('Error saving message to database:', error);
    }
  };

  const fetchResponse = async (messageContent: string): Promise<Message> => {
    setIsLoading(true);
    try {
      const response = await generateResponse(messageContent);
      return { role: 'bot', content: response, chat_id: activeChat || '' };
    } catch (error) {
      console.error('Error fetching response:', error);
      return { role: 'bot', content: 'Error generating response', chat_id: activeChat || '' };
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchActiveKnowledgeBaseContent();
    }
  }, [user, fetchActiveKnowledgeBaseContent]);

  // Add this useEffect to scroll to bottom when messages change or component mounts
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === 'bot') {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const loadGlobalState = async () => {
      if (user) {
        await fetchApiKey(user.id);
        await fetchKnowledgeBases(user.id);
        fetchActiveKnowledgeBase();
      }
    };

    loadGlobalState();
  }, [user]);

  const fetchApiKey = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('key')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      if (data) {
        setGlobalApiKey(data.key);
        setApiKey(data.key);
        localStorage.setItem('geminiApiKey', data.key);
      }
    } catch (error) {
      console.error('Error fetching API key:', error);
    }
  };

  const fetchKnowledgeBases = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('knowledgebases')
        .select('id, name, content')
        .eq('user_id', userId);

      if (error) throw error;
      if (data) {
        setGlobalKnowledgeBases(data);
      }
    } catch (error) {
      console.error('Error fetching knowledge bases:', error);
    }
  };

  const fetchActiveKnowledgeBase = () => {
    const storedActiveKB = localStorage.getItem('activeKnowledgeBase');
    if (storedActiveKB) {
      setGlobalActiveKnowledgeBase(storedActiveKB);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const scrollToBottomOfChat = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Add this new function
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'chat') {
      // Use setTimeout to ensure the DOM has updated before scrolling
      setTimeout(() => {
        scrollToBottomOfChat();
      }, 0);
    }
  };

  useEffect(() => {
    if (activeChat && isInitialLoad) {
      handleSetActiveChat(activeChat);
    }
  }, [activeChat, isInitialLoad, handleSetActiveChat]);

  // Add this new effect
  useEffect(() => {
    if (user && chats.length > 0 && !activeChat) {
      setActiveChat(chats[0].id);
    }
  }, [user, chats, activeChat]);

  useEffect(() => {
    const handleActiveKnowledgeBaseChange = (event: CustomEvent) => {
      setActiveKnowledgeBaseContent(event.detail.content);
      setGlobalActiveKnowledgeBase(event.detail.id);
    };

    window.addEventListener('activeKnowledgeBaseChanged', handleActiveKnowledgeBaseChange as EventListener);

    return () => {
      window.removeEventListener('activeKnowledgeBaseChanged', handleActiveKnowledgeBaseChange as EventListener);
    };
  }, []);

  if (authLoading) {
    return <div className="flex items-center justify-center h-screen"><LoadingDots /></div>
  }

  if (!user) {
    router.push('/auth')
    return null
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <header className="flex items-center justify-between px-4 h-16 border-b bg-background z-30 md:sticky md:top-0 fixed top-0 left-0 right-0">
        <h1 className="text-2xl font-bold">AI Chatbot</h1>
        <div className="flex items-center">
          <Button
            variant="outline"
            size="icon"
            className="mr-2"
            onClick={scrollToBottomOfChat}
          >
            <ArrowDown size={18} />
          </Button>
          <MobileSidebar 
            activeTab={activeTab} 
            setActiveTab={setActiveTab}
            activeChat={activeChat}
            setActiveChat={handleSetActiveChat}
            chats={chats}
            onDeleteChat={handleDeleteChat}
            onNewChat={handleNewChat}
            onRenameChat={handleRenameChat}
            user={user}
            onLogout={handleLogout}
          />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {!isMobile && (
          <div className="w-64 border-r flex flex-col">
            <Sidebar
              activeTab={activeTab}
              setActiveTab={handleTabChange}
              activeChat={activeChat}
              setActiveChat={handleSetActiveChat}
              chats={chats}
              onDeleteChat={handleDeleteChat}
              onNewChat={handleNewChat}
              onRenameChat={handleRenameChat}
              message={message}
              user={user}
            />
          </div>
        )}
        <div className="flex-1 overflow-hidden flex flex-col relative">
          <main className="flex-1 overflow-y-auto pb-[60px] md:pt-0 pt-16">
            {renderTabContent}
          </main>
          {activeTab === 'chat' && activeChat && (
            <div className={`border-t bg-white py-2 ${isMobile ? 'px-2' : 'px-4'} absolute bottom-0 left-0 right-0 z-20`}>
              <form onSubmit={handleSendMessage} className="flex space-x-2 max-w-3xl mx-auto">
                <Input
                  name="message"
                  placeholder="Type your message..."
                  className="flex-grow focus:ring-2 focus:ring-blue-500 text-base focus-visible:ring-transparent"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  disabled={isLoading}
                  autoComplete="off"
                />
                <Button type="submit" disabled={isLoading} className="bg-black hover:bg-gray-800 text-white">
                  <Send className="h-5 w-5" />
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}