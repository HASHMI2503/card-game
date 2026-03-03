import React, { useState } from 'react';
import { RoomService } from '../services/firebase.service';

const PlayerCountOption = ({ count, selected, onClick }) => (
  <button
    onClick={() => onClick(count)}
    style={{
      width: 72,
      height: 72,
      borderRadius: 12,
      border: selected ? '2px solid var(--gold)' : '1px solid rgba(201,168,76,0.2)',
      background: selected
        ? 'linear-gradient(145deg, rgba(201,168,76,0.15), rgba(201,168,76,0.08))'
        : 'rgba(12,26,14,0.6)',
      color: selected ? 'var(--gold-bright)' : 'rgba(201,168,76,0.4)',
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      transition: 'all 0.2s ease',
      boxShadow: selected ? '0 0 20px rgba(201,168,76,0.2)' : 'none',
      transform: selected ? 'scale(1.05)' : 'scale(1)',
    }}
  >
    <span style={{ fontFamily: "'Cinzel',serif", fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{count}</span>
    <span
      style={{
        fontFamily: "'Cinzel',serif",
        fontSize: 9,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}
    >
      players
    </span>
  </button>
);

function errorText(errorCode) {
  switch (errorCode) {
    case 'ROOM_NOT_FOUND':
      return 'Room not found. Check the code and try again.';
    case 'ROOM_FULL':
      return 'This room is already full.';
    case 'INVALID_PLAYER_COUNT':
      return 'Invalid player count.';
    case 'UNAUTHENTICATED':
    case 'INVALID_TOKEN':
      return 'Authentication failed. Refresh and try again.';
    default:
      return errorCode || 'Something went wrong. Try again.';
  }
}

export default function RoomScreen({ mode, onBack, onRoomCreated, onRoomJoined }) {
  const [playerCount, setPlayerCount] = useState(4);
  const [roomCode, setRoomCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const name = displayName.trim();
    if (!name) {
      setError('Enter your name first');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const resp = await RoomService.createRoom(playerCount, name);
      if (!resp?.success) {
        setError(errorText(resp?.error));
        return;
      }

      onRoomCreated?.({
        roomId: resp.roomId,
        roomCode: resp.roomCode,
        playerCount,
      });
    } catch (e) {
      setError(e?.message || 'Could not create room. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const name = displayName.trim();
    const normalizedCode = roomCode.toUpperCase().trim();

    if (!name) {
      setError('Enter your name first');
      return;
    }

    if (normalizedCode.length !== 6) {
      setError('Room code must be 6 characters');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const resp = await RoomService.joinRoom(normalizedCode, name);
      if (!resp?.success) {
        setError(errorText(resp?.error));
        return;
      }

      const meta = await RoomService.getRoomMeta(resp.roomId);
      onRoomJoined?.({
        roomId: resp.roomId,
        roomCode: meta?.roomCode || normalizedCode,
        playerCount: meta?.playerCount || 4,
      });
    } catch (e) {
      setError(e?.message || 'Could not join room. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 0%, #091a0c 0%, #050e07 70%)',
        padding: 24,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 500,
          height: 300,
          background: 'radial-gradient(ellipse, rgba(201,168,76,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ width: '100%', maxWidth: 440, animation: 'scaleIn 0.4s ease both' }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(201,168,76,0.5)',
            marginBottom: 32,
            fontFamily: "'Cinzel',serif",
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            transition: 'color 0.2s',
          }}
        >
          {'<-'} Back
        </button>

        <div
          className="glass"
          style={{
            borderRadius: 24,
            padding: '40px 36px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,168,76,0.08)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div
              style={{
                width: 48,
                height: 2,
                background: 'linear-gradient(90deg, transparent, var(--gold), transparent)',
                margin: '0 auto 18px',
              }}
            />
            <h2
              style={{
                fontFamily: "'Cinzel',serif",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'var(--gold)',
              }}
            >
              {mode === 'create' ? 'New Room' : 'Join Room'}
            </h2>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                fontFamily: "'Cinzel',serif",
                fontSize: 10,
                letterSpacing: '0.15em',
                color: 'rgba(201,168,76,0.5)',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 8,
              }}
            >
              Your Name
            </label>
            <input
              className="input-field"
              style={{ letterSpacing: '0.05em', fontSize: '1rem', textTransform: 'none' }}
              placeholder="Enter your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={16}
            />
          </div>

          {mode === 'create' && (
            <div style={{ marginBottom: 28 }}>
              <label
                style={{
                  fontFamily: "'Cinzel',serif",
                  fontSize: 10,
                  letterSpacing: '0.15em',
                  color: 'rgba(201,168,76,0.5)',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: 12,
                }}
              >
                Players
              </label>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                {[4, 6, 8].map((n) => (
                  <PlayerCountOption key={n} count={n} selected={playerCount === n} onClick={setPlayerCount} />
                ))}
              </div>
            </div>
          )}

          {mode === 'join' && (
            <div style={{ marginBottom: 28 }}>
              <label
                style={{
                  fontFamily: "'Cinzel',serif",
                  fontSize: 10,
                  letterSpacing: '0.15em',
                  color: 'rgba(201,168,76,0.5)',
                  textTransform: 'uppercase',
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                Room Code
              </label>
              <input
                className="input-field"
                placeholder="XXXXXX"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
                maxLength={6}
                autoFocus
              />
            </div>
          )}

          {error && (
            <div
              style={{
                background: 'rgba(192,57,43,0.1)',
                border: '1px solid rgba(192,57,43,0.3)',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 20,
                fontFamily: "'EB Garamond',serif",
                fontSize: 14,
                color: '#e74c3c',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          <button
            className="btn-primary"
            onClick={mode === 'create' ? handleCreate : handleJoin}
            disabled={loading}
            style={{ width: '100%', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? (mode === 'create' ? 'Creating...' : 'Joining...') : mode === 'create' ? 'Create Room' : 'Join Room'}
          </button>
        </div>
      </div>
    </div>
  );
}
