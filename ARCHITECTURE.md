# System Architecture & Technical Design


## 1. High-Level System Architecture

The application is structured as a full-stack real-time communication platform combining RESTful APIs for data persistence and media processing with WebSockets (Socket.IO) for bi-directional live messaging and user presence.

```mermaid
flowchart TB
    subgraph Client["Frontend Client (React 19 + Vite)"]
        UI["UI Layer (HeroUI + Tailwind CSS v4)"]
        Zustand["State Management (Zustand)"]
        ClerkClient["Clerk React SDK"]
        SocketClient["Socket.IO Client"]
    end

    subgraph ExternalAuth["Clerk Identity Platform"]
        ClerkAuth["Clerk Auth Engine"]
        ClerkWebhookEngine["Webhook Dispatcher"]
    end

    subgraph MediaStorage["ImageKit Cloud Storage"]
        ImageKitAPI["ImageKit Upload & CDN"]
        ImageKitTransform["Real-time Media Transformations"]
    end

    subgraph BackendServer["Backend Application (Express 5 + Node.js)"]
        ExpressApp["Express API Router"]
        AuthMiddleware["Clerk & Session Middleware"]
        UploadMiddleware["Multer Memory Buffer"]
        SocketServer["Socket.IO Server (userSocketMap)"]
        WebhookHandler["Clerk Webhook Handler"]
    end

    subgraph Database["MongoDB Database (Mongoose)"]
        UsersCollection[("users Collection")]
        MessagesCollection[("messages Collection")]
    end

    %% Client flows
    UI --> Zustand
    Zustand --> ExpressApp
    ClerkClient <--> ClerkAuth
    SocketClient <--> SocketServer

    %% Backend flows
    ExpressApp --> AuthMiddleware
    ExpressApp --> UploadMiddleware
    UploadMiddleware --> ImageKitAPI
    ExpressApp --> Database
    SocketServer --> Database

    %% Webhook sync
    ClerkWebhookEngine -- "POST /api/webhooks/clerk (Svix verified)" --> WebhookHandler
    WebhookHandler --> UsersCollection

    %% Media transformations
    UI -- "Fetch optimized image/video" --> ImageKitTransform
```

---

## 2. Entity-Relationship (ER) Diagram

The persistence layer uses MongoDB via Mongoose. The database is organized around two primary collections: `User` and `Message`.

```mermaid
erDiagram
    USER ||--o{ MESSAGE : "sends (senderId)"
    USER ||--o{ MESSAGE : "receives (receiverId)"

    USER {
        ObjectId _id PK "Unique user identifier"
        String clerkId UK "Clerk Authentication ID"
        String email UK "User primary email address"
        String fullName "User display name"
        String profilePic "Avatar URL from Clerk or default"
        Date createdAt "Timestamp of user creation"
        Date updatedAt "Timestamp of last profile update"
    }

    MESSAGE {
        ObjectId _id PK "Unique message identifier"
        ObjectId senderId FK "References USER._id"
        ObjectId receiverId FK "References USER._id"
        String text "Optional message text content"
        String image "Optional ImageKit URL for photo"
        String video "Optional ImageKit URL for video"
        Date createdAt "Timestamp when message was sent"
        Date updatedAt "Timestamp of message update"
    }
```
---

## 3. Data Flow & Sequence Diagrams

### 3.1 Authentication & User Profile Synchronization

User accounts are authenticated through Clerk. When users sign up or update profiles, Clerk emits a signed webhook that syncs the user into MongoDB, making them immediately available in search and chat.

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Browser
    participant Client as Frontend (React / Clerk SDK)
    participant Clerk as Clerk Auth Service
    participant Webhook as Express Webhook (/api/webhooks/clerk)
    participant API as Express API (/api/auth/check)
    participant DB as MongoDB

    User->>Client: Open app & Click "Continue"
    Client->>Clerk: Trigger SignIn / SignUp Modal
    Clerk-->>User: Authenticate credentials
    Clerk-->>Client: Issue Session Token & JWT Cookies

    par Asynchronous Webhook Sync
        Clerk->>Webhook: POST /api/webhooks/clerk (user.created / user.updated)
        Note over Webhook: Verify Svix signature with CLERK_WEBHOOK_SIGNING_SECRET
        Webhook->>DB: User.findOneAndUpdate({ clerkId }, data, { upsert: true })
        DB-->>Webhook: User profile saved
        Webhook-->>Clerk: HTTP 200 { received: true }
    and Client Session Verification
        Client->>API: GET /api/auth/check (credentials: include)
        Note over API: clerkMiddleware + protectRoute resolves getAuth(req)
        API->>DB: User.findOne({ clerkId: userId })
        DB-->>API: Return User document
        API-->>Client: HTTP 200 { ok: true, user }
        Client->>Client: Initialize useAuthStore & Socket Connection
    end
