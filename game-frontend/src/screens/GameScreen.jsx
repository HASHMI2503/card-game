import React, { useEffect, useRef, useState } from 'react';
import { CardFace, CardBack, SuitBadge } from '../components/Card';
import BiddingOverlay from '../components/BiddingOverlay';
import ScoreOverlay from '../components/ScoreOverlay';
import { ActionService, ListenerService } from '../services/firebase.service';

function getTotalTricks(playerCount) {
  if (playerCount === 4) return 13;
  if (playerCount === 6) return 12;
  return 9;
}

function scoreFromState(state) {
  return state?.score || { tricksWonByTeam: { A: 0, B: 0 }, mindisByTeam: { A: 0, B: 0 } };
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
    default:
      return code || 'Action failed.';
  }
}

const TrickCard = ({ play, playerName }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, animation: 'cardDeal 0.3s ease both' }}>
    <CardFace rank={play.card.rank} suit={play.card.suit} size="sm" />
    <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, letterSpacing: '0.08em', color: 'rgba(201,168,76,0.5)', textTransform: 'uppercase' }}>
      {playerName}
    </span>
  </div>
);

const OpponentHand = ({ cardCount, label, isCurrentTurn, teamId }) => {
  const tc = teamId === 'A' ? '#c9a84c' : '#7ec8e3';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: cardCount === 0 ? 0.3 : 1 }}>
      {isCurrentTurn && <div style={{ width: 8, height: 8, borderRadius: '50%', background: tc, boxShadow: `0 0 12px ${tc}` }} />}
      <div style={{ display: 'flex', gap: -16 }}>
        {Array.from({ length: Math.min(cardCount, 6) }).map((_, i) => (
          <CardBack key={`${label}-${i}`} size="xs" style={{ marginLeft: i === 0 ? 0 : -18 }} />
        ))}
      </div>
      <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: '0.1em', color: isCurrentTurn ? tc : 'rgba(201,168,76,0.35)', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  );
};

const ScoreBar = ({ score, totalTricks, trumpSuit, gameMode, bid }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#c9a84c' }} />
      <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color: '#c9a84c' }}>A: {score?.tricksWonByTeam?.A || 0}</span>
    </div>

    <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: 'rgba(201,168,76,0.25)' }}>vs</span>

    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#7ec8e3' }} />
      <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color: '#7ec8e3' }}>B: {score?.tricksWonByTeam?.B || 0}</span>
    </div>

    <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: 'rgba(201,168,76,0.2)' }}>-</span>

    <span style={{ fontFamily: "'Courier Prime',serif", fontSize: 10, color: 'rgba(201,168,76,0.35)' }}>
      {(score?.tricksWonByTeam?.A || 0) + (score?.tricksWonByTeam?.B || 0)}/{totalTricks} tricks
    </span>

    {trumpSuit && <SuitBadge suit={trumpSuit} label="Trump" />}

    {gameMode === 'CONTRACT' && bid && (
      <div
        style={{
          background: 'rgba(201,168,76,0.08)',
          border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: 6,
          padding: '3px 8px',
          fontFamily: "'Cinzel',serif",
          fontSize: 9,
          letterSpacing: '0.1em',
          color: 'rgba(201,168,76,0.7)',
          textTransform: 'uppercase',
        }}
      >
        Bid: {bid}
      </div>
    )}
  </div>
);

