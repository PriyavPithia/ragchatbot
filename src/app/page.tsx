"use client";

import * as React from 'react'
import { useEffect, useState, useCallback, useRef, useMemo, useReducer, memo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { Send, Copy, Check, Plus, ArrowDown, LogOut } from 'lucide-react'
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

const MODEL_NAME = "gemini-1.0-pro";

type Message = {
  role: string;
  content: string;
  id?: string;
  chat_id?: string;
  isPending?: boolean;
};

// Define ChatSession type or use any if structure is unknown
type ChatSession = any;

type MessagesState = Message[];

type MessagesAction = 
  | { type: 'ADD_MESSAGE'; payload: Message }
  | { type: 'SET_MESSAGES'; payload: Message[] }
  | { type: 'CLEAR_MESSAGES' };

const messagesReducer = (state: MessagesState, action: MessagesAction): MessagesState => {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return [...state, action.payload];
    case 'SET_MESSAGES':
      return action.payload;
    case 'CLEAR_MESSAGES':
      return [];
    default:
      return state;
  }
};

const MemoizedMessage = memo(({ message, isLast, lastMessageRef, index, copyToClipboard, copiedIndex }: {
  message: Message;
  isLast: boolean;
  lastMessageRef?: React.RefObject<HTMLDivElement>;  // Make this optional
  index: number;
  copyToClipboard: (content: string, index: number) => void;
  copiedIndex: number | null;
}) => {
  return (
    <div className={`mb-4 ${message.role === 'user' ? 'ml-auto text-right' : 'mr-auto'}`}>
      <div className={`rounded-lg ${
        message.role === 'user'
          ? 'bg-primary text-primary-foreground ml-auto inline-block max-w-[80%] py-2 px-3'
          : 'bg-secondary text-secondary-foreground w-full max-w-[80%] p-4'
      }`}>
        <ReactMarkdown
          components={{
            p: ({ node, ...props }) => <p className="mb-1 text-sm" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 text-sm" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 text-sm" {...props} />,
            li: ({ node, ...props }) => <li className="mb-1 text-sm" {...props} />,
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
      {isLast && message.role === 'bot' && <div className="h-10" />} {/* Keep this h-10 div */}
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

  const generateResponse = useCallback(async (prompt: string): Promise<string> => {
    if (!apiKey) {
      throw new Error("API key is not set");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    try {
      let fullPrompt = prompt;
      if (activeKnowledgeBaseContent) {
        fullPrompt = `Given the following context:\n\n${activeKnowledgeBaseContent}\n\nPlease answer the following question: ${prompt}`;
      }

      const result = await model.generateContent(fullPrompt);
      const response = result.response;
      return response.text();
    } catch (error) {
      console.error('Error generating response:', error);
      throw new Error('Failed to fetch response from Gemini API');
    }
  }, [apiKey, activeKnowledgeBaseContent]);

  const handleNewChat = useCallback(() => {
    // ... existing new chat logic ...
    triggerScroll();
  }, [triggerScroll]);

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
    }
  };

  const handleSendMessage = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputMessage.trim() || !activeChat) return;

    console.log('Sending message:', inputMessage);

    const userMessage: Message = {
      role: 'user',
      content: inputMessage,
      chat_id: activeChat
    };

    setLocalMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    triggerScroll();

    // Save user message to Supabase
    await saveMessageToSupabase(userMessage);

    // Start AI response generation
    generateAIResponse(inputMessage, activeChat);
  }, [inputMessage, activeChat, triggerScroll]);

  const generateAIResponse = useCallback(async (message: string, chatId: string) => {
    console.log('Generating AI response for:', message);
    setIsLoading(true);

    try {
      const aiResponse = await generateResponse(message);
      console.log('AI response received:', aiResponse);
      
      const aiMessage: Message = { role: 'bot', content: aiResponse, chat_id: chatId };
      
      // Add both user and AI messages to confirmed messages
      dispatchMessages({ type: 'ADD_MESSAGE', payload: { role: 'user', content: message, chat_id: chatId } });
      dispatchMessages({ type: 'ADD_MESSAGE', payload: aiMessage });
      
      // Save AI message to Supabase
      await saveMessageToSupabase(aiMessage);
      
      // Clear local messages
      setLocalMessages([]);
      
      triggerScroll();
    } catch (error) {
      console.error('Error generating response:', error);
      const errorMessage: Message = { role: 'error', content: 'Failed to get AI response. Please try again.', chat_id: chatId };
      dispatchMessages({ type: 'ADD_MESSAGE', payload: errorMessage });
      await saveMessageToSupabase(errorMessage);
    } finally {
      setIsLoading(false);
      triggerScroll();
    }
  }, [generateResponse, dispatchMessages, triggerScroll]);

  // Fetch messages from Supabase when activeChat changes
  useEffect(() => {
    const fetchMessages = async () => {
      if (!activeChat) return;

      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', activeChat)
          .order('created_at', { ascending: true });

        if (error) throw error;

        dispatchMessages({ type: 'SET_MESSAGES', payload: data || [] });
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    };

    fetchMessages();
  }, [activeChat, supabase, dispatchMessages]);

  console.log('Rendering messages:', { localMessages, globalMessages: messages, allMessages });

  // Render function
  const renderMessages = () => {
    return allMessages.map((message, index) => (
      <div key={`${message.chat_id}-${index}`} className="mb-4">
        <strong>{message.role}: </strong>
        {message.content}
      </div>
    ));
  };

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

      dispatchMessages({ type: 'SET_MESSAGES', payload: data || [] });
    } catch (error) {
      console.error('Error in fetchMessages:', error);
    }
  };

  useEffect(() => {
    console.log('Home component effect', { authLoading, user })
    if (!authLoading) {
      if (user) {
        console.log('User authenticated, fetching chats')
        fetchChats()
      } else {
        console.log('No user found, redirecting to auth page')
        router.push('/auth')
      }
    }
  }, [user, authLoading, router, fetchChats])

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
    if (activeChat) {
      fetchMessages(activeChat);
      // Scroll to bottom after loading messages
      setTimeout(() => scrollToBottom(), 100);
    }
  }, [activeChat, fetchMessages, scrollToBottom]);

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

  const handleSetActiveChat = useCallback(async (chatId: string) => {
    console.log('Setting active chat:', chatId);
    setActiveChat(chatId);
    setLoadingChats(prev => new Set(prev).add(chatId));
    dispatchMessages({ type: 'CLEAR_MESSAGES' });

    try {
      console.log('Fetching messages for chat:', chatId);
      const startTime = performance.now();
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      const endTime = performance.now();
      console.log(`Fetched messages in ${endTime - startTime}ms`);

      if (error) throw error;
      
      console.log('Number of messages fetched:', data?.length);
      dispatchMessages({ type: 'SET_MESSAGES', payload: data || [] });
      
      // Trigger scroll after messages are loaded
      triggerScroll();
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingChats(prev => {
        const newSet = new Set(prev);
        newSet.delete(chatId);
        return newSet;
      });
      console.log('Finished setting active chat');
    }
  }, [supabase, dispatchMessages, triggerScroll]);

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
        return (
          <div className="flex flex-col h-full">
            <div className={`flex-grow overflow-y-auto py-4 ${isMobile ? 'px-2' : 'px-4'} scrollable-area`} ref={scrollAreaRef}>
              {loadingChats.has(activeChat || '') ? (
                <div className="flex justify-center items-center h-full">
                  <LoadingDots />
                </div>
              ) : (
                <>
                  {memoizedMessages}
                  {isLoading && (
                    <>
                      <div className="py-2 px-4 bg-secondary text-secondary-foreground rounded-lg max-w-[80%] mr-auto relative">
                        <LoadingDots />
                      </div>
                      <div className="h-16"></div> {/* Spacer visible only when loading */}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        );
      case 'knowledgebase':
        return (
          <div className="overflow-y-auto h-full pb-16">
            <KnowledgeBase />
          </div>
        );
      case 'apikey':
        return (
          <div className="overflow-y-auto h-full pb-16">
            <ApiKey />
          </div>
        );
      default:
        return null;
    }
  }, [activeTab, memoizedMessages, loadingChats, activeChat, isMobile, isLoading]);

  const fetchActiveKnowledgeBaseContent = useCallback(async () => {
    if (activeKnowledgeBase && user) {
      try {
        const { data, error } = await supabase
          .from('knowledgebases')
          .select('content')
          .eq('id', activeKnowledgeBase)
          .eq('user_id', user.id)
          .single();

        if (error) throw error;
        if (data) {
          setActiveKnowledgeBaseContent(data.content);
        }
      } catch (error) {
        console.error('Error fetching active knowledge base content:', error);
      }
    }
  }, [activeKnowledgeBase, user, supabase]);

  useEffect(() => {
    fetchActiveKnowledgeBaseContent();
  }, [activeKnowledgeBase, fetchActiveKnowledgeBaseContent]);

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

  if (authLoading) {
    return <div className="flex items-center justify-center h-screen"><LoadingDots /></div>
  }

  if (!user) {
    router.push('/auth')
    return null
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <header className="flex items-center justify-between px-4 h-16 border-b bg-background z-30 fixed top-0 left-0 right-0">
        <h1 className="text-2xl font-bold">AI Chatbot</h1>
        <div className="flex items-center">
          <Button
            variant="outline"
            size="default"
            className="mr-2 text-base"
            onClick={handleNewChat}
          >
            <Plus size={18} className="mr-2" />
            New Chat
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
          />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden pt-16">
        {!isMobile && (
          <div className="w-64 border-r flex flex-col">
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
        <div className="flex-1 overflow-hidden flex flex-col relative">
          <main className="flex-1 overflow-y-auto">
            {renderTabContent}
          </main>
          {activeTab === 'chat' && (
            <div className={`border-t bg-white py-2 ${isMobile ? 'px-2 left-0' : 'px-4 left-64'} fixed bottom-0 right-0 z-20`}>
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