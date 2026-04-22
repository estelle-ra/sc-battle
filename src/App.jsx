import { useState, useEffect, useCallback } from "react";

// ⚠️ Apps Script 배포 후 여기에 URL 붙여넣기
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxBNZ8VRsiEzNzobrJy-zr6vGvIbpF2yhAxCOdsncInAfK3BStjSTYpMlYTXYW0ni72/exec";

const ADMIN_PW = "krafton";

const PLAYERS = {
  a: {
    name: "이준호", title: "예측불허 랜덤러", race: "RANDOM",
    raceIcon: "🎲",
    color: "#c084fc", dim: "#c084fc55",
    bg: "linear-gradient(160deg, #1a0f2e, #120a1e)",
    border: "#c084fc55",
    barColor: "linear-gradient(90deg, #a855f7, #c084fc)",
  },
  b: {
    name: "김우림", title: "테란의 황제", race: "TERRAN",
    raceIcon: "🔵",
    color: "#00d4ff", dim: "#00d4ff55",
    bg: "linear-gradient(160deg, #0a1a2e, #071525)",
    border: "#00d4ff55",
    barColor: "linear-gradient(90deg, #00d4ff, #0099cc)",
  },
};

function calcPayout(total, winnerCount) {
  if (winnerCount === 0 || total === 0) return null;
  return Math.round((total / winnerCount) * 100) / 100;
}

const LS_KEY = "sc-battle-vote";