export default function GameScreen({ roomInfo, myPlayerId, onLeave }) {
  const roomId = roomInfo?.roomId;
  const [gameState, setGameState] = useState(null);
  const [players, setPlayers] = useState({});
  const [hand, setHand] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [revealOnPlay, setRevealOnPlay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showScore, setShowScore] = useState(false);
  const biddingCloseRequested = useRef(false);

  useEffect(() => {
    if (!roomId || !myPlayerId) return undefined;

    const unsubs = [
      ListenerService.onGameState(roomId, (state) => {
        if (state?.exists) setGameState(state);
      }),
      ListenerService.onPlayers(roomId, setPlayers),
      ListenerService.onMyHand(roomId, myPlayerId, setHand),
    ];

    return () => {
      unsubs.forEach((unsub) => {
        if (typeof unsub === 'function') unsub();
      });
    };
  }, [roomId, myPlayerId]);

  useEffect(() => {
    if (selectedCard == null) return;
    if (selectedCard >= hand.length) setSelectedCard(null);
  }, [hand, selectedCard]);

  useEffect(() => {
    if (gameState?.phase === 'COMPLETE') setShowScore(true);
  }, [gameState?.phase]);

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
  const canHideCard = gameState?.phase === 'HIDING_CARD' && players[myPlayerId]?.teamId === gameState?.hidingTeam;
  const canPickTrump = gameState?.phase === 'TRUMP_SELECTION' && gameState?.biddingState?.biddingWinner === myPlayerId;

  const opponents = Object.entries(players)
    .filter(([pid]) => pid !== myPlayerId)
    .map(([pid, p]) => ({ pid, ...p }))
    .sort((a, b) => (a.seatNumber || 999) - (b.seatNumber || 999));

  const doAction = async (fn) => {
    setBusy(true);
    setError('');
    try {
      const resp = await fn();
      if (resp?.success === false) setError(mapError(resp.error));
    } catch (err) {
      setError(err?.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleHideCard = () => {
    if (selectedCard == null) return;
    const card = hand[selectedCard];
    if (!card) return;
    doAction(() => ActionService.selectHiddenCard(roomId, myPlayerId, card.id));
    setSelectedCard(null);
  };

  const handlePlayCard = () => {
    if (selectedCard == null) return;
    const card = hand[selectedCard];
    if (!card) return;
    doAction(() => ActionService.playCard(roomId, myPlayerId, card.id, revealOnPlay));
    setRevealOnPlay(false);
    setSelectedCard(null);
  };

  const handleBid = (amount) => doAction(() => ActionService.submitBid(roomId, myPlayerId, amount));
  const handlePass = () => doAction(() => ActionService.passBid(roomId, myPlayerId));
  const handleSelectTrump = (suit) => doAction(() => ActionService.selectTrumpSuit(roomId, myPlayerId, suit));
  const handleResetMatch = () => {
    setShowScore(false);
    doAction(() => ActionService.resetMatch(roomId));
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(ellipse at 50% 40%, #091a0c, #050e07)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid rgba(201,168,76,0.07)', background: 'rgba(5,14,7,0.8)', backdropFilter: 'blur(8px)', flexShrink: 0, zIndex: 10, animation: 'fadeDown 0.4s ease both' }}>
        <button onClick={onLeave} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: '0.1em', color: 'rgba(201,168,76,0.3)', textTransform: 'uppercase' }}>
          Leave
        </button>

        <ScoreBar score={score} totalTricks={totalTricks} trumpSuit={gameState?.trumpSuit} gameMode={gameState?.gameMode} bid={gameState?.biddingState?.highestBid?.amount} />

        <button onClick={() => setShowScore(true)} className="btn-ghost" style={{ padding: '5px 10px', fontSize: 10 }}>
          Scores
        </button>
      </div>

      {error && <div style={{ margin: '8px auto 0', padding: '6px 10px', color: '#f4b1a9', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 8, background: 'rgba(192,57,43,0.12)', fontSize: 13 }}>{error}</div>}

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '8%', left: '12%', right: '12%', bottom: '28%', borderRadius: '50%', background: 'radial-gradient(ellipse at 40% 38%, #115c22, #0a3a14 50%, #072a0f)', border: '3px solid #5a3a18', boxShadow: 'inset 0 4px 60px rgba(0,0,0,0.5), 0 0 60px rgba(0,0,0,0.4)' }} />

        <div style={{ position: 'absolute', top: '3%', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {opponents.map((op) => (
            <OpponentHand key={op.pid} cardCount={Array.isArray(gameState?.hands?.[op.pid]) ? gameState.hands[op.pid].length : hand.length} label={op.displayName || op.pid} isCurrentTurn={gameState?.turn === op.pid} teamId={op.teamId} />
          ))}
        </div>

        <div style={{ position: 'absolute', top: '52%', left: '50%', transform: 'translate(-50%,-58%)', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          {(gameState?.currentTrick?.plays || []).map((play) => (
            <TrickCard key={`${play.playerId}-${play.order}`} play={play} playerName={play.playerId === myPlayerId ? 'You' : players[play.playerId]?.displayName || play.playerId} />
          ))}
          {(gameState?.currentTrick?.plays || []).length === 0 && <div style={{ fontFamily: "'EB Garamond',serif", fontSize: 13, fontStyle: 'italic', color: 'rgba(201,168,76,0.2)' }}>{myTurn ? 'Your lead' : 'Waiting for lead'}</div>}
        </div>

        {canPickTrump && (
          <div style={{ position: 'absolute', top: '35%', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ color: 'var(--gold)', letterSpacing: '0.08em', fontFamily: "'Cinzel',serif" }}>Select Trump Suit</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {['S', 'H', 'D', 'C'].map((s) => (
                <button key={s} className="btn-ghost" onClick={() => handleSelectTrump(s)} style={{ minWidth: 64, padding: '10px 14px' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState?.phase === 'HIDING_CARD' && (
          <div style={{ position: 'absolute', bottom: '33%', left: '50%', transform: 'translateX(-50%)', color: 'rgba(201,168,76,0.8)', fontFamily: "'Cinzel',serif", fontSize: 12, letterSpacing: '0.08em' }}>
            {canHideCard ? 'Select one card to hide' : 'Waiting for hiding team...'}
          </div>
        )}

        {myTurn && gameState?.phase === 'PLAYING' && (
          <div style={{ position: 'absolute', bottom: '33%', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 20, padding: '4px 14px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)' }} />
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: '0.15em', color: 'var(--gold)', textTransform: 'uppercase' }}>Your Turn</span>
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, background: 'linear-gradient(to top, rgba(3,7,4,0.95), rgba(5,14,7,0.8) 60%, transparent)', paddingTop: 12, minHeight: 170, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, animation: 'fadeUp 0.5s 0.2s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: hand.length > 10 ? -4 : hand.length > 7 ? 2 : 6, paddingBottom: 12, paddingTop: 4, overflowX: 'auto', maxWidth: '100vw', paddingLeft: 20, paddingRight: 20 }}>
          {hand.map((card, idx) => (
            <CardFace key={card.id} rank={card.rank} suit={card.suit} size="md" playable={canHideCard || myTurn} selected={selectedCard === idx} onClick={() => setSelectedCard((prev) => (prev === idx ? null : idx))} dealDelay={idx * 0.03} style={{ marginLeft: idx === 0 ? 0 : hand.length > 10 ? -18 : hand.length > 7 ? -10 : 0 }} />
          ))}
          {hand.length === 0 && <div style={{ color: 'rgba(201,168,76,0.35)', padding: '16px 0' }}>No cards</div>}
        </div>

        {myTurn && gameState?.phase === 'PLAYING' && selectedCard != null && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(201,168,76,0.65)', fontSize: 12 }}>
            <input type="checkbox" checked={revealOnPlay} onChange={(e) => setRevealOnPlay(e.target.checked)} />
            Request hidden-card reveal if legal
          </label>
        )}

        {canHideCard && selectedCard != null && (
          <button className="btn-primary" onClick={handleHideCard} disabled={busy} style={{ marginBottom: 10, padding: '11px 30px' }}>
            {busy ? 'Working...' : 'Hide Selected Card'}
          </button>
        )}

        {myTurn && gameState?.phase === 'PLAYING' && selectedCard != null && (
          <button className="btn-primary" onClick={handlePlayCard} disabled={busy} style={{ marginBottom: 10, padding: '11px 36px' }}>
            {busy ? 'Working...' : 'Play Selected Card'}
          </button>
        )}
      </div>

      {gameState?.phase === 'BIDDING' && gameState?.biddingState?.isOpen && (
        <BiddingOverlay playerCount={gameState?.playerCount || 4} myPlayerId={myPlayerId} players={players} biddingState={gameState?.biddingState || { isOpen: true, bids: {}, passedPlayers: [], highestBid: null }} deadline={gameState?.biddingState?.deadline} onBid={handleBid} onPass={handlePass} disabled={busy} />
      )}

      {showScore && (
        <ScoreOverlay matchResult={gameState?.matchResult} matchRecord={gameState?.matchRecord} players={players} teams={gameState?.teams || { A: { playerIds: [] }, B: { playerIds: [] } }} onNextMatch={handleResetMatch} onHome={onLeave} />
      )}
    </div>
  );
}
