import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, applyNodeChanges, applyEdgeChanges, type Connection, type Node, type NodeProps } from "@xyflow/react";
import { DEFAULT_WINDOW, MODULES, connectionError, defaultPipeline, parseEvents, parsePipeline, scenario, toCsv, type Pipeline, type ModuleKind, type PipelineNode, type ReplayFrame, type Scenario } from "@streamweave/core";

type Frame = ReplayFrame & { output: number | null };
type VisualNode = Node<{ module: PipelineNode; active: boolean }, "module">;
const symbols: Record<ModuleKind, string> = { source: "↳", window: "◷", pressure: "±", smooth: "∿", output: "◎" };
const labels: Record<Scenario, string> = { reversal: "Direction reversal", balanced: "Balanced activity", sustained: "Sustained positive flow", quiet: "A quiet interval" };
const fmt = (value: number | null | undefined, digits = 1) => value == null ? "—" : value.toFixed(digits);

function ModuleNode({ data, selected }: NodeProps<VisualNode>) {
  const { module } = data, spec = MODULES[module.kind];
  const detail = module.kind === "source" ? String(module.params.stream)
    : module.kind === "window" ? `${Number(module.params.windowMs) / 1000}s window · minimum ${module.params.minEvents} events`
    : module.kind === "pressure" ? `${module.params.metric === "raw" ? "Uniform" : "Time-decayed"} weight · −100 to +100`
    : module.kind === "smooth" ? `${Number(module.params.halfLifeMs) / 1000}s half-life` : "Replay output";
  return <div className={`module-node kind-${module.kind} ${selected ? "selected" : ""}`}>
    {spec.input && <Handle type="target" position={Position.Left} id="in"/>}
    <div className="node-eyebrow"><span>{spec.input ?? "INPUT"}</span><i className={data.active ? "active-dot" : ""}/></div>
    <div className="node-title"><span className="node-icon">{symbols[module.kind]}</span>{spec.label}</div>
    <div className="node-detail">{detail}</div>
    {spec.output && <Handle type="source" position={Position.Right} id="out"/>}
  </div>;
}
const nodeTypes = { module: ModuleNode };

function initialGraph(): Pipeline {
  try { const stored = localStorage.getItem("streamweave.pipeline.v1"); if (stored) return parsePipeline(stored); } catch { /* Recover with a known valid pipeline. */ }
  const graph = defaultPipeline();
  const positions = [{ x: 0, y: 80 }, { x: 240, y: 80 }, { x: 480, y: 80 }, { x: 480, y: 255 }, { x: 720, y: 255 }];
  graph.nodes.forEach((n, i) => { n.position = positions[i]!; });
  return graph;
}

