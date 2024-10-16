import React, { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/Sidebar'

type MobileSidebarProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeChat: string | null;
  setActiveChat: (chatId: string) => void;
  chats: { id: string; name: string }[];
  onDeleteChat: (chatId: string) => void;
  onNewChat: () => void;
  onRenameChat: (chatId: string, newName: string) => void;
};

export function MobileSidebar({ 
  activeTab, 
  setActiveTab, 
  activeChat, 
  setActiveChat,
  chats,
  onDeleteChat,
  onNewChat,
  onRenameChat
}: MobileSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setIsOpen(false);
  };

  const handleNewChat = () => {
    console.log('New chat button clicked in MobileSidebar');
    onNewChat();
    setIsOpen(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[250px] p-0">
        <div className="h-full py-4">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={handleTabChange}
            activeChat={activeChat}
            setActiveChat={(chatId) => {
              setActiveChat(chatId);
              setIsOpen(false);
            }}
            chats={chats}
            onDeleteChat={onDeleteChat}
            onNewChat={handleNewChat}
            onRenameChat={onRenameChat}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
