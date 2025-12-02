// src/ChatBox.js
import React, { useEffect, useState, useRef } from 'react';
import { firestore, auth } from './firebaseConfig';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

import './ChatBox.css';

const generateConversationId = (u1, u2) => {
  if (!u1 || !u2) return null;
  return [u1, u2].sort().join('_');
};

function ChatBox({ conversationId: propConversationId, recipientId, onClose, userRole = 'customer' }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    setCurrentUserId(auth.currentUser?.uid || null);
    // if auth state changes elsewhere, we could listen here; kept minimal
  }, []);

  // compute deterministic convId (override prop if inconsistent)
  const convId = generateConversationId(currentUserId, recipientId) || propConversationId;

  // messages collection reference uses the deterministic convId
  const messagesRefPath = convId ? collection(firestore, 'conversations', convId, 'messages') : null;

  useEffect(() => {
    if (!convId || !messagesRefPath) return;

    const q = query(messagesRefPath, orderBy('timestamp', 'asc'));

    const unsub = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => doc.data()));
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId]); // intentionally only convId so path is stable

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!message.trim()) return;
    if (!currentUserId) return alert('Not signed in');

    // ensure convId exists
    const finalConvId = generateConversationId(currentUserId, recipientId);
    if (!finalConvId) return alert('Conversation id missing');

    const finalMessagesRef = collection(firestore, 'conversations', finalConvId, 'messages');

    await addDoc(finalMessagesRef, {
      text: message,
      senderId: currentUserId,
      recipientId,
      participants: [currentUserId, recipientId].sort(),
      timestamp: serverTimestamp(),
    });

    setMessage('');
  };

  const talkingTo = userRole === 'customer' ? 'Cleaner' : 'Customer';

  return (
    <div className="chatbox-container">
      {/* Header */}
      <div className="chatbox-header">
        <span className="chat-title">💬 Talking to: <strong>{talkingTo}</strong></span>
        <button onClick={onClose} className="chatbox-close-button">✖</button>
      </div>

      {/* Messages */}
      <div className="chatbox-messages">
        {messages.map((msg, i) => {
          const isSender = msg.senderId === currentUserId;
          return (
            <div
              key={i}
              className={`chatbox-message-row ${isSender ? 'chatbox-message-sent' : 'chatbox-message-received'}`}
            >
              <div className="chatbox-message-bubble">
                <div className="message-text">{msg.text}</div>
                <div className="chatbox-message-timestamp">
                  {msg.timestamp?.toDate ? msg.timestamp?.toDate().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : ''}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chatbox-input-area">
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault(); // prevent newline
              sendMessage();
            }
          }}
          placeholder="Type a message..."
          className="chatbox-input"
          rows={1}
        />
        <button
          onClick={sendMessage}
          className="chatbox-send-button"
          title="Send"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatBox;
