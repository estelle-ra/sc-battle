import { useState, useEffect, useCallback } from "react";

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxBNZ8VRsiEzNzobrJy-zr6vGvIbpF2yhAxCOdsncInAfK3BStjSTYpMlYTXYW0ni72/exec";
const ADMIN_PW   = "krafton";
const LS_KEY      = "sc-battle-v5";
const LS_OLD_KEYS = ["sc-battle-v4", "sc-battle-vote", "sc-voted"]; // 이전 버전 키들

// 구버전 localStorage → 현재 키로 마이그레이션
function migrateLocalStorage() {
  if (localStorage.getItem(LS_KEY)) return; // 이미 있으면 스킵
  for (const oldKey of LS_OLD_KEYS) {
    const old = localStorage.getItem(oldKey);
    if (old) {
      try {
        const parsed = JSON.parse(old);
        // 구버전 포맷 통일: { session, round } 형태로 변환
        if (parsed.vote && parsed.round !== undefined) {
          // sc-battle-vote 포맷: { vote: {...}, round: N }
          const sess = { ...parsed.vote, bet: parsed.vote.bet || 1, pin: parsed.vote.pin || "" };
          localStorage.setItem(LS_KEY, JSON.stringify({ session: sess, round: parsed.round }));
        } else if (parsed.session && parsed.round !== undefined) {
          // sc-battle-v4 포맷: { session: {...}, round: N } → 그대로 복사
          localStorage.setItem(LS_KEY, JSON.stringify(parsed));
        }
        localStorage.removeItem(oldKey);
        break;
      } catch {}
    }
  }
}

const PLAYERS = {
  a: {
    name: "이준호", title: "예측불허 랜덤러", race: "RANDOM", raceIcon: "🎲",
    color: "#c084fc", dim: "#c084fc55",
    bg: "linear-gradient(160deg,#1a0f2e,#120a1e)", border: "#c084fc55",
    barColor: "linear-gradient(90deg,#a855f7,#c084fc)",
  },
  b: {
    name: "김우림", title: "테란의 황제", race: "TERRAN", raceIcon: "🔵",
    color: "#00d4ff", dim: "#00d4ff55",
    bg: "linear-gradient(160deg,#0a1a2e,#071525)", border: "#00d4ff55",
    barColor: "linear-gradient(90deg,#00d4ff,#0099cc)",
  },
};

// 티켓 수 기준 배당 계산
function calcPayout(totalTickets, sideTickets) {
  if (!sideTickets || !totalTickets) return null;
  return Math.round((totalTickets / sideTickets) * 100) / 100;
}

async function api(params) {
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(`${SCRIPT_URL}?${qs}`, { redirect: "follow" });
  return res.json();
}

