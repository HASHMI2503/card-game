'use strict';

// ============================================================
// CLIENT-SIDE FIREBASE SERVICE
// firebase.service.js
//
// CHANGE FROM PREVIOUS VERSION:
//   callCloudFunction() now points to your Render.com server
//   instead of Firebase Cloud Functions.
//   Everything else is identical.
//
// Replace SERVER_URL with your actual Render.com URL after deploy.
// Example: https://mendikot-server.onrender.com
// ============================================================

import { initializeApp }       from 'firebase/app';
import { getFirestore, doc, collection, onSnapshot,
         setDoc, getDoc, serverTimestamp }  from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// ── Your Firebase config (from Firebase Console → Project Settings) ───────────
const firebaseConfig = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
};

// ── YOUR RENDER.COM SERVER URL ────────────────────────────────────────────────
// After deploying to Render, replace this with your real URL.
// Format: https://your-service-name.onrender.com
const SERVER_URL = 'https://mendikot-server.onrender.com';

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);


// ============================================================
// AUTH SERVICE
// ============================================================
export const AuthService = {
  async signIn() {
    const stored = localStorage.getItem('mendikot_uid');
    return new Promise((resolve) => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          localStorage.setItem('mendikot_uid', user.uid);
          resolve(user.uid);
        } else {
          const cred = await signInAnonymously(auth);
          localStorage.setItem('mendikot_uid', cred.user.uid);
          resolve(cred.user.uid);
        }
      });
    });
  },

  getCurrentUserId() {
    return auth.currentUser?.uid ?? null;
  },
};


// ============================================================
// ROOM SERVICE
// ============================================================
export const RoomService = {
  async createRoom(playerCount, displayName) {
    const resp = await callServer('createRoom', { playerCount, displayName });
    if (resp.success) localStorage.setItem('mendikot_room', resp.roomId);
    return resp;
  },

  async joinRoom(roomCode, displayName) {
    const resp = await callServer('joinRoom', {
      roomCode: roomCode.toUpperCase(),
      displayName,
    });
    if (resp.success) localStorage.setItem('mendikot_room', resp.roomId);
    return resp;
  },

  async getPlayerActiveRoom(playerId) {
    const roomId = localStorage.getItem('mendikot_room');
    if (!roomId) return { exists: false };
    try {
      const snap = await getDoc(
        doc(db, 'rooms', roomId, 'players', playerId)
      );
      return {
        exists: snap.exists() && snap.data()?.status !== 'left',
        roomId,
      };
    } catch {
      return { exists: false };
    }
  },
};


// ============================================================
// ACTION SERVICE — sends player intents to Firestore
// ============================================================
export const ActionService = {
  async sendAction(roomId, playerId, action) {
    const actionRef = doc(db, 'rooms', roomId, 'actions', playerId);
    await setDoc(actionRef, {
      ...action,
      playerId,
      timestamp: serverTimestamp(),
      processed: false,
      result:    null,
    });
    return waitForActionResult(actionRef);
  },

  // ── Convenience wrappers ─────────────────────────────────
  selectSeat:          (r, p, seatNumber)     => ActionService.sendAction(r, p, { type: 'SELECT_SEAT',            seatNumber }),
  ready:               (r, p)                 => ActionService.sendAction(r, p, { type: 'READY' }),
  selectHiddenCard:    (r, p, cardId)         => ActionService.sendAction(r, p, { type: 'SELECT_HIDDEN_CARD',    cardId }),
  peekHiddenCard:      (r, p)                 => ActionService.sendAction(r, p, { type: 'PEEK_HIDDEN_CARD' }),
  submitBid:           (r, p, amount)         => ActionService.sendAction(r, p, { type: 'SUBMIT_BID',            amount }),
  passBid:             (r, p)                 => ActionService.sendAction(r, p, { type: 'PASS_BID' }),
  selectTrumpSuit:     (r, p, suit)           => ActionService.sendAction(r, p, { type: 'SELECT_TRUMP_SUIT',     suit }),
  playCard:            (r, p, cardId, reveal) => ActionService.sendAction(r, p, { type: 'PLAY_CARD',             cardId, requestReveal: reveal ?? false }),
  requestReveal:       (r, p, cardId)         => ActionService.sendAction(r, p, { type: 'REQUEST_HIDDEN_CARD_REVEAL', cardId }),

  // These call the server directly (not via action queue)
  closeBidding:  (roomId) => callServer('closeBidding',  { roomId }),
  resetMatch:    (roomId) => callServer('resetMatch',    { roomId }),
};


