"use client";

import * as React from 'react'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { Send, Copy, RefreshCw, Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MobileSidebar } from '../components/MobileSidebar'
import { Sidebar } from '../components/Sidebar'
import { KnowledgeBase } from '../components/KnowledgeBase'
import { ApiKey } from '../components/ApiKey'
import ReactMarkdown from 'react-markdown'
import { LoadingDots } from '@/components/LoadingDots'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { memo } from 'react';
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

const MemoizedMessage = memo(({ message, isLast, lastMessageRef, index, copyToClipboard, regenerateResponse, copiedIndex, regeneratingIndexes }: {
  message: Message;
  isLast: boolean;
  lastMessageRef: React.RefObject<HTMLDivElement>;
  index: number;
  copyToClipboard: (content: string, index: number) => void;
  regenerateResponse: (index: number) => Promise<void>;
  copiedIndex: number | null;
  regeneratingIndexes: Set<number>;
}) => {
  console.log('Rendering message:', message.id);
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
          <div className="flex justify-end space-x-2 mt-2 border-t pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(message.content, index)}
              className="h-8 w-8"
            >
              {copiedIndex === index ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => regenerateResponse(index)}
              className="h-8 w-8"
              disabled={regeneratingIndexes.has(index)}
            >
              <RefreshCw className={`h-4 w-4 ${regeneratingIndexes.has(index) ? 'animate-spin' : ''}`} />
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
  prevProps.copiedIndex === nextProps.copiedIndex &&
  prevProps.regeneratingIndexes === nextProps.regeneratingIndexes
);

MemoizedMessage.displayName = 'MemoizedMessage';

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
  const [showScrollButton, setShowScrollButton] = useState(false); // Define state for scroll button
  const [activeKnowledgeBaseContent, setActiveKnowledgeBaseContent] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState<Set<string>>(new Set());

  const lastMessageRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((smooth: boolean = true) => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current;
      const scrollHeight = scrollElement.scrollHeight;
      const height = scrollElement.clientHeight;
      const maxScrollTop = scrollHeight - height;
      
      scrollElement.scrollTo({
        top: maxScrollTop,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollAreaRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
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

      setMessages(data || []);
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

  const handleSetActiveChat = useCallback(async (chatId: string) => {
    console.log('Setting active chat:', chatId);
    setActiveChat(chatId);
    setLoadingChats(prev => new Set(prev).add(chatId));
    setMessages([]); // Clear messages immediately

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
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingChats(prev => {
        const newSet = new Set(prev);
        newSet.delete(chatId);
        return newSet;
      });
      console.log('Finished setting active chat');
      // Use a short timeout to ensure the messages are rendered before scrolling
      setTimeout(() => scrollToBottom(false), 50);
    }
  }, [supabase, scrollToBottom]);

  const fetchApiKey = useCallback(async () => {
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
  }, [user, supabase, setApiKey]);

  useEffect(() => {
    if (user) {
      fetchApiKey();
    }
  }, [user, fetchApiKey]);

  const fetchActiveKnowledgeBaseContent = useCallback(async () => {
    const activeKBId = localStorage.getItem('activeKnowledgeBase');
    if (activeKBId && user) {
      try {
        const { data, error } = await supabase
          .from('knowledgebases')
          .select('content')
          .eq('id', activeKBId)
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
  }, [user, supabase]);

  useEffect(() => {
    if (user) {
      fetchActiveKnowledgeBaseContent();
    }
  }, [user, fetchActiveKnowledgeBaseContent]);

  const generateResponse = async (prompt: string): Promise<string> => {
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
  };

  const handleSendMessage = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputMessage.trim() || !activeChat) return;
    if (!apiKey) {
      setMessages(prev => [...prev, { role: 'bot', content: 'Please set your API key in the settings before sending messages.' }]);
      return;
    }

    const currentChatId = activeChat;
    const newUserMessage: Message = { role: 'user', content: inputMessage, chat_id: currentChatId };
    
    setMessages(prev => [...prev, newUserMessage]);
    setInputMessage('');
    
    // Scroll to bottom after adding user's message
    setTimeout(() => scrollToBottom(true), 50);

    try {
      await supabase.from('messages').insert([newUserMessage]);
    } catch (error) {
      console.error('Error saving user message to database:', error);
    }

    setIsLoading(true);
    // Scroll to show loading dots
    setTimeout(() => scrollToBottom(true), 50);

    try {
      console.log('Generating response for message:', inputMessage);
      const response = await generateResponse(inputMessage);
      console.log('Response generated successfully');
      const newBotMessage: Message = { role: 'bot', content: response, chat_id: currentChatId };
      
      setMessages(prev => [...prev, newBotMessage]);
      
      const { error } = await supabase.from('messages').insert([newBotMessage]);
      if (error) {
        console.error('Error saving bot message to database:', error);
      }
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      setMessages(prev => [
        ...prev, 
        { role: 'bot', content: 'Sorry, I encountered an error while generating a response. Please try again later.', chat_id: currentChatId }
      ]);
    } finally {
      setIsLoading(false);
      // Scroll to bottom after adding bot's message
      setTimeout(() => scrollToBottom(true), 50);
    }
  }, [inputMessage, activeChat, apiKey, generateResponse, supabase, scrollToBottom]);

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

  const memoizedMessages = useMemo(() => {
    console.log('Recalculating memoizedMessages');
    const filteredMessages = messages.filter(message => message.chat_id === activeChat);
    return filteredMessages.map((message, index) => (
      <MemoizedMessage 
        key={message.id || message.content} 
        message={message} 
        isLast={index === filteredMessages.length - 1}
        lastMessageRef={lastMessageRef}
        index={index}
        copyToClipboard={copyToClipboard}
        regenerateResponse={regenerateResponse}
        copiedIndex={copiedIndex}
        regeneratingIndexes={regeneratingIndexes}
      />
    ));
  }, [messages, activeChat, copyToClipboard, regenerateResponse, copiedIndex, regeneratingIndexes]);

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
                  <div style={{ height: '1px' }} /> {/* Removed lastMessageRef */}
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
