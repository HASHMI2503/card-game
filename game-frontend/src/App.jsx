import React, { useEffect, useMemo, useState } from 'react';
import './index.css';

import HomeScreen from './screens/HomeScreen';
import RoomScreen from './screens/RoomScreen';
import LobbyScreen from './screens/LobbyScreen';
import GameScreen from './screens/GameScreen';
import {
  AuthService,
  ReconnectService,
  RoomService,
  startHeartbeat,
} from './services/firebase.service';

const SCREENS = {
  HOME: 'HOME',
  ROOM: 'ROOM',
  LOBBY: 'LOBBY',
  GAME: 'GAME',
};

function phaseToScreen(phase) {
  if (!phase) return SCREENS.HOME;
  if (phase === 'WAITING' || phase === 'DEALING') return SCREENS.LOBBY;
  return SCREENS.GAME;
}

export default function App() {
  const [screen, setScreen] = useState(SCREENS.HOME);
  const [roomMode, setRoomMode] = useState('create');
  const [roomInfo, setRoomInfo] = useState(null);
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState('');

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        setBootError('');
        const uid = await AuthService.signIn();
        if (!mounted) return;

        setMyPlayerId(uid);

        const restored = await ReconnectService.checkAndRestore(uid);
        if (!mounted) return;

        if (restored.inGame) {
          const meta = await RoomService.getRoomMeta(restored.roomId);
          if (!mounted) return;

          setRoomInfo({
            roomId: restored.roomId,
            roomCode: meta?.roomCode || restored.roomId.slice(0, 6).toUpperCase(),
            playerCount: meta?.playerCount || restored.gameState?.playerCount || 4,
          });
          setScreen(phaseToScreen(restored.gameState?.phase));
        }
      } catch (err) {
        if (mounted) {
          setBootError(err?.message || 'Failed to initialize app.');
        }
      } finally {
        if (mounted) setBooting(false);
      }
    };

    bootstrap();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!roomInfo?.roomId || !myPlayerId) return undefined;
    const hb = startHeartbeat(roomInfo.roomId);
    return () => {
      if (hb) clearInterval(hb);
    };
  }, [roomInfo?.roomId, myPlayerId]);

  const leaveRoom = useMemo(
    () => () => {
      localStorage.removeItem('mendikot_room');
      localStorage.removeItem('mendikot_room_code');
      setRoomInfo(null);
      setScreen(SCREENS.HOME);
    },
    []
  );

  if (booting) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', background: '#050e07' }}>
        <div style={{ fontFamily: "'Cinzel',serif", letterSpacing: '0.1em', color: 'var(--gold)' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <div className="noise-overlay" />

      {bootError && (
        <div style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(192,57,43,0.16)',
          border: '1px solid rgba(192,57,43,0.4)',
          borderRadius: 8,
          padding: '8px 14px',
          color: '#f4b1a9',
          fontFamily: "'EB Garamond',serif",
        }}>
          {bootError}
        </div>
      )}

      {screen === SCREENS.HOME && (
        <HomeScreen
          onCreateRoom={() => {
            setRoomMode('create');
            setScreen(SCREENS.ROOM);
          }}
          onJoinRoom={() => {
            setRoomMode('join');
            setScreen(SCREENS.ROOM);
          }}
        />
      )}

      {screen === SCREENS.ROOM && (
        <RoomScreen
          mode={roomMode}
          onBack={() => setScreen(SCREENS.HOME)}
          onRoomCreated={(info) => {
            setRoomInfo(info);
            setScreen(SCREENS.LOBBY);
          }}
          onRoomJoined={(info) => {
            setRoomInfo(info);
            setScreen(SCREENS.LOBBY);
          }}
        />
      )}

      {screen === SCREENS.LOBBY && roomInfo && (
        <LobbyScreen
          roomId={roomInfo.roomId}
          roomCode={roomInfo.roomCode}
          playerCount={roomInfo.playerCount}
          myPlayerId={myPlayerId}
          onBack={leaveRoom}
          onGameStart={() => setScreen(SCREENS.GAME)}
        />
      )}

      {screen === SCREENS.GAME && roomInfo && (
        <GameScreen
          roomInfo={roomInfo}
          myPlayerId={myPlayerId}
          onLeave={leaveRoom}
        />
      )}
    </div>
  );
}
