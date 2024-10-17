"use client";

import * as React from 'react'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../components/AuthProvider'
import { Send, Copy, RefreshCw, Check, Plus, ArrowDown, User, Bot } from 'lucide-react'
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
import { memo } from 'react';
import type { Components } from 'react-markdown';

const MODEL_NAME = "gemini-1.0-pro";

type Message = {
  role: string;
  content: string;
  id?: string;
  chat_id?: string;
};

const MemoizedMessage = memo(({ message }: { message: Message }) => (
  <div className={`py-8 ${message.role === 'user' ? 'bg-white' : 'bg-gray-50'}`}>
    <div className="max-w-3xl mx-auto flex space-x-6 px-4">
      <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
        {message.role === 'user' ? (
          <User size={20} />
        ) : (
          <Bot size={20} />
        )}
      </div>
      <div className="flex-grow">
        <ReactMarkdown
          components={{
            p: ({ node, ...props }) => <p className="mb-4 text-gray-800" {...props} />,
            ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-4" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-4" {...props} />,
            li: ({ node, ...props }) => <li className="mb-2" {...props} />,
            code: (props) => {
              const { className, children, ...rest } = props;
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match && !children?.toString().includes('\n');
              return isInline ? (
                <code className="bg-gray-100 rounded px-1 py-0.5" {...rest}>
                  {children}
                </code>
              ) : (
                <pre className="bg-gray-100 rounded p-4 overflow-x-auto">
                  <code className={className} {...rest}>
                    {children}
                  </code>
                </pre>
              );
            },
          }}
        >
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  </div>
));

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

  // Add this new state
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const isNearBottom = useCallback(() => {
    if (scrollAreaRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
      return scrollHeight - scrollTop - clientHeight < 100;
    }
    return false;
  }, []);

  const scrollToBottom = useCallback((force: boolean = false) => {
    if (messagesEndRef.current) {
      const scrollContainer = messagesEndRef.current.parentElement;
      if (scrollContainer) {
        if (force) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        } else {
          const { scrollHeight, clientHeight, scrollTop } = scrollContainer;
          const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
          if (isNearBottom) {
            scrollContainer.scrollTop = scrollHeight - clientHeight;
          }
        }
      }
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollAreaRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
      const isAtBottom = scrollHeight - scrollTop <= clientHeight + 100; // Add some threshold
      setShowScrollButton(!isAtBottom);
      setUserHasScrolled(!isAtBottom);
    }
  }, []);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (scrollArea) {
      scrollArea.addEventListener('scroll', handleScroll);
      return () => scrollArea.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        const isKeyboard = window.innerHeight < window.outerHeight;
        setIsKeyboardVisible(isKeyboard);
        if (isKeyboard) {
          setTimeout(scrollToBottom, 100); // Delay scroll when keyboard appears
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [scrollToBottom]);

  useEffect(() => {
    if (messages.length > 0 && !isNearBottom()) {
      setShowScrollButton(true);
    }
  }, [messages, isNearBottom]);

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
    setActiveChat(chatId);
    setIsLoading(true);
    setMessages([]); // Clear messages immediately to reduce flashing
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setIsLoading(false);
      // Scroll to bottom after loading messages
      setTimeout(() => scrollToBottom(false), 100);
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

    const currentChatId = activeChat;
    const newUserMessage: Message = { role: 'user', content: inputMessage, chat_id: currentChatId };
    
    // Immediately add the user's message to the chat and clear the input
    setMessages(prev => [...prev, newUserMessage]);
    setInputMessage('');
    
    // Scroll to bottom immediately after adding user's message
    scrollToBottom(true);

    // Save the user's message to the database immediately
    try {
      await supabase.from('messages').insert([newUserMessage]);
    } catch (error) {
      console.error('Error saving user message to database:', error);
    }

    setIsLoading(true);
    // Scroll to show loading dots
    setTimeout(() => scrollToBottom(true), 100);

    try {
      console.log('Generating response for message:', inputMessage);
      const response = await generateResponse(inputMessage);
      console.log('Response generated successfully');
      const newBotMessage: Message = { role: 'bot', content: response, chat_id: currentChatId };
      
      // Add the bot's response to the chat
      setMessages(prev => [...prev, newBotMessage]);
      
      console.log('Saving bot message to database...');
      const { error } = await supabase.from('messages').insert([newBotMessage]);

      if (error) {
        console.error('Error saving bot message to database:', error);
        throw error;
      }

      console.log('Bot message saved successfully');
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      setMessages(prev => [
        ...prev, 
        { role: 'bot', content: 'Sorry, I encountered an error. Please check your API key and try again.', chat_id: currentChatId }
      ]);
    } finally {
      setIsLoading(false);
      // Scroll to bottom after everything is done, with a slight delay
      setTimeout(() => scrollToBottom(true), 100);
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

  const memoizedMessages = useMemo(() => 
    messages
      .filter(message => message.chat_id === activeChat)
      .map((message, index) => (
        <div
          key={index}
          className={`mb-6 ${
            message.role === 'user'
              ? 'ml-auto'
              : 'mr-auto w-full'
          }`}
        >
          <div className={`rounded-lg ${
            message.role === 'user'
              ? 'bg-primary text-primary-foreground inline-block py-2 px-3'
              : 'bg-secondary text-secondary-foreground p-4 w-full'
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
            {message.role === 'bot' && (
              <div className="flex justify-start space-x-2 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(message.content, index)}
                  className="h-8 w-8"
                >
                  {copiedIndex === index ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Copy className="h-5 w-5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => regenerateResponse(index)}
                  className="h-8 w-8"
                  disabled={regeneratingIndexes.has(index)}
                >
                  <RefreshCw className={`h-5 w-5 ${regeneratingIndexes.has(index) ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            )}
          </div>
        </div>
      )),
    [messages, activeChat, copyToClipboard, regenerateResponse, copiedIndex, regeneratingIndexes]
  );

  const renderTabContent = useMemo(() => {
    switch (activeTab) {
      case 'chat':
        return (
          <div className="flex flex-col h-full">
            <div className="flex-grow overflow-y-auto">
              {memoizedMessages}
              {isLoading && (
                <div className="py-8 bg-white">
                  <div className="max-w-3xl mx-auto flex space-x-6 px-4">
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                      <img src="/bot-avatar.png" alt="AI" className="w-6 h-6" />
                    </div>
                    <div className="flex-grow">
                      <LoadingDots />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="border-t bg-white py-4">
              <div className="max-w-3xl mx-auto px-4">
                <form onSubmit={handleSendMessage} className="flex space-x-4">
                  <Input
                    name="message"
                    placeholder="Type your message..."
                    className="flex-grow focus:ring-2 focus:ring-blue-500"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    disabled={isLoading}
                    autoComplete="off"
                  />
                  <Button type="submit" disabled={isLoading} className="bg-blue-500 hover:bg-blue-600 text-white">
                    <Send className="h-5 w-5" />
                  </Button>
                </form>
              </div>
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
  }, [activeTab, memoizedMessages, isLoading, inputMessage, handleSendMessage]);

  if (authLoading) {
    return <div className="flex items-center justify-center h-screen"><LoadingDots /></div>
  }

  if (!user) {
    router.push('/auth')
    return null
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="flex items-center justify-between px-4 h-16 border-b fixed top-0 left-0 right-0 bg-background z-20">
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
      <div className="flex flex-1 overflow-hidden pt-16 pb-16"> {/* Added pb-16 to account for the footer height */}
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
          <main className="flex-1 overflow-hidden">
            {renderTabContent}
          </main>
        </div>
      </div>
      {activeTab === 'chat' && chats.length > 0 && activeChat && (
        <footer className={`p-2 sm:p-4 border-t fixed bottom-0 left-0 right-0 bg-background z-10`}>
          <form onSubmit={handleSendMessage} className="flex space-x-2 w-full max-w-3xl mx-auto">
            <Input
              name="message"
              placeholder="Type your message..."
              className="flex-1 focus:ring-2 focus:ring-blue-500"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={isLoading}
              autoComplete="off"
            />
            <Button type="submit" disabled={isLoading} className="bg-blue-500 hover:bg-blue-600 text-white">
              <Send className="h-5 w-5" />
            </Button>
          </form>
        </footer>
      )}
    </div>
  );
}
