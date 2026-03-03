# Mendikot Frontend

React + Vite · Dark green/gold theme · All 6 screens

---

## Quick Start

```bash
cd mendikot-frontend
npm install
npm run dev
# Opens at http://localhost:5173
```

---

## File Structure

```
mendikot-frontend/
│
├── index.html
├── package.json
├── vite.config.js
│
└── src/
    ├── main.jsx              ← React entry point
    ├── App.jsx               ← Router — wires all screens
    ├── index.css             ← Global styles, tokens, animations
    │
    ├── screens/
    │   ├── HomeScreen.jsx    ← Landing page with animated cards
    │   ├── RoomScreen.jsx    ← Create or Join room
    │   ├── LobbyScreen.jsx   ← Seat selection, waiting room
    │   └── GameScreen.jsx    ← Card table, hand, trick play
    │
    └── components/
        ├── Card.jsx          ← CardFace, CardBack, SuitBadge
        ├── BiddingOverlay.jsx← Bid/pass UI with countdown timer
        └── ScoreOverlay.jsx  ← Match result and score screen
```

---

## Connecting to Your Backend

Every place you need to wire up is marked with a `// TODO:` comment.

### 1. Firebase config — `src/services/firebase.service.js`
Copy `firebase.service.js` from `mendikot-server/` into `src/services/` and fill in your Firebase config values.

### 2. Create / Join room — `RoomScreen.jsx`
```js
// Replace mock delays with:
const resp = await RoomService.createRoom(playerCount, displayName);
const resp = await RoomService.joinRoom(roomCode, displayName);
```

### 3. Lobby seat selection — `LobbyScreen.jsx`
```js
// Replace local state updates with:
await ActionService.selectSeat(roomId, myPlayerId, seatNumber);
await ActionService.ready(roomId, myPlayerId);
```

### 4. Hide card — `GameScreen.jsx` (HIDING_CARD phase)
```js
await ActionService.selectHiddenCard(roomId, myPlayerId, card.id);
```

### 5. Play card — `GameScreen.jsx`
```js
await ActionService.playCard(roomId, myPlayerId, card.id);
```

### 6. Bidding — `BiddingOverlay.jsx`
```js
await ActionService.submitBid(roomId, myPlayerId, amount);
await ActionService.passBid(roomId, myPlayerId);
```

### 7. Real-time game state — `GameScreen.jsx`
```js
// On mount:
const unsub1 = ListenerService.onGameState(roomId, setGameState);
const unsub2 = ListenerService.onMyHand(roomId, myPlayerId, setHand);
// On unmount: unsub1(); unsub2();
```

---

## Deploy to Netlify (Free)

```bash
npm run build
# Drag the dist/ folder to https://app.netlify.com/drop
```

Or connect GitHub repo → Netlify auto-deploys on every push.
Build command: `npm run build`
Publish directory: `dist`
