import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CardFace, CardBack, SuitBadge } from '../components/Card';
import BiddingOverlay from '../components/BiddingOverlay';
import ScoreOverlay from '../components/ScoreOverlay';
import { ActionService, ListenerService } from '../services/firebase.service';

const SUIT_ORDER = Object.freeze({ H: 0, S: 1, D: 2, C: 3 });
const RANK_WEIGHT = Object.freeze({
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  '10': 10,
  '9': 9,
  '8': 8,
  '7': 7,
  '6': 6,
  '5': 5,
  '4': 4,
  '3': 3,
  '2': 2,
});

function getTotalTricks(playerCount) {
  if (playerCount === 4) return 13;
  if (playerCount === 6) return 12;
  return 9;
}

function scoreFromState(state) {
  return state?.score || { tricksWonByTeam: { A: 0, B: 0 }, mindisByTeam: { A: 0, B: 0 } };
}

function sortHand(cards) {
  return [...cards].sort((a, b) => {
    const suitGap = (SUIT_ORDER[a.suit] ?? 99) - (SUIT_ORDER[b.suit] ?? 99);
    if (suitGap !== 0) return suitGap;
    const rankGap = (RANK_WEIGHT[b.rank] ?? 0) - (RANK_WEIGHT[a.rank] ?? 0);
    if (rankGap !== 0) return rankGap;
    return String(a.id).localeCompare(String(b.id));
  });
}

function mapError(code) {
  switch (code) {
    case 'WRONG_TURN':
      return 'Not your turn.';
    case 'MUST_FOLLOW_SUIT':
      return 'You must follow the led suit.';
    case 'CARD_NOT_IN_HAND':
      return 'Card is no longer in your hand.';
    case 'WRONG_PHASE':
      return 'Action is not valid in this phase.';
    case 'NOT_BIDDING_WINNER':
      return 'Only bidding winner can do that.';
    case 'ROOM_TIMED_OUT':
      return 'Room timed out due to inactivity.';
    case 'ROOM_INACTIVE':
      return 'Room is no longer active.';
    default:
      return code || 'Action failed.';
  }
}

const TrickCard = ({ play, playerName }) => (
  <div className="trick-card">
    <CardFace rank={play.card.rank} suit={play.card.suit} size="sm" />
    <span className="trick-card-label">{playerName}</span>
  </div>
);

const OpponentHand = ({ cardCount, label, isCurrentTurn, teamId }) => {
  const turnColor = teamId === 'A' ? '#c9a84c' : '#7ec8e3';
  return (
    <div className={`opponent-slot ${cardCount === 0 ? 'is-empty' : ''}`}>
      {isCurrentTurn && <div className="turn-dot" style={{ background: turnColor, boxShadow: `0 0 12px ${turnColor}` }} />}
      <div className="opponent-cards">
        {Array.from({ length: Math.min(cardCount, 6) }).map((_, idx) => (
          <CardBack key={`${label}-${idx}`} size="xs" style={{ marginLeft: idx === 0 ? 0 : -16 }} />
        ))}
      </div>
      <div className="opponent-label" style={{ color: isCurrentTurn ? turnColor : undefined }}>{label}</div>
    </div>
  );
};

const ScoreBar = ({ score, totalTricks, trumpSuit, gameMode, bid }) => (
  <div className="score-bar">
    <div className="score-team score-team-a">
      <span className="team-dot" />
      <span>A: {score?.tricksWonByTeam?.A || 0}</span>
    </div>
    <span className="score-vs">vs</span>
    <div className="score-team score-team-b">
      <span className="team-dot" />
      <span>B: {score?.tricksWonByTeam?.B || 0}</span>
    </div>
    <span className="score-total">{(score?.tricksWonByTeam?.A || 0) + (score?.tricksWonByTeam?.B || 0)}/{totalTricks} tricks</span>
    {trumpSuit && <SuitBadge suit={trumpSuit} label="Trump" />}
    {gameMode === 'CONTRACT' && bid && (
      <div className="score-bid">Bid: {bid}</div>
    )}
  </div>
);

