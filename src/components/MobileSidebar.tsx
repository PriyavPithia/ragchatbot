import React from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Menu, LogOut } from 'lucide-react';
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
  onLogout: () => void;
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
  onLogout,
}: MobileSidebarProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="md:hidden">
          <Menu className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px] sm:w-[400px] p-0">
        <div className="flex flex-col h-full">
          <div className="flex-grow overflow-y-auto">
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
          </div>
          <div className="p-4 border-t">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={onLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