// ============================================================
// REALTIME LISTENER SERVICE
// ============================================================
export const ListenerService = {
  onGameState(roomId, callback) {
    return onSnapshot(
      doc(db, 'rooms', roomId, 'gameState', 'public'),
      snap => callback(snap.exists() ? { exists: true, ...snap.data() } : { exists: false }),
      err  => console.error('[GameState]', err)
    );
  },

  onMyHand(roomId, playerId, callback) {
    return onSnapshot(
      doc(db, 'rooms', roomId, 'privateHands', playerId),
      snap => callback(snap.exists() ? (snap.data().cards ?? []) : []),
      err  => console.error('[Hand]', err)
    );
  },

  onCurrentTrick(roomId, callback) {
    return onSnapshot(
      doc(db, 'rooms', roomId, 'gameState', 'public'),
      snap => callback(snap.exists() ? snap.data().currentTrick : { plays: [] })
    );
  },

  onPlayers(roomId, callback) {
    return onSnapshot(
      collection(db, 'rooms', roomId, 'players'),
      snap => {
        const players = {};
        snap.forEach(d => { players[d.id] = d.data(); });
        callback(players);
      }
    );
  },

  onScores(roomId, callback) {
    return onSnapshot(
      doc(db, 'rooms', roomId, 'scores', 'main'),
      snap => callback(snap.exists() ? snap.data() : { teamA: { wins: 0 }, teamB: { wins: 0 } })
    );
  },
};


// ============================================================
// RECONNECT SERVICE
// ============================================================
export const ReconnectService = {
  async checkAndRestore(playerId) {
    const { exists, roomId } = await RoomService.getPlayerActiveRoom(playerId);
    if (!exists) return { inGame: false };

    await callServer('playerReconnected', { roomId });

    const [gameSnap, handSnap] = await Promise.all([
      getDoc(doc(db, 'rooms', roomId, 'gameState', 'public')),
      getDoc(doc(db, 'rooms', roomId, 'privateHands', playerId)),
    ]);

    return {
      inGame:    true,
      roomId,
      gameState: gameSnap.exists() ? gameSnap.data() : null,
      myHand:    handSnap.exists() ? handSnap.data().cards : [],
    };
  },
};


// ============================================================
// HEARTBEAT — keeps player marked as connected
// Call this once on app load; it runs every 30 seconds.
// ============================================================
export function startHeartbeat(roomId) {
  const playerId = AuthService.getCurrentUserId();
  if (!playerId || !roomId) return;

  const beat = () => callServer('heartbeat', { roomId });
  beat(); // immediate first beat
  return setInterval(beat, 30_000);
}


// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Call a route on your Render.com server.
 * Automatically attaches the Firebase ID token for auth.
 */
async function callServer(route, data) {
  const idToken = await auth.currentUser?.getIdToken();
  const resp    = await fetch(`${SERVER_URL}/${route}`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(data),
  });
  return resp.json();
}

/**
 * Poll the action document until the server writes a result.
 * Times out after 10 seconds.
 */
function waitForActionResult(actionRef) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsub();
      reject(new Error('Server did not respond in 10s — check your Render.com logs'));
    }, 10_000);

    const unsub = onSnapshot(actionRef, snap => {
      const data = snap.data();
      if (data?.processed === true) {
        clearTimeout(timeout);
        unsub();
        resolve(data.result);
      }
    });
  });
}
