import React from 'react';

export function ChatConversations() {
  // Hardcoded previous conversations
  const conversations = [
    { id: 1, title: 'Conversation 1', date: '2023-04-01' },
    { id: 2, title: 'Conversation 2', date: '2023-04-02' },
    { id: 3, title: 'Conversation 3', date: '2023-04-03' },
  ];

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">Previous Conversations</h2>
      <ul className="space-y-2">
        {conversations.map((conv) => (
          <li key={conv.id} className="p-2 bg-secondary rounded-md">
            <h3 className="font-medium">{conv.title}</h3>
            <p className="text-sm text-muted-foreground">{conv.date}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
