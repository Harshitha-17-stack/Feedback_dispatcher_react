import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDown, BarChart3, Check, ChevronDown, CircleHelp,
  Clock3, Cpu, Download, Gauge, Pause, Play, Plus, RefreshCw,
  Settings2, Shuffle, SkipForward, Trash2, Zap
} from "lucide-react";

const starter = [
  { id: "P1", arrival: 0, burst: 3, priority: 1, memory: 64 },
  { id: "P2", arrival: 2, burst: 6, priority: 1, memory: 64 },
  { id: "P3", arrival: 4, burst: 4, priority: 1, memory: 64 },
  { id: "P4", arrival: 6, burst: 5, priority: 1, memory: 64 },
  { id: "P5", arrival: 8, burst: 2, priority: 1, memory: 64 }
];

const clone = (x) => JSON.parse(JSON.stringify(x));
const fmt = (n) => Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : "—";

function buildSimulation(input, quantum, duration, policy) {
  const jobs = input.map((p, i) => ({
    ...p, id: p.id || `P${i + 1}`, remaining: Number(p.burst),
    queue: 0, status: "New", firstStart: null, completion: null,
    waiting: 0, turnaround: null, executed: 0
  })).sort((a, b) => a.arrival - b.arrival);
  const queues = [[], [], []];
  const gantt = [];
  const events = [];
  let time = 0, running = null, sliceUsed = 0, finished = 0;
  const maxTime = Math.max(1, Number(duration) || 1);
  const pushEvent = (message, type = "info") => events.unshift({ time, message, type, key: `${time}-${events.length}-${message}` });

  while (time < maxTime && finished < jobs.length) {
    jobs.filter(p => p.status === "New" && p.arrival <= time).forEach(p => {
      p.status = "Ready"; p.queue = 0; queues[0].push(p);
      pushEvent(`${p.id} arrived and entered RQ0`, "arrival");
    });

    if (!running) {
      let level = queues.findIndex(q => q.length > 0);
      if (level >= 0) {
        running = queues[level].shift();
        running.status = "Running";
        sliceUsed = 0;
        if (running.firstStart === null) running.firstStart = time;
        pushEvent(`${running.id} selected from RQ${level}`, "run");
      }
    }

    if (!running) {
      gantt.push({ start: time, end: time + 1, id: "IDLE", queue: -1 });
      jobs.filter(p => p.status === "Ready").forEach(p => p.waiting++);
      time++;
      continue;
    }

    gantt.push({ start: time, end: time + 1, id: running.id, queue: running.queue });
    running.remaining--;
    running.executed++;
    sliceUsed++;
    jobs.filter(p => p.status === "Ready").forEach(p => p.waiting++);
    time++;

    if (running.remaining <= 0) {
      running.status = "Completed";
      running.completion = time;
      running.turnaround = time - running.arrival;
      finished++;
      pushEvent(`${running.id} completed`, "complete");
      running = null;
      sliceUsed = 0;
      continue;
    }

    const waitingExists = queues.some(q => q.length > 0) ||
      jobs.some(p => p.status === "New" && p.arrival <= time);

    if (sliceUsed >= quantum && waitingExists) {
      const oldQueue = running.queue;
      if (policy === "demote" && running.queue < 2) running.queue++;
      running.status = "Ready";
      queues[running.queue].push(running);
      pushEvent(`${running.id} preempted${running.queue > oldQueue ? ` and demoted to RQ${running.queue}` : `; remains in RQ${running.queue}`}`, "move");
      running = null;
      sliceUsed = 0;
    } else if (sliceUsed >= quantum) {
      // No other ready work: let the current process continue, matching the supplied dispatcher rule.
      sliceUsed = 0;
    }
  }

  if (running) running.status = "Ready";
  jobs.forEach(p => {
    if (p.status === "Ready" && !queues.some(q => q.includes(p))) queues[p.queue].push(p);
  });
  const completed = jobs.filter(p => p.status === "Completed");
  const avgWaiting = completed.length ? completed.reduce((s, p) => s + p.waiting, 0) / completed.length : null;
  const avgTurnaround = completed.length ? completed.reduce((s, p) => s + p.turnaround, 0) / completed.length : null;
  return { jobs, queues, gantt, events, time, finished, avgWaiting, avgTurnaround, completed: completed.length, total: jobs.length, stoppedAtLimit: time >= maxTime && finished < jobs.length };
}

