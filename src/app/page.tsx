"use client";

import * as React from 'react'
import { useEffect, useState, useCallback, useRef, useMemo, useReducer, memo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { Send, Copy, Check, Plus, ArrowDown } from 'lucide-react'
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
  lastMessageRef: React.RefObject<HTMLDivElement>;
  index: number;
  copyToClipboard: (content: string, index: number) => void;
  copiedIndex: number | null;
}) => {
  // Remove console.log to reduce noise
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
      {isLast && <div ref={lastMessageRef} style={{ height: '1px' }} />}
    </div>
  );
}, (prevProps: { message: Message; isLast: boolean; copiedIndex: number | null }, nextProps: { message: Message; isLast: boolean; copiedIndex: number | null }) => 
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
  const [showScrollButton, setShowScrollButton] = useState(false); // Define state for scroll button
  const [activeKnowledgeBaseContent, setActiveKnowledgeBaseContent] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState<Set<string>>(new Set());

  const lastMessageRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth: boolean = false) => {
    if (lastMessageRef.current) {
      lastMessageRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollAreaRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isAtBottom);
    }
  }, []);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (scrollArea) {
      scrollArea.addEventListener('scroll', handleScroll);
      return () => scrollArea.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

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
    }
  }, [activeChat, fetchMessages]);

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
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingChats(prev => {
        const newSet = new Set(prev);
        newSet.delete(chatId);
        return newSet;
      });
      console.log('Finished setting active chat');
      setTimeout(() => scrollToBottom(false), 50);
    }
  }, [supabase, scrollToBottom]);

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

  const handleSendMessage = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputMessage.trim() || !activeChat) return;
    if (!apiKey) {
      dispatchMessages({ type: 'ADD_MESSAGE', payload: { role: 'bot', content: 'Please set your API key in the settings before sending messages.' } });
      return;
    }

    const newUserMessage: Message = { role: 'user', content: inputMessage, chat_id: activeChat };
    
    dispatchMessages({ type: 'ADD_MESSAGE', payload: newUserMessage });
    setInputMessage('');
    
    // Scroll to bottom after adding user's message
    setTimeout(() => scrollToBottom(true), 100);

    await saveMessage(newUserMessage);

    setIsLoading(true);

    try {
      const botResponse = await generateResponse(inputMessage);
      const newBotMessage: Message = { role: 'bot', content: botResponse, chat_id: activeChat };
      
      dispatchMessages({ type: 'ADD_MESSAGE', payload: newBotMessage });
      
      await saveMessage(newBotMessage);
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      dispatchMessages({ type: 'ADD_MESSAGE', payload: { role: 'bot', content: 'Sorry, I encountered an error while generating a response. Please try again later.', chat_id: activeChat } });
    } finally {
      setIsLoading(false);
      // Scroll to bottom after adding bot's message
      setTimeout(() => scrollToBottom(true), 100);
    }
  }, [inputMessage, activeChat, apiKey, generateResponse, saveMessage, dispatchMessages, scrollToBottom]);

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
      dispatchMessages({ type: 'CLEAR_MESSAGES' });
      setGeminiChat(null);
      scrollToBottom(false);
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
        lastMessageRef={lastMessageRef}
        index={index}
        copyToClipboard={copyToClipboard}
        copiedIndex={copiedIndex}
      />
    ));
  }, [messages, activeChat, lastMessageRef, copyToClipboard, copiedIndex]);

  const renderTabContent = useMemo(() => {
    switch (activeTab) {
      case 'chat':
        return (
          <div className="flex flex-col h-full">
            <div className={`flex-grow overflow-y-auto hide-scrollbar py-4 ${isMobile ? 'px-2' : 'px-4'}`} ref={scrollAreaRef}>
              {loadingChats.has(activeChat || '') ? (
                <div className="flex justify-center items-center h-full">
                  <LoadingDots />
                </div>
              ) : (
                <>
                  {memoizedMessages}
                  {isLoading && (
                    <div className="py-2 px-4 bg-secondary text-secondary-foreground rounded-lg max-w-[80%] mr-auto">
                      <LoadingDots />
                    </div>
                  )}
                  <div ref={lastMessageRef} style={{ height: '1px' }} />
                  {/* Add extra padding at the bottom */}
                  <div className="h-32" /> {/* Adjust this value as needed */}
                </>
              )}
            </div>
          </div>
        );
      case 'knowledgebase':
        return <KnowledgeBase />;
      case 'apikey':
        return <ApiKey />;
      default:
        return null;
    }
  }, [activeTab, memoizedMessages, loadingChats, activeChat, isMobile, isLoading]);

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
          {activeTab === 'chat' && !isMobile && (
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
      <div className="flex flex-1 overflow-hidden pt-16"> {/* Remove bottom padding */}
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
          <main className="flex-1 overflow-y-auto" ref={scrollAreaRef}>
            {renderTabContent}
          </main>
          {showScrollButton && (
            <Button
              className="fixed bottom-20 right-4 rounded-full p-2 bg-primary text-primary-foreground shadow-lg z-50"
              onClick={() => scrollToBottom(true)}
            >
              <ArrowDown size={24} />
            </Button>
          )}
        </div>
      </div>
      {activeTab === 'chat' && (
        <div className={`border-t bg-white py-2 ${isMobile ? 'px-2' : 'px-4'} fixed bottom-0 left-0 right-0 z-20`}>
          <form onSubmit={handleSendMessage} className="flex space-x-2 max-w-3xl mx-auto">
            <Input
              name="message"
              placeholder="Type your message..."
              className="flex-grow focus:ring-2 focus:ring-blue-500 text-base"
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
  );
}