// Apps Script 호출 헬퍼 (모두 GET 쿼리스트링)
async function api(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${SCRIPT_URL}?${qs}`, { redirect: "follow" });
  return res.json();
}

export default function App() {
  const [allVotes, setAllVotes]   = useState([]);
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [apiError, setApiError]   = useState(false);

  const [myVote, setMyVote]       = useState(null);
  const [step, setStep]           = useState("form");
  const [formData, setFormData]   = useState({ nickname: "", side: null });
  const [submitting, setSubmitting] = useState(false);
  const [dupError, setDupError]   = useState(false);

  const [adminPw, setAdminPw]     = useState("");
  const [adminMode, setAdminMode] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [resultPick, setResultPick] = useState(null);
  const [adminBusy, setAdminBusy] = useState(false);

  const [tab, setTab] = useState("predict");

  const loadData = useCallback(async () => {
    try {
      const data = await api({ action: "getAll" });
      if (data.ok) {
        const serverRound = data.round ?? 1;
        setAllVotes(data.votes || []);
        setResult(data.result || null);
        setApiError(false);

        // localStorage에서 내 투표 복원 — 라운드가 같을 때만
        const saved = localStorage.getItem(LS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.round === serverRound) {
            setMyVote(parsed.vote);
            setStep("done");
          } else {
            // 라운드가 다르면 (관리자가 초기화) 로컬도 삭제
            localStorage.removeItem(LS_KEY);
          }
        }
      }
    } catch {
      setApiError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    // 15초마다 자동 새로고침
    const t = setInterval(loadData, 15000);
    return () => clearInterval(t);
  }, [loadData]);

  async function handleSubmit() {
    const { nickname, side } = formData;
    if (!nickname.trim() || !side || submitting) return;
    setSubmitting(true);
    setDupError(false);
    try {
      const res = await api({ action: "vote", nickname: nickname.trim(), side });
      if (res.ok) {
        const entry = { id: Date.now(), nickname: nickname.trim(), side };
        setMyVote(entry);
        setStep("done");
        setTab("board");
        // 라운드 포함해서 localStorage 저장
        const currentRound = res.round ?? 1;
        localStorage.setItem(LS_KEY, JSON.stringify({ vote: entry, round: currentRound }));
        await loadData();
      } else if (res.error === "DUPLICATE") {
        setDupError(true);
      }
    } catch { setApiError(true); }
    setSubmitting(false);
  }

  async function handleSetResult() {
    if (!resultPick || adminBusy) return;
    setAdminBusy(true);
    try {
      const res = await api({ action: "setResult", result: resultPick, pw: ADMIN_PW });
      if (res.ok) { await loadData(); setAdminMode(false); }
    } catch { setApiError(true); }
    setAdminBusy(false);
  }

  async function handleResetResult() {
    if (adminBusy) return;
    setAdminBusy(true);
    try {
      await api({ action: "resetResult", pw: ADMIN_PW });
      await loadData();
    } catch {}
    setAdminBusy(false);
  }

  async function handleResetAll() {
    if (adminBusy) return;
    setAdminBusy(true);
    try {
      await api({ action: "resetAll", pw: ADMIN_PW });
      // 관리자 본인 로컬도 초기화
      localStorage.removeItem(LS_KEY);
      setMyVote(null); setStep("form"); setFormData({ nickname: "", side: null });
      await loadData();
    } catch {}
    setAdminBusy(false);
  }

  function handleAdminLogin() {
    if (adminPw === ADMIN_PW) { setAdminMode(true); setAdminError(""); }
    else setAdminError("비밀번호가 틀렸습니다");
  }

  const total        = allVotes.length;
  const countA       = allVotes.filter(v => v.side === "a").length;
  const countB       = allVotes.filter(v => v.side === "b").length;
  const pctA         = total > 0 ? Math.round((countA / total) * 100) : 50;
  const pctB         = 100 - pctA;
  const payoutA      = calcPayout(total, countA);
  const payoutB      = calcPayout(total, countB);
  const winnerCount  = result ? (result === "a" ? countA : countB) : 0;
  const winnerPayout = result ? calcPayout(total, winnerCount) : null;

  return (
    <div style={{ minHeight:"100vh", background:"#050a12", fontFamily:"'Rajdhani',sans-serif", color:"#e0eaf8", position:"relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing:border-box; }
        @keyframes pulse-a  { 0%,100%{box-shadow:0 0 20px #c084fc33} 50%{box-shadow:0 0 40px #c084fc66} }
        @keyframes pulse-b  { 0%,100%{box-shadow:0 0 20px #00d4ff33} 50%{box-shadow:0 0 40px #00d4ff66} }
        @keyframes fadeIn   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        @keyframes spin     { to{transform:rotate(360deg)} }
        @keyframes ticketShine {
          0%{background-position:200% center} 100%{background-position:-200% center}
        }
        .fade-in  { animation:fadeIn 0.35s ease forwards; }
        .tab-btn:hover  { background:#0d1e35 !important; }
        .vote-row:hover { background:#0d1830 !important; }
        .pick-btn:hover { transform:scale(1.02); }
        .pick-btn { transition:all 0.18s; }
        input { outline:none; }
        input::placeholder { color:#334455; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track  { background:#050a12; }
        ::-webkit-scrollbar-thumb  { background:#1a2a3a; border-radius:2px; }
        .ticket-glow {
          background: linear-gradient(120deg,#ffcc44 0%,#fff8dc 40%,#ffcc44 60%,#e6aa00 100%);
          background-size:200% auto;
          -webkit-background-clip:text;
          -webkit-text-fill-color:transparent;
          animation:ticketShine 3s linear infinite;
        }
        .spinner {
          width:16px; height:16px; border:2px solid #334455;
          border-top-color:#c084fc; border-radius:50%;
          animation:spin 0.7s linear infinite; display:inline-block;
        }
      `}</style>

      <div style={{ position:"fixed", top:0, left:0, right:0, height:2, background:"linear-gradient(transparent,rgba(192,132,252,0.15),transparent)", zIndex:1, animation:"scanline 10s linear infinite", pointerEvents:"none" }} />
      <div style={{ position:"fixed", inset:0, zIndex:0, backgroundImage:"linear-gradient(rgba(192,132,252,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.025) 1px,transparent 1px)", backgroundSize:"40px 40px", pointerEvents:"none" }} />

      <div style={{ position:"relative", zIndex:10, maxWidth:720, margin:"0 auto", padding:"20px 16px 48px" }}>

        {/* API 연결 전 안내 */}
        {SCRIPT_URL.includes("여기에_배포_URL") && (
          <div style={{ background:"#1a0a00", border:"1px solid #ff880044", borderRadius:8, padding:"12px 16px", marginBottom:16, fontSize:12, color:"#ff9944", lineHeight:1.8 }}>
            ⚠️ <strong>설정 필요:</strong> <code>App.jsx</code> 상단의 <code>SCRIPT_URL</code>에 Apps Script 배포 URL을 입력해주세요.
          </div>
        )}

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, letterSpacing:7, color:"#8844cc66", marginBottom:6 }}>PPD · KRAFTON STARCRAFT</div>
          <h1 style={{ fontFamily:"'Orbitron',monospace", fontSize:"clamp(20px,5vw,34px)", fontWeight:900, margin:0, letterSpacing:2, background:"linear-gradient(135deg,#c084fc,#fff,#00d4ff)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            BATTLE PREDICTION
          </h1>
          {result && (
            <div className="fade-in" style={{ marginTop:12, display:"inline-block", background: result==="a" ? "linear-gradient(135deg,#1a0f2e,#120a1e)" : "linear-gradient(135deg,#0a1a2e,#071525)", border:`2px solid ${PLAYERS[result].color}`, borderRadius:8, padding:"8px 20px" }}>
              <span style={{ fontFamily:"'Orbitron',monospace", fontSize:11, color:PLAYERS[result].color, letterSpacing:3 }}>
                🏆 최종 승자: {PLAYERS[result].name}
              </span>
            </div>
          )}
        </div>

        {/* VS Card */}
        <div style={{ position:"relative", display:"flex", gap:0, marginBottom:12 }}>
          {["a","b"].map((side, idx) => {
            const p      = PLAYERS[side];
            const count  = side==="a" ? countA : countB;
            const pct    = side==="a" ? pctA : pctB;
            const payout = side==="a" ? payoutA : payoutB;
            return (
              <div key={side} style={{ flex:1, textAlign:"center", padding:"14px 10px", background:p.bg, border:`1px solid ${p.border}`, borderRadius: idx===0 ? "10px 0 0 10px" : "0 10px 10px 0" }}>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:p.dim, letterSpacing:3, marginBottom:2 }}>{p.raceIcon} {p.race}</div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:"clamp(14px,3.5vw,22px)", color:p.color }}>{p.name}</div>
                <div style={{ fontSize:11, color: idx===0 ? "#8866aa" : "#336688", marginTop:1, marginBottom:8 }}>{p.title}</div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:20, fontWeight:900, color:p.color }}>{pct}%</div>
                <div style={{ fontSize:11, color:"#445566", marginBottom:8 }}>{count}명 예측</div>
                <div style={{ background:"#00000033", border:`1px solid ${p.border}`, borderRadius:6, padding:"7px 8px", fontSize:11 }}>
                  <div style={{ color:"#667788", marginBottom:2 }}>{p.name} 승리 시 배당</div>
                  {payout
                    ? <div className="ticket-glow" style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:15 }}>🎫 × {payout.toFixed(2)}</div>
                    : <div style={{ color:"#334455", fontSize:11 }}>참여자 대기중</div>
                  }
                </div>
              </div>
            );
          })}
          {/* VS badge */}
          <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:10, width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", background:"#050a12", border:"1px solid #ffffff18", borderRadius:"50%", boxShadow:"0 0 20px #00000088" }}>
            <span style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:13, color:"#fff", textShadow:"0 0 12px #fff8" }}>VS</span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height:5, background:"#0a0f18", borderRadius:3, overflow:"hidden", marginBottom:8, border:"1px solid #ffffff08" }}>
          <div style={{ display:"flex", height:"100%" }}>
            <div style={{ width:`${pctA}%`, background:PLAYERS.a.barColor, transition:"width 0.8s ease", boxShadow:"4px 0 8px #c084fc55" }} />
            <div style={{ flex:1, background:PLAYERS.b.barColor, boxShadow:"-4px 0 8px #00d4ff55" }} />
          </div>
        </div>

        {/* 자동 새로고침 안내 */}
        <div style={{ textAlign:"right", fontSize:10, color:"#1a2a3a", marginBottom:14 }}>
          {loading ? <span><span className="spinner" style={{ verticalAlign:"middle", marginRight:4 }} />불러오는 중...</span> : "↻ 15초마다 자동 갱신"}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:0, marginBottom:18, background:"#0a0f18", borderRadius:8, padding:3, border:"1px solid #ffffff08" }}>
          {[
            { key:"predict", label: step==="done" ? "✓ 예측완료" : "예측 참여" },
            { key:"board",   label:`현황 (${total})` },
            { key:"admin",   label:"관리자" },
          ].map(t => (
            <button key={t.key} className="tab-btn" onClick={() => setTab(t.key)} style={{
              flex:1, padding:"9px 6px", cursor:"pointer", borderRadius:6,
              background: tab===t.key ? "#0d1e35" : "transparent",
              border: tab===t.key ? "1px solid #c084fc44" : "1px solid transparent",
              color: tab===t.key ? "#c084fc" : "#445566",
              fontFamily:"'Orbitron',monospace", fontSize:10, letterSpacing:1, transition:"all 0.2s",
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── TAB: Predict ── */}
        {tab==="predict" && (
          <div className="fade-in">
            {step==="form" ? (
              <div style={{ background:"linear-gradient(135deg,#0f0a1e,#0d1830)", border:"1px solid #c084fc22", borderRadius:12, padding:"24px 20px" }}>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:"#c084fc88", letterSpacing:3, marginBottom:20 }}>▶ ENTER YOUR PREDICTION</div>

                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:12, color:"#8899aa", display:"block", marginBottom:6, letterSpacing:1 }}>닉네임 / 이름</label>
                  <input value={formData.nickname} onChange={e => { setFormData(p=>({...p,nickname:e.target.value})); setDupError(false); }}
                    placeholder="홍길동"
                    style={{ width:"100%", background:"#050a12", border:`1px solid ${dupError ? "#ff4444" : "#c084fc33"}`, color:"#e0eaf8", padding:"10px 14px", borderRadius:6, fontSize:15, fontFamily:"'Rajdhani',sans-serif" }} />
                  {dupError && <div style={{ color:"#ff4444", fontSize:12, marginTop:4 }}>이미 해당 닉네임으로 참여하셨습니다</div>}
                </div>

                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:12, color:"#8899aa", display:"block", marginBottom:10, letterSpacing:1 }}>승리 예측 선택</label>
                  <div style={{ display:"flex", gap:10 }}>
                    {["a","b"].map(side => {
                      const p      = PLAYERS[side];
                      const payout = side==="a" ? payoutA : payoutB;
                      const sel    = formData.side===side;
                      return (
                        <button key={side} className="pick-btn" onClick={() => setFormData(p2=>({...p2,side}))} style={{
                          flex:1, padding:"14px 10px", cursor:"pointer", borderRadius:8,
                          background: sel ? p.bg : "#050a12",
                          border:`2px solid ${sel ? p.color : "#1a2a3a"}`,
                          color: sel ? p.color : "#445566",
                          fontFamily:"'Orbitron',monospace", fontSize:12, fontWeight:700,
                          boxShadow: sel ? `0 0 20px ${p.dim}` : "none",
                        }}>
                          <div>{p.raceIcon} {p.name}</div>
                          <div style={{ fontSize:9, letterSpacing:2, marginTop:3, opacity:0.7 }}>{p.race}</div>
                          {payout && <div style={{ fontSize:10, color: sel ? "#ffcc44" : "#334455", marginTop:6, fontFamily:"'Rajdhani',sans-serif", fontWeight:600 }}>현재 배당 {payout.toFixed(2)}x</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ background:"#0a0a0a", border:"1px solid #ffcc4433", borderRadius:8, padding:"11px 14px", marginBottom:18, display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:20 }}>🎫</span>
                  <div style={{ fontSize:12, color:"#aa9933", lineHeight:1.6 }}>
                    모두 <strong style={{ color:"#ffcc44" }}>예측 티켓 1장</strong>씩 베팅합니다.<br/>
                    승리 예측 성공 시 <strong style={{ color:"#ffcc44" }}>티켓 × 배당률</strong>만큼 획득.
                  </div>
                </div>

                <button onClick={handleSubmit} disabled={!formData.nickname.trim()||!formData.side||submitting} style={{
                  width:"100%", padding:"13px", cursor: formData.nickname.trim()&&formData.side&&!submitting ? "pointer" : "not-allowed",
                  background: formData.nickname.trim()&&formData.side ? "linear-gradient(135deg,#c084fc22,#8833cc11)" : "#0a0f18",
                  border:`1px solid ${formData.nickname.trim()&&formData.side ? "#c084fc88" : "#1a2a3a"}`,
                  color: formData.nickname.trim()&&formData.side ? "#c084fc" : "#334455",
                  borderRadius:8, fontSize:13, fontFamily:"'Orbitron',monospace", letterSpacing:3, transition:"all 0.2s",
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                }}>
                  {submitting ? <><span className="spinner" />저장 중...</> : "예측 제출 →"}
                </button>
              </div>
            ) : (
              <div className="fade-in" style={{ textAlign:"center", padding:"32px 20px", background:"linear-gradient(135deg,#0f0a1e,#0d1830)", border:"1px solid #c084fc22", borderRadius:12 }}>
                <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
                <div style={{ fontFamily:"'Orbitron',monospace", color:"#c084fc", fontSize:13, letterSpacing:3, marginBottom:10 }}>예측 완료!</div>
                <div style={{ color:"#8899aa", fontSize:14, lineHeight:1.9 }}>
                  <span style={{ color:PLAYERS[myVote.side].color, fontWeight:700 }}>{myVote.nickname}</span> 님은<br/>
                  <span style={{ color:PLAYERS[myVote.side].color }}>🎫 {PLAYERS[myVote.side].name} 승리</span>를 예측하셨습니다
                </div>
                {result ? (
                  <div style={{ marginTop:16, padding:"14px", borderRadius:8, background: myVote.side===result ? "#0a2010" : "#1a0808", border:`1px solid ${myVote.side===result ? "#44ff8844":"#ff444433"}` }}>
                    {myVote.side===result ? (
                      <>
                        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, color:"#44ff88" }}>🏆 예측 성공!</div>
                        <div style={{ marginTop:8, fontSize:13, color:"#8899aa" }}>
                          획득 티켓:&nbsp;
                          <span className="ticket-glow" style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:18 }}>
                            🎫 × {winnerPayout ? winnerPayout.toFixed(2) : "-"}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, color:"#ff4444" }}>💀 예측 실패...</div>
                        <div style={{ fontSize:12, color:"#554444", marginTop:4 }}>티켓 1장을 잃었습니다</div>
                      </>
                    )}
                  </div>
                ) : (
                  <div style={{ marginTop:12, fontSize:12, color:"#445566" }}>결과 발표를 기다리는 중...</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Board ── */}
        {tab==="board" && (
          <div className="fade-in">
            {total > 0 && (
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                {["a","b"].map(side => {
                  const p      = PLAYERS[side];
                  const payout = side==="a" ? payoutA : payoutB;
                  const isWin  = result===side;
                  return (
                    <div key={side} style={{ flex:1, background: isWin ? "#0a2010" : p.bg, border:`1px solid ${isWin ? "#44ff8833" : p.border}`, borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, color:p.color, letterSpacing:2, marginBottom:4 }}>{p.name} 예측</div>
                      <div style={{ fontSize:13, color:"#667788", marginBottom:4 }}>{side==="a" ? countA : countB}명 · {side==="a" ? pctA : pctB}%</div>
                      {payout && <div className="ticket-glow" style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:14 }}>🎫 × {payout.toFixed(2)}</div>}
                      {result && <div style={{ fontSize:10, color: isWin ? "#44ff88" : "#ff4444", marginTop:4, letterSpacing:2 }}>{isWin ? "🏆 WIN" : "💀 LOSE"}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {allVotes.length===0 ? (
              <div style={{ textAlign:"center", padding:"48px 20px", color:"#334455", fontFamily:"'Orbitron',monospace", fontSize:11, letterSpacing:3 }}>
                {loading ? <span className="spinner" /> : "아직 참여자가 없습니다"}
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {allVotes.map((v, i) => {
                  const p        = PLAYERS[v.side];
                  const isWinner = result && v.side===result;
                  const isLoser  = result && v.side!==result;
                  return (
                    <div key={v.id} className="vote-row" style={{
                      display:"flex", alignItems:"center", gap:10,
                      background: isWinner ? "#0a1e12" : isLoser ? "#180a0a" : "#0a1020",
                      border:`1px solid ${isWinner ? "#44ff8822" : isLoser ? "#ff444422" : "#ffffff08"}`,
                      borderRadius:8, padding:"9px 12px", transition:"background 0.2s",
                    }}>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:"#2a3a4a", minWidth:20 }}>{String(i+1).padStart(2,"0")}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:600, color: isWinner ? "#44ff88" : isLoser ? "#ff5555" : "#ccd8e8" }}>
                          {v.nickname}
                          {isWinner && <span style={{ marginLeft:6 }}>🏆</span>}
                          {isLoser  && <span style={{ marginLeft:6 }}>💀</span>}
                        </div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        {isWinner && winnerPayout
                          ? <span className="ticket-glow" style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:13 }}>🎫 × {winnerPayout.toFixed(2)}</span>
                          : isLoser
                          ? <span style={{ color:"#553333", fontFamily:"'Orbitron',monospace", fontSize:11 }}>🎫 × 0</span>
                          : <span style={{ color:"#334455", fontFamily:"'Orbitron',monospace", fontSize:10 }}>🎫 × ?</span>
                        }
                      </div>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, fontWeight:700, color:p.color, background:p.bg, border:`1px solid ${p.border}`, borderRadius:5, padding:"4px 8px", letterSpacing:1, whiteSpace:"nowrap" }}>
                        {p.raceIcon} {p.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Admin ── */}
        {tab==="admin" && (
          <div className="fade-in">
            {!adminMode ? (
              <div style={{ background:"#0a1020", border:"1px solid #c084fc22", borderRadius:12, padding:"24px 20px" }}>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:"#c084fc88", letterSpacing:3, marginBottom:16 }}>🔐 ADMIN ACCESS</div>
                <input type="password" value={adminPw} onChange={e => setAdminPw(e.target.value)}
                  onKeyDown={e => e.key==="Enter" && handleAdminLogin()}
                  placeholder="관리자 비밀번호"
                  style={{ width:"100%", background:"#050a12", border:"1px solid #c084fc33", color:"#e0eaf8", padding:"10px 14px", borderRadius:6, fontSize:15, fontFamily:"'Rajdhani',sans-serif", marginBottom:10 }} />
                {adminError && <div style={{ color:"#ff4444", fontSize:12, marginBottom:8 }}>{adminError}</div>}
                <button onClick={handleAdminLogin} style={{ width:"100%", padding:"11px", cursor:"pointer", background:"linear-gradient(135deg,#c084fc22,#8833cc11)", border:"1px solid #c084fc55", color:"#c084fc", borderRadius:6, fontSize:12, fontFamily:"'Orbitron',monospace", letterSpacing:3 }}>
                  입장 →
                </button>
              </div>
            ) : (
              <div style={{ background:"#0a1020", border:"1px solid #c084fc33", borderRadius:12, padding:"24px 20px" }}>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:"#c084fc", letterSpacing:3, marginBottom:20 }}>⚙ ADMIN PANEL</div>

                <div style={{ background:"#050a12", borderRadius:8, padding:"12px 14px", marginBottom:20, fontSize:12, color:"#667788", lineHeight:2 }}>
                  총 참여자: <strong style={{ color:"#e0eaf8" }}>{total}명</strong> &nbsp;·&nbsp;
                  이준호: <strong style={{ color:PLAYERS.a.color }}>{countA}명</strong> &nbsp;·&nbsp;
                  김우림: <strong style={{ color:PLAYERS.b.color }}>{countB}명</strong><br/>
                  {payoutA && <>이준호 승리 배당: <strong style={{ color:"#ffcc44" }}>×{payoutA.toFixed(2)}</strong>&nbsp;·&nbsp;</>}
                  {payoutB && <>김우림 승리 배당: <strong style={{ color:"#ffcc44" }}>×{payoutB.toFixed(2)}</strong></>}
                </div>

                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:13, color:"#8899aa", marginBottom:10 }}>최종 승자 설정</div>
                  <div style={{ display:"flex", gap:10, marginBottom:12 }}>
                    {["a","b"].map(side => (
                      <button key={side} onClick={() => setResultPick(side)} style={{
                        flex:1, padding:"12px", cursor:"pointer", borderRadius:8,
                        background: resultPick===side ? PLAYERS[side].bg : "#050a12",
                        border:`2px solid ${resultPick===side ? PLAYERS[side].color : "#1a2a3a"}`,
                        color: resultPick===side ? PLAYERS[side].color : "#445566",
                        fontFamily:"'Orbitron',monospace", fontSize:11, transition:"all 0.2s",
                      }}>
                        {PLAYERS[side].raceIcon} {PLAYERS[side].name}
                      </button>
                    ))}
                  </div>
                  <button onClick={handleSetResult} disabled={!resultPick||adminBusy} style={{
                    width:"100%", padding:"11px", cursor: resultPick&&!adminBusy ? "pointer" : "not-allowed",
                    background: resultPick ? "linear-gradient(135deg,#ffcc4422,#aa880011)" : "#0a0f18",
                    border:`1px solid ${resultPick ? "#ffcc4488" : "#1a2a3a"}`,
                    color: resultPick ? "#ffcc44" : "#334455",
                    borderRadius:6, fontSize:12, fontFamily:"'Orbitron',monospace", letterSpacing:2, marginBottom:8,
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  }}>
                    {adminBusy ? <><span className="spinner" />처리 중...</> : "🏆 결과 발표 →"}
                  </button>
                  {result && (
                    <button onClick={handleResetResult} disabled={adminBusy} style={{ width:"100%", padding:"9px", cursor:"pointer", background:"transparent", border:"1px solid #334455", color:"#556677", borderRadius:6, fontSize:11, fontFamily:"'Orbitron',monospace", letterSpacing:2 }}>
                      결과 초기화
                    </button>
                  )}
                </div>

                <div style={{ borderTop:"1px solid #1a2a3a", paddingTop:20 }}>
                  <div style={{ fontSize:12, color:"#445566", marginBottom:10 }}>⚠ 전체 데이터 초기화</div>
                  <button onClick={handleResetAll} disabled={adminBusy} style={{ width:"100%", padding:"9px", cursor:"pointer", background:"transparent", border:"1px solid #ff444433", color:"#ff4444", borderRadius:6, fontSize:11, fontFamily:"'Orbitron',monospace", letterSpacing:2 }}>
                    모든 투표 삭제
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign:"center", marginTop:28, fontSize:10, color:"#1a2a3a", letterSpacing:3, fontFamily:"'Orbitron',monospace" }}>
          PPD USER & FAN CREW · KRAFTON
        </div>
      </div>
    </div>
  );
}
