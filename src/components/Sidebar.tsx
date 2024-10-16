import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Database, Key, LogOut, Plus, Trash2, MoreVertical, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from './AuthProvider';
import { ScrollArea } from '@/components/ui/scroll-area';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SidebarProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeChat: string | null;
  setActiveChat: (chatId: string) => void;
  chats: { id: string; name: string }[];
  onDeleteChat: (chatId: string) => void;
  onNewChat: () => void;
  onRenameChat: (chatId: string, newName: string) => void;
  message?: string;
};

export function Sidebar({ 
  activeTab, 
  setActiveTab, 
  activeChat, 
  setActiveChat, 
  chats, 
  onDeleteChat, 
  onNewChat,
  onRenameChat,
  message 
}: SidebarProps) {
  const { user, signOut } = useAuth();
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingChatName, setEditingChatName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingChatId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingChatId]);

  const handleRenameChat = (chatId: string) => {
    if (editingChatName.trim() === '') return;
    onRenameChat(chatId, editingChatName);
    setEditingChatId(null);
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleNewChatClick = () => {
    console.log('New Chat button clicked in Sidebar');
    onNewChat();
  };

  return (
    <div className="flex flex-col h-full pt-5">
      <div className="flex flex-col space-y-1 px-2">
        <button
          className={`flex items-center space-x-2 p-2 rounded-md text-xs ${
            activeTab === 'chat' ? 'bg-secondary' : 'hover:bg-secondary/50'
          }`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={14} />
          <span>AI Chatbot</span>
        </button>
        <button
          className={`flex items-center space-x-2 p-2 rounded-md text-xs ${
            activeTab === 'knowledgebase' ? 'bg-secondary' : 'hover:bg-secondary/50'
          }`}
          onClick={() => setActiveTab('knowledgebase')}
        >
          <Database size={14} />
          <span>Knowledge Base</span>
        </button>
        <button
          className={`flex items-center space-x-2 p-2 rounded-md text-xs ${
            activeTab === 'apikey' ? 'bg-secondary' : 'hover:bg-secondary/50'
          }`}
          onClick={() => setActiveTab('apikey')}
        >
          <Key size={14} />
          <span>API Key</span>
        </button>
      </div>

      {activeTab === 'chat' && (
        <>
          <Button
            variant="outline"
            className="mt-3 mx-2 text-xs py-1.5 h-8"
            onClick={handleNewChatClick}
          >
            <Plus size={14} className="mr-1" />
            New Chat
          </Button>

          {message && <p className="text-sm text-red-500 mt-2">{message}</p>}

          <ScrollArea className="flex-grow mt-3">
            {chats.map((chat) => (
              <div 
                key={chat.id} 
                className={`flex items-center justify-between p-1.5 ${
                  activeChat === chat.id ? 'bg-secondary' : 'hover:bg-secondary/50'
                }`}
              >
                {editingChatId === chat.id ? (
                  <Input
                    ref={inputRef}
                    value={editingChatName}
                    onChange={(e) => setEditingChatName(e.target.value)}
                    onBlur={() => handleRenameChat(chat.id)}
                    onKeyPress={(e) => e.key === 'Enter' && handleRenameChat(chat.id)}
                    className="flex-grow mr-2 h-6 text-xs focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-transparent"
                  />
                ) : (
                  <>
                    <button
                      className={`flex items-center space-x-2 text-xs w-full text-left ${
                        activeChat === chat.id ? 'font-bold' : ''
                      }`}
                      onClick={() => setActiveChat(chat.id)}
                    >
                      <MessageSquare size={14} />
                      <span>{chat.name}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreVertical size={10} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-28">
                        <DropdownMenuItem 
                          onClick={() => {
                            setEditingChatId(chat.id);
                            setEditingChatName(chat.name);
                          }}
                          className="text-xs py-1 cursor-pointer"
                        >
                          <Edit className="mr-2 h-3 w-3" />
                          <span>Rename</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => onDeleteChat(chat.id)}
                          className="text-xs py-1 cursor-pointer"
                        >
                          <Trash2 className="mr-2 h-3 w-3" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ))}
          </ScrollArea>
        </>
      )}

      <div className="px-2 py-3 mt-auto">
        <div className="flex items-center justify-between">
          {user?.user_metadata?.avatar_url && (
            <Image
              src={user.user_metadata.avatar_url}
              alt="User Avatar"
              width={24}
              height={24}
              className="rounded-full mr-2"
            />
          )}
          <span>{user?.user_metadata?.full_name || user?.email}</span>
          <Button
            variant="ghost"
            className="w-full justify-start text-xs py-2 h-9"
            onClick={handleLogout}
          >
            <LogOut size={14} className="mr-2" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}