function App() {
  const [processes, setProcesses] = useState(clone(starter));
  const [mode, setMode] = useState("fixed");
  const [quantum, setQuantum] = useState(1);
  const [duration, setDuration] = useState(60);
  const [policy, setPolicy] = useState("demote");
  const [speed, setSpeed] = useState(650);
  const [result, setResult] = useState(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const timer = useRef(null);

  const prepared = useMemo(() => result ? result : null, [result]);
  const visibleTime = prepared ? Math.min(cursor, prepared.gantt.length) : 0;
  const visibleGantt = prepared ? prepared.gantt.slice(0, visibleTime) : [];
  const currentSlot = visibleGantt.length ? visibleGantt[visibleGantt.length - 1] : null;
  const visibleJobs = prepared ? prepared.jobs.map(p => {
    const executed = visibleGantt.filter(g => g.id === p.id).length;
    const completedSlot = visibleGantt.findLast ? visibleGantt.findLast(g => g.id === p.id) : [...visibleGantt].reverse().find(g => g.id === p.id);
    const isDone = p.completion !== null && visibleTime >= p.completion;
    let status = isDone ? "Completed" : executed ? "Running/Ready" : p.arrival <= visibleTime ? "Ready" : "New";
    return { ...p, shownRemaining: Math.max(0, p.burst - executed), shownStatus: status, lastSlot: completedSlot };
  }) : [];

  useEffect(() => {
    if (!playing || !result) return;
    timer.current = setInterval(() => {
      setCursor(c => {
        const next = Math.min(c + 1, result.gantt.length);
        if (next >= result.gantt.length) setPlaying(false);
        return next;
      });
    }, speed);
    return () => clearInterval(timer.current);
  }, [playing, result, speed]);

  useEffect(() => () => clearInterval(timer.current), []);

  function updateProcess(index, field, value) {
    setProcesses(old => old.map((p, i) => i === index ? { ...p, [field]: value } : p));
  }
  function addProcess() {
    setProcesses(old => [...old, { id: `P${old.length + 1}`, arrival: old.length * 2, burst: 4, priority: 1, memory: 64 }]);
  }
  function removeProcess(index) {
    setProcesses(old => old.filter((_, i) => i !== index).map((p, i) => ({ ...p, id: `P${i + 1}` })));
  }
  function randomize() {
    const count = Math.max(1, processes.length);
    setProcesses(Array.from({ length: count }, (_, i) => ({
      id: `P${i + 1}`, arrival: Math.floor(Math.random() * Math.max(2, count * 2)),
      burst: 2 + Math.floor(Math.random() * 9), priority: 1 + Math.floor(Math.random() * 5),
      memory: [32, 64, 128, 256][Math.floor(Math.random() * 4)]
    })).sort((a, b) => a.arrival - b.arrival));
    setMode("random");
    setResult(null); setCursor(0); setPlaying(false); setHasRun(false);
  }
  function runSimulation() {
    const valid = processes.length && processes.every(p =>
      Number.isFinite(Number(p.arrival)) && Number(p.arrival) >= 0 &&
      Number.isFinite(Number(p.burst)) && Number(p.burst) > 0
    );
    if (!valid) { alert("Enter at least one process with arrival time ≥ 0 and burst time > 0."); return; }
    const normalized = processes.map((p, i) => ({ ...p, id: p.id || `P${i + 1}`, arrival: Number(p.arrival), burst: Number(p.burst) }));
    const sim = buildSimulation(normalized, Math.max(1, Number(quantum)), Math.max(1, Number(duration)), policy);
    setResult(sim); setCursor(0); setPlaying(false); setHasRun(true);
  }
  function reset() { setPlaying(false); setResult(null); setCursor(0); setHasRun(false); }
  function downloadCSV() {
    if (!result) return;
    const rows = [["PID","Arrival","Burst","Completion","Waiting","Turnaround","Status"]];
    result.jobs.forEach(p => rows.push([p.id,p.arrival,p.burst,p.completion ?? "",p.waiting,p.turnaround ?? "",p.status]));
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "feedback-dispatcher-results.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  const qLists = [0,1,2].map(level => {
    if (!result) return [];
    return result.jobs.filter(p => p.queue === level && p.status !== "Completed");
  });

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Activity size={20}/></div><div><b>QueueLab</b><span>OS SCHEDULING SUITE</span></div></div>
      <div className="nav-label">WORKSPACE</div>
      <div className="nav-item active"><Cpu size={17}/> Feedback Dispatcher</div>
      <div className="side-note"><div className="live-dot"/> Local simulation <span>READY</span></div>
      <div className="sidebar-bottom"><div className="avatar">OS</div><div><b>Operating Systems</b><small>Project Simulator</small></div></div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><div className="eyebrow">OPERATING SYSTEMS / CPU SCHEDULING</div><h1>Feedback Dispatcher</h1><p>Multilevel feedback queue · Round Robin scheduling</p></div>
        <div className="top-actions"><span className="status-pill"><i/> SIMULATOR READY</span><button className="icon-btn" title="Reset" onClick={reset}><RefreshCw size={17}/></button></div>
      </header>

      <section className="metric-row">
        <Metric icon={<Clock3/>} label="SIMULATION TIME" value={result ? `${visibleTime} / ${result.time}` : "0"} foot="Logical time units"/>
        <Metric icon={<Cpu/>} label="PROCESSES" value={processes.length} foot={`${result?.completed ?? 0} completed`}/>
        <Metric icon={<Gauge/>} label="AVG. WAITING TIME" value={result && cursor >= result.gantt.length ? fmt(result.avgWaiting) : "—"} foot="Completed processes only"/>
        <Metric icon={<BarChart3/>} label="AVG. TURNAROUND" value={result && cursor >= result.gantt.length ? fmt(result.avgTurnaround) : "—"} foot="Completed processes only"/>
      </section>

      <div className="content-grid">
        <section className="panel config-panel">
          <div className="panel-head"><div><div className="section-kicker">01 / CONFIGURATION</div><h2>Simulation setup</h2></div><Settings2 size={19}/></div>
          <div className="field-grid">
            <label>Time quantum <input type="number" min="1" value={quantum} onChange={e=>setQuantum(e.target.value)}/></label>
            <label>Run duration <input type="number" min="1" value={duration} onChange={e=>setDuration(e.target.value)}/></label>
          </div>
          <div className="field-label">PROCESS INPUT MODE</div>
          <div className="segmented">
            <button className={mode==="fixed"?"selected":""} onClick={()=>setMode("fixed")}>Fixed input</button>
            <button className={mode==="random"?"selected":""} onClick={randomize}><Shuffle size={14}/> Randomized</button>
          </div>
          <div className="field-label">DEMOTION POLICY</div>
          <select value={policy} onChange={e=>setPolicy(e.target.value)}>
            <option value="demote">Demote after quantum when work is waiting</option>
            <option value="rotate">Rotate within current queue</option>
          </select>
          <div className="field-label process-title">PROCESSES <span>{processes.length} configured</span></div>
          <div className="process-table-wrap">
            <table className="process-table"><thead><tr><th>PROCESS</th><th>ARRIVAL</th><th>BURST</th><th>MEMORY</th><th></th></tr></thead>
              <tbody>{processes.map((p,i)=><tr key={p.id+i}>
                <td><span className="pid-chip">{p.id}</span></td>
                <td><input aria-label={`${p.id} arrival`} type="number" min="0" value={p.arrival} onChange={e=>updateProcess(i,"arrival",e.target.value)}/></td>
                <td><input aria-label={`${p.id} burst`} type="number" min="1" value={p.burst} onChange={e=>updateProcess(i,"burst",e.target.value)}/></td>
                <td><input aria-label={`${p.id} memory`} type="number" min="1" value={p.memory} onChange={e=>updateProcess(i,"memory",e.target.value)}/></td>
                <td><button className="remove-btn" onClick={()=>removeProcess(i)} title="Remove process"><Trash2 size={14}/></button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="config-actions"><button className="text-btn" onClick={addProcess}><Plus size={15}/> Add process</button><button className="text-btn" onClick={()=>{setProcesses(clone(starter));setMode("fixed");reset();}}>Load sample</button></div>
          <button className="primary-btn full" onClick={runSimulation}><Play size={16} fill="currentColor"/> Generate simulation</button>
          <p className="hint"><CircleHelp size={13}/> Sample defaults preserve your five-process assignment input. Set quantum to 1 for the original test.</p>
        </section>

        <section className="panel queues-panel">
          <div className="panel-head"><div><div className="section-kicker">02 / LIVE DISPATCH</div><h2>Feedback queues</h2></div><span className="priority-tag">HIGHEST → LOWEST</span></div>
          <div className="queue-stack">
            {[0,1,2].map((level)=> {
              const active = currentSlot && currentSlot.queue === level && currentSlot.id !== "IDLE";
              const ids = result ? result.jobs.filter(p => p.queue === level && p.status !== "Completed" && p.arrival <= visibleTime && !visibleGantt.some(g=>g.id===p.id && (p.completion!==null && visibleTime>=p.completion))) : [];
              return <div className={`queue-card q${level}`} key={level}>
                <div className="queue-meta"><div><b>RQ{level}</b><span>{["Highest priority","Medium priority","Lowest priority"][level]}</span></div><span className="queue-count">{ids.length} PROCESSES</span></div>
                <div className="queue-processes">
                  {ids.length ? ids.map(p=><span className={`queue-token ${active && currentSlot.id===p.id?"is-active":""}`} key={p.id}>{p.id}{active && currentSlot.id===p.id ? <i>RUNNING</i>:null}</span>) : <span className="empty-queue">Queue empty</span>}
                </div>
              </div>
            })}
          </div>
          <div className="cpu-card">
            <div className="cpu-top"><span><Zap size={15}/> CPU DISPATCHER</span><span className={currentSlot?"cpu-on":"cpu-idle"}>{currentSlot?.id === "IDLE" || !currentSlot ? "IDLE" : "EXECUTING"}</span></div>
            <div className="cpu-process">{currentSlot && currentSlot.id !== "IDLE" ? currentSlot.id : "—"}</div>
            <div className="cpu-sub">{currentSlot && currentSlot.id !== "IDLE" ? `Running from RQ${currentSlot.queue}` : "Waiting for a ready process"}</div>
          </div>
          <div className="playback">
            <div className="play-controls">
              <button className="primary-btn small" disabled={!result || cursor>=result.gantt.length} onClick={()=>setPlaying(v=>!v)}>{playing?<Pause size={15}/>:<Play size={15}/>} {playing?"Pause":"Play"}</button>
              <button className="icon-btn" disabled={!result} onClick={()=>{setPlaying(false);setCursor(c=>Math.min(c+1,result.gantt.length));}} title="Step forward"><SkipForward size={16}/></button>
              <button className="icon-btn" disabled={!result} onClick={()=>{setPlaying(false);setCursor(0);}} title="Restart playback"><RefreshCw size={15}/></button>
            </div>
            <label className="speed-control">Playback speed
              <select value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value="1000">0.5×</option><option value="650">1×</option><option value="300">2×</option></select>
            </label>
          </div>
          <div className="progress-track"><div style={{width:result?`${(cursor/Math.max(1,result.gantt.length))*100}%`:"0%"}}/></div>
          <div className="progress-caption"><span>TIME {visibleTime}</span><span>{result?`${cursor} / ${result.gantt.length} STEPS`:"RUN A SIMULATION TO BEGIN"}</span></div>
        </section>
      </div>

      <section className="panel gantt-panel">
        <div className="panel-head"><div><div className="section-kicker">03 / EXECUTION TIMELINE</div><h2>Gantt chart</h2></div><span className="small-muted">One block = one logical time unit</span></div>
        {visibleGantt.length ? <div className="gantt-scroll"><div className="gantt-row">{visibleGantt.map((g,i)=><div key={i} className={`gantt-block ${g.id==="IDLE"?"idle":`gantt-q${g.queue}`}`} title={`${g.id}: ${g.start}–${g.end}`}><b>{g.id}</b><small>{g.start}–{g.end}</small></div>)}</div><div className="gantt-axis">{visibleGantt.map((g,i)=><span key={i}>{g.start}</span>)}<span>{visibleGantt[visibleGantt.length-1].end}</span></div></div> : <div className="empty-chart"><BarChart3 size={25}/><b>Your execution timeline will appear here</b><span>Configure processes and generate a simulation.</span></div>}
      </section>

      <div className="bottom-grid">
        <section className="panel">
          <div className="panel-head"><div><div className="section-kicker">04 / PROCESS MONITOR</div><h2>Process status</h2></div><span className="small-muted">{visibleJobs.length} processes</span></div>
          <div className="table-scroll"><table className="status-table"><thead><tr><th>PROCESS</th><th>ARRIVAL</th><th>BURST</th><th>REMAINING</th><th>QUEUE</th><th>STATUS</th></tr></thead><tbody>
            {visibleJobs.map(p=><tr key={p.id}><td><b>{p.id}</b></td><td>{p.arrival}</td><td>{p.burst}</td><td>{p.shownRemaining}</td><td>RQ{p.queue}</td><td><span className={`status status-${p.shownStatus==="Completed"?"done":p.shownStatus==="New"?"new":"ready"}`}>{p.shownStatus}</span></td></tr>)}
            {!visibleJobs.length && <tr><td colSpan="6" className="table-empty">No simulation data yet</td></tr>}
          </tbody></table></div>
        </section>
        <section className="panel events-panel">
          <div className="panel-head"><div><div className="section-kicker">05 / EVENT LOG</div><h2>Dispatcher events</h2></div><span className="live-label">● LOG</span></div>
          <div className="event-list">{result ? result.events.slice(0,9).map(e=><div className="event" key={e.key}><span className="event-time">T+{e.time}</span><span className={`event-dot ${e.type}`}/><span>{e.message}</span></div>) : <div className="event-empty">Scheduling events will be listed here after you generate a simulation.</div>}</div>
        </section>
      </div>

      {result && <section className="result-bar"><div><Check size={17}/><b>Simulation generated</b><span>{result.completed} completed · {result.total-result.completed} unfinished at stop</span></div><button className="export-btn" onClick={downloadCSV}><Download size={15}/> Export results CSV</button></section>}
      <footer>QueueLab · Feedback Dispatcher Simulator <span>Educational simulation · Logical CPU time</span></footer>
    </main>
  </div>;
}

function Metric({icon,label,value,foot}) {
  return <div className="metric-card"><div className="metric-icon">{React.cloneElement(icon,{size:17})}</div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-foot">{foot}</div></div>;
}

export default App;
