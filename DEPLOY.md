# Complete Deployment Guide
## Mendikot Game Server → Render.com (Free, No Credit Card)

---

## YOUR COMPLETE FILE STRUCTURE

```
mendikot-server/                  ← your GitHub repository root
│
├── server.js                     ← main server (replaces Cloud Functions)
├── package.json                  ← Node.js dependencies
├── render.yaml                   ← Render.com auto-config
├── firebase.json                 ← Firebase CLI config (for rules + indexes)
├── firestore.rules               ← Firestore security rules
├── firestore.indexes.json        ← Firestore compound query indexes
├── firebase.service.js           ← client-side code (goes in your frontend)
├── .env.example                  ← copy to .env for local dev
├── .gitignore                    ← protects your secrets
│
└── src/                          ← pure game engine (no Firebase)
    ├── index.js
    ├── constants.js
    ├── stateFactory.js
    ├── deck.js
    ├── validators.js
    ├── rules.js
    ├── transitions.js
    ├── invariants.js
    ├── publicState.js
    └── actionHandlers.js         ← bridges engine ↔ Firebase
```

---

## PART 1: FIREBASE SETUP (one time)

### Step 1 — Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click **"Add project"** → Name it `mendikot-game`
3. Disable Google Analytics → **Create project**

### Step 2 — Enable Firestore
1. Left sidebar → **Build → Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in production mode"** (our rules secure it)
4. Pick any region (e.g. `us-central`)

### Step 3 — Enable Anonymous Authentication
1. Left sidebar → **Build → Authentication**
2. Click **"Get started"**
3. Click **"Anonymous"** → Toggle **Enable** → Save

### Step 4 — Get your Firebase Web Config
1. Left sidebar → **Project Settings** (gear icon)
2. Scroll to **"Your apps"** → Click **"</>  Web"**
3. Register the app with any name
4. Copy the `firebaseConfig` object — you need it in `firebase.service.js`

### Step 5 — Get your Service Account Key
```
This is what lets your server talk to Firebase with full admin access.
```
1. **Project Settings → Service Accounts tab**
2. Click **"Generate new private key"**
3. Download the `.json` file — keep it SAFE, never commit to git
4. Open the file and note:
   - `project_id`
   - `client_email`
   - `private_key`

### Step 6 — Deploy Firestore Rules and Indexes
```bash
# Install Firebase CLI (one time)
npm install -g firebase-tools

# Login
firebase login

# In your project folder:
firebase deploy --only firestore
```
This deploys:
- `firestore.rules` → secures your database
- `firestore.indexes.json` → enables compound queries (takes ~2 min to build)

---

## PART 2: RENDER.COM SETUP (one time)

### Step 1 — Push to GitHub
```bash
# In your project folder:
git init
git add .
git commit -m "Initial commit"
git branch -M main

# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/mendikot-server.git
git push -u origin main
```

### Step 2 — Create Render Account
1. Go to https://render.com
2. Sign up with GitHub (so it can access your repos)
3. **No credit card required for free plan**

### Step 3 — Create Web Service
1. Click **"New +"** → **"Web Service"**
2. Click **"Connect"** next to your `mendikot-server` repo
3. Render auto-detects `render.yaml` and fills in settings

### Step 4 — Add Environment Variables
In the Render dashboard → your service → **"Environment"** tab:

| Key | Value |
|-----|-------|
| `FIREBASE_PROJECT_ID` | your-project-id |
| `FIREBASE_CLIENT_EMAIL` | firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com |
| `FIREBASE_PRIVATE_KEY` | The entire private key including `-----BEGIN PRIVATE KEY-----` |

⚠️ For `FIREBASE_PRIVATE_KEY`: paste the entire value exactly as it appears
in the `.json` file, including the `\n` characters. Render handles it correctly.

### Step 5 — Deploy
Click **"Create Web Service"** → Render builds and deploys automatically.

Your server URL will be:
```
https://mendikot-server.onrender.com
```
(or whatever name you chose)

---

## PART 3: CONNECT CLIENT TO SERVER

### Update firebase.service.js
Replace the placeholder URL:
```javascript
// Before:
const SERVER_URL = 'https://mendikot-server.onrender.com';

// After (use your actual Render URL):
const SERVER_URL = 'https://your-actual-name.onrender.com';
```

Also fill in your Firebase config:
```javascript
const firebaseConfig = {
  apiKey:            'AIzaSy...',        // from Firebase console
  authDomain:        'mendikot-game.firebaseapp.com',
  projectId:         'mendikot-game',
  storageBucket:     'mendikot-game.appspot.com',
  messagingSenderId: '123456789',
  appId:             '1:123456789:web:abcdef',
};
```

---

## PART 4: LOCAL DEVELOPMENT

### Setup .env
```bash
# Copy the example file
cp .env.example .env

# Edit .env and fill in your values from the service account JSON:
FIREBASE_PROJECT_ID=mendikot-game
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@mendikot-game.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nABC123...\n-----END PRIVATE KEY-----\n"
PORT=3000
```

### Run locally
```bash
npm install
npm run dev     # uses node --watch for auto-restart on file changes
```

Your local server: `http://localhost:3000`
Test it: `http://localhost:3000/health` → should return `{"status":"ok"}`

---

## FREE TIER LIMITS COMPARISON

| | Firebase Functions | Render.com |
|--|--|--|
| Cost | Requires credit card | Truly free |
| Invocations | 2M/month | Unlimited |
| Compute | Per-invocation | Always-on |
| Sleep | Never | After 15 min idle |
| Wake time | Instant | ~30 seconds |
| Credit card | Required | Never required |

**The 30-second wake time** only affects the very first request after 15 minutes
of no activity. Once awake, the server responds in milliseconds. For a game
with active players, the server stays awake continuously.

---

## COMMON ERRORS AND FIXES

### "FIREBASE_PRIVATE_KEY is invalid"
The private key must preserve newlines. In Render, paste it exactly as:
```
-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9...
-----END PRIVATE KEY-----
```

### "Failed to parse Firebase options"
Make sure all 3 environment variables are set in Render dashboard.

### "Permission denied" from Firestore
Run `firebase deploy --only firestore` to apply security rules.

### "Index not found" error
Run `firebase deploy --only firestore:indexes` and wait 2-3 minutes for indexes to build.

### Server not waking up fast enough
Add a keep-alive ping from your client on app load:
```javascript
fetch(`${SERVER_URL}/health`).catch(() => {}); // wake the server
```

---

## DEPLOYMENT CHECKLIST

- [ ] Firebase project created
- [ ] Firestore database created (production mode)
- [ ] Anonymous Auth enabled
- [ ] Service account key downloaded
- [ ] `firebase deploy --only firestore` run successfully
- [ ] GitHub repo created and code pushed
- [ ] Render.com account created (GitHub login)
- [ ] Web service created on Render
- [ ] All 3 environment variables set in Render
- [ ] Render deploy completed (green status)
- [ ] `/health` endpoint returns OK
- [ ] `firebase.service.js` updated with real URLs and config
- [ ] `.env` file is in `.gitignore` (never committed)
