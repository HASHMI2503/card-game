'use strict';

// ============================================================
// MENDIKOT GAME SERVER
// server.js
//
// BEGINNER NOTE:
//   This file does the EXACT same job as Firebase Cloud Functions
//   but runs as a normal Node.js server on Render.com for FREE.
//
//   How it works:
//   1. Express handles HTTP routes (createRoom, joinRoom etc.)
//   2. Firestore listeners watch for player action documents
//   3. Game engine validates and processes each action
//   4. Results written back to Firestore
//   5. All players see updates in real-time via their listeners
//
//   Deploy: push to GitHub → connect repo to Render.com → done.
// ============================================================

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const admin      = require('firebase-admin');

// ── Firebase Admin SDK init ───────────────────────────────────────────────────
// This runs on the SERVER side and has full database access.
// It bypasses all Firestore security rules (that's intentional —
// the server IS the trusted authority).

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Render stores the key as an env variable; the \n must be unescaped
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db   = admin.firestore();
const auth = admin.auth();
const ACTIVE_ROOM_STATUS = Object.freeze(['WAITING', 'IN_PROGRESS']);
const GAME_IDLE_TIMEOUT_MS = 10 * 60_000;
const ROOM_MAINTENANCE_INTERVAL_MS = 60_000;

// ── Game engine (pure logic, no Firebase dependency) ─────────────────────────
const GameEngine = require('./frontend/src/index');

// ── Action handlers (each action type maps to one handler) ───────────────────
const {
  handleSelectSeat,
  handleReady,
  handleSelectHiddenCard,
  handleSubmitBid,
  handlePassBid,
  handleSelectTrumpSuit,
  handlePeekHiddenCard,
  handlePlayCard,
  handleHiddenCardReveal,
} = require('./frontend/src/actionHandlers');

// ── Express setup ─────────────────────────────────────────────────────────────
const app  = express();
app.use(cors());
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
// Render.com pings this to verify your server is alive.
// This also keeps the free server from sleeping.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});


// ============================================================
// HTTP ROUTES
// These handle one-time requests (not real-time).
// Clients call these directly from firebase.service.js
// ============================================================

