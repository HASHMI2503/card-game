import React, { useEffect, useRef } from 'react';

const SUITS = ['♠','♥','♦','♣'];

// Floating suit particles in background
const FloatingParticles = () => {
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    suit: SUITS[i % 4],
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 14 + Math.random() * 32,
    duration: 8 + Math.random() * 12,
    delay: Math.random() * 8,
    r: `${(Math.random() - 0.5) * 40}deg`,
    o: 0.03 + Math.random() * 0.07,
    isRed: i % 4 === 1 || i % 4 === 2,
  }));

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          left: `${p.x}%`,
          top: `${p.y}%`,
          fontSize: p.size,
          color: p.isRed ? '#c0392b' : '#c9a84c',
          opacity: p.o,
          '--r': p.r,
          '--o': p.o,
          animation: `suitFloat ${p.duration}s ease-in-out ${p.delay}s infinite`,
          userSelect: 'none',
        }}>
          {p.suit}
        </div>
      ))}
    </div>
  );
};

// Animated decorative card stack
const HeroCards = () => {
  const cards = [
    { rank: 'A', suit: '♠', rot: -18, x: -36, delay: 0,   bg: 'linear-gradient(145deg,#fdfaf4,#f0e8d8)' },
    { rank: 'K', suit: '♥', rot:  -6, x: -12, delay: 0.1, bg: 'linear-gradient(145deg,#fdfaf4,#f5eddf)' },
    { rank: 'Q', suit: '♦', rot:   6, x:  12, delay: 0.2, bg: 'linear-gradient(145deg,#fdfaf4,#f8f0e6)' },
    { rank: 'J', suit: '♣', rot:  18, x:  36, delay: 0.3, bg: 'linear-gradient(145deg,#fdfaf4,#f3ead8)' },
  ];
  const isRed = s => s === '♥' || s === '♦';

  return (
    <div style={{
      position: 'relative', width: 220, height: 140,
      margin: '0 auto 56px',
    }}>
      {cards.map((c, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          width: 80, height: 112,
          marginLeft: -40 + c.x,
          borderRadius: 8,
          background: c.bg,
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
          transform: `rotate(${c.rot}deg)`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 4,
          animation: `cardDeal 0.5s cubic-bezier(0.34,1.56,0.64,1) ${c.delay}s both, float ${6 + i}s ease-in-out ${c.delay + 0.5}s infinite`,
          '--r': `${c.rot}deg`,
        }}>
          <span style={{
            fontFamily: "'Cinzel',serif", fontWeight: 700, fontSize: 22,
            color: isRed(c.suit) ? '#c0392b' : '#1a1a1a',
          }}>{c.rank}</span>
          <span style={{
            fontSize: 28, lineHeight: 1,
            color: isRed(c.suit) ? '#c0392b' : '#1a1a1a',
          }}>{c.suit}</span>
        </div>
      ))}
    </div>
  );
};

export default function HomeScreen({ onCreateRoom, onJoinRoom }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 0%, #0a2812 0%, #050e07 60%)',
      position: 'relative', overflow: 'hidden',
    }}>
      <FloatingParticles />

      {/* Radial glow behind content */}
      <div style={{
        position: 'absolute', top: '30%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 600, height: 400,
        background: 'radial-gradient(ellipse, rgba(201,168,76,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center',
        padding: '0 24px',
        animation: 'fadeUp 0.8s ease both',
      }}>
        <HeroCards />

        {/* Title */}
        <div style={{ marginBottom: 8 }}>
          <div style={{
            fontFamily: "'Cinzel',serif", fontSize: 11,
            letterSpacing: '0.5em', color: 'rgba(201,168,76,0.5)',
            textTransform: 'uppercase', marginBottom: 10,
            animation: 'fadeDown 0.6s 0.2s ease both',
          }}>
            ✦ The Royal Card Game ✦
          </div>
          <h1 style={{
            fontFamily: "'Cinzel Decorative',serif",
            fontSize: 'clamp(40px, 8vw, 72px)',
            fontWeight: 700,
            letterSpacing: '0.04em',
            lineHeight: 1,
            marginBottom: 6,
            background: 'linear-gradient(135deg, #8a6a22 0%, #c9a84c 30%, #f0d080 50%, #c9a84c 70%, #8a6a22 100%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'goldShimmer 5s linear infinite, fadeUp 0.7s 0.1s ease both',
          }}>
            Mendikot
          </h1>
          <div style={{
            width: 120, height: 1,
            background: 'linear-gradient(90deg, transparent, var(--gold), transparent)',
            margin: '12px auto',
          }} />
          <p style={{
            fontFamily: "'EB Garamond',serif",
            fontSize: 16, fontStyle: 'italic',
            color: 'rgba(232,213,160,0.5)',
            letterSpacing: '0.03em',
            animation: 'fadeUp 0.7s 0.3s ease both',
          }}>
            4 · 6 · 8 Players &nbsp;·&nbsp; Teams &nbsp;·&nbsp; Trump &nbsp;·&nbsp; Mindi
          </p>
        </div>

        {/* Buttons */}
        <div style={{
          display: 'flex', gap: 16, marginTop: 48,
          animation: 'fadeUp 0.7s 0.4s ease both',
          flexWrap: 'wrap', justifyContent: 'center',
        }}>
          <button className="btn-primary" onClick={onCreateRoom} style={{ fontSize:'0.9rem', padding:'16px 44px' }}>
            Create Room
          </button>
          <button className="btn-ghost" onClick={onJoinRoom} style={{ fontSize:'0.9rem', padding:'16px 44px' }}>
            Join Room
          </button>
        </div>

        {/* Footer note */}
        <p style={{
          marginTop: 48,
          fontFamily: "'Cinzel',serif", fontSize: 10,
          letterSpacing: '0.2em', color: 'rgba(201,168,76,0.2)',
          textTransform: 'uppercase',
          animation: 'fadeUp 0.7s 0.6s ease both',
        }}>
          Free to play &nbsp;·&nbsp; No account required
        </p>
      </div>

      {/* Bottom vignette */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 120,
        background: 'linear-gradient(transparent, var(--bg-void))',
        pointerEvents: 'none',
      }} />
    </div>
  );
}
