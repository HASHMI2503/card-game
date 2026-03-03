import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  onSnapshot,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || '').replace(/\/+$/, '');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

export const AuthService = {
  async signIn() {
    const uid = await ensureSignedIn();
    localStorage.setItem('mendikot_uid', uid);
    return uid;
  },

  getCurrentUserId() {
    return auth.currentUser?.uid ?? localStorage.getItem('mendikot_uid');
  },
};

export const RoomService = {
  async createRoom(playerCount, displayName) {
    const resp = await callServer('createRoom', { playerCount, displayName });
    if (resp.success) {
      localStorage.setItem('mendikot_room', resp.roomId);
      localStorage.setItem('mendikot_room_code', resp.roomCode);
    }
    return resp;
  },

  async joinRoom(roomCode, displayName) {
    const resp = await callServer('joinRoom', {
      roomCode: String(roomCode || '').toUpperCase(),
      displayName,
    });
    if (resp.success) {
      localStorage.setItem('mendikot_room', resp.roomId);
      localStorage.setItem('mendikot_room_code', String(roomCode || '').toUpperCase());
    }
    return resp;
  },

  async getPlayerActiveRoom(playerId) {
    const roomId = localStorage.getItem('mendikot_room');
    if (!roomId) return { exists: false };

    try {
      const snap = await getDoc(doc(db, 'rooms', roomId, 'players', playerId));
      return {
        exists: snap.exists() && snap.data()?.status !== 'left',
        roomId,
      };
    } catch {
      return { exists: false };
    }
  },

  async getRoomMeta(roomId) {
    const snap = await getDoc(doc(db, 'rooms', roomId));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    const metadata = data.metadata || {};
    return {
      roomCode: metadata.roomCode || localStorage.getItem('mendikot_room_code') || roomId?.slice(0, 6)?.toUpperCase(),
      playerCount: metadata.playerCount,
      status: metadata.status,
    };
  },
};

export const ActionService = {
  async sendAction(roomId, playerId, action) {
    const actionRef = doc(db, 'rooms', roomId, 'actions', playerId);
    await setDoc(actionRef, {
      ...action,
      playerId,
      timestamp: serverTimestamp(),
      processed: false,
      result: null,
    });
    return waitForActionResult(actionRef);
  },

  selectSeat: (roomId, playerId, seatNumber) =>
    ActionService.sendAction(roomId, playerId, { type: 'SELECT_SEAT', seatNumber }),

  ready: (roomId, playerId) =>
    ActionService.sendAction(roomId, playerId, { type: 'READY' }),

  selectHiddenCard: (roomId, playerId, cardId) =>
    ActionService.sendAction(roomId, playerId, { type: 'SELECT_HIDDEN_CARD', cardId }),

  peekHiddenCard: (roomId, playerId) =>
    ActionService.sendAction(roomId, playerId, { type: 'PEEK_HIDDEN_CARD' }),

  submitBid: (roomId, playerId, amount) =>
    ActionService.sendAction(roomId, playerId, { type: 'SUBMIT_BID', amount }),

  passBid: (roomId, playerId) =>
    ActionService.sendAction(roomId, playerId, { type: 'PASS_BID' }),

  selectTrumpSuit: (roomId, playerId, suit) =>
    ActionService.sendAction(roomId, playerId, { type: 'SELECT_TRUMP_SUIT', suit }),

  playCard: (roomId, playerId, cardId, reveal = false) =>
    ActionService.sendAction(roomId, playerId, {
      type: 'PLAY_CARD',
      cardId,
      requestReveal: reveal === true,
    }),

  requestReveal: (roomId, playerId, cardId) =>
    ActionService.sendAction(roomId, playerId, {
      type: 'REQUEST_HIDDEN_CARD_REVEAL',
      cardId,
    }),

  closeBidding: (roomId) => callServer('closeBidding', { roomId }),
  resetMatch: (roomId) => callServer('resetMatch', { roomId }),
};

export const ListenerService = {
  onGameState(roomId, callback) {
    return onSnapshot(
      doc(db, 'rooms', roomId, 'gameState', 'public'),
      (snap) => callback(snap.exists() ? { exists: true, ...snap.data() } : { exists: false }),
      (err) => console.error('[GameState]', err)
    );
  },

  onMyHand(roomId, playerId, callback) {
    return onSnapshot(
      doc(db, 'rooms', roomId, 'privateHands', playerId),
      (snap) => callback(snap.exists() ? snap.data().cards || [] : []),
      (err) => console.error('[Hand]', err)
    );
  },

  onCurrentTrick(roomId, callback) {
    return onSnapshot(doc(db, 'rooms', roomId, 'gameState', 'public'), (snap) => {
      callback(snap.exists() ? snap.data().currentTrick : { plays: [] });
    });
  },

  onPlayers(roomId, callback) {
    return onSnapshot(collection(db, 'rooms', roomId, 'players'), (snap) => {
      const players = {};
      snap.forEach((d) => {
        players[d.id] = d.data();
      });
      callback(players);
    });
  },

  onScores(roomId, callback) {
    return onSnapshot(doc(db, 'rooms', roomId, 'scores', 'main'), (snap) => {
      callback(snap.exists() ? snap.data() : { teamA: { wins: 0 }, teamB: { wins: 0 } });
    });
  },
};

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
      inGame: true,
      roomId,
      gameState: gameSnap.exists() ? gameSnap.data() : null,
      myHand: handSnap.exists() ? handSnap.data().cards || [] : [],
    };
  },
};

export function startHeartbeat(roomId) {
  if (!roomId) return null;

  const beat = async () => {
    try {
      await callServer('heartbeat', { roomId });
    } catch {
      // Heartbeat should not crash UI.
    }
  };

  beat();
  return setInterval(beat, 30000);
}

async function callServer(route, data) {
  if (!SERVER_URL) {
    throw new Error('Missing VITE_SERVER_URL in frontend environment.');
  }

  await ensureSignedIn();
  const idToken = await auth.currentUser.getIdToken();

  const resp = await fetch(`${SERVER_URL}/${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(data || {}),
  });

  if (!resp.ok) {
    throw new Error(`Server request failed: ${route} (${resp.status})`);
  }

  return resp.json();
}

function waitForActionResult(actionRef) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsub();
      reject(new Error('Server did not respond within 10 seconds.'));
    }, 10000);

    const unsub = onSnapshot(actionRef, (snap) => {
      const data = snap.data();
      if (data?.processed === true) {
        clearTimeout(timeout);
        unsub();
        resolve(data.result || { success: false, error: 'UNKNOWN_ACTION_RESULT' });
      }
    });
  });
}