function download(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SignalChart({ frames, cursor }: { frames: Frame[]; cursor: number }) {
  const width = 1000, height = 180, left = 40, top = 14, bottom = 28;
  const plotHeight = height - top - bottom;
  const x = (i: number) => left + i / Math.max(1, frames.length - 1) * (width - left - 15);
  const y = (n: number) => top + (100 - n) / 200 * plotHeight;
  const path = (key: "pressure" | "output") => {
    let pen = false;
    return frames.map((frame, i) => {
      if (frame[key] === null) { pen = false; return ""; }
      const command = pen ? "L" : "M"; pen = true;
      return `${command}${x(i).toFixed(1)},${y(frame[key]).toFixed(1)}`;
    }).join(" ");
  };
  return <svg className="signal-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historical pressure and pipeline output, from minus 100 to plus 100">
    {[-100, -50, 0, 50, 100].map(n => <g key={n}><line x1={left} x2={width - 15} y1={y(n)} y2={y(n)} className={n === 0 ? "zero-line" : "grid-line"}/><text x={left - 10} y={y(n) + 4} textAnchor="end">{n}</text></g>)}
    <path d={path("pressure")} className="raw-path"/><path d={path("output")} className="output-path"/>
    {frames.length > 0 && <><line x1={x(cursor)} x2={x(cursor)} y1={top} y2={height - bottom} className="cursor-line"/>
      {frames[cursor]?.output != null && <circle cx={x(cursor)} cy={y(frames[cursor]!.output!)} r="4" fill="#a5ecc8"/>}
      {[0, 0.25, 0.5, 0.75, 1].map(t => <text key={t} x={x(Math.round(t * (frames.length - 1)))} y={height - 7} textAnchor="middle">{Math.round((frames[Math.round(t * (frames.length - 1))]!.timestampMs - frames[0]!.timestampMs) / 1000)}s</text>)}</>}
  </svg>;
}

export function App() {
  const [graph, setGraph] = useState<Pipeline>(initialGraph);
  const [events, setEvents] = useState(() => scenario("reversal"));
  const [recording, setRecording] = useState("Direction reversal");
  const [selectedScenario, setSelectedScenario] = useState<Scenario>("reversal");
  const [selected, setSelected] = useState("window");
  const [frames, setFrames] = useState<Frame[]>([]);
  const [cursor, setCursor] = useState(45);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stepMs, setStepMs] = useState(1000);
  const eventInput = useRef<HTMLInputElement>(null), graphInput = useRef<HTMLInputElement>(null);
  const worker = useRef<Worker | null>(null);
  // Layout edits do not trigger analytical recomputation.
  const computation = JSON.stringify({ version: graph.version, name: graph.name, nodes: graph.nodes.map(({ id, kind, params }) => ({ id, kind, params })), edges: graph.edges });
  useEffect(() => {
    setPlaying(false); setBusy(true); setError(""); setFrames([]);
    const w = new Worker(new URL("./replay.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    w.onmessage = (event: MessageEvent<{ frames?: Frame[]; error?: string }>) => {
      setBusy(false);
      if (event.data.error) { setError(event.data.error); return; }
      const next = event.data.frames ?? [];
      setFrames(next); setCursor(c => Math.min(c, Math.max(0, next.length - 1)));
      if (!next.length) setError("No observations for this stream. Choose a stream in Event source.");
    };
    w.onerror = () => { setBusy(false); setError("Replay worker failed. Reload the workbench and try again."); };
    w.postMessage({ graph, events, stepMs });
    return () => w.terminate();
  }, [computation, events, stepMs]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const timer = setInterval(() => setCursor(c => {
      if (c >= frames.length - 1) { setPlaying(false); return c; }
      return c + 1;
    }), 80);
    return () => clearInterval(timer);
  }, [playing, frames.length]);

  const current = frames[cursor];
  const activeNode = graph.nodes.find(n => n.id === selected);
  const streams = useMemo(() => [...new Set(events.map(e => e.stream))], [events]);
  const visualNodes = useMemo<VisualNode[]>(() => graph.nodes.map(n => ({ id: n.id, type: "module", position: n.position, width: 196, height: 111, selected: selected === n.id, data: { module: n, active: !error && !busy } })), [graph.nodes, selected, error, busy]);
  const visualEdges = useMemo(() => graph.edges.map(e => ({ ...e, sourceHandle: "out", targetHandle: "in", type: "smoothstep", animated: playing })), [graph.edges, playing]);
  const connect = useCallback((connection: Connection) => {
    setGraph(g => {
      const reason = connectionError(g, connection.source, connection.target);
      if (reason) { setNotice(reason); return g; }
      setNotice("");
      return { ...g, edges: [...g.edges, { id: crypto.randomUUID(), source: connection.source, target: connection.target }] };
    });
  }, []);
  const updateParam = (key: string, value: string | number) => setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === selected ? { ...n, params: { ...n.params, [key]: value } } : n) }));

  async function importFile(event: ChangeEvent<HTMLInputElement>, kind: "events" | "graph") {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > (kind === "graph" ? 100_000 : 5_000_000)) throw new Error("File exceeds the import size limit.");
      const text = await file.text();
      if (kind === "graph") { const imported = parsePipeline(text); setGraph(imported); setSelected(imported.nodes[0]!.id); }
      else {
        const ext = file.name.split(".").at(-1)?.toLowerCase();
        if (ext !== "csv" && ext !== "json" && ext !== "jsonl") throw new Error("Choose a CSV, JSON, or JSONL recording.");
        const imported = parseEvents(text, ext); setEvents(imported); setRecording(file.name); setCursor(0);
        setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.kind === "source" ? { ...n, params: { stream: imported[0]!.stream } } : n) }));
      }
      setNotice(`Loaded ${file.name}.`);
    } catch (e) { setNotice(`Import failed: ${(e as Error).message}`); }
    finally { event.target.value = ""; }
  }

  function loadScenario(name: Scenario) {
    setEvents(scenario(name)); setSelectedScenario(name); setRecording(labels[name]); setCursor(45);
    setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.kind === "source" ? { ...n, params: { stream: "sensor-A" } } : n) }));
    setNotice("");
  }
  function saveGraph() {
    try { parsePipeline(JSON.stringify(graph)); localStorage.setItem("streamweave.pipeline.v1", JSON.stringify(graph)); setNotice("Pipeline saved in this browser."); }
    catch (e) { setNotice(`Could not save: ${(e as Error).message}`); }
  }
  const numberParam = (label: string, key: string, unit: string, scale = 1, min = 1, max = 3600) => <label className="field">{label}<div className="input-unit"><input aria-label={label} type="number" min={min} max={max} step={scale === 1000 ? 0.1 : 1} value={Number(activeNode?.params[key] ?? 0) / scale} onChange={e => updateParam(key, Number(e.target.value) * scale)}/><span>{unit}</span></div></label>;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/" aria-label="Streamweave home"><span className="brand-mark">≋</span>Streamweave<span className="version">0.1</span></a><div className="top-tabs"><span className="selected-tab">Workbench</span><a href="https://gitlab.com/Deamenophobia/streamweave" target="_blank" rel="noreferrer">Repository ↗</a></div><span className="local-badge"><i/> Local workspace</span></header>
    <aside className="sidebar">
      <div className="section-caption">WORKSPACE <span>01</span></div>
      <div className="workspace-name">Signal research<span>Build · inspect · replay</span></div>
      <div className="section-caption section-gap">PIPELINE MODULES</div>
      <div className="module-list">{(Object.keys(MODULES) as ModuleKind[]).map(kind => <button key={kind} className={activeNode?.kind === kind ? "module-button active" : "module-button"} onClick={() => {
        const node = graph.nodes.find(n => n.kind === kind);
        if (node) setSelected(node.id);
        else { const fresh: PipelineNode = { id: kind, kind, position: { x: 280, y: 320 }, params: kind === "smooth" ? { halfLifeMs: 5000 } : kind === "window" ? { ...DEFAULT_WINDOW } : kind === "source" ? { stream: streams[0] ?? "sensor-A" } : kind === "pressure" ? { metric: "decayed" } : {} }; setGraph(g => ({ ...g, nodes: [...g.nodes, fresh] })); setSelected(fresh.id); }
      }}><span>{symbols[kind]}</span>{MODULES[kind].label}<small>{graph.nodes.some(n => n.kind === kind) ? "·" : "+"}</small></button>)}</div>
      <div className="section-caption section-gap">EXAMPLE RECORDINGS</div>
      {(Object.keys(labels) as Scenario[]).map(name => <button key={name} className={`recording-button ${recording === labels[name] ? "active" : ""}`} onClick={() => loadScenario(name)}><span>▤</span>{labels[name]}</button>)}
      <button className="import-button" onClick={() => eventInput.current?.click()}>＋ Import recording</button>
      <input ref={eventInput} type="file" accept=".csv,.json,.jsonl" className="hidden" aria-label="Import event recording" onChange={e => void importFile(e, "events")}/>
      <div className="sidebar-foot"><span className="tiny-label">YOUR DATA STAYS HERE</span><p>Files are processed in your browser. Export a pipeline to continue elsewhere.</p></div>
    </aside>
    <main>
      <div className="page-heading"><div><div className="breadcrumb">Workspace <span>/</span> Experiments</div><h1>Follow the flow.</h1><p>Turn timestamped observations into an interpretable signal.</p></div><button className="button primary" disabled={busy || !!error || !frames.length} onClick={() => { if (!playing && cursor >= frames.length - 1) setCursor(0); setPlaying(!playing); }}>{playing ? "Ⅱ Pause" : "▷ Replay"}</button></div>
      <section className="canvas-section" aria-label="Pipeline editor"><div className="panel-header"><div><span className="tiny-label">PIPELINE</span><input className="pipeline-name" aria-label="Pipeline name" maxLength={120} value={graph.name} onChange={e => setGraph(g => ({ ...g, name: e.target.value }))}/></div><div className="toolbar"><button onClick={saveGraph}>Save</button><button onClick={() => graphInput.current?.click()}>Open</button><button onClick={() => download("streamweave.pipeline.json", JSON.stringify(graph, null, 2), "application/json")}>Export</button><button title="Restore the default pipeline" onClick={() => { const fresh = defaultPipeline(); fresh.nodes.forEach((n, i) => { n.position = [{ x: 0, y: 80 }, { x: 240, y: 80 }, { x: 480, y: 80 }, { x: 480, y: 255 }, { x: 720, y: 255 }][i]!; }); fresh.nodes[0]!.params.stream = streams[0] ?? "sensor-A"; setGraph(fresh); setSelected("window"); }}>Reset</button></div></div>
        <input ref={graphInput} type="file" accept=".json" className="hidden" aria-label="Open pipeline file" onChange={e => void importFile(e, "graph")}/>
        <div className="canvas"><ReactFlow<VisualNode> nodes={visualNodes} edges={visualEdges} nodeTypes={nodeTypes} onNodeClick={(_, node) => setSelected(node.id)} onConnect={connect}
          onNodesChange={changes => { const edits = changes.filter(c => c.type === "position" || c.type === "remove"); if (!edits.length) return; const next = applyNodeChanges(edits, visualNodes); setGraph(g => ({ ...g, nodes: next.map(n => ({ ...n.data.module, position: n.position })), edges: g.edges.filter(e => next.some(n => n.id === e.source) && next.some(n => n.id === e.target)) })); }}
          onEdgesChange={changes => setGraph(g => ({ ...g, edges: applyEdgeChanges(changes, g.edges) }))}
          isValidConnection={c => connectionError(graph, c.source, c.target) === null} fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.25} maxZoom={1.5} colorMode="dark" deleteKeyCode={["Backspace", "Delete"]}>
          <Background variant={BackgroundVariant.Dots} color="#34413e" gap={22} size={1}/><Controls showInteractive={false}/>
        </ReactFlow><span className="canvas-hint">Drag to arrange · Connect matching ports · Select to configure</span></div>
        <div className={`pipeline-status ${error ? "invalid" : ""}`} role="status"><span>{busy ? "◌ Computing replay…" : error ? `! ${error}` : `✓ Pipeline connected · ${frames.length} replay frames`}</span><span>EVENT TIME</span></div>
      </section>
      {notice && <div className="notice" role="alert">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
      <section className="results-section" aria-label="Replay results"><div className="panel-header"><div><span className="tiny-label">REPLAY</span><h2>{recording}</h2></div><button className="text-button" disabled={!frames.length} onClick={() => download("streamweave.results.csv", toCsv(frames.map(f => ({ ...f }))), "text/csv")}>Export results ↗</button></div>
        <div className="stats"><div><span>Directional index</span><strong data-testid="output-index" className={(current?.output ?? 0) < 0 ? "negative" : "positive"}>{current?.output != null && current.output > 0 ? "+" : ""}{fmt(current?.output)}</strong><small>{current?.status === "ready" ? "Descriptive pressure · −100 to +100" : "Waiting for sufficient observations"}</small></div><div><span>Events in window</span><strong data-testid="event-count">{current?.count ?? "—"}</strong><small>{fmt(current?.eventsPerSecond, 2)} events / second</small></div><div><span>Effective sample size</span><strong>{fmt(current?.effectiveEvents)}</strong><small>Accounts for uneven event weights</small></div><div><span>Pressure change</span><strong>{fmt(current?.pressureChangePerSecond, 2)}</strong><small>Index points / second</small></div></div>
        <div className="chart-legend"><span><i className="raw-key"/> Raw pressure</span><span><i className="output-key"/> Pipeline output</span><span className="history-note">Full recording · selected time highlighted</span></div>
        <SignalChart frames={frames} cursor={cursor}/>
        <div className="scrubber"><button disabled={!frames.length} aria-label="Restart replay" onClick={() => { setCursor(0); setPlaying(false); }}>↤</button><input aria-label="Replay position" type="range" min={0} max={Math.max(0, frames.length - 1)} value={cursor} disabled={!frames.length} onChange={e => { setCursor(Number(e.target.value)); setPlaying(false); }}/><span>{current ? ((current.timestampMs - frames[0]!.timestampMs) / 1000).toFixed(1) : "0.0"}s <small>/ {frames.length ? ((frames.at(-1)!.timestampMs - frames[0]!.timestampMs) / 1000).toFixed(1) : "0.0"}s</small></span></div>
      </section><footer className="main-foot">Streamweave / signal workbench <span>{events.length.toLocaleString()} observations · {streams.length} stream{streams.length === 1 ? "" : "s"} · {recording === labels[selectedScenario] ? "Seeded synthetic example" : "Imported recording"}</span></footer>
    </main>
    <aside className="inspector"><div className="section-caption">INSPECTOR <span>⌘</span></div>{activeNode ? <><div className={`inspector-icon kind-${activeNode.kind}`}>{symbols[activeNode.kind]}</div><h2>{MODULES[activeNode.kind].label}</h2><p>{MODULES[activeNode.kind].description}.</p><div className="inspector-fields">
      {activeNode.kind === "source" && <label className="field">Stream<select aria-label="Source stream" value={String(activeNode.params.stream)} onChange={e => updateParam("stream", e.target.value)}>{streams.map(s => <option key={s}>{s}</option>)}</select></label>}
      {activeNode.kind === "window" && <>{numberParam("Window duration", "windowMs", "seconds", 1000)}{numberParam("Decay half-life", "halfLifeMs", "seconds", 1000)}{numberParam("Minimum observations", "minEvents", "events", 1, 1, 100000)}<p className="field-help">Observations expire after the time window, including during quiet intervals. A half-life halves an observation’s weight.</p></>}
      {activeNode.kind === "pressure" && <label className="field">Weighting<select aria-label="Pressure weighting" value={activeNode.params.metric} onChange={e => updateParam("metric", e.target.value)}><option value="decayed">Exponential time decay</option><option value="raw">Uniform weights</option></select></label>}
      {activeNode.kind === "smooth" && <>{numberParam("Smoothing half-life", "halfLifeMs", "seconds", 1000)}<p className="field-help">Larger values respond more slowly. The filter resets when the input has insufficient activity.</p></>}
      {activeNode.kind === "output" && <p className="field-help">Positive values indicate positive event pressure. Negative values indicate negative pressure. The index is not a forecast probability.</p>}
    </div><button className="remove-button" onClick={() => setGraph(g => ({ ...g, nodes: g.nodes.filter(n => n.id !== selected), edges: g.edges.filter(e => e.source !== selected && e.target !== selected) }))}>Remove module</button></> : <p>Select a module on the canvas.</p>}
      <div className="inspector-divider"/><div className="section-caption">REPLAY SETTINGS</div><label className="field">Sample interval<select aria-label="Sample interval" value={stepMs} onChange={e => setStepMs(Number(e.target.value))}><option value={250}>250 milliseconds</option><option value={1000}>1 second</option><option value={5000}>5 seconds</option><option value={10000}>10 seconds</option><option value={60000}>1 minute</option></select></label>
      <div className="method-note"><span>THE MEASURE</span><div className="formula">100 × (P − N) / (P + N)</div><p>P and N are positive and negative event weights. Activity and directional pressure remain separate.</p></div>
      <button className="text-button sample-download" onClick={() => download("streamweave.example.csv", toCsv(scenario("reversal").map(e => ({ ...e }))), "text/csv")}>Download example CSV ↓</button>
    </aside>
  </div>;
}