```

---

### 3.2 Real-Time Messaging & Media Delivery

When a user sends a message (text, image, or video), the message is processed via REST API and dispatched in real time via Socket.IO to the recipient.

```mermaid
sequenceDiagram
    autonumber
    actor Sender as Sender (Client A)
    participant ClientA as Client A Store & Socket
    participant Express as Express Server (routes/message.routes.js)
    participant ImageKit as ImageKit Storage
    participant DB as MongoDB
    participant SocketServer as Socket.IO Server
    actor Receiver as Receiver (Client B)
    participant ClientB as Client B Store & Socket

    Sender->>ClientA: Types message / Attaches media & clicks Send
    alt Attachment Present (Image/Video)
        ClientA->>Express: POST /api/messages/send/:receiverId (FormData with 'media')
        Express->>ImageKit: uploadChatMedia(file.buffer, fileName)
        ImageKit-->>Express: Returns media URL
    else Text Only
        ClientA->>Express: POST /api/messages/send/:receiverId ({ text })
    end

    Express->>DB: new Message({ senderId, receiverId, text, image, video }).save()
    DB-->>Express: Message saved with _id and timestamps

    Express->>SocketServer: getReceiverSocketId(receiverId)
    alt Receiver is Online
        SocketServer->>ClientB: emit("newMessage", savedMessage)
        ClientB->>Receiver: Append message to view & trigger audio/scroll
    end

    Express-->>ClientA: HTTP 201 Created (savedMessage)
    ClientA->>Sender: Append to local feed, reset composer & refresh conversations
```

---

### 3.3 User Presence & Socket Lifecycle

Presence tracking is maintained entirely in-memory on the Socket.IO server via `userSocketMap`.

```mermaid
sequenceDiagram
    autonumber
    actor Client as User App Instance
    participant Store as useAuthStore (Zustand)
    participant SocketServer as Backend Socket.IO Server
    participant AllClients as Connected Clients Broadcast

    Note over Client,Store: Auth verified via /api/auth/check
    Store->>SocketServer: io.connect(BASE_URL, { query: { userId } })
    SocketServer->>SocketServer: userSocketMap[userId] = socket.id
    SocketServer->>AllClients: io.emit("getOnlineUsers", Object.keys(userSocketMap))
    AllClients->>AllClients: Update online indicator badges in UI

    alt User closes tab or disconnects
        Client->>SocketServer: socket.disconnect()
        SocketServer->>SocketServer: delete userSocketMap[userId]
        SocketServer->>AllClients: io.emit("getOnlineUsers", Object.keys(userSocketMap))
        AllClients->>AllClients: Update indicator to offline
    end
```

---

## 4. Frontend State Management & Context Pipeline

The frontend separates concerns into modular Zustand stores for business logic and React Contexts for UI personalization:

```mermaid
graph TD
    subgraph Providers["Application Root & Providers (App.jsx)"]
        ClerkProv["ClerkProvider (Auth Context)"]
        RouterProv["BrowserRouter (Routing)"]
        ThemeProv["ThemeProvider (Light/Dark + HeroUI Presets)"]
        WallProv["WallpaperProvider (macOS Wallpaper Backdrop)"]
    end

    subgraph Stores["Global State Stores (Zustand)"]
        AuthStore["useAuthStore<br/>• authUser<br/>• onlineUsers<br/>• socket instance<br/>• checkAuth() / connectSocket()"]
        ChatStore["useChatStore (Persisted)<br/>• conversations[]<br/>• messages[]<br/>• activeConversationId<br/>• selectedUser<br/>• searchQuery / searchResults<br/>• composerText<br/>• isSoundEnabled<br/>• sendTextMessage() / sendMediaMessage()"]
    end

    subgraph Hooks["Custom Composition Hooks"]
        useSelected["useSelectedConversation()<br/>Maps DB messages to UI ViewModel with peer initials & roles"]
        useSound["useKeyboardSound()<br/>Plays randomized mechanical key audio"]
        useScroll["useScrollToBottom()<br/>Auto-scrolls chat window on thread update"]
        useMedia["useMediaQuery()<br/>Responsive viewport switching (Desktop/Mobile view)"]
    end

    subgraph Pages["Pages & UI Components"]
        AuthPage["AuthPage (HeroPanel, ActionPanel)"]
        ChatPage["ChatPage"]
        Sidebar["ChatSidebar (Chats tab, Users email search)"]
        ChatHeader["ChatHeader (Online status, theme/wallpaper toggles)"]
        MessageList["MessageList & MessageBubble (ImageKit transformations & video poster)"]
        ChatComposer["ChatComposer (Text input, Media file picker)"]
    end

    %% Bindings
    ClerkProv --> RouterProv --> ThemeProv --> WallProv
    WallProv --> AuthPage
    WallProv --> ChatPage

    AuthStore --> useSelected
    ChatStore --> useSelected
    ChatStore --> Sidebar
    ChatStore --> ChatHeader
    ChatStore --> MessageList
    ChatStore --> ChatComposer

    useSelected --> ChatHeader
    useSelected --> MessageList
    useSelected --> ChatComposer
    useSound --> ChatComposer
    useScroll --> MessageList
    useMedia --> ChatPage
```

---

