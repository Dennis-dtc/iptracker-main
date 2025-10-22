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

function ChatBox({ conversationId, recipientId, onClose, userRole = 'customer' }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

  const currentUserId = auth.currentUser?.uid;
  const talkingTo = userRole === 'customer' ? 'Cleaner' : 'Customer';

  const messagesRef = collection(firestore, 'conversations', conversationId, 'messages');

  useEffect(() => {
    if (!conversationId) return;

    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsub = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => doc.data()));
    });

    return () => unsub();
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!message.trim()) return;

    await addDoc(messagesRef, {
      text: message,
      senderId: currentUserId,
      recipientId,
      participants: [currentUserId, recipientId],
      timestamp: serverTimestamp(),
    });

    setMessage('');
  };

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
                  {msg.timestamp?.toDate().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {/* <div className="chatbox-input-area">
        <input
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
          placeholder="Type a message..."
          className="chatbox-input"
        />
        <button onClick={sendMessage} className="chatbox-send-button" title="Send">Send</button>
      </div> */}
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
          rows={1} // optional: can be removed for auto-grow
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






// not so futuristic
// import React, { useEffect, useState, useRef } from 'react';
// import { firestore, auth } from './firebaseConfig';
// import {
//   collection,
//   addDoc,
//   query,
//   orderBy,
//   onSnapshot,
//   serverTimestamp,
// } from 'firebase/firestore';

// import './ChatBox.css'; // 👈 Import the CSS

// function ChatBox({ conversationId, recipientId, onClose }) {
//   const [message, setMessage] = useState('');
//   const [messages, setMessages] = useState([]);
//   const messagesEndRef = useRef(null);

//   const messagesRef = collection(firestore, 'conversations', conversationId, 'messages');

//   useEffect(() => {
//     if (!conversationId) return;

//     const q = query(messagesRef, orderBy('timestamp', 'asc'));

//     const unsub = onSnapshot(q, (snapshot) => {
//       setMessages(snapshot.docs.map(doc => doc.data()));
//     });

//     return () => unsub();
//   }, [conversationId]);

//   useEffect(() => {
//     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
//   }, [messages]);

//   const sendMessage = async () => {
//     if (!message.trim()) return;

//     const senderId = auth.currentUser?.uid;

//     await addDoc(messagesRef, {
//       text: message,
//       senderId,
//       recipientId,
//       participants: [senderId, recipientId],
//       timestamp: serverTimestamp(),
//     });

//     setMessage('');
//   };

//   return (
//     <div className="chatbox-container">
//       {/* Header */}
//       <div className="chatbox-header">
//         <span>💬 Chat</span>
//         <button onClick={onClose} className="chatbox-close-button">✖</button>
//       </div>

//       {/* Messages */}
//       <div className="chatbox-messages">
//         {messages.map((msg, i) => {
//           const isSender = msg.senderId === auth.currentUser?.uid;
//           return (
//             <div
//               key={i}
//               className={`chatbox-message-row ${isSender ? 'chatbox-message-sent' : 'chatbox-message-received'}`}
//             >
//               <div className="chatbox-message-bubble">
//                 <div>{msg.text}</div>
//                 <div className="chatbox-message-timestamp">
//                   {msg.timestamp?.toDate().toLocaleTimeString([], {
//                     hour: '2-digit',
//                     minute: '2-digit'
//                   })}
//                 </div>
//               </div>
//             </div>
//           );
//         })}
//         <div ref={messagesEndRef} />
//       </div>

//       {/* Input */}
//       <div className="chatbox-input-area">
//         <input
//           value={message}
//           onChange={e => setMessage(e.target.value)}
//           onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }}
//           placeholder="Type a message..."
//           className="chatbox-input"
//         />
//         <button onClick={sendMessage} className="chatbox-send-button" title="Send">➤</button>
//       </div>
//     </div>
//   );
// }

// export default ChatBox;










// import React, { useEffect, useState } from 'react';
// import { firestore, auth } from './firebaseConfig';
// import {
//   collection,
//   addDoc,
//   query,
//   orderBy,
//   onSnapshot,
//   serverTimestamp,
// } from 'firebase/firestore';

// function ChatBox({ conversationId, recipientId, onClose }) {
//   const [message, setMessage] = useState('');
//   const [messages, setMessages] = useState([]);
  

//   const messagesRef = collection(firestore, 'conversations', conversationId, 'messages');

//   useEffect(() => {
//   if (!conversationId) return;

//   const messagesRef = collection(firestore, 'conversations', conversationId, 'messages');
//   const q = query(messagesRef, orderBy('timestamp', 'asc'));

//   const unsub = onSnapshot(q, (snapshot) => {
//     setMessages(snapshot.docs.map(doc => doc.data()));
//   });

//   return () => unsub();
// }, [conversationId]);



//   // useEffect(() => {
//   //   const q = query(messagesRef, orderBy('timestamp', 'asc'));
//   //   const unsub = onSnapshot(q, (snapshot) => {
//   //     setMessages(snapshot.docs.map(doc => doc.data()));
//   //   });

//   //   return () => unsub();
//   // }, [conversationId]);

//   const sendMessage = async () => {
//     if (!message.trim()) return;

//     const senderId = auth.currentUser?.uid;

//     await addDoc(messagesRef, {
//       text: message,
//       senderId,
//       recipientId,
//       participants: [senderId, recipientId],
//       timestamp: serverTimestamp(),
//     });

//     setMessage('');
//   };

//   return (
//     <div style={{
//       position: 'absolute', 
//       borderRadius: '5px', 
//       zIndex: 1000, 
//       padding: 20, 
//       border: '1px solid #ccc', 
//       marginTop: 20, 
//       background: 'rgba(168, 89, 37, 1)' 
//       }}>
//       {/* ✅ Close Button */}
//         <div style={{ textAlign: 'right' }}>
//           <button onClick={onClose} style={{
//             position: 'absolute',
//             top: 5,
//             right: 15,
//             background: 'transparent',
//             border: 'none',
//             fontSize: '1.2rem',
//             fontWeight: 'bold',
//             cursor: 'pointer',
//             color: 'white'
//           }}>
//             ✖
//           </button>
//         </div>
      
//       <h4 style={{ 
//         marginTop: -10,
//         color: 'white',
//         paddingRight: 15,
//         borderRadius: 5,
//         width: 'fit-content',
//         background: 'rgba(0, 0, 0, 0.2)',
//         }}>💬 Chat</h4>
//       <div style={{ maxHeight: 200, overflowY: 'auto' }}>
//         {messages.map((msg, i) => (
//           <div key={i} style={{
//             textAlign: msg.senderId === auth.currentUser.uid ? 'right' : 'left',
//             margin: '5px 0'
//           }}>
//             <span><strong>{msg.senderId === auth.currentUser.uid ? 'You' : 'Them'}:</strong> {msg.text}</span>
//             <div style={{ fontSize: '0.8em', color: '#aaa' }}>
//               {msg.timestamp?.toDate().toLocaleTimeString()}
//             </div>

//           </div>
//         ))}
//       </div>
//       <div>
//         <input
//           value={message}
//           onChange={e => setMessage(e.target.value)}
//           placeholder="Type a message..."
//           style={{ width: '80%' }}
//         />
//         <button onClick={sendMessage}>Send</button>
//       </div>
//     </div>
//   );
// }

// export default ChatBox;




// // ChatBox.js
// import React, { useEffect, useState } from 'react';
// import { firestore, auth } from './firebaseConfig';
// import {
//   collection,
//   addDoc,
//   query,
//   orderBy,
//   onSnapshot,
//   serverTimestamp,
// } from 'firebase/firestore';

// function ChatBox({ conversationId }) {
//   const [message, setMessage] = useState('');
//   const [messages, setMessages] = useState([]);

//   const messagesRef = collection(firestore, 'conversations', conversationId, 'messages');

//   useEffect(() => {
//     const q = query(messagesRef, orderBy('timestamp', 'asc'));
//     const unsub = onSnapshot(q, (snapshot) => {
//       setMessages(snapshot.docs.map(doc => doc.data()));
//     });

//     return () => unsub();
//   }, [conversationId]);

//   const sendMessage = async () => {
//   if (!message.trim()) return;

//   const senderId = auth.currentUser?.uid;
//   const recipientId = conversationId.replace(senderId, '').replace('-', '');

//   await addDoc(messagesRef, {
//     text: message,
//     senderId,
//     recipientId,
//     participants: [senderId, recipientId],
//     timestamp: serverTimestamp(),
//   });

//   setMessage('');
// };

//   return (
//     <div style={{ padding: 10, border: '1px solid #ccc', marginTop: 20 }}>
//       <h4>💬 Chat</h4>
//       <div style={{ maxHeight: 200, overflowY: 'auto' }}>
//         {messages.map((msg, i) => (
//           <div key={i} style={{
//             textAlign: msg.senderId === auth.currentUser.uid ? 'right' : 'left',
//             margin: '5px 0'
//           }}>
//             <span>{msg.text}</span>
//           </div>
//         ))}
//       </div>
//       <div>
//         <input
//           value={message}
//           onChange={e => setMessage(e.target.value)}
//           placeholder="Type a message..."
//           style={{ width: '80%' }}
//         />
//         <button onClick={sendMessage}>Send</button>
//       </div>
//     </div>
//   );
// }

// export default ChatBox;