export default function App() {
  const [allVotes, setAllVotes]     = useState([]);
  const [adminVotes, setAdminVotes] = useState([]);
  const [result, setResult]         = useState(null);
  const [closed, setClosed]         = useState(false);
  const [loading, setLoading]       = useState(true);

  const [session, setSession]       = useState(null);
  const [screen, setScreen]         = useState("form"); // form | setPinPrompt | done | login

  const [formData, setFormData]     = useState({ nickname:"", realname:"", pin:"", side:null, bet:1 });
  const [submitting, setSubmitting] = useState(false);
  const [dupError, setDupError]     = useState(false);

  const [pinSetValue, setPinSetValue]   = useState("");
  const [pinSetBusy, setPinSetBusy]     = useState(false);
  const [pinSetError, setPinSetError]   = useState("");

  const [loginData, setLoginData]   = useState({ nickname:"", pin:"" });
  const [loginBusy, setLoginBusy]   = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginStep, setLoginStep]   = useState("input"); // input | setNewPin
  const [loginNewPin, setLoginNewPin] = useState("");
  const [loginNewPinBusy, setLoginNewPinBusy] = useState(false);

  const [editingProfile, setEditingProfile] = useState(false);
  const [editNickname, setEditNickname]     = useState("");
  const [editRealname, setEditRealname]     = useState("");
  const [editBusy, setEditBusy]             = useState(false);
  const [editError, setEditError]           = useState("");

  const [tab, setTab]               = useState("predict");
  const [adminPw, setAdminPw]       = useState("");
  const [adminMode, setAdminMode]   = useState(false);
  const [adminError, setAdminError] = useState("");
  const [resultPick, setResultPick] = useState(null);
  const [adminBusy, setAdminBusy]   = useState(false);
  const [deleting, setDeleting]     = useState(null); // voteId being deleted

  const loadData = useCallback(async () => {
    try {
      const data = await api({ action: "getAll" });
      if (!data.ok) return;
      const serverRound = data.round ?? 1;
      setAllVotes(data.votes || []);
      setResult(data.result || null);
      setClosed(data.closed || false);

      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.round === serverRound) {
          setSession(parsed.session);
          setScreen(parsed.session.pin ? "done" : "setPinPrompt");
        } else {
          localStorage.removeItem(LS_KEY);
        }
      }
    } catch {}
    setLoading(false);
  }, []);

  const loadAdminData = useCallback(async () => {
    try {
      const data = await api({ action: "getAll", pw: ADMIN_PW });
      if (data.ok) setAdminVotes(data.votes || []);
    } catch {}
  }, []);

  useEffect(() => {
    migrateLocalStorage(); // 구버전 키 마이그레이션
    loadData();
    const t = setInterval(loadData, 15000);
    return () => clearInterval(t);
  }, [loadData]);

  function saveSession(sess, round) {
    localStorage.setItem(LS_KEY, JSON.stringify({ session: sess, round }));
    setSession(sess);
  }

  async function handleSubmit() {
    const { nickname, side, realname, pin, bet } = formData;
    if (!nickname.trim() || !side || submitting) return;
    setSubmitting(true); setDupError(false);
    try {
      const res = await api({ action:"vote", nickname:nickname.trim(), side, realname:realname.trim(), pin:pin.trim(), bet });
      if (res.ok) {
        const sess = { nickname:nickname.trim(), side, realname:realname.trim(), pin:pin.trim(), bet };
        saveSession(sess, res.round ?? 1);
        setScreen("done"); setTab("board");
        await loadData();
      } else if (res.error === "DUPLICATE") setDupError(true);
      else if (res.error === "CLOSED") setClosed(true);
    } catch {}
    setSubmitting(false);
  }

  async function handleSetPin() {
    if (pinSetValue.length < 4 || pinSetBusy || !session) return;
    setPinSetBusy(true); setPinSetError("");
    try {
      const res = await api({ action:"setPin", nickname:session.nickname, pin:pinSetValue.trim() });
      if (res.ok) {
        const saved = JSON.parse(localStorage.getItem(LS_KEY));
        saved.session.pin = pinSetValue.trim();
        localStorage.setItem(LS_KEY, JSON.stringify(saved));
        setSession(s => ({ ...s, pin:pinSetValue.trim() }));
        setScreen("done");
      } else if (res.error === "PIN_ALREADY_SET") setPinSetError("이미 PIN이 설정되어 있어요");
      else setPinSetError("오류가 발생했어요");
    } catch { setPinSetError("오류가 발생했어요"); }
    setPinSetBusy(false);
  }

  async function handleLogin() {
    const { nickname, pin } = loginData;
    if (!nickname.trim() || pin.length < 4 || loginBusy) return;
    setLoginBusy(true); setLoginError("");
    try {
      const res = await api({ action:"verifyPin", nickname:nickname.trim(), pin:pin.trim() });
      if (res.ok) {
        const all   = await api({ action:"getAll" });
        const round = all.round ?? 1;
        const sess  = { nickname:nickname.trim(), side:res.side, realname:res.realname||"", pin:pin.trim(), bet:res.bet||1 };
        saveSession(sess, round);
        setScreen("done"); setTab("board");
      } else {
        if      (res.error === "WRONG_PIN")  setLoginError("PIN이 틀렸어요");
        else if (res.error === "NOT_FOUND")  setLoginError("해당 닉네임을 찾을 수 없어요");
        else if (res.error === "NO_PIN") {
          // PIN 없는 기존 참여자 → PIN 설정 단계로
          setLoginStep("setNewPin");
          setLoginError("");
        }
        else setLoginError("오류가 발생했어요");
      }
    } catch { setLoginError("오류가 발생했어요"); }
    setLoginBusy(false);
  }

  // 기존 참여자 — 닉네임만으로 PIN 신규 설정 후 로그인
  async function handleLoginSetNewPin() {
    if (loginNewPin.length < 4 || loginNewPinBusy) return;
    setLoginNewPinBusy(true); setLoginError("");
    try {
      const setRes = await api({ action:"setPin", nickname:loginData.nickname.trim(), pin:loginNewPin.trim() });
      if (setRes.ok || setRes.error === "PIN_ALREADY_SET") {
        // PIN 설정 완료 → 바로 verifyPin으로 로그인
        const verRes = await api({ action:"verifyPin", nickname:loginData.nickname.trim(), pin:loginNewPin.trim() });
        if (verRes.ok) {
          const all   = await api({ action:"getAll" });
          const round = all.round ?? 1;
          const sess  = { nickname:loginData.nickname.trim(), side:verRes.side, realname:verRes.realname||"", pin:loginNewPin.trim(), bet:verRes.bet||1 };
          saveSession(sess, round);
          setScreen("done"); setTab("board");
        } else {
          setLoginError("인증에 실패했어요. 다시 시도해주세요");
          setLoginStep("input");
        }
      } else if (setRes.error === "NOT_FOUND") {
        setLoginError("해당 닉네임을 찾을 수 없어요. 닉네임을 확인해주세요");
        setLoginStep("input");
      } else {
        setLoginError("오류가 발생했어요");
      }
    } catch { setLoginError("오류가 발생했어요"); }
    setLoginNewPinBusy(false);
  }

  async function handleUpdateProfile() {
    if (!session || editBusy) return;
    setEditBusy(true); setEditError("");
    try {
      const res = await api({ action:"updateProfile", nickname:session.nickname, pin:session.pin, newNickname:editNickname.trim()||session.nickname, newRealname:editRealname });
      if (res.ok) {
        const newNick = editNickname.trim() || session.nickname;
        const saved   = JSON.parse(localStorage.getItem(LS_KEY));
        saved.session.nickname = newNick;
        saved.session.realname = editRealname;
        localStorage.setItem(LS_KEY, JSON.stringify(saved));
        setSession(s => ({ ...s, nickname:newNick, realname:editRealname }));
        setEditingProfile(false);
        await loadData();
      } else if (res.error === "DUPLICATE") setEditError("이미 사용 중인 닉네임이에요");
      else if (res.error === "WRONG_PIN")   setEditError("PIN 인증 실패");
      else setEditError("수정에 실패했어요");
    } catch { setEditError("오류가 발생했어요"); }
    setEditBusy(false);
  }

  function handleAdminLogin() {
    if (adminPw === ADMIN_PW) { setAdminMode(true); setAdminError(""); }
    else setAdminError("비밀번호가 틀렸습니다");
  }

  async function handleToggleClosed() {
    if (adminBusy) return; setAdminBusy(true);
    try {
      const res = await api({ action:"setClosed", closed:String(!closed), pw:ADMIN_PW });
      if (res.ok) { setClosed(res.closed); await loadData(); }
    } catch {}
    setAdminBusy(false);
  }

  async function handleDeleteVote(voteId) {
    if (deleting) return;
    setDeleting(voteId);
    try {
      const res = await api({ action:"deleteVote", voteId:String(voteId), pw:ADMIN_PW });
      if (res.ok) {
        setAdminVotes(v => v.filter(x => String(x.id) !== String(voteId)));
        await loadData();
      }
    } catch {}
    setDeleting(null);
  }

  async function handleSetResult() {
    if (!resultPick || adminBusy) return; setAdminBusy(true);
    try {
      const res = await api({ action:"setResult", result:resultPick, pw:ADMIN_PW });
      if (res.ok) { await loadData(); setAdminMode(false); }
    } catch {}
    setAdminBusy(false);
  }

  async function handleResetResult() {
    if (adminBusy) return; setAdminBusy(true);
    try { await api({ action:"resetResult", pw:ADMIN_PW }); await loadData(); } catch {}
    setAdminBusy(false);
  }

  async function handleResetAll() {
    if (adminBusy) return; setAdminBusy(true);
    try {
      await api({ action:"resetAll", pw:ADMIN_PW });
      localStorage.removeItem(LS_KEY);
      setSession(null); setScreen("form");
      setFormData({ nickname:"", realname:"", pin:"", side:null, bet:1 });
      setAdminVotes([]); setClosed(false);
      await loadData();
    } catch {}
    setAdminBusy(false);
  }

  // 티켓 수 기준 배당 계산
  const ticketsA     = allVotes.filter(v=>v.side==="a").reduce((s,v)=>s+(v.bet||1),0);
  const ticketsB     = allVotes.filter(v=>v.side==="b").reduce((s,v)=>s+(v.bet||1),0);
  const totalTickets = ticketsA + ticketsB;
  const countA       = allVotes.filter(v=>v.side==="a").length;
  const countB       = allVotes.filter(v=>v.side==="b").length;
  const total        = allVotes.length;
  const pctA         = totalTickets > 0 ? Math.round((ticketsA/totalTickets)*100) : 50;
  const pctB         = 100 - pctA;
  const payoutA      = calcPayout(totalTickets, ticketsA);
  const payoutB      = calcPayout(totalTickets, ticketsB);
  const winnerTickets = result ? (result==="a" ? ticketsA : ticketsB) : 0;
  const winnerPayout  = result ? calcPayout(totalTickets, winnerTickets) : null;

  return (
    <div style={{ minHeight:"100vh", background:"#050a12", fontFamily:"'Rajdhani',sans-serif", color:"#e0eaf8" }}>
      <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Orbitron:wght@400;700;900&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing:border-box; }
        @keyframes pulse-a  { 0%,100%{box-shadow:0 0 20px #c084fc33} 50%{box-shadow:0 0 40px #c084fc66} }
        @keyframes pulse-b  { 0%,100%{box-shadow:0 0 20px #00d4ff33} 50%{box-shadow:0 0 40px #00d4ff66} }
        @keyframes fadeIn   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        @keyframes spin     { to{transform:rotate(360deg)} }
        @keyframes ticketShine { 0%{background-position:200% center} 100%{background-position:-200% center} }
        .fade-in { animation:fadeIn 0.35s ease forwards; }
        .tab-btn:hover  { background:#0d1e35 !important; }
        .vote-row:hover { background:#0d1830 !important; }
        .pick-btn:hover { transform:scale(1.02); }
        .pick-btn { transition:all 0.18s; }
        .bet-btn:hover { opacity:0.85; }
        .bet-btn { transition:all 0.15s; }
        input { outline:none; }
        input::placeholder { color:#334455; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-thumb { background:#1a2a3a; border-radius:2px; }
        .ticket-glow {
          background:linear-gradient(120deg,#ffcc44 0%,#fff8dc 40%,#ffcc44 60%,#e6aa00 100%);
          background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          animation:ticketShine 3s linear infinite;
        }
        .spinner { width:14px; height:14px; border:2px solid #334455; border-top-color:#c084fc; border-radius:50%; animation:spin 0.7s linear infinite; display:inline-block; }
      `}</style>

      <div style={{ position:"fixed", top:0, left:0, right:0, height:2, background:"linear-gradient(transparent,rgba(192,132,252,0.12),transparent)", zIndex:1, animation:"scanline 10s linear infinite", pointerEvents:"none" }} />
      <div style={{ position:"fixed", inset:0, zIndex:0, backgroundImage:"linear-gradient(rgba(192,132,252,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.025) 1px,transparent 1px)", backgroundSize:"40px 40px", pointerEvents:"none" }} />

      <div style={{ position:"relative", zIndex:10, maxWidth:720, margin:"0 auto", padding:"20px 16px 48px" }}>

        {/* 헤더 */}
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <div style={{ fontFamily:"'Orbitron',monospace", fontSize:9, letterSpacing:7, color:"#8844cc66", marginBottom:6 }}>PPD · KRAFTON STARCRAFT</div>
          <h1 style={{ fontFamily:"'Orbitron',monospace", fontSize:"clamp(20px,5vw,34px)", fontWeight:900, margin:0, letterSpacing:2, background:"linear-gradient(135deg,#c084fc,#fff,#00d4ff)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>BATTLE PREDICTION</h1>
          {closed && !result && (
            <div className="fade-in" style={{ marginTop:10, display:"inline-block", background:"#1a0808", border:"2px solid #ff444466", borderRadius:8, padding:"6px 18px" }}>
              <span style={{ fontFamily:"'Orbitron',monospace", fontSize:11, color:"#ff6666", letterSpacing:3 }}>🔒 참여 마감</span>
            </div>
          )}
          {result && (
            <div className="fade-in" style={{ marginTop:10, display:"inline-block", background:PLAYERS[result].bg, border:`2px solid ${PLAYERS[result].color}`, borderRadius:8, padding:"8px 20px" }}>
              <span style={{ fontFamily:"'Orbitron',monospace", fontSize:11, color:PLAYERS[result].color, letterSpacing:3 }}>🏆 최종 승자: {PLAYERS[result].name}</span>
            </div>
          )}
        </div>

        {/* VS 카드 */}
        <div style={{ position:"relative", display:"flex", marginBottom:12 }}>
          {["a","b"].map((side, idx) => {
            const p      = PLAYERS[side];
            const tickets = side==="a" ? ticketsA : ticketsB;
            const count   = side==="a" ? countA : countB;
            const pct     = side==="a" ? pctA : pctB;
            const payout  = side==="a" ? payoutA : payoutB;
            return (
              <div key={side} style={{ flex:1, textAlign:"center", padding:"14px 10px", background:p.bg, border:`1px solid ${p.border}`, borderRadius:idx===0?"10px 0 0 10px":"0 10px 10px 0" }}>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:11, color:p.dim, letterSpacing:3, marginBottom:2 }}>{p.raceIcon} {p.race}</div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:"clamp(18px,4vw,28px)", color:p.color }}>{p.name}</div>
                <div style={{ fontSize:15, color:idx===0?"#8866aa":"#336688", marginTop:1, marginBottom:8 }}>{p.title}</div>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:26, fontWeight:900, color:p.color }}>{pct}%</div>
                <div style={{ fontSize:13, color:"#445566", marginBottom:2 }}>{count}명 · 🎫 {tickets}장</div>
                <div style={{ marginBottom:8 }} />
                <div style={{ background:"#00000033", border:`1px solid ${p.border}`, borderRadius:6, padding:"7px 8px" }}>
                  <div style={{ fontSize:13, color:"#667788", marginBottom:2 }}>{p.name} 승리 시 배당</div>
                  {payout
                    ? <div className="ticket-glow" style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:19 }}>🎫 × {payout.toFixed(2)}</div>
                    : <div style={{ color:"#334455", fontSize:13 }}>참여자 대기중</div>}
                </div>
              </div>
            );
          })}
          <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:10, width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", background:"#050a12", border:"1px solid #ffffff18", borderRadius:"50%", boxShadow:"0 0 20px #00000088" }}>
            <span style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:13, color:"#fff", textShadow:"0 0 12px #fff8" }}>VS</span>
          </div>
        </div>

        {/* 진행바 */}
        <div style={{ height:5, background:"#0a0f18", borderRadius:3, overflow:"hidden", marginBottom:8, border:"1px solid #ffffff08" }}>
          <div style={{ display:"flex", height:"100%" }}>
            <div style={{ width:`${pctA}%`, background:PLAYERS.a.barColor, transition:"width 0.8s ease" }} />
            <div style={{ flex:1, background:PLAYERS.b.barColor }} />
          </div>
        </div>
        <div style={{ textAlign:"right", fontSize:10, color:"#1a2a3a", marginBottom:14 }}>
          {loading ? <span className="spinner" style={{ verticalAlign:"middle" }} /> : `총 🎫 ${totalTickets}장 · ↻ 15초마다 자동 갱신`}
        </div>

        {/* 탭 */}
        <div style={{ display:"flex", marginBottom:18, background:"#0a0f18", borderRadius:8, padding:3, border:"1px solid #ffffff08" }}>
          {[
            { key:"predict", label: screen==="done"?"✓ 예측완료": screen==="setPinPrompt"?"🔐 PIN 설정": screen==="login"?"🔑 로그인":"예측 참여" },
            { key:"board",   label:`현황 (${total})` },
            { key:"admin",   label:"관리자" },
          ].map(t => (
            <button key={t.key} className="tab-btn" onClick={()=>setTab(t.key)} style={{
              flex:1, padding:"9px 6px", cursor:"pointer", borderRadius:6,
              background:tab===t.key?"#0d1e35":"transparent",
              border:tab===t.key?"1px solid #c084fc44":"1px solid transparent",
              color:tab===t.key?"#c084fc":"#445566",
              fontFamily:"'Orbitron',monospace", fontSize:13, letterSpacing:1, transition:"all 0.2s",
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── 예측 탭 ── */}
        {tab==="predict" && (
          <div className="fade-in">

            {/* 마감 안내 */}
            {closed && screen==="form" && (
              <div style={{ background:"#1a0808", border:"1px solid #ff444433", borderRadius:12, padding:"32px 20px", textAlign:"center" }}>
                <div style={{ fontSize:36, marginBottom:12 }}>🔒</div>
                <div style={{ fontFamily:"'Orbitron',monospace", color:"#ff6666", fontSize:14, letterSpacing:3, marginBottom:10 }}>참여가 마감되었습니다</div>
                <div style={{ color:"#664444", fontSize:13 }}>경기 결과 발표를 기다려주세요</div>
                <div style={{ marginTop:16 }}>
                  <button onClick={()=>setScreen("login")} style={{ background:"transparent", border:"none", color:"#445566", fontSize:12, cursor:"pointer", fontFamily:"'Orbitron',monospace", letterSpacing:2 }}>
                    이미 참여했어요 →
                  </button>
                </div>
              </div>
            )}

            {/* 투표 폼 */}
            {!closed && screen==="form" && (
              <div style={{ background:"linear-gradient(135deg,#0f0a1e,#0d1830)", border:"1px solid #c084fc22", borderRadius:12, padding:"24px 20px" }}>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:"#c084fc88", letterSpacing:3, marginBottom:20 }}>▶ ENTER YOUR PREDICTION</div>

                <Field label="닉네임 / 이름" error={dupError?"이미 해당 닉네임으로 참여하셨습니다":""}>
                  <input value={formData.nickname} onChange={e=>{setFormData(p=>({...p,nickname:e.target.value}));setDupError(false);}} placeholder="샛별" style={inputStyle(dupError)} />
                </Field>

                <Field label="실명" hint="선택 · 본인과 관리자만 볼 수 있어요">
                  <input value={formData.realname} onChange={e=>setFormData(p=>({...p,realname:e.target.value}))} placeholder="라샛별" style={inputStyle()} />
                </Field>

                <Field label="PIN 번호" hint="4자리 · 다른 기기 접속 시 필요해요">
                  <input value={formData.pin} onChange={e=>setFormData(p=>({...p,pin:e.target.value.replace(/\D/g,"").slice(0,4)}))} placeholder="1234" maxLength={4} style={inputStyle()} />
                </Field>

                {/* 베팅 수량 */}
                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:15, color:"#8899aa", display:"block", marginBottom:8 }}>
                    베팅 티켓 수 <span style={{ color:"#445566", fontSize:12 }}>최대 10장</span>
                  </label>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button key={n} className="bet-btn" onClick={()=>setFormData(p=>({...p,bet:n}))} style={{
                        width:44, height:44, cursor:"pointer", borderRadius:8,
                        background: formData.bet===n ? "linear-gradient(135deg,#ffcc4433,#aa880022)" : "#050a12",
                        border: `2px solid ${formData.bet===n ? "#ffcc44" : "#1a2a3a"}`,
                        color: formData.bet===n ? "#ffcc44" : "#445566",
                        fontFamily:"'Orbitron',monospace", fontSize:14, fontWeight:700,
                      }}>{n}</button>
                    ))}
                  </div>
                  <div style={{ fontSize:12, color:"#556633", marginTop:8 }}>
                    🎫 {formData.bet}장 선택됨
                  </div>
                </div>

                {/* 승리 예측 */}
                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:15, color:"#8899aa", display:"block", marginBottom:10 }}>승리 예측 선택</label>
                  <div style={{ display:"flex", gap:10 }}>
                    {["a","b"].map(side => {
                      const p = PLAYERS[side];
                      const sel = formData.side===side;
                      const payout = side==="a" ? payoutA : payoutB;
                      // 이 사람이 이쪽을 선택하면 배당 미리보기
                      const myBet = formData.bet || 1;
                      const previewTickets = sel ? totalTickets + myBet : totalTickets;
                      const previewSide   = side==="a"
                        ? (sel ? ticketsA + myBet : ticketsA)
                        : (sel ? ticketsB + myBet : ticketsB);
                      const previewPayout = calcPayout(previewTickets, previewSide);
                      return (
                        <button key={side} className="pick-btn" onClick={()=>setFormData(p2=>({...p2,side}))} style={{
                          flex:1, padding:"14px 10px", cursor:"pointer", borderRadius:8,
                          background:sel?p.bg:"#050a12", border:`2px solid ${sel?p.color:"#1a2a3a"}`,
                          color:sel?p.color:"#445566", fontFamily:"'Orbitron',monospace", fontSize:14, fontWeight:700,
                          boxShadow:sel?`0 0 20px ${p.dim}`:"none",
                        }}>
                          <div>{p.raceIcon} {p.name}</div>
                          <div style={{ fontSize:9, letterSpacing:2, marginTop:3, opacity:0.7 }}>{p.race}</div>
                          {previewPayout && <div style={{ fontSize:11, color:sel?"#ffcc44":"#334455", marginTop:6 }}>예상 배당 {previewPayout.toFixed(2)}x</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 쿠폰 안내 */}
                <div style={{ background:"#0d0a00", border:"1px solid #ffcc4444", borderRadius:8, padding:"12px 16px", marginBottom:18 }}>
                  <div style={{ fontSize:13, color:"#ccaa33", lineHeight:2 }}>
                    ⚠️ <strong style={{ color:"#ffcc44" }}>필수 안내</strong><br/>
                    경기 진행 전 예측 티켓과 같은 수량의<br/>
                    <strong style={{ color:"#ffcc44" }}>크래프톤 카페 쿠폰을 라샛별에게 제출</strong>하셔야 인정됩니다.<br/>
                    <span style={{ color:"#887722", fontSize:12 }}>이 페이지는 대결을 재미있게 시청하고 응원하기 위한 용도이니<br/>절. 대. 진지하게 임하지 말아 주세요! 😄</span>
                  </div>
                </div>

                <button onClick={handleSubmit} disabled={!formData.nickname.trim()||!formData.side||submitting} style={{
                  ...primaryBtn(!formData.nickname.trim()||!formData.side||submitting),
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                }}>
                  {submitting ? <><span className="spinner" />저장 중...</> : `🎫 ${formData.bet}장으로 예측 제출 →`}
                </button>

                <div style={{ textAlign:"center", marginTop:14 }}>
                  <button onClick={()=>setScreen("login")} style={{ background:"transparent", border:"none", color:"#445566", fontSize:12, cursor:"pointer", fontFamily:"'Orbitron',monospace", letterSpacing:2 }}>
                    이미 참여했는데 다른 기기예요 →
                  </button>
                </div>
              </div>
            )}

            {/* PIN 설정 (기존 참여자) */}
            {screen==="setPinPrompt" && session && (
              <div style={{ background:"linear-gradient(135deg,#0f0a1e,#0d1830)", border:"1px solid #ffcc4433", borderRadius:12, padding:"24px 20px" }}>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:"#ffcc4488", letterSpacing:3, marginBottom:16 }}>🔐 PIN 설정</div>
                <p style={{ fontSize:14, color:"#8899aa", lineHeight:1.8, marginBottom:20 }}>
                  <strong style={{ color:PLAYERS[session.side].color }}>{session.nickname}</strong> 님, 안녕하세요!<br/>
                  다른 기기에서도 접속할 수 있도록 PIN을 설정해주세요.
                </p>
                <Field label="4자리 PIN 설정" error={pinSetError}>
                  <input value={pinSetValue} onChange={e=>setPinSetValue(e.target.value.replace(/\D/g,"").slice(0,4))} onKeyDown={e=>e.key==="Enter"&&handleSetPin()} placeholder="숫자 4자리" maxLength={4} style={inputStyle(!!pinSetError)} />
                </Field>
                <button onClick={handleSetPin} disabled={pinSetValue.length<4||pinSetBusy} style={{ ...primaryBtn(pinSetValue.length<4||pinSetBusy), display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:10 }}>
                  {pinSetBusy ? <><span className="spinner" />저장 중...</> : "PIN 저장 →"}
                </button>
                <button onClick={()=>setScreen("done")} style={{ width:"100%", padding:"9px", cursor:"pointer", background:"transparent", border:"1px solid #334455", color:"#556677", borderRadius:6, fontSize:11, fontFamily:"'Orbitron',monospace" }}>나중에 설정할게요</button>
              </div>
            )}

            {/* 예측 완료 */}
            {screen==="done" && session && (
              <div className="fade-in" style={{ background:"linear-gradient(135deg,#0f0a1e,#0d1830)", border:"1px solid #c084fc22", borderRadius:12, padding:"28px 20px", textAlign:"center" }}>
                <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
                <div style={{ fontFamily:"'Orbitron',monospace", color:"#c084fc", fontSize:13, letterSpacing:3, marginBottom:10 }}>예측 완료!</div>
                <div style={{ color:"#8899aa", fontSize:15, lineHeight:1.9 }}>
                  <span style={{ color:PLAYERS[session.side].color, fontWeight:700 }}>{session.nickname}</span> 님은<br/>
                  <span style={{ color:PLAYERS[session.side].color }}>🎫 {session.bet}장 · {PLAYERS[session.side].name} 승리</span>를 예측하셨습니다
                </div>
                {session.realname && (
                  <div style={{ fontSize:13, color:"#667788", marginTop:6 }}>
                    실명: <span style={{ color:"#8899aa" }}>{session.realname}</span>
                    <span style={{ color:"#334455", fontSize:11 }}> (본인·관리자만)</span>
                  </div>
                )}

                {/* 쿠폰 안내 */}
                {!result && (
                  <div style={{ background:"#0d0a00", border:"1px solid #ffcc4433", borderRadius:8, padding:"10px 14px", marginTop:14, textAlign:"left" }}>
                    <div style={{ fontSize:12, color:"#ccaa33", lineHeight:1.9 }}>
                      ⚠️ 예측 티켓 <strong style={{ color:"#ffcc44" }}>{session.bet}장</strong>에 해당하는<br/>
                      <strong style={{ color:"#ffcc44" }}>크래프톤 카페 쿠폰을 라샛별에게 제출</strong>해주세요.<br/>
                      <span style={{ color:"#887722", fontSize:11 }}>절. 대. 진지하게 임하지 말아 주세요! 😄</span>
                    </div>
                  </div>
                )}

                {/* 프로필 수정 */}
                {!result && (
                  <div style={{ marginTop:16 }}>
                    {!editingProfile ? (
                      <button onClick={()=>{ setEditingProfile(true); setEditNickname(session.nickname); setEditRealname(session.realname||""); }} style={{ padding:"8px 18px", cursor:"pointer", borderRadius:6, background:"transparent", border:"1px solid #445566", color:"#667788", fontSize:12, fontFamily:"'Orbitron',monospace", letterSpacing:2 }}>
                        ✏️ 닉네임 / 실명 수정
                      </button>
                    ) : (
                      <div style={{ textAlign:"left" }}>
                        <Field label="닉네임 (전체 공개)">
                          <input value={editNickname} onChange={e=>{setEditNickname(e.target.value);setEditError("");}} placeholder={session.nickname} style={inputStyle(!!editError)} />
                        </Field>
                        <Field label="실명 (본인·관리자만)">
                          <input value={editRealname} onChange={e=>setEditRealname(e.target.value)} placeholder="라샛별" style={inputStyle()} />
                        </Field>
                        {editError && <div style={{ color:"#ff4444", fontSize:12, marginBottom:8 }}>{editError}</div>}
                        <div style={{ display:"flex", gap:8 }}>
                          <button onClick={handleUpdateProfile} disabled={editBusy} style={{ ...primaryBtn(editBusy), flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                            {editBusy ? <><span className="spinner" />저장 중...</> : "저장 →"}
                          </button>
                          <button onClick={()=>{setEditingProfile(false);setEditError("");}} style={{ padding:"10px 16px", cursor:"pointer", borderRadius:6, background:"transparent", border:"1px solid #334455", color:"#556677", fontSize:12, fontFamily:"'Orbitron',monospace" }}>취소</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {result && (
                  <div style={{ marginTop:16, padding:"14px", borderRadius:8, background:session.side===result?"#0a2010":"#1a0808", border:`1px solid ${session.side===result?"#44ff8844":"#ff444433"}` }}>
                    {session.side===result ? (
                      <>
                        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, color:"#44ff88" }}>🏆 예측 성공!</div>
                        <div style={{ marginTop:8, fontSize:13, color:"#8899aa" }}>
                          획득 티켓: <span className="ticket-glow" style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:18 }}>
                            🎫 {winnerPayout ? (session.bet * winnerPayout).toFixed(2) : "-"}장
                          </span>
                        </div>
                        <div style={{ fontSize:11, color:"#446633", marginTop:4 }}>({session.bet}장 × {winnerPayout?.toFixed(2)}배)</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, color:"#ff4444" }}>💀 예측 실패...</div>
                        <div style={{ fontSize:12, color:"#554444", marginTop:4 }}>🎫 {session.bet}장을 잃었습니다</div>
                      </>
                    )}
                  </div>
                )}
                {!result && <div style={{ marginTop:12, fontSize:12, color:"#445566" }}>결과 발표를 기다리는 중...</div>}
              </div>
            )}

            {/* 다른 기기 로그인 */}
            {screen==="login" && (
              <div className="fade-in" style={{ background:"linear-gradient(135deg,#0a1628,#0d1e35)", border:"1px solid #00d4ff22", borderRadius:12, padding:"24px 20px" }}>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:"#00d4ff88", letterSpacing:3, marginBottom:16 }}>🔑 내 예측 찾기</div>

                {/* 단계 1: 닉네임 + PIN 입력 */}
                {loginStep==="input" && (
                  <>
                    <p style={{ fontSize:14, color:"#8899aa", lineHeight:1.8, marginBottom:20 }}>
                      처음 투표한 기기가 아닌 경우,<br/>닉네임과 PIN을 입력해 인증하세요.<br/>
                      <span style={{ fontSize:12, color:"#445566" }}>PIN을 설정한 적 없으면 닉네임만 입력하고 인증을 시도해보세요.</span>
                    </p>
                    <Field label="닉네임">
                      <input value={loginData.nickname} onChange={e=>{setLoginData(p=>({...p,nickname:e.target.value}));setLoginError("");}} placeholder="샛별" style={inputStyle(!!loginError)} />
                    </Field>
                    <Field label="PIN 번호" hint="설정한 적 없으면 비워두세요" error={loginError}>
                      <input value={loginData.pin} onChange={e=>{setLoginData(p=>({...p,pin:e.target.value.replace(/\D/g,"").slice(0,4)}));setLoginError("");}}
                        onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="1234 (없으면 비워두기)" maxLength={4} style={inputStyle(!!loginError)} />
                    </Field>
                    <button
                      onClick={() => {
                        if (loginData.pin.length === 0) {
                          // PIN 없이 닉네임만 → NO_PIN 플로우 직행
                          setLoginStep("setNewPin"); setLoginError("");
                        } else {
                          handleLogin();
                        }
                      }}
                      disabled={!loginData.nickname.trim()||loginBusy}
                      style={{ ...primaryBtn(!loginData.nickname.trim()||loginBusy), display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:10 }}>
                      {loginBusy ? <><span className="spinner" />확인 중...</> : "인증 →"}
                    </button>
                  </>
                )}

                {/* 단계 2: PIN 없는 기존 참여자 — 새 PIN 설정 */}
                {loginStep==="setNewPin" && (
                  <>
                    <div style={{ background:"#0a1a10", border:"1px solid #44ff8833", borderRadius:8, padding:"10px 14px", marginBottom:20 }}>
                      <div style={{ fontSize:13, color:"#44ff88" }}>✓ 닉네임 확인됨</div>
                      <div style={{ fontSize:14, color:"#8899aa", marginTop:4 }}>
                        <strong style={{ color:"#e0eaf8" }}>{loginData.nickname}</strong> 님, 처음 접속이시군요!<br/>
                        앞으로 사용할 PIN 4자리를 새로 설정해주세요.
                      </div>
                    </div>
                    <Field label="새 PIN 설정 (숫자 4자리)" error={loginError}>
                      <input value={loginNewPin} onChange={e=>{setLoginNewPin(e.target.value.replace(/\D/g,"").slice(0,4));setLoginError("");}}
                        onKeyDown={e=>e.key==="Enter"&&handleLoginSetNewPin()} placeholder="1234" maxLength={4} style={inputStyle(!!loginError)} />
                    </Field>
                    <button onClick={handleLoginSetNewPin} disabled={loginNewPin.length<4||loginNewPinBusy} style={{ ...primaryBtn(loginNewPin.length<4||loginNewPinBusy), display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:10 }}>
                      {loginNewPinBusy ? <><span className="spinner" />설정 중...</> : "PIN 설정하고 로그인 →"}
                    </button>
                    <button onClick={()=>{setLoginStep("input");setLoginError("");setLoginNewPin("");}} style={{ width:"100%", padding:"9px", cursor:"pointer", background:"transparent", border:"1px solid #334455", color:"#556677", borderRadius:6, fontSize:11, fontFamily:"'Orbitron',monospace" }}>← 뒤로</button>
                  </>
                )}

                {loginStep==="input" && (
                  <button onClick={()=>{setScreen("form");setLoginStep("input");setLoginError("");}} style={{ width:"100%", padding:"9px", cursor:"pointer", background:"transparent", border:"1px solid #334455", color:"#556677", borderRadius:6, fontSize:11, fontFamily:"'Orbitron',monospace" }}>← 돌아가기</button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 현황 탭 ── */}
        {tab==="board" && (
          <div className="fade-in">
            {total > 0 && (
              <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                {["a","b"].map(side => {
                  const p = PLAYERS[side]; const isWin = result===side;
                  const tickets = side==="a" ? ticketsA : ticketsB;
                  const payout  = side==="a" ? payoutA : payoutB;
                  return (
                    <div key={side} style={{ flex:1, background:isWin?"#0a2010":p.bg, border:`1px solid ${isWin?"#44ff8833":p.border}`, borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, color:p.color, letterSpacing:2, marginBottom:4 }}>{p.name} 예측</div>
                      <div style={{ fontSize:14, color:"#667788", marginBottom:2 }}>{side==="a"?countA:countB}명 · 🎫 {tickets}장</div>
                      {payout && <div className="ticket-glow" style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:17 }}>× {payout.toFixed(2)}</div>}
                      {result && <div style={{ fontSize:13, color:isWin?"#44ff88":"#ff4444", marginTop:4 }}>{isWin?"🏆 WIN":"💀 LOSE"}</div>}
                    </div>
                  );
                })}
              </div>
            )}
            {allVotes.length===0 ? (
              <div style={{ textAlign:"center", padding:"48px 20px", color:"#334455", fontFamily:"'Orbitron',monospace", fontSize:11, letterSpacing:3 }}>아직 참여자가 없습니다</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                {allVotes.map((v, i) => {
                  const p        = PLAYERS[v.side];
                  const isWinner = result && v.side===result;
                  const isLoser  = result && v.side!==result;
                  const myWin    = isWinner && winnerPayout ? (v.bet * winnerPayout) : null;
                  return (
                    <div key={v.id} className="vote-row" style={{ display:"flex", alignItems:"center", gap:10, background:isWinner?"#0a1e12":isLoser?"#180a0a":"#0a1020", border:`1px solid ${isWinner?"#44ff8822":isLoser?"#ff444422":"#ffffff08"}`, borderRadius:8, padding:"9px 12px" }}>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12, color:"#2a3a4a", minWidth:20 }}>{String(i+1).padStart(2,"0")}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:17, fontWeight:600, color:isWinner?"#44ff88":isLoser?"#ff5555":"#ccd8e8" }}>
                          {v.nickname}{isWinner?" 🏆":isLoser?" 💀":""}
                        </div>
                        <div style={{ fontSize:12, color:"#445566" }}>🎫 {v.bet || 1}장 베팅</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        {isWinner && myWin
                          ? <span className="ticket-glow" style={{ fontFamily:"'Orbitron',monospace", fontWeight:900, fontSize:15 }}>🎫 {myWin.toFixed(1)}장</span>
                          : isLoser
                          ? <span style={{ color:"#553333", fontFamily:"'Orbitron',monospace", fontSize:13 }}>🎫 0장</span>
                          : <span style={{ color:"#334455", fontFamily:"'Orbitron',monospace", fontSize:12 }}>🎫 × ?</span>}
                      </div>
                      <div style={{ fontFamily:"'Orbitron',monospace", fontSize:11, fontWeight:700, color:p.color, background:p.bg, border:`1px solid ${p.border}`, borderRadius:5, padding:"4px 8px", whiteSpace:"nowrap" }}>
                        {p.raceIcon} {p.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── 관리자 탭 ── */}
        {tab==="admin" && (
          <div className="fade-in">
            {!adminMode ? (
              <div style={{ background:"#0a1020", border:"1px solid #c084fc22", borderRadius:12, padding:"24px 20px" }}>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:"#c084fc88", letterSpacing:3, marginBottom:16 }}>🔐 ADMIN ACCESS</div>
                <input type="password" value={adminPw} onChange={e=>setAdminPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()} placeholder="관리자 비밀번호" style={{ ...inputStyle(!!adminError), marginBottom:10 }} />
                {adminError && <div style={{ color:"#ff4444", fontSize:12, marginBottom:8 }}>{adminError}</div>}
                <button onClick={handleAdminLogin} style={{ width:"100%", padding:"11px", cursor:"pointer", background:"linear-gradient(135deg,#c084fc22,#8833cc11)", border:"1px solid #c084fc55", color:"#c084fc", borderRadius:6, fontSize:12, fontFamily:"'Orbitron',monospace", letterSpacing:3 }}>입장 →</button>
              </div>
            ) : (
              <div style={{ background:"#0a1020", border:"1px solid #c084fc33", borderRadius:12, padding:"24px 20px" }}>
                <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:"#c084fc", letterSpacing:3, marginBottom:20 }}>⚙ ADMIN PANEL</div>

                {/* 통계 */}
                <div style={{ background:"#050a12", borderRadius:8, padding:"12px 14px", marginBottom:20, fontSize:12, color:"#667788", lineHeight:2 }}>
                  총 참여자: <strong style={{ color:"#e0eaf8" }}>{total}명</strong> &nbsp;·&nbsp; 총 티켓: <strong style={{ color:"#ffcc44" }}>🎫 {totalTickets}장</strong><br/>
                  이준호: <strong style={{ color:PLAYERS.a.color }}>{countA}명 · {ticketsA}장</strong> &nbsp;·&nbsp;
                  김우림: <strong style={{ color:PLAYERS.b.color }}>{countB}명 · {ticketsB}장</strong><br/>
                  {payoutA && <>이준호 배당: <strong style={{ color:"#ffcc44" }}>×{payoutA.toFixed(2)}</strong>&nbsp;·&nbsp;</>}
                  {payoutB && <>김우림 배당: <strong style={{ color:"#ffcc44" }}>×{payoutB.toFixed(2)}</strong></>}
                </div>

                {/* 참여 마감 토글 */}
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:13, color:"#8899aa", marginBottom:10 }}>참여 마감 관리</div>
                  <button onClick={handleToggleClosed} disabled={adminBusy} style={{
                    width:"100%", padding:"12px", cursor:"pointer", borderRadius:8,
                    background: closed ? "linear-gradient(135deg,#ff444422,#aa110011)" : "linear-gradient(135deg,#44ff8822,#00aa4411)",
                    border: `2px solid ${closed ? "#ff444466" : "#44ff8866"}`,
                    color: closed ? "#ff6666" : "#44ff88",
                    fontFamily:"'Orbitron',monospace", fontSize:12, letterSpacing:2, transition:"all 0.2s",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  }}>
                    {adminBusy ? <><span className="spinner" />처리 중...</> : closed ? "🔒 마감 중 → 재개하기" : "🟢 참여 중 → 마감하기"}
                  </button>
                  <div style={{ fontSize:11, color:"#334455", marginTop:6 }}>마감 후에는 새 참여가 불가합니다. 언제든 재개할 수 있어요.</div>
                </div>

                {/* 참여자 실명 + 개별 삭제 */}
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:12, color:"#8899aa", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span>참여자 목록 (실명 · 쿠폰 미제출자 삭제)</span>
                    <button onClick={loadAdminData} style={{ padding:"4px 10px", cursor:"pointer", borderRadius:4, background:"transparent", border:"1px solid #334455", color:"#556677", fontSize:10, fontFamily:"'Orbitron',monospace" }}>불러오기</button>
                  </div>
                  {adminVotes.length===0 ? (
                    <div style={{ fontSize:11, color:"#334455" }}>위 버튼을 눌러 목록을 불러오세요</div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:260, overflowY:"auto" }}>
                      {adminVotes.map((v, i) => {
                        const p        = PLAYERS[v.side];
                        const isWinner = result && v.side===result;
                        const isLoser  = result && v.side!==result;
                        const isDel    = deleting === v.id;
                        return (
                          <div key={v.id} style={{ display:"flex", alignItems:"center", gap:8, background:"#0a0f18", borderRadius:6, padding:"7px 10px", border:"1px solid #ffffff08" }}>
                            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:"#2a3a4a", minWidth:16 }}>{String(i+1).padStart(2,"0")}</div>
                            <div style={{ flex:1 }}>
                              <span style={{ fontSize:13, color:isWinner?"#44ff88":isLoser?"#ff5555":"#ccd8e8" }}>{v.nickname}</span>
                              {v.realname ? <span style={{ fontSize:12, color:"#ffcc44", marginLeft:6 }}>({v.realname})</span>
                                : <span style={{ fontSize:11, color:"#334455", marginLeft:6 }}>실명없음</span>}
                              {!v.hasPin && <span style={{ fontSize:10, color:"#664400", marginLeft:4 }}>PIN없음</span>}
                              <span style={{ fontSize:11, color:"#556633", marginLeft:6 }}>🎫{v.bet||1}</span>
                            </div>
                            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:10, color:p.color, marginRight:4 }}>{p.raceIcon}</div>
                            <button onClick={()=>handleDeleteVote(v.id)} disabled={!!deleting} style={{
                              padding:"4px 10px", cursor:deleting?"not-allowed":"pointer", borderRadius:4,
                              background:"transparent", border:"1px solid #ff444433",
                              color: isDel ? "#553333" : "#ff4444",
                              fontSize:10, fontFamily:"'Orbitron',monospace",
                            }}>
                              {isDel ? "..." : "삭제"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {adminVotes.length > 0 && (
                    <div style={{ fontSize:11, color:"#334455", marginTop:6 }}>삭제 후 "불러오기"를 다시 눌러야 목록이 갱신돼요</div>
                  )}
                </div>

                {/* 결과 설정 */}
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontSize:13, color:"#8899aa", marginBottom:10 }}>최종 승자 설정</div>
                  <div style={{ display:"flex", gap:10, marginBottom:12 }}>
                    {["a","b"].map(side => (
                      <button key={side} onClick={()=>setResultPick(side)} style={{ flex:1, padding:"12px", cursor:"pointer", borderRadius:8, background:resultPick===side?PLAYERS[side].bg:"#050a12", border:`2px solid ${resultPick===side?PLAYERS[side].color:"#1a2a3a"}`, color:resultPick===side?PLAYERS[side].color:"#445566", fontFamily:"'Orbitron',monospace", fontSize:11, transition:"all 0.2s" }}>
                        {PLAYERS[side].raceIcon} {PLAYERS[side].name}
                      </button>
                    ))}
                  </div>
                  <button onClick={handleSetResult} disabled={!resultPick||adminBusy} style={{ ...primaryBtn(!resultPick||adminBusy), marginBottom:8, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                    {adminBusy ? <><span className="spinner" />처리 중...</> : "🏆 결과 발표 →"}
                  </button>
                  {result && <button onClick={handleResetResult} disabled={adminBusy} style={{ width:"100%", padding:"9px", cursor:"pointer", background:"transparent", border:"1px solid #334455", color:"#556677", borderRadius:6, fontSize:11, fontFamily:"'Orbitron',monospace", letterSpacing:2 }}>결과 초기화</button>}
                </div>

                <div style={{ borderTop:"1px solid #1a2a3a", paddingTop:20 }}>
                  <div style={{ fontSize:12, color:"#445566", marginBottom:10 }}>⚠ 전체 데이터 초기화</div>
                  <button onClick={handleResetAll} disabled={adminBusy} style={{ width:"100%", padding:"9px", cursor:"pointer", background:"transparent", border:"1px solid #ff444433", color:"#ff4444", borderRadius:6, fontSize:11, fontFamily:"'Orbitron',monospace", letterSpacing:2 }}>모든 투표 삭제</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign:"center", marginTop:28, fontSize:10, color:"#1a2a3a", letterSpacing:3, fontFamily:"'Orbitron',monospace" }}>PPD USER & FAN CREW · KRAFTON</div>
      </div>
    </div>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:15, color:"#8899aa", display:"block", marginBottom:5 }}>
        {label}{hint && <span style={{ color:"#445566", fontSize:12, marginLeft:6 }}>{hint}</span>}
      </label>
      {children}
      {error && <div style={{ color:"#ff4444", fontSize:12, marginTop:4 }}>{error}</div>}
    </div>
  );
}

function inputStyle(hasError) {
  return { width:"100%", background:"#050a12", border:`1px solid ${hasError?"#ff4444":"#c084fc33"}`, color:"#e0eaf8", padding:"10px 14px", borderRadius:6, fontSize:16, fontFamily:"'Rajdhani',sans-serif" };
}

function primaryBtn(disabled) {
  return { width:"100%", padding:"12px", cursor:disabled?"not-allowed":"pointer", background:disabled?"#0a0f18":"linear-gradient(135deg,#c084fc22,#8833cc11)", border:`1px solid ${disabled?"#1a2a3a":"#c084fc88"}`, color:disabled?"#334455":"#c084fc", borderRadius:8, fontSize:13, fontFamily:"'Orbitron',monospace", letterSpacing:3, transition:"all 0.2s" };
}