// ─── POST /createRoom ─────────────────────────────────────────────────────────
app.post('/createRoom', requireAuth, async (req, res) => {
  try {
    const { playerCount, displayName } = req.body;
    const playerId = req.uid;

    if (![4, 6, 8].includes(playerCount)) {
      return res.json({ success: false, error: 'INVALID_PLAYER_COUNT' });
    }

    // Generate unique 6-char room code
    const roomCode = await generateUniqueRoomCode();

    // Build initial GameState using the pure engine
    const gameState = GameEngine.createGame(roomCode, playerCount);

    const batch   = db.batch();
    const roomRef = db.collection('rooms').doc();
    const roomId  = roomRef.id;

    // ── rooms/{roomId} ────────────────────────────────────────────────────────
    batch.set(roomRef, {
      metadata: {
        roomCode,
        playerCount,
        status:    'WAITING',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: playerId,
      }
    });

    // ── rooms/{roomId}/gameState/engine ───────────────────────────────────────
    // We store the FULL engine state here (server side only).
    // Clients never read this directly — they read /gameState/public.
    batch.set(roomRef.collection('gameState').doc('engine'), {
      state:     serializeState(gameState),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── rooms/{roomId}/gameState/public ───────────────────────────────────────
    // What all clients can see (no private hands, hidden card masked).
    batch.set(roomRef.collection('gameState').doc('public'), {
      ...buildPublicSnapshot(gameState, null),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── rooms/{roomId}/players/{playerId} ─────────────────────────────────────
    batch.set(roomRef.collection('players').doc(playerId), {
      playerId,
      displayName: displayName ?? 'Player',
      seatNumber:  null,
      teamId:      null,
      status:      'connected',
      isReady:     false,
      joinedAt:    admin.firestore.FieldValue.serverTimestamp(),
      lastSeenAt:  admin.firestore.FieldValue.serverTimestamp(),
    });

    // ── rooms/{roomId}/scores/main ────────────────────────────────────────────
    batch.set(roomRef.collection('scores').doc('main'), {
      teamA: { wins: 0, losses: 0, draws: 0 },
      teamB: { wins: 0, losses: 0, draws: 0 },
      matchHistory: [],
    });

    await batch.commit();

    // Start watching this room for player actions
    watchRoom(roomId);

    return res.json({ success: true, roomId, roomCode });

  } catch (err) {
    console.error('[createRoom]', err);
    return res.json({ success: false, error: err.message });
  }
});


// ─── POST /joinRoom ───────────────────────────────────────────────────────────
app.post('/joinRoom', requireAuth, async (req, res) => {
  try {
    const { roomCode, displayName } = req.body;
    const playerId = req.uid;

    // Find room by code
    const roomSnap = await db.collection('rooms')
      .where('metadata.roomCode', '==', roomCode.toUpperCase())
      .where('metadata.status', '==', 'WAITING')
      .limit(1).get();

    if (roomSnap.empty) {
      return res.json({ success: false, error: 'ROOM_NOT_FOUND' });
    }

    const roomRef  = roomSnap.docs[0].ref;
    const roomId   = roomRef.id;
    const roomData = roomSnap.docs[0].data();

    // Check if already in room (reconnect)
    const existingSnap = await roomRef.collection('players').doc(playerId).get();
    if (existingSnap.exists) {
      await Promise.all([
        roomRef.collection('players').doc(playerId).update({
          status:     'connected',
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
        roomRef.update({
          'metadata.lastActivityAt': admin.firestore.FieldValue.serverTimestamp(),
        }),
      ]);
      watchRoom(roomId);
      return res.json({ success: true, roomId, reconnected: true });
    }

    // Count current players
    const playersSnap = await roomRef.collection('players').get();
    if (playersSnap.size >= roomData.metadata.playerCount) {
      return res.json({ success: false, error: 'ROOM_FULL' });
    }

    await roomRef.collection('players').doc(playerId).set({
      playerId,
      displayName: displayName ?? 'Player',
      seatNumber:  null,
      teamId:      null,
      status:      'connected',
      isReady:     false,
      joinedAt:    admin.firestore.FieldValue.serverTimestamp(),
      lastSeenAt:  admin.firestore.FieldValue.serverTimestamp(),
    });
    await roomRef.update({
      'metadata.lastActivityAt': admin.firestore.FieldValue.serverTimestamp(),
    });

    // Make sure we are watching this room
    watchRoom(roomId);

    return res.json({ success: true, roomId });

  } catch (err) {
    console.error('[joinRoom]', err);
    return res.json({ success: false, error: err.message });
  }
});


// ─── POST /closeBidding ───────────────────────────────────────────────────────
// Called by client after bidding timer expires.
app.post('/closeBidding', requireAuth, async (req, res) => {
  try {
    const { roomId } = req.body;
    const result     = await processGameAction(roomId, req.uid, {
      type: 'CLOSE_BIDDING',
      playerId: req.uid,
    });
    return res.json(result);
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});


// ─── POST /resetMatch ─────────────────────────────────────────────────────────
app.post('/resetMatch', requireAuth, async (req, res) => {
  try {
    const { roomId } = req.body;
    const result     = await processGameAction(roomId, req.uid, {
      type: 'RESET_MATCH',
      playerId: req.uid,
    });
    return res.json(result);
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});


// ─── POST /playerReconnected ──────────────────────────────────────────────────
app.post('/playerReconnected', requireAuth, async (req, res) => {
  try {
    const { roomId } = req.body;
    const playerId   = req.uid;
    const roomRef = db.collection('rooms').doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      return res.json({ success: false, error: 'ROOM_NOT_FOUND' });
    }
    const roomStatus = roomSnap.data()?.metadata?.status;
    if (!isRoomStatusActive(roomStatus)) {
      return res.json({
        success: false,
        error: roomStatus === 'TIMED_OUT' ? 'ROOM_TIMED_OUT' : 'ROOM_INACTIVE',
      });
    }

    await Promise.all([
      roomRef.collection('players').doc(playerId).update({
        status:     'connected',
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
      roomRef.update({
        'metadata.lastActivityAt': admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);

    watchRoom(roomId);
    return res.json({ success: true });

  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});


// ============================================================
// FIRESTORE ACTION LISTENER
// This replaces the Firebase onDocumentCreated Cloud Function trigger.
//
// Instead of Firebase triggering our code automatically, we
// watch the actions collection ourselves with onSnapshot.
//
// The effect is identical: player writes action → server sees it
// immediately → validates → updates state.
// ============================================================

// Track which rooms we are already watching (avoid duplicate listeners)
const roomWatchers = new Map();

function isRoomStatusActive(status) {
  return ACTIVE_ROOM_STATUS.includes(status);
}

function detachRoomWatcher(roomId) {
  const unsub = roomWatchers.get(roomId);
  if (!unsub) return;
  try {
    unsub();
  } catch (err) {
    console.error(`[watchRoom] Failed to detach watcher for ${roomId}:`, err);
  }
  roomWatchers.delete(roomId);
}

/**
 * Start watching a room's actions subcollection.
 * Safe to call multiple times — only sets up one listener per room.
 *
 * @param {string} roomId
 */
function watchRoom(roomId) {
  if (roomWatchers.has(roomId)) return;

  console.log(`[watchRoom] Now watching room: ${roomId}`);

  const actionsRef = db.collection('rooms').doc(roomId).collection('actions');

  // Listen for NEW unprocessed action documents
  const unsubscribe = actionsRef
    .where('processed', '==', false)
    .onSnapshot(async (snapshot) => {
      // Process each new/changed action document
      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') continue;

        const actionDoc  = change.doc;
        const actionData = actionDoc.data();

        // Skip if already being processed (race condition guard)
        if (actionData.processed) continue;

        try {
          const result = await processGameAction(
            roomId,
            actionData.playerId,
            actionData
          );

          // Write result back to action document so client can read it
          await actionDoc.ref.update({
            processed:   true,
            result,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          if (result?.phase === 'COMPLETE') {
            detachRoomWatcher(roomId);
          }

        } catch (err) {
          console.error(`[watchRoom] Error processing action in ${roomId}:`, err);
          await actionDoc.ref.update({
            processed:   true,
            result:      { success: false, error: err.message ?? 'INTERNAL_ERROR' },
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }, (err) => {
      console.error(`[watchRoom] Listener error for room ${roomId}:`, err);
      // Remove so it can be re-watched
      roomWatchers.delete(roomId);
    });

  roomWatchers.set(roomId, unsubscribe);
}


// ============================================================
// CORE ACTION PROCESSOR
// Routes every action to the correct handler.
// Loads state → validates → runs engine → saves state.
// ============================================================

/**
 * Load engine state, run action, save new state.
 * All game logic lives in the pure engine (src/index.js).
 * This function only handles Firebase I/O.
 *
 * @param {string} roomId
 * @param {string} playerId
 * @param {object} actionData
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function processGameAction(roomId, playerId, actionData) {
  const roomRef = db.collection('rooms').doc(roomId);

  // ── Load current engine state ──────────────────────────────────────────────
  const [roomSnap, engineSnap, playerSnap, playersSnap] = await Promise.all([
    roomRef.get(),
    roomRef.collection('gameState').doc('engine').get(),
    roomRef.collection('players').doc(playerId).get(),
    roomRef.collection('players').get(),
  ]);

  if (!roomSnap.exists) return { success: false, error: 'ROOM_NOT_FOUND' };
  const roomStatus = roomSnap.data()?.metadata?.status;
  if (!isRoomStatusActive(roomStatus)) {
    return {
      success: false,
      error: roomStatus === 'TIMED_OUT' ? 'ROOM_TIMED_OUT' : 'ROOM_INACTIVE',
    };
  }
  if (!engineSnap.exists) return { success: false, error: 'ROOM_NOT_FOUND' };
  if (!playerSnap.exists) return { success: false, error: 'INVALID_PLAYER' };

  // Deserialize stored state back into a plain object
  let state = deserializeState(engineSnap.data().state);

  const players = {};
  playersSnap.forEach(d => { players[d.id] = d.data(); });

  // ── Route to action handler ────────────────────────────────────────────────
  let result;
  switch (actionData.type) {

    case 'SELECT_SEAT':
      result = await handleSelectSeat({ state, playerId, actionData, db, roomRef, players });
      break;

    case 'READY':
      result = await handleReady({ state, playerId, db, roomRef, players });
      break;

    case 'SELECT_HIDDEN_CARD':
      result = await handleSelectHiddenCard({ state, playerId, actionData, db, roomRef });
      break;

    case 'SUBMIT_BID':
      result = await handleSubmitBid({ state, playerId, actionData, db, roomRef });
      break;

    case 'PASS_BID':
      result = await handlePassBid({ state, playerId, db, roomRef });
      break;

    case 'CLOSE_BIDDING':
      result = await handleCloseBidding({ state, playerId, db, roomRef });
      break;

    case 'SELECT_TRUMP_SUIT':
      result = await handleSelectTrumpSuit({ state, playerId, actionData, db, roomRef });
      break;

    case 'PEEK_HIDDEN_CARD':
      result = await handlePeekHiddenCard({ state, playerId });
      break;

    case 'PLAY_CARD':
      result = await handlePlayCard({ state, playerId, actionData, db, roomRef, players });
      break;

    case 'REQUEST_HIDDEN_CARD_REVEAL':
      result = await handleHiddenCardReveal({ state, playerId, actionData, db, roomRef });
      break;

    case 'RESET_MATCH':
      result = await handleResetMatch({ state, playerId, db, roomRef });
      break;

    default:
      return { success: false, error: 'UNKNOWN_ACTION_TYPE' };
  }

  return result;
}


// ─── handleCloseBidding (server-only, not in actionHandlers) ─────────────────
async function handleCloseBidding({ state, playerId, db, roomRef }) {
  const result = GameEngine.closeBidding(state, Date.now());
  if (!result.success) return { success: false, error: result.error };
  await saveState(roomRef, result.state, playerId);
  return { success: true, phase: result.state.phase };
}

async function handleResetMatch({ state, playerId, db, roomRef }) {
  const result = GameEngine.resetMatch(state);
  if (!result.success) return { success: false, error: result.error };
  // After reset, immediately deal cards
  const dealt = GameEngine.startDeal(result.state, playerId);
  if (!dealt.success) return { success: false, error: dealt.error };
  await saveState(roomRef, dealt.state, playerId);
  return { success: true, phase: dealt.state.phase };
}


// ============================================================
// STATE PERSISTENCE HELPERS
// ============================================================

/**
 * Save the new engine state to Firestore.
 * Writes:
 *   1. /gameState/engine — full state (server-only)
 *   2. /gameState/public — client-safe view
 *   3. /privateHands/{pid} — each player's private hand
 *
 * @param {FirestoreDocRef} roomRef
 * @param {GameState} newState
 * @param {string} viewerPlayerId - used for public state generation
 */
async function saveState(roomRef, newState, viewerPlayerId) {
  const batch = db.batch();

  // Full engine state (only server reads this)
  batch.set(roomRef.collection('gameState').doc('engine'), {
    state:     serializeState(newState),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Public state (all clients in room can read this)
  batch.set(roomRef.collection('gameState').doc('public'), {
    ...buildPublicSnapshot(newState, viewerPlayerId),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Private hands — each player gets only their own cards
  for (const [pid, hand] of Object.entries(newState.hands ?? {})) {
    batch.set(roomRef.collection('privateHands').doc(pid), {
      cards:     hand,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Update scores document
  if (newState.matchRecord) {
    batch.set(roomRef.collection('scores').doc('main'), {
      teamA:        newState.matchRecord.byTeam?.A ?? { wins: 0, losses: 0, draws: 0 },
      teamB:        newState.matchRecord.byTeam?.B ?? { wins: 0, losses: 0, draws: 0 },
      totalMatches: newState.matchRecord.totalMatches ?? 0,
      updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const roomMetadataUpdate = {
    'metadata.lastActivityAt': admin.firestore.FieldValue.serverTimestamp(),
  };
  if (newState.phase === 'COMPLETE') {
    roomMetadataUpdate['metadata.status'] = 'COMPLETE';
    roomMetadataUpdate['metadata.completedAt'] = admin.firestore.FieldValue.serverTimestamp();
  }
  batch.update(roomRef, roomMetadataUpdate);

  await batch.commit();
}

/**
 * Build the public-facing snapshot from engine state.
 * Strips private hands and masks hidden card.
 */
function buildPublicSnapshot(state, viewerPlayerId) {
  return {
    phase:             state.phase,
    gameMode:          state.gameMode,
    trumpSuit:         state.trumpSuit,
    turn:              state.turn,
    currentTrickIndex: state.trickHistory?.length ?? 0,
    totalTricks:       state.playerCount === 4 ? 13 : state.playerCount === 6 ? 12 : 9,
    hidingTeam:        state.hidingTeam,
    hiddenCardHolder:  state.hiddenCard?.ownerPlayerId ?? null,
    hiddenCardRevealed: state.hiddenCardRevealed ?? false,
    // Reveal card value only once revealed (never expose before that)
    revealedHiddenCard: state.hiddenCardRevealed ? state.revealedHiddenCard : null,
    biddingState: {
      isOpen:        state.biddingState?.isOpen ?? false,
      deadline:      state.biddingState?.deadline ?? null,
      // Bids are visible to all (open bidding system)
      bids:          state.biddingState?.bids ?? {},
      passedPlayers: state.biddingState?.passedPlayers ?? [],
      biddingWinner: state.biddingState?.biddingWinner ?? null,
      highestBid:    state.biddingState?.highestBid ?? null,
    },
    currentTrick:  state.currentTrick,
    trickHistory:  state.trickHistory,
    score:         state.score,
    matchResult:   state.matchResult,
    matchRecord:   state.matchRecord,
    seats:         state.seats,
    players:       state.players,
    teams:         state.teams,
    dealerTeam:    state.dealerTeam,
    firstMatch:    state.firstMatch,
  };
}

/**
 * Serialize GameState for Firestore storage.
 * Firestore does not support undefined values or frozen objects directly —
 * we JSON round-trip to get a plain mutable object.
 */
function serializeState(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Deserialize from Firestore back to a plain object.
 * The engine works on plain objects; it does not require freezing on input.
 */
function deserializeState(raw) {
  return raw; // already a plain object from Firestore
}


// ============================================================
// DISCONNECT DETECTION
// Render.com keeps the server alive permanently.
// We use a heartbeat system: clients ping every 30s.
// If a player misses 3 pings, they are marked disconnected.
// ============================================================

const HEARTBEAT_INTERVAL_MS = 30_000;  // client pings every 30s
const DISCONNECT_TIMEOUT_MS = 90_000;  // 3 missed pings = disconnected

app.post('/heartbeat', requireAuth, async (req, res) => {
  const { roomId } = req.body;
  const playerId   = req.uid;

  try {
    const roomRef = db.collection('rooms').doc(roomId);
    const roomSnap = await roomRef.get();
    if (!roomSnap.exists) {
      return res.json({ success: false, error: 'ROOM_NOT_FOUND' });
    }
    const roomStatus = roomSnap.data()?.metadata?.status;
    if (!isRoomStatusActive(roomStatus)) {
      return res.json({
        success: false,
        error: roomStatus === 'TIMED_OUT' ? 'ROOM_TIMED_OUT' : 'ROOM_INACTIVE',
      });
    }

    await Promise.all([
      roomRef.collection('players').doc(playerId).update({
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        status:     'connected',
      }),
      roomRef.update({
        'metadata.lastActivityAt': admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false, error: err.message ?? 'HEARTBEAT_FAILED' });
  }
});

// Periodically check for disconnected players (every 60 seconds)
setInterval(async () => {
  try {
    const cutoff  = new Date(Date.now() - DISCONNECT_TIMEOUT_MS);
    const roomsSnap = await db.collection('rooms')
      .where('metadata.status', '==', 'IN_PROGRESS').get();

    for (const roomDoc of roomsSnap.docs) {
      const playersSnap = await roomDoc.ref.collection('players')
        .where('status', '==', 'connected')
        .where('lastSeenAt', '<', cutoff).get();

      for (const playerDoc of playersSnap.docs) {
        console.log(`[disconnect] ${playerDoc.id} in room ${roomDoc.id}`);
        await playerDoc.ref.update({ status: 'disconnected' });
      }
    }
  } catch (err) {
    console.error('[disconnect checker]', err);
  }
}, 60_000);

setInterval(async () => {
  await expireIdleRooms();
}, ROOM_MAINTENANCE_INTERVAL_MS);


// ============================================================
// ROOM WATCHER STARTUP
// On server start, re-attach listeners to all active rooms.
// This handles server restarts gracefully.
// ============================================================
async function restoreActiveRoomWatchers() {
  try {
    const snap = await db.collection('rooms')
      .where('metadata.status', 'in', ACTIVE_ROOM_STATUS).get();
    console.log(`[startup] Restoring watchers for ${snap.size} active rooms`);
    snap.forEach(doc => watchRoom(doc.id));
  } catch (err) {
    console.error('[startup] Failed to restore room watchers:', err);
  }
}

async function expireIdleRooms() {
  try {
    const now = Date.now();
    const snap = await db.collection('rooms')
      .where('metadata.status', 'in', ACTIVE_ROOM_STATUS).get();

    for (const docSnap of snap.docs) {
      const roomId = docSnap.id;
      const metadata = docSnap.data()?.metadata ?? {};
      const lastActivityAt = metadata.lastActivityAt?.toDate?.() ?? metadata.createdAt?.toDate?.();
      if (!lastActivityAt) continue;
      const idleMs = now - lastActivityAt.getTime();
      if (idleMs < GAME_IDLE_TIMEOUT_MS) continue;

      await docSnap.ref.update({
        'metadata.status': 'TIMED_OUT',
        'metadata.timedOutAt': admin.firestore.FieldValue.serverTimestamp(),
      });
      detachRoomWatcher(roomId);
      console.log(`[maintenance] Timed out idle room ${roomId} after ${idleMs}ms`);
    }
  } catch (err) {
    console.error('[maintenance] Failed to expire idle rooms:', err);
  }
}


// ============================================================
// AUTH MIDDLEWARE
// Verifies Firebase ID token from Authorization header.
// Every protected route uses this.
// ============================================================
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'UNAUTHENTICATED' });
  }
  try {
    const token = header.slice(7);
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch {
    return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
  }
}


// ============================================================
// UTILITY: Generate unique room code
// ============================================================
async function generateUniqueRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');

    const existing = await db.collection('rooms')
      .where('metadata.roomCode', '==', code)
      .where('metadata.status', 'in', ACTIVE_ROOM_STATUS)
      .limit(1).get();

    if (existing.empty) return code;
  }
  throw new Error('Could not generate unique room code after 10 attempts');
}


// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`✅ Mendikot server running on port ${PORT}`);
  await restoreActiveRoomWatchers();
});

module.exports = app; // exported for testing

