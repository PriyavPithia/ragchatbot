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
    <div className="flex flex-col h-full pt-5 text-base">
      <div className="px-4 py-2 mb-4">
        <div className="flex items-center space-x-3 mb-4">
          {user?.user_metadata?.avatar_url && (
            <Image
              src={user.user_metadata.avatar_url}
              alt="User Avatar"
              width={40}
              height={40}
              className="rounded-full"
            />
          )}
          <div>
            <p className="font-semibold">{user?.user_metadata?.full_name || user?.email}</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col space-y-2 px-2">
        <button
          className={`flex items-center space-x-2 p-2 rounded-md ${
            activeTab === 'chat' ? 'bg-secondary' : 'hover:bg-secondary/50'
          }`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={18} />
          <span>AI Chatbot</span>
        </button>
        <button
          className={`flex items-center space-x-2 p-2 rounded-md ${
            activeTab === 'knowledgebase' ? 'bg-secondary' : 'hover:bg-secondary/50'
          }`}
          onClick={() => setActiveTab('knowledgebase')}
        >
          <Database size={18} />
          <span>Knowledge Base</span>
        </button>
        <button
          className={`flex items-center space-x-2 p-2 rounded-md ${
            activeTab === 'apikey' ? 'bg-secondary' : 'hover:bg-secondary/50'
          }`}
          onClick={() => setActiveTab('apikey')}
        >
          <Key size={18} />
          <span>API Key</span>
        </button>
      </div>

      {activeTab === 'chat' && (
        <>
          <Button
            variant="outline"
            className="mt-4 mx-2 py-2 h-10"
            onClick={handleNewChatClick}
          >
            <Plus size={18} className="mr-2" />
            New Chat
          </Button>

          {message && <p className="text-sm text-red-500 mt-2">{message}</p>}

          <ScrollArea className="flex-grow mt-4">
            {chats.map((chat) => (
              <div 
                key={chat.id} 
                className={`flex items-center justify-between p-2 ${
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
                    className="flex-grow mr-2 h-8 text-sm focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-transparent"
                  />
                ) : (
                  <>
                    <button
                      className={`flex items-center space-x-2 w-full text-left ${
                        activeChat === chat.id ? 'font-bold' : ''
                      }`}
                      onClick={() => setActiveChat(chat.id)}
                    >
                      <MessageSquare size={18} />
                      <span>{chat.name}</span>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical size={14} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-32">
                        <DropdownMenuItem 
                          onClick={() => {
                            setEditingChatId(chat.id);
                            setEditingChatName(chat.name);
                          }}
                          className="text-sm py-1.5 cursor-pointer"
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          <span>Rename</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => onDeleteChat(chat.id)}
                          className="text-sm py-1.5 cursor-pointer"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
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
        <Button
          variant="ghost"
          className="w-full justify-start text-sm py-2 h-10"
          onClick={handleLogout}
        >
          <LogOut size={18} className="mr-2" />
          Logout
        </Button>
      </div>
    </div>
  );
}
