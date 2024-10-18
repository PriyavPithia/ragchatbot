import React from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { User } from '@supabase/supabase-js';

type MobileSidebarProps = {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  activeChat: string | null;
  setActiveChat: (chatId: string) => void;
  chats: { id: string; name: string }[];
  onDeleteChat: (chatId: string) => void;
  onNewChat: () => void;
  onRenameChat: (chatId: string, newName: string) => void;
  user: User | null;
};

export function MobileSidebar({
  activeTab,
  setActiveTab,
  activeChat,
  setActiveChat,
  chats,
  onDeleteChat,
  onNewChat,
  onRenameChat,
  user,
}: MobileSidebarProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="md:hidden">
          <Menu className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] sm:w-[400px]">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeChat={activeChat}
          setActiveChat={setActiveChat}
          chats={chats}
          onDeleteChat={onDeleteChat}
          onNewChat={onNewChat}
          onRenameChat={onRenameChat}
          message=""
          user={user}
        />
      </SheetContent>
    </Sheet>
  );
}
