import React, { useEffect, useState } from 'react';

export default function ScoreOverlay({ matchResult, matchRecord, players, teams, onNextMatch, onHome }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 400);
    return () => clearTimeout(t);
  }, []);

  if (!matchResult) return null;

  const { winnerTeam, isDraw, gameMode, tricksWonByTeam, mindisByTeam, bidAmount } = matchResult;

  const teamACount = teams?.A?.playerIds?.length ?? 2;
  const teamBCount = teams?.B?.playerIds?.length ?? 2;

  const headline = isDraw
    ? 'Draw!'
    : winnerTeam === 'A'
    ? 'Team A Wins!'
    : 'Team B Wins!';

  const winColor  = isDraw ? 'rgba(201,168,76,0.8)' : winnerTeam === 'A' ? '#c9a84c' : '#7ec8e3';

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(3,10,5,0.92)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200, padding: 24,
      animation: 'fadeIn 0.4s ease',
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        animation: 'scaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.2s both',
      }}>
        {/* Main result card */}
        <div style={{
          background: 'linear-gradient(160deg, rgba(14,30,16,0.98), rgba(7,15,9,0.99))',
          border: `1px solid ${winColor}40`,
          borderRadius: 24, overflow: 'hidden',
          boxShadow: `0 0 80px ${winColor}15, 0 32px 80px rgba(0,0,0,0.7)`,
        }}>
          {/* Win color top bar */}
          <div style={{
            height: 3,
            background: `linear-gradient(90deg, transparent, ${winColor}, transparent)`,
          }} />

          <div style={{ padding: '32px 32px 28px' }}>
            {/* Mode badge */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: 20, padding: '4px 12px',
              fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: '0.15em',
              color: 'rgba(201,168,76,0.6)', textTransform: 'uppercase',
              marginBottom: 20,
            }}>
              {gameMode === 'CONTRACT' ? `Contract · Bid ${bidAmount}` : 'Mindi Mode'}
            </div>

            {/* Headline */}
            <h2 style={{
              fontFamily: "'Cinzel Decorative',serif",
              fontSize: 'clamp(28px,6vw,42px)',
              fontWeight: 700, letterSpacing: '0.06em',
              color: winColor, marginBottom: 6,
              textShadow: `0 0 40px ${winColor}50`,
              animation: revealed ? 'fadeUp 0.6s ease both' : 'none',
            }}>
              {headline}
            </h2>

            {!isDraw && (
              <p style={{
                fontFamily: "'EB Garamond',serif", fontSize: 15,
                fontStyle: 'italic', color: 'rgba(232,213,160,0.45)',
                marginBottom: 28,
              }}>
                {gameMode === 'CONTRACT'
                  ? `${winnerTeam==='A'?'Team A':'Team B'} ${tricksWonByTeam?.[winnerTeam]??0 >= bidAmount ? 'made' : 'failed'} their bid of ${bidAmount}`
                  : `${winnerTeam==='A'?'Team A':'Team B'} captured the majority of Mindis`}
              </p>
            )}

            {/* Score grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
              marginBottom: 24,
              opacity: revealed ? 1 : 0,
              transition: 'opacity 0.6s 0.3s ease',
            }}>
              {['A','B'].map(team => {
                const isWinner = team === winnerTeam;
                const tc = team === 'A' ? '#c9a84c' : '#7ec8e3';
                return (
                  <div key={team} style={{
                    background: isWinner ? `rgba(${team==='A'?'201,168,76':'126,200,227'},0.08)` : 'rgba(12,26,14,0.6)',
                    border: `1px solid rgba(${team==='A'?'201,168,76':'126,200,227'},${isWinner?'0.3':'0.1'})`,
                    borderRadius: 14, padding: '16px 18px',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    {isWinner && (
                      <div style={{
                        position: 'absolute', top: 8, right: 8,
                        fontSize: 14, opacity: 0.6,
                      }}>👑</div>
                    )}
                    <div style={{
                      fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: '0.15em',
                      color: `${tc}80`, textTransform: 'uppercase', marginBottom: 10,
                    }}>
                      Team {team}
                    </div>

                    <div style={{ display: 'flex', gap: 16 }}>
                      <div>
                        <div style={{ fontFamily:"'Cinzel',serif", fontSize:26, fontWeight:700, color:tc, lineHeight:1 }}>
                          {tricksWonByTeam?.[team] ?? 0}
                        </div>
                        <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, letterSpacing:'0.1em', color:`${tc}60`, textTransform:'uppercase', marginTop:2 }}>
                          Tricks
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily:"'Cinzel',serif", fontSize:26, fontWeight:700, color:tc, lineHeight:1 }}>
                          {mindisByTeam?.[team] ?? 0}
                        </div>
                        <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, letterSpacing:'0.1em', color:`${tc}60`, textTransform:'uppercase', marginTop:2 }}>
                          🃏 Mindi
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Overall record */}
            {matchRecord && (
              <div style={{
                background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.1)',
                borderRadius: 12, padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 24,
                opacity: revealed ? 1 : 0,
                transition: 'opacity 0.6s 0.5s ease',
              }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:18, fontWeight:700, color:'#c9a84c' }}>
                    {matchRecord.byTeam?.A?.wins ?? 0}
                  </div>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, letterSpacing:'0.1em', color:'rgba(201,168,76,0.4)', textTransform:'uppercase' }}>
                    Team A
                  </div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:10, letterSpacing:'0.15em', color:'rgba(201,168,76,0.3)', textTransform:'uppercase' }}>
                    Match {matchRecord.totalMatches}
                  </div>
                  <div style={{ fontFamily:"'EB Garamond',serif", fontSize:12, fontStyle:'italic', color:'rgba(201,168,76,0.3)', marginTop:2 }}>
                    Overall
                  </div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:18, fontWeight:700, color:'#7ec8e3' }}>
                    {matchRecord.byTeam?.B?.wins ?? 0}
                  </div>
                  <div style={{ fontFamily:"'Cinzel',serif", fontSize:8, letterSpacing:'0.1em', color:'rgba(126,200,227,0.4)', textTransform:'uppercase' }}>
                    Team B
                  </div>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn-ghost" onClick={onHome} style={{ flex:1, padding:'12px 0' }}>
                Home
              </button>
              <button className="btn-primary" onClick={onNextMatch} style={{ flex:2, padding:'12px 0' }}>
                Next Match →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