export default function GameScreen({ roomInfo, myPlayerId, onLeave }) {
  const roomId = roomInfo?.roomId;
  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState({});
  const [roomMeta, setRoomMeta] = useState(null);
  const [hand, setHand] = useState([]);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [revealOnPlay, setRevealOnPlay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showScore, setShowScore] = useState(false);
  const [throwingCardId, setThrowingCardId] = useState(null);
  const [dragState, setDragState] = useState(null);
  const biddingCloseRequested = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const leaveRequestedRef = useRef(false);

  const sortedHand = useMemo(() => sortHand(hand), [hand]);
  const selectedCard = useMemo(
    () => sortedHand.find((card) => card.id === selectedCardId) || null,
    [sortedHand, selectedCardId]
  );

  useEffect(() => {
    if (!roomId || !myPlayerId) return undefined;

    const unsubs = [
      ListenerService.onGameState(roomId, (state) => {
        if (state?.exists) setGameState(state);
      }),
      ListenerService.onPlayers(roomId, setPlayers),
      ListenerService.onMyHand(roomId, myPlayerId, setHand),
      ListenerService.onRoomMeta(roomId, setRoomMeta),
    ];

    return () => {
      unsubs.forEach((unsub) => {
        if (typeof unsub === 'function') unsub();
      });
    };
  }, [roomId, myPlayerId]);

  useEffect(() => {
    if (!selectedCardId) return;
    const stillExists = hand.some((card) => card.id === selectedCardId);
    if (!stillExists) setSelectedCardId(null);
  }, [hand, selectedCardId]);

  useEffect(() => {
    if (gameState?.phase === 'COMPLETE') setShowScore(true);
  }, [gameState?.phase]);

  useEffect(() => {
    if (roomMeta?.status !== 'TIMED_OUT' || leaveRequestedRef.current) return;
    leaveRequestedRef.current = true;
    setError('Room timed out due to inactivity. Returning to home...');
    setTimeout(() => {
      onLeave?.();
      leaveRequestedRef.current = false;
    }, 1200);
  }, [roomMeta?.status, onLeave]);

  useEffect(() => {
    const deadline = gameState?.biddingState?.deadline;
    const isOpen = gameState?.phase === 'BIDDING' && gameState?.biddingState?.isOpen;
    if (!isOpen || !deadline || !roomId) {
      biddingCloseRequested.current = false;
      return undefined;
    }

    const closeIfExpired = async () => {
      if (Date.now() < deadline || biddingCloseRequested.current) return;
      biddingCloseRequested.current = true;
      try {
        await ActionService.closeBidding(roomId);
      } catch {
        biddingCloseRequested.current = false;
      }
    };

    closeIfExpired();
    const id = setInterval(closeIfExpired, 1000);
    return () => clearInterval(id);
  }, [roomId, gameState?.phase, gameState?.biddingState?.isOpen, gameState?.biddingState?.deadline]);

  const totalTricks = getTotalTricks(gameState?.playerCount || roomInfo?.playerCount || 4);
  const score = scoreFromState(gameState);
  const myTurn = gameState?.phase === 'PLAYING' && gameState?.turn === myPlayerId;
  const canPickTrump = gameState?.phase === 'TRUMP_SELECTION' && gameState?.biddingState?.biddingWinner === myPlayerId;
  const ledSuit = gameState?.currentTrick?.ledSuit || null;
  const hasLedSuitInHand = ledSuit ? hand.some((card) => card.suit === ledSuit) : false;
  const canRequestReveal = Boolean(
    myTurn &&
    gameState?.phase === 'PLAYING' &&
    !gameState?.hiddenCardRevealed &&
    gameState?.hiddenCardHolder &&
    selectedCard &&
    ledSuit &&
    selectedCard.suit !== ledSuit &&
    !hasLedSuitInHand
  );

  useEffect(() => {
    if (!canRequestReveal) setRevealOnPlay(false);
  }, [canRequestReveal]);

  const opponents = Object.entries(players)
    .filter(([pid]) => pid !== myPlayerId)
    .map(([pid, p]) => ({ pid, ...p }))
    .sort((a, b) => (a.seatNumber || 999) - (b.seatNumber || 999));

  const doAction = async (fn) => {
    setBusy(true);
    setError('');
    try {
      const resp = await fn();
      if (resp?.success === false) {
        const message = mapError(resp.error);
        setError(message);
        if ((resp.error === 'ROOM_INACTIVE' || resp.error === 'ROOM_TIMED_OUT') && !leaveRequestedRef.current) {
          leaveRequestedRef.current = true;
          setTimeout(() => {
            onLeave?.();
            leaveRequestedRef.current = false;
          }, 1200);
        }
      }
      return resp;
    } catch (err) {
      setError(err?.message || 'Action failed.');
      return { success: false };
    } finally {
      setBusy(false);
    }
  };

  const playCardById = async (cardId, reveal = false) => {
    if (!cardId || busy || !myTurn || gameState?.phase !== 'PLAYING') return;
    const card = hand.find((c) => c.id === cardId);
    if (!card) return;
    setThrowingCardId(cardId);
    setSelectedCardId(null);
    await new Promise((resolve) => setTimeout(resolve, 160));
    await doAction(() => ActionService.playCard(roomId, myPlayerId, card.id, reveal));
    setThrowingCardId(null);
    setRevealOnPlay(false);
  };

  const handlePlayCard = () => {
    if (!selectedCard) return;
    playCardById(selectedCard.id, revealOnPlay);
  };

  const handleBid = (amount) => doAction(() => ActionService.submitBid(roomId, myPlayerId, amount));
  const handlePass = () => doAction(() => ActionService.passBid(roomId, myPlayerId));
  const handleSelectTrump = (suit) => doAction(() => ActionService.selectTrumpSuit(roomId, myPlayerId, suit));
  const handleResetMatch = () => {
    setShowScore(false);
    doAction(() => ActionService.resetMatch(roomId));
  };

  const handleCardClick = (cardId) => {
    if (Date.now() < suppressClickUntilRef.current) return;
    setSelectedCardId((prev) => (prev === cardId ? null : cardId));
  };

  const handleCardPointerDown = (cardId, event) => {
    if (!myTurn || gameState?.phase !== 'PLAYING') return;
    if (cardId !== selectedCardId) return;
    setDragState({
      cardId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
    });
  };

  const handleCardPointerMove = (cardId, event) => {
    if (!dragState) return;
    if (dragState.cardId !== cardId || dragState.pointerId !== event.pointerId) return;
    setDragState((prev) =>
      prev
        ? {
            ...prev,
            dx: event.clientX - prev.startX,
            dy: event.clientY - prev.startY,
          }
        : prev
    );
  };

  const handleCardPointerEnd = (cardId, event) => {
    if (!dragState) return;
    if (dragState.cardId !== cardId || dragState.pointerId !== event.pointerId) return;
    const { dx, dy } = dragState;
    const dragDistance = Math.hypot(dx, dy);
    const shouldThrow = dy < -85 || (dragDistance > 150 && dy < -20);
    setDragState(null);
    if (!shouldThrow) return;
    suppressClickUntilRef.current = Date.now() + 220;
    playCardById(cardId, revealOnPlay);
  };

  return (
    <div className="game-screen">
      <div className="game-topbar">
        <button onClick={onLeave} className="topbar-link">Leave</button>
        <ScoreBar
          score={score}
          totalTricks={totalTricks}
          trumpSuit={gameState?.trumpSuit}
          gameMode={gameState?.gameMode}
          bid={gameState?.biddingState?.highestBid?.amount}
        />
        <button onClick={() => setShowScore(true)} className="btn-ghost topbar-score-btn">Scores</button>
      </div>

      {error && <div className="game-error-banner">{error}</div>}

      <div className="game-table-wrap">
        <div className="game-felt" />

        <div className="opponents-row">
          {opponents.map((op) => (
            <OpponentHand
              key={op.pid}
              cardCount={Array.isArray(gameState?.hands?.[op.pid]) ? gameState.hands[op.pid].length : hand.length}
              label={op.displayName || op.pid}
              isCurrentTurn={gameState?.turn === op.pid}
              teamId={op.teamId}
            />
          ))}
        </div>

        <div className="trick-zone">
          {(gameState?.currentTrick?.plays || []).map((play) => (
            <TrickCard
              key={`${play.playerId}-${play.order}`}
              play={play}
              playerName={play.playerId === myPlayerId ? 'You' : players[play.playerId]?.displayName || play.playerId}
            />
          ))}
          {(gameState?.currentTrick?.plays || []).length === 0 && (
            <div className="trick-placeholder">{myTurn ? 'Your lead' : 'Waiting for lead'}</div>
          )}
        </div>

        {canPickTrump && (
          <div className="trump-picker">
            <div className="trump-picker-title">Select Trump Suit</div>
            <div className="trump-picker-actions">
              {['S', 'H', 'D', 'C'].map((suit) => (
                <button
                  key={suit}
                  className="btn-ghost trump-suit-btn"
                  onClick={() => handleSelectTrump(suit)}
                >
                  {suit}
                </button>
              ))}
            </div>
          </div>
        )}

        {myTurn && gameState?.phase === 'PLAYING' && (
          <div className="turn-chip">
            <span className="turn-chip-dot" />
            <span>Your Turn</span>
          </div>
        )}
      </div>

      <div className="hand-dock">
        <div className="hand-row">
          {sortedHand.map((card, idx) => {
            const isDragging = dragState?.cardId === card.id;
            const isThrowing = throwingCardId === card.id;
            const dragStyle = isDragging
              ? {
                  transform: `translate(${dragState.dx}px, ${dragState.dy}px) scale(1.08)`,
                  transition: 'none',
                  zIndex: 60,
                }
              : null;
            const throwStyle = isThrowing
              ? { animation: 'cardThrow 0.2s ease forwards', pointerEvents: 'none' }
              : null;

            return (
              <CardFace
                key={card.id}
                rank={card.rank}
                suit={card.suit}
                size="md"
                playable={myTurn && gameState?.phase === 'PLAYING'}
                selected={selectedCardId === card.id}
                onClick={() => handleCardClick(card.id)}
                onPointerDown={(event) => handleCardPointerDown(card.id, event)}
                onPointerMove={(event) => handleCardPointerMove(card.id, event)}
                onPointerUp={(event) => handleCardPointerEnd(card.id, event)}
                onPointerCancel={(event) => handleCardPointerEnd(card.id, event)}
                dealDelay={idx * 0.03}
                style={{
                  marginLeft: idx === 0 ? 0 : sortedHand.length > 10 ? -18 : sortedHand.length > 7 ? -10 : 0,
                  ...(dragStyle || {}),
                  ...(throwStyle || {}),
                }}
              />
            );
          })}
          {sortedHand.length === 0 && <div className="hand-empty">No cards</div>}
        </div>

        <div className="table-actions">
          {canRequestReveal && (
            <button
              type="button"
              className={`reveal-chip ${revealOnPlay ? 'is-active' : ''}`}
              onClick={() => setRevealOnPlay((prev) => !prev)}
            >
              {revealOnPlay ? 'Reveal: ON' : 'Ask Reveal'}
            </button>
          )}

          {myTurn && gameState?.phase === 'PLAYING' && selectedCard && (
            <button
              className="btn-primary play-btn"
              onClick={handlePlayCard}
              disabled={busy}
            >
              {busy ? 'Working...' : 'Play Selected Card'}
            </button>
          )}
        </div>
      </div>

      {gameState?.phase === 'BIDDING' && gameState?.biddingState?.isOpen && (
        <BiddingOverlay
          playerCount={gameState?.playerCount || 4}
          myPlayerId={myPlayerId}
          players={players}
          biddingState={
            gameState?.biddingState || {
              isOpen: true,
              bids: {},
              passedPlayers: [],
              highestBid: null,
            }
          }
          deadline={gameState?.biddingState?.deadline}
          onBid={handleBid}
          onPass={handlePass}
          disabled={busy}
        />
      )}

      {showScore && (
        <ScoreOverlay
          matchResult={gameState?.matchResult}
          matchRecord={gameState?.matchRecord}
          players={players}
          teams={gameState?.teams || { A: { playerIds: [] }, B: { playerIds: [] } }}
          onNextMatch={handleResetMatch}
          onHome={onLeave}
        />
      )}
    </div>
  );
}
