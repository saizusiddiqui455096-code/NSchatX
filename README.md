# NS ChatX — Private Real-Time Chat Rooms

A modern, fully functional real-time chat application built with Node.js, Express, and WebSocket technology. Create private rooms with password protection and chat with multiple users instantly without page refreshes.

## Features

✨ **Real-Time Messaging** — Messages delivered instantly via WebSocket  
🔐 **Password Protected Rooms** — Secure room access with room codes and passwords  
👥 **User Presence** — See who's online and connected to your room  
✏️ **Typing Indicators** — Know when others are typing  
📱 **Responsive Design** — Works beautifully on desktop, tablet, and mobile  
🌙 **Dark/Light Mode** — Toggle between dark and light themes  
💬 **Message History** — View chat history when you join a room  
🎯 **Join Notifications** — See when users enter and leave  
📋 **User List** — See all connected users in the sidebar  
⌨️ **Smart Input** — Press Enter to send, Shift+Enter for new lines  
📋 **Copy Room Code** — Easy room code sharing with one click  

## Technology Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** Node.js + Express
- **Real-Time Communication:** WebSocket (ws library)
- **Authentication:** Token-based REST API
- **Storage:** In-memory (rooms expire after 1 hour of inactivity)

## Project Structure

```
NS-ChatX/
├── public/
│   ├── index.html       # Main HTML page
│   ├── style.css        # Styling and design system
│   └── app.js           # Frontend application logic
├── server.js            # Express + WebSocket server
├── package.json         # Project dependencies
└── README.md            # This file
```

## Getting Started

### Prerequisites

- Node.js 14+ and npm

### Installation

1. **Clone or download the repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open in browser**
   ```
   http://localhost:3000
   ```

## How to Use

### Creating a Room

1. Open the application
2. Click the **"Create a room"** tab
3. Enter your **username** (2+ characters)
4. Either:
   - Click **"Generate"** to auto-generate a room ID, or
   - Enter a custom room ID
5. Enter a **password** (4+ characters)
6. Click **"Create room"**
7. Share the room ID and password with others

### Joining a Room

1. Open the application
2. Stay on the **"Join a room"** tab
3. Enter your **username** (2+ characters)
4. Enter the **room ID** you were given
5. Enter the **room password**
6. Click **"Enter room"**

### In the Chat Room

- **Send a message:** Type and press Enter (or click Send button)
- **New line:** Press Shift+Enter
- **See typing status:** Watch for "X is typing…" below the message area
- **View members:** Click the people icon to see who's online
- **Copy room ID:** Click the copy button to share the room ID
- **Toggle theme:** Click the sun/moon icon for dark/light mode
- **Leave room:** Click the "Leave" button to exit

## Testing with Two Browsers

Perfect for testing real-time functionality:

**Browser 1 (Shayan):**
- Username: `Shayan`
- Room ID: `ABC123`
- Password: `12345`
- Create the room

**Browser 2 (Rahul):**
- Username: `Rahul`
- Room ID: `ABC123`
- Password: `12345`
- Join the room

Now both browsers are in the same room. Messages from one appear instantly on the other without page refresh!

## Server Endpoints

### REST API

- `POST /api/rooms` — Create a new room
- `POST /api/rooms/join` — Join an existing room
- `GET /api/health` — Check server status

### WebSocket

- `ws://localhost:3000/ws?token=<token>` — WebSocket connection for real-time messaging

## Architecture

### Authentication Flow

1. User submits username, room ID, and password via REST API
2. Server validates credentials
3. If valid, server issues a short-lived token
4. Client uses token to establish WebSocket connection
5. Server upgrades connection and adds user to room

### Message Broadcasting

1. User sends message over WebSocket
2. Server validates message
3. Server broadcasts to all users in the same room
4. Other clients receive message instantly
5. Messages are stored in room history (up to 200 messages)

### Room Lifecycle

- Rooms are created on-demand in server memory
- Messages stored in room history
- Empty rooms expire after 1 hour
- When user disconnects, room user list updates
- Other users see leave notification

## Security Features

- Passwords hashed with crypto.scrypt
- Timing-safe password comparison
- Token-based authentication
- CORS enabled for cross-origin requests
- Input validation and sanitization
- Message length limits (2000 characters)

## Customization

### Port Configuration

Set the PORT environment variable:
```bash
PORT=8000 npm start
```

### Styling

Edit `public/style.css` to customize:
- Color schemes (dark/light themes)
- Typography
- Spacing and layout
- Animations

### Message History

Adjust in `server.js`:
```javascript
const HISTORY_MAX = 200; // Max messages to keep
```

### Room Expiration

Adjust in `server.js`:
```javascript
const ROOM_TTL_MS = 60 * 60 * 1000; // 1 hour
```

## Troubleshooting

### "Connection refused" error
- Ensure server is running with `npm start`
- Check that port 3000 is not in use
- Try a different port: `PORT=3001 npm start`

### Messages not sending
- Check browser console for errors
- Ensure both users are in the same room with correct password
- Verify WebSocket connection is established (green dot in header)

### Can't join room
- Verify room ID and password are correct
- Check that the creator hasn't left yet (empty rooms expire)
- Try creating a new room instead

### Styling looks broken
- Clear browser cache (Ctrl+Shift+Delete or Cmd+Shift+Delete)
- Hard refresh the page (Ctrl+Shift+R or Cmd+Shift+R)

## Performance

- Handles multiple concurrent rooms
- Efficient message broadcasting
- Automatic cleanup of expired rooms and tokens
- Scrollbar height optimized for large message histories

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

MIT

## Author

Built with ❤️ as a functional real-time chat application.

---

**Ready to chat?** Start the server and open http://localhost:3000 in two browser windows to test real-time messaging!
