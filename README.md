# 🚀 ZeroOne — Modern Communication Platform

**ZeroOne** is a full-featured communication platform with HD video calls, real-time messaging, group chats, and seamless collaboration tools — inspired by Zoom and WhatsApp, built with modern web technologies.

## ✨ Features

### 🎥 Video & Audio Calls
- **1080p HD Video** calls with adaptive quality
- **AI-powered noise cancellation** for crystal-clear audio
- **Screen sharing** with audio support
- **Group video calls** up to 100 participants
- **Audio-only calls** for low-bandwidth situations
- **Background blur** and virtual backgrounds
- **Raise hand** and reactions in meetings
- **Call history** and missed call tracking

### 💬 Real-Time Messaging
- **Instant messaging** with read receipts
- **Group chats** with unlimited members
- **Rich media** support (images, files, voice messages)
- **Message reactions** with emoji picker
- **Reply & forward** messages
- **Typing indicators** in real-time
- **Voice messages** with waveform visualization
- **End-to-end encryption** ready architecture

### 👥 Contacts & Groups
- **Contact management** with search
- **Create groups** with custom names and photos
- **Group admin controls**
- **Online status** indicators (online, away, busy, offline)
- **User presence** with last seen
- **Profile customization** with bio and status

### 📅 Meetings & Scheduling
- **Instant meetings** with unique IDs
- **Schedule meetings** with calendar integration
- **Meeting join links** for easy sharing
- **Waiting room** support
- **Recording** capabilities (coming soon)
- **Meeting history** and analytics

### 🎨 Modern UI/UX
- **Dark theme** with minimalist design
- **Lucide icons** for consistent visuals
- **Smooth animations** and transitions
- **Responsive design** for all devices
- **Accessibility** compliant (WCAG 2.1)
- **Toast notifications** for feedback
- **Modal dialogs** for actions

### 🔐 Security & Privacy
- **Firebase Authentication** (Email, Google, GitHub)
- **Secure WebRTC** connections with STUN/TURN
- **Real-time Database** for presence and signaling
- **Firestore** for persistent data
- **Cloud Storage** for media files
- **Privacy controls** (last seen, online status, read receipts)

---

## 🛠️ Technology Stack

### Frontend
- **HTML5** — Semantic structure
- **CSS3** — Custom properties, animations, grid, flexbox
- **Vanilla JavaScript** — No frameworks, pure ES6+
- **Lucide Icons** — Beautiful, consistent icon set
- **WebRTC** — Real-time peer-to-peer communication
- **MediaRecorder API** — Voice message recording
- **Canvas API** — (Optional) for effects

### Backend
- **Firebase Authentication** — User management
- **Cloud Firestore** — NoSQL database for chats, users, meetings
- **Realtime Database** — Presence, typing indicators, call signaling
- **Cloud Storage** — File uploads (images, documents, voice)
- **Cloud Functions** — (Optional) for notifications and triggers

---

## 📦 Setup Instructions

### Prerequisites
1. **Node.js** (optional, for local server)
2. **Firebase Project** — Create one at [console.firebase.google.com](https://console.firebase.google.com)
3. **Modern Web Browser** — Chrome, Firefox, Safari, or Edge

### Step 1: Clone/Download

Place all files in a directory, e.g., `/home/ram/Desktop/call/`

```
call/
├── index.html              # Login page
├── dashboard.html          # Main app
├── firebase-config.js      # Firebase configuration
├── styles/
│   ├── global.css          # Global styles & utilities
│   ├── login.css           # Login/signup page styles
│   └── dashboard.css       # Dashboard layout & components
├── js/
│   ├── utils.js            # Utility functions
│   ├── auth.js             # Authentication logic
│   ├── profile-setup.js    # Profile setup flow
│   ├── dashboard.js        # Dashboard core
│   ├── chat.js             # Messaging & chat
│   ├── calls.js            # WebRTC calls
│   ├── contacts.js         # Contact management
│   ├── groups.js           # Group chat
│   ├── meetings.js         # Meetings & scheduling
│   ├── notifications.js    # Notifications
│   └── profile.js          # User profile
└── README.md               # This file
```

### Step 2: Firebase Configuration

1. **Create a Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Create a new project (e.g., "ZeroOne")

2. **Enable Services**
   - **Authentication**: Enable Email/Password, Google, and GitHub providers
   - **Firestore Database**: Create in production mode, add rules (see below)
   - **Realtime Database**: Create, add rules (see below)
   - **Storage**: Enable, add rules (see below)

3. **Get Firebase Config**
   - Go to Project Settings → General → Your apps
   - Add a Web app, copy the config object
   - Replace the values in `firebase-config.js`:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com"
};
```

### Step 3: Firebase Security Rules

#### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
      match /contacts/{contactId} {
        allow read, write: if request.auth.uid == userId;
      }
    }
    match /chats/{chatId} {
      allow read, write: if request.auth != null && request.auth.uid in resource.data.members;
    }
    match /chats/{chatId}/messages/{messageId} {
      allow read: if request.auth != null && request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.members;
      allow create: if request.auth != null && request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.members;
      allow update, delete: if request.auth != null && request.auth.uid == resource.data.senderId;
    }
    match /meetings/{meetingId} {
      allow read, write: if request.auth != null;
    }
    match /callHistory/{callId} {
      allow read, write: if request.auth != null && request.auth.uid in resource.data.participants;
    }
    match /notifications/{notifId} {
      allow read: if request.auth != null && request.auth.uid == resource.data.recipientId;
      allow create: if request.auth != null;
    }
  }
}
```

