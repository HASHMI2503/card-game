import React, { useEffect, useMemo, useState } from 'react';

const TIMER_SECONDS = 30;

export default function BiddingOverlay({
  playerCount = 4,
  myPlayerId,
  players = {},
  biddingState = {},
  onBid,
  onPass,
  deadline,
  disabled = false,
}) {
  const minBid = playerCount === 4 ? 8 : 7;
  const maxBid = playerCount === 4 ? 13 : playerCount === 6 ? 12 : 9;

  const currentHighest = biddingState.highestBid?.amount ?? null;
  const minValid = Math.max(minBid, (currentHighest ?? minBid - 1) + 1);

  const [bidAmount, setBidAmount] = useState(minValid);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [hasPassed, setHasPassed] = useState(biddingState.passedPlayers?.includes(myPlayerId) ?? false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHasPassed(biddingState.passedPlayers?.includes(myPlayerId) ?? false);
  }, [biddingState.passedPlayers, myPlayerId]);

  useEffect(() => {
    if (bidAmount < minValid) setBidAmount(minValid);
  }, [minValid, bidAmount]);

  useEffect(() => {
    if (!deadline) return undefined;

    const tick = () => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [deadline]);

  const progress = useMemo(() => Math.max(0, Math.min(1, timeLeft / TIMER_SECONDS)), [timeLeft]);
  const timerColor = timeLeft > 15 ? '#c9a84c' : timeLeft > 8 ? '#f0a030' : '#e74c3c';

  const handleBid = async () => {
    if (!onBid) return;
    setLoading(true);
    try {
      await onBid(bidAmount);
    } finally {
      setLoading(false);
    }
  };

  const handlePass = async () => {
    if (!onPass) return;
    setLoading(true);
    try {
      await onPass();
      setHasPassed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(3,10,5,0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440, padding: '0 20px', animation: 'scaleIn 0.4s ease' }}>
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(12,26,14,0.95), rgba(7,15,9,0.98))',
            border: '1px solid rgba(201,168,76,0.25)',
            borderRadius: 24,
            padding: '32px 32px 28px',
            boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: 1, background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h3 style={{ fontFamily: "'Cinzel',serif", fontSize: 20, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.06em' }}>Bidding</h3>
              <p style={{ fontFamily: "'EB Garamond',serif", fontSize: 14, color: 'rgba(232,213,160,0.45)', marginTop: 4, fontStyle: 'italic' }}>
                {currentHighest ? `Current bid: ${currentHighest}` : 'No bids yet'}
              </p>
            </div>

            <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
              <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(201,168,76,0.08)" strokeWidth="3" />
                <circle cx="36" cy="36" r="28" fill="none" stroke={timerColor} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 28}`} strokeDashoffset={`${2 * Math.PI * 28 * (1 - progress)}`} style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.5s ease' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Courier Prime',serif", fontWeight: 700, fontSize: 18, color: timerColor }}>{timeLeft}</div>
            </div>
          </div>

          {hasPassed ? (
            <div style={{ background: 'rgba(192,57,43,0.08)', border: '1px solid rgba(192,57,43,0.2)', borderRadius: 12, padding: '20px 24px', textAlign: 'center' }}>
              <p style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: 'rgba(232,213,160,0.6)', letterSpacing: '0.05em' }}>You passed. Waiting for bidding to close.</p>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: '0.15em', color: 'rgba(201,168,76,0.5)', textTransform: 'uppercase' }}>Your Bid</span>
                  <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: '0.1em', color: 'rgba(201,168,76,0.35)' }}>{minBid} - {maxBid}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 14, padding: '16px 24px' }}>
                  <button onClick={() => setBidAmount((a) => Math.max(minValid, a - 1))} disabled={loading || disabled} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.08)', color: 'var(--gold)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>-</button>
                  <div style={{ textAlign: 'center', minWidth: 80 }}>
                    <div style={{ fontFamily: "'Cinzel',serif", fontSize: 52, fontWeight: 900, color: 'var(--gold)', lineHeight: 1 }}>{bidAmount}</div>
                    <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: '0.15em', color: 'rgba(201,168,76,0.4)', textTransform: 'uppercase', marginTop: 2 }}>tricks</div>
                  </div>
                  <button onClick={() => setBidAmount((a) => Math.min(maxBid, a + 1))} disabled={loading || disabled} style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.08)', color: 'var(--gold)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>+</button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-danger" onClick={handlePass} disabled={loading || disabled} style={{ flex: 1, padding: '12px 0' }}>{loading ? '...' : 'Pass'}</button>
                <button className="btn-primary" onClick={handleBid} disabled={loading || disabled} style={{ flex: 2, padding: '12px 0' }}>{loading ? '...' : `Bid ${bidAmount}`}</button>
              </div>
            </>
          )}

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(201,168,76,0.08)', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {Object.values(players).map((p) => {
              const bid = biddingState.bids?.[p.playerId];
              const passed = biddingState.passedPlayers?.includes(p.playerId);
              return (
                <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(12,26,14,0.6)', borderRadius: 8, padding: '5px 10px', border: `1px solid ${passed ? 'rgba(192,57,43,0.2)' : bid ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.08)'}` }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: passed ? '#c0392b' : bid ? 'var(--gold)' : 'rgba(201,168,76,0.2)' }} />
                  <span style={{ fontFamily: "'EB Garamond',serif", fontSize: 13, color: 'rgba(232,213,160,0.7)' }}>{p.displayName}</span>
                  {bid && <span style={{ fontFamily: "'Courier Prime',serif", fontSize: 12, fontWeight: 700, color: 'var(--gold)' }}>{bid.amount}</span>}
                  {passed && <span style={{ fontFamily: "'Cinzel',serif", fontSize: 8, color: 'rgba(192,57,43,0.7)', letterSpacing: '0.05em' }}>PASS</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
