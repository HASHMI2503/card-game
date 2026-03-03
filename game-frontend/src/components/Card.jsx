import React, { useState } from 'react';

// ── Suit SVG symbols ─────────────────────────────────────────────────────────
const SuitSymbol = ({ suit, size = 20, color }) => {
  const c = color || (suit === 'H' || suit === 'D' ? '#c0392b' : '#1a1a1a');
  const paths = {
    H: <path d="M10 17.5C10 17.5 2 12 2 6.5C2 4 4 2 6.5 2C8.5 2 10 3.5 10 3.5C10 3.5 11.5 2 13.5 2C16 2 18 4 18 6.5C18 12 10 17.5 10 17.5Z" fill={c}/>,
    D: <path d="M10 2L18 10L10 18L2 10Z" fill={c}/>,
    C: <>
        <circle cx="7" cy="11" r="3.5" fill={c}/>
        <circle cx="13" cy="11" r="3.5" fill={c}/>
        <circle cx="10" cy="7"  r="3.5" fill={c}/>
        <rect x="8.5" y="12" width="3" height="5" rx="1" fill={c}/>
       </>,
    S: <>
        <path d="M10 2L17 11C17 11 14.5 13 12 12C13 14 14 16 14 16H6C6 16 7 14 8 12C5.5 13 3 11 3 11Z" fill={c}/>
        <rect x="8.5" y="14" width="3" height="4" rx="1" fill={c}/>
       </>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      {paths[suit]}
    </svg>
  );
};

// ── Rank display ─────────────────────────────────────────────────────────────
const rankDisplay = (rank) => rank;

// ── Card face ─────────────────────────────────────────────────────────────────
export const CardFace = ({ rank, suit, size = 'md', selected, playable, style, onClick, dealDelay = 0 }) => {
  const [hovered, setHovered] = useState(false);
  const isRed = suit === 'H' || suit === 'D';
  const color = isRed ? '#c0392b' : '#1a1a1a';

  const sizes = {
    xs: { w: 38,  h: 54,  rank: 11, suit: 12, pad: 3 },
    sm: { w: 52,  h: 74,  rank: 13, suit: 16, pad: 4 },
    md: { w: 72,  h: 100, rank: 17, suit: 22, pad: 6 },
    lg: { w: 90,  h: 126, rank: 21, suit: 28, pad: 8 },
  };
  const s = sizes[size] || sizes.md;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: s.w,
        height: s.h,
        borderRadius: s.w * 0.1,
        background: 'linear-gradient(145deg, #fdfaf4, #f5ede0)',
        border: selected
          ? '2px solid #c9a84c'
          : hovered && playable
          ? '2px solid rgba(201,168,76,0.6)'
          : '1px solid rgba(0,0,0,0.12)',
        boxShadow: selected
          ? '0 0 20px rgba(201,168,76,0.5), 0 6px 20px rgba(0,0,0,0.5)'
          : hovered && playable
          ? '0 8px 28px rgba(0,0,0,0.5), 0 0 12px rgba(201,168,76,0.2)'
          : '0 4px 16px rgba(0,0,0,0.45)',
        transform: selected
          ? 'translateY(-18px) scale(1.04)'
          : hovered && playable
          ? 'translateY(-12px) scale(1.02)'
          : 'translateY(0)',
        transition: 'all 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        cursor: playable ? 'pointer' : 'default',
        position: 'relative',
        flexShrink: 0,
        userSelect: 'none',
        animation: `cardDeal 0.4s cubic-bezier(0.34,1.56,0.64,1) ${dealDelay}s both`,
        ...style,
      }}
    >
      {/* Top-left corner */}
      <div style={{
        position: 'absolute', top: s.pad, left: s.pad,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        lineHeight: 1,
      }}>
        <span style={{ fontFamily: "'Cinzel',serif", fontSize: s.rank, fontWeight: 700, color, lineHeight:1 }}>
          {rankDisplay(rank)}
        </span>
        <SuitSymbol suit={suit} size={s.suit} />
      </div>

      {/* Center suit */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0.15,
      }}>
        <SuitSymbol suit={suit} size={s.w * 0.55} />
      </div>

      {/* Bottom-right corner (rotated) */}
      <div style={{
        position: 'absolute', bottom: s.pad, right: s.pad,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        transform: 'rotate(180deg)', lineHeight: 1,
      }}>
        <span style={{ fontFamily: "'Cinzel',serif", fontSize: s.rank, fontWeight: 700, color, lineHeight:1 }}>
          {rankDisplay(rank)}
        </span>
        <SuitSymbol suit={suit} size={s.suit} />
      </div>

      {/* Playable highlight */}
      {playable && !selected && (
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: 'inherit',
          background: 'radial-gradient(circle at 50% 30%, rgba(201,168,76,0.08), transparent 70%)',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
};

// ── Card back ─────────────────────────────────────────────────────────────────
export const CardBack = ({ size = 'md', style }) => {
  const sizes = { xs:{ w:38,h:54 }, sm:{ w:52,h:74 }, md:{ w:72,h:100 }, lg:{ w:90,h:126 } };
  const s = sizes[size] || sizes.md;
  return (
    <div style={{
      width: s.w, height: s.h,
      borderRadius: s.w * 0.1,
      background: 'linear-gradient(145deg, #0e3a18, #0a2812)',
      border: '1px solid rgba(201,168,76,0.25)',
      boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      flexShrink: 0,
      ...style,
    }}>
      {/* Diamond pattern */}
      <svg width="100%" height="100%" style={{ position:'absolute', inset:0 }}>
        <defs>
          <pattern id="dp" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M5 0L10 5L5 10L0 5Z" fill="none" stroke="rgba(201,168,76,0.15)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dp)"/>
      </svg>
      {/* Center emblem */}
      <div style={{
        width: s.w * 0.5, height: s.h * 0.5,
        border: '1px solid rgba(201,168,76,0.4)',
        borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(201,168,76,0.05)',
      }}>
        <span style={{ fontSize: s.w * 0.22, opacity: 0.5 }}>♦</span>
      </div>
    </div>
  );
};

// ── Suit badge (for trump indicator) ─────────────────────────────────────────
export const SuitBadge = ({ suit, label }) => {
  if (!suit) return null;
  const isRed = suit === 'H' || suit === 'D';
  const suitNames = { H: 'Hearts', D: 'Diamonds', S: 'Spades', C: 'Clubs' };
  const suitSymbols = { H: '♥', D: '♦', S: '♠', C: '♣' };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'rgba(12,26,14,0.9)',
      border: '1px solid rgba(201,168,76,0.35)',
      borderRadius: 8, padding: '5px 12px',
    }}>
      {label && <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing:'0.1em', color:'rgba(201,168,76,0.6)', textTransform:'uppercase' }}>{label}</span>}
      <span style={{ fontSize: 18, color: isRed ? '#e74c3c' : '#e8d5a0', lineHeight:1 }}>
        {suitSymbols[suit]}
      </span>
      <span style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color:'rgba(201,168,76,0.8)', letterSpacing:'0.05em' }}>
        {suitNames[suit]}
      </span>
    </div>
  );
};

export { SuitSymbol };
export default CardFace;