#### Realtime Database Rules
```json
{
  "rules": {
    "presence": {
      "$uid": {
        ".read": true,
        ".write": "$uid === auth.uid"
      }
    },
    "typing": {
      "$chatId": {
        ".read": true,
        "$uid": {
          ".write": "$uid === auth.uid"
        }
      }
    },
    "calls": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": true
      }
    },
    "webrtc": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

#### Storage Rules
> **Not needed** — this app runs entirely on the free Spark plan.  
> Images, voice messages, and file attachments are compressed and stored as  
> base64 data URIs directly inside Firestore documents.  
> If you ever upgrade to the Blaze plan, Firebase Storage can be re-enabled  
> for larger file support (full instructions are in the code comments).

### Step 4: Run the Application

#### Option 1: Using a Simple HTTP Server
```bash
# Python 3
cd /home/ram/Desktop/call
python3 -m http.server 8000

# Then open: http://localhost:8000
```

#### Option 2: Using Node.js
```bash
npx serve /home/ram/Desktop/call
```

#### Option 3: Using VS Code Live Server
- Install "Live Server" extension
- Right-click `index.html` → "Open with Live Server"

### Step 5: Create Your Account
1. Open the app in your browser
2. Click "Create Account"
3. Enter your details and register
4. Complete the profile setup
5. Start using ZeroOne!

---

## 🎯 Usage Guide

### Creating an Account
1. Go to the app URL
2. Click **Create Account** tab
3. Fill in name, email, password
4. Accept terms and click **Create Account**
5. Complete profile setup (photo, username, bio, preferences)
6. Click **Let's go!** to enter the dashboard

### Starting a Video Call
1. Go to **Messages** or **Contacts**
2. Select a contact
3. Click the **video icon** in the header
4. Allow camera/microphone permissions
5. The call will connect automatically

### Sending Messages
1. Go to **Messages**
2. Click **New Chat** or select a conversation
3. Type your message and press Enter
4. Use icons to send images, files, or voice messages

### Creating a Meeting
1. Go to **Home** page
2. Click **New Meeting** card
3. Enter a topic (optional)
4. Click **Start Meeting**
5. Share the meeting ID with participants

### Scheduling a Meeting
1. Click **Schedule** on the home page
2. Enter meeting details (topic, date, time)
3. Click **Schedule**
4. The meeting appears in "Upcoming Meetings"

---

## 🔧 Customization

### Changing Colors
Edit `styles/global.css` → `:root` section:

```css
:root {
  --accent: #6c63ff;        /* Primary accent color */
  --green: #22c55e;         /* Success/online color */
  --red: #ef4444;           /* Error/busy color */
  /* ...more colors */
}
```

### Adding New Features
1. Create a new JS file in `js/` folder
2. Include it in `dashboard.html` before `</body>`
3. Follow existing code patterns for consistency

---

## 🐛 Troubleshooting

### Camera/Microphone Not Working
- **Check browser permissions**: Click the lock icon in address bar
- **Try HTTPS**: WebRTC requires secure context
- **Test in Chrome**: Best WebRTC support

### Firebase Connection Issues
- **Check config**: Verify all Firebase config values
- **Check rules**: Ensure security rules are deployed
- **Check console**: Open browser DevTools → Console for errors

### Calls Not Connecting
- **Firewall**: Ensure STUN/TURN ports are open
- **Network**: WebRTC requires UDP (may not work on restrictive networks)
- **Both users online**: Check presence indicators

---

## 🚀 Deployment

### Deploy to Firebase Hosting
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize
firebase init hosting

# Deploy
firebase deploy --only hosting
```

### Deploy to Netlify
1. Drag and drop the `/call` folder to [Netlify](https://app.netlify.com/drop)
2. Or connect your Git repository
3. Set build settings: none needed (static site)

### Deploy to Vercel
```bash
npm i -g vercel
cd /home/ram/Desktop/call
vercel
```

---

## 📝 License

This project is open-source and available for personal and commercial use.

---

## 🙏 Credits

- **Icons**: [Lucide Icons](https://lucide.dev)
- **Fonts**: [Google Fonts - Inter & Space Grotesk](https://fonts.google.com)
- **Backend**: [Firebase](https://firebase.google.com)
- **WebRTC**: Google STUN servers

---

## 📧 Support

For issues or questions:
1. Check this README
2. Check browser console for errors
3. Verify Firebase configuration
4. Test in a different browser

---

**Built with ❤️ for modern communication**

ZeroOne — Connect, Communicate, Collaborate
