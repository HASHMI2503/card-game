import React, { useEffect, useMemo, useState } from 'react';
import { ActionService, ListenerService } from '../services/firebase.service';

const TEAM_A_COLOR = '#c9a84c';
const TEAM_B_COLOR = '#7ec8e3';

function getTeam(seat) {
  return seat % 2 === 1 ? 'A' : 'B';
}

const TableLayout = ({ playerCount, seats, myPlayerId, onSeatClick, players }) => {
  const positions = {
    4: [
      { seat: 1, x: 50, y: 88 },
      { seat: 2, x: 88, y: 50 },
      { seat: 3, x: 50, y: 12 },
      { seat: 4, x: 12, y: 50 },
    ],
    6: [
      { seat: 1, x: 50, y: 90 },
      { seat: 2, x: 82, y: 72 },
      { seat: 3, x: 82, y: 28 },
      { seat: 4, x: 50, y: 10 },
      { seat: 5, x: 18, y: 28 },
      { seat: 6, x: 18, y: 72 },
    ],
    8: [
      { seat: 1, x: 50, y: 90 },
      { seat: 2, x: 80, y: 78 },
      { seat: 3, x: 90, y: 50 },
      { seat: 4, x: 80, y: 22 },
      { seat: 5, x: 50, y: 10 },
      { seat: 6, x: 20, y: 22 },
      { seat: 7, x: 10, y: 50 },
      { seat: 8, x: 20, y: 78 },
    ],
  };

  const layout = positions[playerCount] || positions[4];
  const mySeat = Object.entries(seats).find(([, pid]) => pid === myPlayerId)?.[0];
  const myTeam = mySeat ? getTeam(Number(mySeat)) : null;

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '70%' }}>
      <div style={{ position: 'absolute', inset: '5% 5%' }}>
        <div
          style={{
            position: 'absolute',
            top: '12%',
            left: '8%',
            right: '8%',
            bottom: '12%',
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at 40% 35%, #115a25, #0a3515)',
            border: '3px solid rgba(201,168,76,0.25)',
            boxShadow: 'inset 0 4px 40px rgba(0,0,0,0.5), 0 0 40px rgba(0,0,0,0.4)',
          }}
        />

        {layout.map(({ seat, x, y }) => {
          const team = getTeam(seat);
          const occupantId = seats[seat];
          const occupant = occupantId ? players[occupantId] : null;
          const isMe = occupantId === myPlayerId;
          const isEmpty = !occupantId;
          const teamColor = team === 'A' ? TEAM_A_COLOR : TEAM_B_COLOR;

          return (
            <div
              key={seat}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%,-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <div
                onClick={() => isEmpty && !myTeam && onSeatClick(seat)}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  border: isMe
                    ? `2px solid ${teamColor}`
                    : !isEmpty
                    ? `2px solid rgba(${team === 'A' ? '201,168,76' : '126,200,227'},0.4)`
                    : '2px dashed rgba(201,168,76,0.2)',
                  background: isMe
                    ? `radial-gradient(circle, rgba(${team === 'A' ? '201,168,76' : '126,200,227'},0.25), rgba(${team === 'A' ? '201,168,76' : '126,200,227'},0.08))`
                    : !isEmpty
                    ? 'rgba(12,26,14,0.9)'
                    : 'rgba(12,26,14,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isEmpty && !myTeam ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                  boxShadow: isMe ? `0 0 20px rgba(${team === 'A' ? '201,168,76' : '126,200,227'},0.3)` : 'none',
                  flexShrink: 0,
                }}
              >
                {!isEmpty ? (
                  <span style={{ color: occupant?.isReady ? '#4caf50' : 'rgba(201,168,76,0.75)', fontFamily: "'Cinzel',serif", fontSize: 12 }}>
                    {occupant?.isReady ? 'READY' : 'PLAYER'}
                  </span>
                ) : (
                  <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: 'rgba(201,168,76,0.3)', letterSpacing: '0.05em' }}>{seat}</span>
                )}
              </div>

              <div
                style={{
                  background: isMe ? `rgba(${team === 'A' ? '201,168,76' : '126,200,227'},0.12)` : 'rgba(5,14,7,0.8)',
                  border: `1px solid rgba(${team === 'A' ? '201,168,76' : '126,200,227'},${isMe ? '0.35' : '0.15'})`,
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontFamily: "'Cinzel',serif",
                  fontSize: 9,
                  color: isMe ? teamColor : !isEmpty ? 'rgba(232,213,160,0.7)' : 'rgba(201,168,76,0.2)',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                  maxWidth: 90,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  textTransform: 'uppercase',
                }}
              >
                {!isEmpty ? (isMe ? 'You' : occupant?.displayName || 'Player') : `Team ${team}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

function errorText(errorCode) {
  switch (errorCode) {
    case 'SEAT_TAKEN':
      return 'Seat already taken.';
    case 'DUPLICATE_PLAYER':
      return 'You already selected a seat.';
    case 'WRONG_PHASE':
      return 'Cannot do that in current phase.';
    default:
      return errorCode || 'Action failed.';
  }
}

export default function LobbyScreen({ roomId, roomCode, playerCount, myPlayerId, onBack, onGameStart }) {
  const [players, setPlayers] = useState({});
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!roomId) return undefined;

    const unsubs = [
      ListenerService.onPlayers(roomId, setPlayers),
      ListenerService.onGameState(roomId, (state) => {
        if (state?.exists) setGameState(state);
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => {
        if (typeof unsub === 'function') unsub();
      });
    };
  }, [roomId]);

  useEffect(() => {
    if (!gameState?.phase) return;
    if (gameState.phase !== 'WAITING' && gameState.phase !== 'DEALING') {
      onGameStart?.();
    }
  }, [gameState?.phase, onGameStart]);

  const seats = useMemo(() => {
    const mapping = {};
    Object.entries(players).forEach(([pid, p]) => {
      if (typeof p?.seatNumber === 'number' && p.seatNumber > 0) {
        mapping[p.seatNumber] = pid;
      }
    });
    return mapping;
  }, [players]);

  const mySeat = players[myPlayerId]?.seatNumber || null;
  const myTeam = players[myPlayerId]?.teamId || null;
  const targetCount = gameState?.playerCount || playerCount || 4;
  const connectedCount = Object.keys(players).length;
  const allReady = connectedCount === targetCount && Object.values(players).every((p) => p?.isReady === true && p?.seatNumber != null);

  const handleSeatClick = async (seatNumber) => {
    if (!roomId || !myPlayerId) return;
    if (mySeat) return;

    setIsBusy(true);
    setError('');
    try {
      const resp = await ActionService.selectSeat(roomId, myPlayerId, seatNumber);
      if (!resp?.success) {
        setError(errorText(resp?.error));
      }
    } catch (err) {
      setError(err?.message || 'Seat selection failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleReady = async () => {
    if (!roomId || !myPlayerId || !mySeat) return;

    setIsBusy(true);
    setError('');
    try {
      const resp = await ActionService.ready(roomId, myPlayerId);
      if (!resp?.success) {
        setError(errorText(resp?.error));
      }
    } catch (err) {
      setError(err?.message || 'Ready action failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const phaseLabel = gameState?.phase || 'WAITING';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'radial-gradient(ellipse at 50% 0%, #091a0c 0%, #050e07 80%)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderBottom: '1px solid rgba(201,168,76,0.08)',
          animation: 'fadeDown 0.4s ease both',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: "'Cinzel',serif",
            fontSize: 11,
            letterSpacing: '0.1em',
            color: 'rgba(201,168,76,0.4)',
            textTransform: 'uppercase',
          }}
        >
          {'<-'} Leave
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 15, color: 'var(--gold)', letterSpacing: '0.08em' }}>Mendikot</div>
          <div
            style={{
              fontFamily: "'Cinzel',serif",
              fontSize: 9,
              color: 'rgba(201,168,76,0.4)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            {phaseLabel}
          </div>
        </div>

        <button
          onClick={copyCode}
          style={{
            background: 'rgba(201,168,76,0.06)',
            border: '1px solid rgba(201,168,76,0.2)',
            borderRadius: 8,
            padding: '6px 14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontFamily: "'Courier Prime',serif", fontSize: 14, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--gold)' }}>{roomCode}</span>
          <span style={{ fontSize: 10, color: 'rgba(201,168,76,0.4)' }}>{copied ? 'OK' : 'COPY'}</span>
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden', animation: 'fadeUp 0.5s 0.1s ease both' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 8px 16px 24px' }}>
          <div style={{ width: '100%', maxWidth: 500 }}>
            <TableLayout playerCount={targetCount} seats={seats} myPlayerId={myPlayerId} onSeatClick={handleSeatClick} players={players} />
            {!mySeat && (
              <p
                style={{
                  textAlign: 'center',
                  fontFamily: "'EB Garamond',serif",
                  fontSize: 14,
                  fontStyle: 'italic',
                  color: 'rgba(201,168,76,0.4)',
                  marginTop: 8,
                }}
              >
                Select a seat to join a team
              </p>
            )}
          </div>
        </div>

        <div
          style={{
            width: 250,
            flexShrink: 0,
            padding: '16px 16px 16px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            borderLeft: '1px solid rgba(201,168,76,0.06)',
          }}
        >
          <div style={{ background: 'rgba(12,26,14,0.6)', border: 'var(--border-dim)', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: '0.15em', color: 'rgba(201,168,76,0.4)', textTransform: 'uppercase', marginBottom: 8 }}>
              Players
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 28, fontWeight: 700, color: 'var(--gold)' }}>{connectedCount}</span>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 14, color: 'rgba(201,168,76,0.4)' }}>/ {targetCount}</span>
            </div>
          </div>

          {['A', 'B'].map((team) => (
            <div key={team} style={{ background: 'rgba(12,26,14,0.5)', border: 'var(--border-dim)', borderRadius: 12, padding: '10px 14px' }}>
              <div
                style={{
                  fontFamily: "'Cinzel',serif",
                  fontSize: 9,
                  letterSpacing: '0.15em',
                  color: team === 'A' ? 'rgba(201,168,76,0.5)' : 'rgba(126,200,227,0.5)',
                  textTransform: 'uppercase',
                  marginBottom: 8,
                }}
              >
                Team {team}
              </div>
              {Object.entries(players)
                .filter(([, p]) => p?.teamId === team)
                .map(([pid, p]) => (
                  <div key={pid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontFamily: "'EB Garamond',serif", fontSize: 14, color: 'rgba(232,213,160,0.8)' }}>
                      {pid === myPlayerId ? 'You' : p.displayName || 'Player'}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Cinzel',serif",
                        fontSize: 8,
                        letterSpacing: '0.1em',
                        color: p.isReady ? '#4caf50' : 'rgba(201,168,76,0.3)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {p.isReady ? 'Ready' : 'Waiting'}
                    </span>
                  </div>
                ))}
            </div>
          ))}

          {error && (
            <div style={{ background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.3)', borderRadius: 8, padding: '8px 10px', color: '#f4b1a9', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: 'auto' }}>
            {mySeat && players[myPlayerId]?.isReady !== true ? (
              <button className="btn-primary" onClick={handleReady} disabled={isBusy} style={{ width: '100%', padding: '13px 0' }}>
                {isBusy ? 'Working...' : "I'm Ready"}
              </button>
            ) : mySeat && players[myPlayerId]?.isReady === true ? (
              <div
                style={{
                  width: '100%',
                  padding: '13px 0',
                  borderRadius: 12,
                  border: '1px solid rgba(76,175,80,0.4)',
                  background: 'rgba(76,175,80,0.08)',
                  fontFamily: "'Cinzel',serif",
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#4caf50',
                  textAlign: 'center',
                }}
              >
                Ready
              </div>
            ) : (
              <div style={{ fontFamily: "'EB Garamond',serif", fontSize: 13, fontStyle: 'italic', color: 'rgba(201,168,76,0.3)', textAlign: 'center', padding: '8px 0' }}>
                Select a seat to ready up
              </div>
            )}

            {allReady && (
              <div style={{ marginTop: 8, textAlign: 'center', color: 'rgba(201,168,76,0.5)', fontSize: 12 }}>
                All players ready. Starting game...
              </div>
            )}

            {myTeam && (
              <div style={{ marginTop: 10, textAlign: 'center', color: myTeam === 'A' ? TEAM_A_COLOR : TEAM_B_COLOR, fontSize: 12, letterSpacing: '0.08em' }}>
                Team {myTeam}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
