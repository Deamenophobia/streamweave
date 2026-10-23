import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Background, BackgroundVariant, Controls, Handle, Position, ReactFlow, applyNodeChanges, useReactFlow, type Connection, type Node, type NodeProps } from "@xyflow/react";
import { WORKBENCH_MODULES, dataRows, emptyProject, makeNode, multiSourceExample, parseDataset, parseProject, pressureExample, toCsv, workbenchConnectionError, type Dataset, type DataValue, type WorkbenchKind, type WorkbenchNode, type WorkbenchProject, type WorkbenchRun } from "@streamweave/core";
import { DataView } from "./DataView";
import { Inspector } from "./Inspector";

type VisualNode = Node<{ module: WorkbenchNode; state: string; detail: string }, "module">;
const icons: Record<WorkbenchKind, string> = { source: "▤", field: "↳", filter: "≡", align: "⋈", transform: "Δ", scale: "×", smooth: "∿", rolling: "◷", arithmetic: "±", correlation: "ρ", regression: "ƒ", pressure: "⇅", chart: "⌁", table: "▦", export: "↓" };
const categories = ["Data", "Process", "Analyze", "Output"] as const;
const storageKey = "streamweave.project.v2";
const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

function initialProject(): WorkbenchProject {
  try { const saved = localStorage.getItem(storageKey); if (saved) return parseProject(saved); } catch { /* Recover from malformed saved data. */ }
  return multiSourceExample();
}
function download(name: string, value: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ModuleNode({ data, selected }: NodeProps<VisualNode>) {
  const n = data.module, spec = WORKBENCH_MODULES[n.type];
  return <div className={`flow-module category-${spec.category.toLowerCase()} ${selected ? "selected" : ""}`}>
    <div className="node-eyebrow"><span>{spec.category}</span><i className={`node-state ${data.state}`} title={data.state}/></div>
    <div className="node-title"><span>{icons[n.type]}</span><strong title={n.title}>{n.title}</strong></div>
    <div className="node-detail" title={data.detail}>{data.detail}</div>
    {spec.inputs.map((p, i) => <div key={p.id}><Handle type="target" position={Position.Left} id={p.id} style={{ top: 94 + i * 21 }} aria-label={`${n.title} input ${p.id}`}/><span className="port-name input-port" style={{ top: 88 + i * 21 }}>{p.id}{p.multiple ? " +" : ""}</span></div>)}
    {spec.outputs.map((p, i) => <div key={p.id}><Handle type="source" position={Position.Right} id={p.id} style={{ top: 94 + i * 21 }} aria-label={`${n.title} output ${p.id}`}/><span className="port-name output-port" style={{ top: 88 + i * 21 }}>{p.id}</span></div>)}
  </div>;
}
const nodeTypes = { module: ModuleNode };

export function App() {
  const [project, setProject] = useState<WorkbenchProject>(initialProject);
  const [run, setRun] = useState<WorkbenchRun | null>(null);
  const [selected, setSelected] = useState<string | null>("alignment");
  const [datasetPreview, setDatasetPreview] = useState<string | null>(null);
  const [view, setView] = useState<"outputs" | "inspect">("outputs");
  const [previewMode, setPreviewMode] = useState<"chart" | "table">("table");
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [focus, setFocus] = useState(false), [refresh, setRefresh] = useState(0);
  const [activeEdges, setActiveEdges] = useState<string[]>([]);
  const datasetInput = useRef<HTMLInputElement>(null), projectInput = useRef<HTMLInputElement>(null), canvas = useRef<HTMLDivElement>(null);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const graph = project.graph;
  const computeKey = JSON.stringify({ name: graph.name, nodes: graph.nodes.map(({ id, type, title, params }) => ({ id, type, title, params })), edges: graph.edges });
  useEffect(() => {
    setBusy(true); setError(""); setRun(null);
    const worker = new Worker(new URL("./graph.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ run?: WorkbenchRun; error?: string }>) => { setBusy(false); setError(e.data.error ?? ""); setRun(e.data.run ?? null); };
    worker.onerror = () => { setBusy(false); setError("Calculation worker failed. Reload the workbench."); };
    worker.postMessage(project);
    return () => worker.terminate();
  }, [computeKey, project.datasets, refresh]);

  const fit = () => requestAnimationFrame(() => requestAnimationFrame(() => { void fitView({ padding: 0.12, duration: 180 }); }));
  const updateGraph = (updater: (g: WorkbenchProject["graph"]) => WorkbenchProject["graph"]) => setProject(p => ({ ...p, graph: updater(p.graph) }));
  const selectedNode = graph.nodes.find(n => n.id === selected);
  const selectedResult = selected ? run?.nodes[selected] : undefined;
  const outputNodes = graph.nodes.filter(n => WORKBENCH_MODULES[n.type].category === "Output");
  const failures = Object.values(run?.nodes ?? {}).filter(n => n.state !== "ready").length;
  const selectNode = (id: string) => { setSelected(id); setDatasetPreview(null); };

  const visualNodes = useMemo<VisualNode[]>(() => graph.nodes.map(n => {
    const result = run?.nodes[n.id];
    const detail = result?.error ?? (n.type === "source" ? project.datasets.find(d => d.id === n.params.datasetId)?.name ?? "Choose dataset" : n.type === "align" ? String(n.params.mode) : n.type === "transform" || n.type === "rolling" || n.type === "arithmetic" ? String(n.params.operation) : WORKBENCH_MODULES[n.type].title);
    return { id: n.id, type: "module", position: n.position, width: 184, height: 134, selected: selected === n.id, data: { module: n, detail, state: busy ? "computing" : result?.state ?? "waiting" } };
  }), [graph.nodes, selected, run, busy, project.datasets]);
  const visualEdges = useMemo(() => graph.edges.map(e => ({ ...e, sourceHandle: e.sourcePort, targetHandle: e.targetPort, type: "smoothstep", selected: activeEdges.includes(e.id) })), [graph.edges, activeEdges]);

  const connect = useCallback((c: Connection) => {
    setProject(p => {
      const edge = { source: c.source, sourcePort: c.sourceHandle ?? "", target: c.target, targetPort: c.targetHandle ?? "" };
      const reason = workbenchConnectionError(p.graph, edge);
      if (reason) { setNotice(reason); return p; }
      setNotice("");
      return { ...p, graph: { ...p.graph, edges: [...p.graph.edges, { id: uid("edge"), ...edge }] } };
    });
  }, []);

  function centerPosition() {
    const rect = canvas.current?.getBoundingClientRect();
    return rect ? screenToFlowPosition({ x: rect.left + rect.width / 2 - 90, y: rect.top + rect.height / 2 - 60 }) : { x: 100, y: 100 };
  }
  function addModule(type: WorkbenchKind, position = centerPosition(), params: WorkbenchNode["params"] = {}) {
    if (graph.nodes.length >= 50) { setNotice("This workspace supports up to 50 modules."); return; }
    const node = makeNode(uid(type), type, position.x, position.y, params);
    if (type === "source" && !node.params.datasetId && project.datasets[0]) {
      node.params.datasetId = project.datasets[0].id;
      node.params.column = project.datasets[0].columns.find(c => c.type === "number" && !["timestampMs", "availableAtMs"].includes(c.key))?.key ?? "";
    }
    updateGraph(g => ({ ...g, nodes: [...g.nodes, node] })); selectNode(node.id); setView("inspect");
  }
  function dropModule(event: DragEvent) {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/streamweave-module");
    if (Object.hasOwn(WORKBENCH_MODULES, type)) addModule(type as WorkbenchKind, screenToFlowPosition({ x: event.clientX - 80, y: event.clientY - 30 }));
  }
  function removeNode(id: string) { updateGraph(g => ({ ...g, nodes: g.nodes.filter(n => n.id !== id), edges: g.edges.filter(e => e.source !== id && e.target !== id) })); setSelected(null); }
  function duplicateNode(node: WorkbenchNode) { addModule(node.type, { x: node.position.x + 35, y: node.position.y + 160 }, { ...node.params }); }
  function updateParam(key: string, value: string | number) {
    updateGraph(g => ({ ...g, nodes: g.nodes.map(n => {
      if (n.id !== selected) return n;
      const params = { ...n.params, [key]: value };
      if (key === "datasetId") params.column = project.datasets.find(d => d.id === value)?.columns.find(c => c.type === "number" && !["timestampMs", "availableAtMs"].includes(c.key))?.key ?? "";
      return { ...n, params };
    }) }));
  }
  function loadProject(next: WorkbenchProject) { setProject(next); setSelected(next.graph.nodes.find(n => n.type === "align")?.id ?? next.graph.nodes[0]?.id ?? null); setDatasetPreview(null); setView("outputs"); setNotice(""); setActiveEdges([]); requestAnimationFrame(fit); }
  async function importDatasets(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    try {
      const imported: Dataset[] = [];
      for (const file of files) {
        if (file.size > 5_000_000) throw new Error(`${file.name} exceeds 5 MB.`);
        const ext = file.name.split(".").at(-1)?.toLowerCase();
        if (ext !== "csv" && ext !== "json" && ext !== "jsonl") throw new Error("Choose CSV, JSON, or JSONL datasets.");
        imported.push(parseDataset(await file.text(), ext, uid("dataset"), file.name.slice(0, 120)));
      }
      const combined = [...project.datasets, ...imported];
      if (combined.length > 12 || combined.reduce((n, d) => n + d.rows.length, 0) > 50_000 || graph.nodes.length + imported.length > 50) throw new Error("Workspace limits: 12 datasets, 50,000 rows, 50 modules.");
      const center = centerPosition();
      const sources = imported.map((d, i) => makeNode(uid("source"), "source", center.x + i * 35, center.y + i * 155, { datasetId: d.id, column: d.columns.find(c => c.type === "number" && !["timestampMs", "availableAtMs"].includes(c.key))?.key ?? "" }, d.name.slice(0, 100)));
      const next = { ...project, datasets: combined, graph: { ...graph, nodes: [...graph.nodes, ...sources] } };
      if (new Blob([JSON.stringify(next)]).size > 14_000_000) throw new Error("Combined project is too large. Keep source data below 14 MB to allow a portable project under 15 MB.");
      setProject(next);
      if (sources[0]) selectNode(sources[0].id);
      setNotice(`Imported ${imported.length} dataset${imported.length === 1 ? "" : "s"}. Connect their named ports to a calculation.`);
    } catch (e) { setNotice(`Import failed: ${(e as Error).message}`); }
    finally { event.target.value = ""; }
  }
  async function openProject(event: ChangeEvent<HTMLInputElement>) {
    try { const file = event.target.files?.[0]; if (file) { if (file.size > 15_000_000) throw new Error("Project exceeds 15 MB."); loadProject(parseProject(await file.text())); setNotice(`Opened ${file.name}.`); } }
    catch (e) { setNotice(`Could not open project: ${(e as Error).message}`); }
    finally { event.target.value = ""; }
  }
  function saveProject() {
    try { const content = JSON.stringify(project); parseProject(content); localStorage.setItem(storageKey, content); setNotice("Project and datasets saved in this browser."); }
    catch (e) { setNotice(`Save failed: ${(e as Error).message} Use Download project for larger workspaces.`); }
  }
  function downloadProject() {
    try {
      const content = JSON.stringify(project);
      parseProject(content);
      if (new Blob([content]).size > 15_000_000) throw new Error("Project exceeds 15 MB.");
      download("streamweave.project.json", content);
    } catch (e) { setNotice(`Could not export project: ${(e as Error).message}`); }
  }
  function exportJson(node: WorkbenchNode, values: { label: string; data: DataValue }[]) {
    download(`streamweave-${node.id}.results.json`, JSON.stringify({ format: "streamweave-results", version: 2, engineVersion: "0.2.0", moduleId: node.id, results: values, project }, null, 2));
  }
  const selectedValues = selectedResult ? Object.entries(selectedResult.outputs).map(([label, data]) => ({ label, data })) : [];
  if (selectedResult && !selectedValues.length) selectedValues.push(...selectedResult.inputs.map(({ edge, data }) => ({ label: `${edge.source} / ${edge.sourcePort}`, data })));
  const dataset = project.datasets.find(d => d.id === datasetPreview);

  return <div className={`workbench-shell ${focus ? "canvas-focus" : ""}`}>
    <header className="workbench-header"><a href="/" className="brand"><span className="brand-mark">≋</span>Streamweave <span className="version">0.2</span></a><span className="header-purpose">Visual numerical workbench</span><a className="repo-link" href="https://gitlab.com/Deamenophobia/streamweave" target="_blank" rel="noreferrer">Repository ↗</a><span className="local-badge"><i/> Local computation</span></header>
    <aside className="library">
      <div className="section-caption">DATASETS <span>{project.datasets.length}/12</span></div>
      <div className="dataset-list">{project.datasets.map(d => <button className={datasetPreview === d.id ? "active" : ""} key={d.id} onClick={() => { setDatasetPreview(d.id); setView("inspect"); }} title={d.name}><span>▤</span><div>{d.name}<small>{d.rows.length.toLocaleString()} rows · {d.columns.length} columns</small></div></button>)}</div>
      <button className="import-button" onClick={() => datasetInput.current?.click()}>＋ Import datasets</button><input ref={datasetInput} className="hidden" type="file" multiple accept=".csv,.json,.jsonl" aria-label="Import datasets" onChange={e => void importDatasets(e)}/>
      <p className="library-hint">Each file becomes a separate source. Timestamped CSV / JSON / JSONL.</p>
      <div className="section-caption library-title">MODULE LIBRARY</div>
      {categories.map(category => <div className="module-category" key={category}><h3>{category}</h3>{(Object.keys(WORKBENCH_MODULES) as WorkbenchKind[]).filter(type => WORKBENCH_MODULES[type].category === category).map(type => <button draggable onDragStart={e => { e.dataTransfer.setData("application/streamweave-module", type); e.dataTransfer.effectAllowed = "copy"; }} aria-label={`Add ${WORKBENCH_MODULES[type].title}`} key={type} onClick={() => addModule(type)} title={WORKBENCH_MODULES[type].description}><span>{icons[type]}</span>{WORKBENCH_MODULES[type].title}<small>＋</small></button>)}</div>)}
      <div className="example-library"><span className="tiny-label">STARTING POINTS</span><button onClick={() => loadProject(multiSourceExample())}>Two-source study</button><button onClick={() => loadProject(pressureExample())}>Signed-event study</button><button onClick={() => loadProject(emptyProject())}>Blank workspace</button></div>
    </aside>
    <main className="workbench-main">
      <div className="workbench-heading"><div><span className="tiny-label">SOURCES → CALCULATIONS → OUTPUTS</span><h1>Make the connections.</h1><p>Compose independent datasets and calculations. Inspect every step.</p></div><button className="button primary" onClick={() => setRefresh(n => n + 1)} disabled={busy}>↻ Run</button></div>
      <section className="canvas-section" aria-label="Calculation canvas"><div className="panel-header"><div><span className="tiny-label">WORKSPACE</span><input className="pipeline-name" aria-label="Project name" maxLength={120} value={graph.name} onChange={e => updateGraph(g => ({ ...g, name: e.target.value }))}/></div><div className="toolbar"><button onClick={saveProject}>Save</button><button onClick={() => projectInput.current?.click()}>Open</button><button onClick={downloadProject}>Download project</button><button onClick={() => { setFocus(v => !v); fit(); }}>{focus ? "Exit focus" : "Focus canvas"}</button></div></div>
        <input className="hidden" ref={projectInput} type="file" accept=".json" aria-label="Open project file" onChange={e => void openProject(e)}/>
        <div ref={canvas} className="workbench-canvas" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }} onDrop={dropModule}>
          <ReactFlow<VisualNode> nodes={visualNodes} edges={visualEdges} nodeTypes={nodeTypes} onNodeClick={(_, node) => selectNode(node.id)} onPaneClick={() => setSelected(null)} onConnect={connect}
            onNodesChange={changes => { const edits = changes.filter(c => c.type === "position" || c.type === "remove"); if (!edits.length) return; const next = applyNodeChanges(edits, visualNodes); updateGraph(g => ({ ...g, nodes: next.map(n => ({ ...n.data.module, position: n.position })), edges: g.edges.filter(e => next.some(n => n.id === e.source) && next.some(n => n.id === e.target)) })); }}
            onEdgesChange={changes => { const removed = new Set(changes.filter(c => c.type === "remove").map(c => c.id)); if (removed.size) updateGraph(g => ({ ...g, edges: g.edges.filter(e => !removed.has(e.id)) })); for (const change of changes) if (change.type === "select") setActiveEdges(ids => change.selected ? [...new Set([...ids, change.id])] : ids.filter(id => id !== change.id)); }}
            isValidConnection={c => workbenchConnectionError(graph, { source: c.source, sourcePort: c.sourceHandle ?? "", target: c.target, targetPort: c.targetHandle ?? "" }) === null}
            fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.2} maxZoom={1.6} colorMode="dark" deleteKeyCode={["Backspace", "Delete"]}>
            <Background variant={BackgroundVariant.Dots} color="#34413e" gap={22} size={1}/><Controls showInteractive={false}/>
          </ReactFlow>
          {!graph.nodes.length && <div className="canvas-empty"><strong>Start with a dataset.</strong><p>Import a file, then drag modules from the library.</p></div>}
          <span className="canvas-hint">Drag modules · Connect named ports · Duplicate for parallel paths</span>
        </div>
        <div className={`pipeline-status ${error || failures ? "invalid" : ""}`} role="status"><span>{busy ? "◌ Computing graph…" : error ? error : `${failures ? "!" : "✓"} ${graph.nodes.length} modules · ${graph.edges.length} connections · ${failures ? `${failures} need attention` : "all branches ready"}`}</span><span>{project.datasets.length} DATA SOURCES</span></div>
      </section>
      {notice && <div className="notice" role="alert">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
      <div className="results-tabs"><button className={view === "outputs" ? "active" : ""} onClick={() => setView("outputs")}>Outputs <span>{outputNodes.length}</span></button><button className={view === "inspect" ? "active" : ""} onClick={() => setView("inspect")}>{dataset ? "Inspect dataset" : "Inspect module"}</button><span>Values stay separate · units stay visible</span></div>
      {busy ? <div className="empty-state">Computing…</div> : error ? <div className="empty-state">Resolve the graph error to inspect results.</div> : view === "outputs" ? <div className="output-grid">
        {!outputNodes.length && <div className="empty-state">Add a Chart, Table, or Export module and connect its input.</div>}
        {outputNodes.map(node => { const result = run?.nodes[node.id]; const values = result?.inputs.map(({ edge, data }) => ({ label: `${edge.source} / ${edge.sourcePort}`, data })) ?? []; return <section className="output-card" key={node.id}><div className="panel-header"><div><span className="tiny-label">{WORKBENCH_MODULES[node.type].title.toUpperCase()} OUTPUT</span><h2>{node.title}</h2></div><button className="text-button" onClick={() => selectNode(node.id)}>Configure ↗</button></div>{result?.state !== "ready" ? <p className="module-error">{result?.error ?? "Waiting for calculation."}</p> : <>{node.type === "export" && <p className="result-note">CSV contains values and quality states. JSON also includes the complete graph, parameters, and source datasets for reproduction.</p>}{values.map(({ label, data }, i) => <div key={i}><div className="result-tools"><span>{label}</span><button onClick={() => download(`${node.id}-${i}.csv`, toCsv(dataRows(data)), "text/csv")}>CSV ↓</button></div><DataView data={data} mode={node.type === "chart" ? "chart" : "table"}/></div>)}<div className="output-foot"><button onClick={() => exportJson(node, values)}>Results + project JSON ↓</button></div></>}</section>; })}
      </div> : <section className="output-card inspection"><div className="panel-header"><div><span className="tiny-label">INTERMEDIATE DATA</span><h2>{dataset?.name ?? selectedNode?.title ?? "Select a module"}</h2></div><div className="toolbar"><button onClick={() => setPreviewMode("table")}>Table</button><button onClick={() => setPreviewMode("chart")}>Chart</button></div></div>{dataset ? <><DataView data={dataset}/><div className="output-foot"><button onClick={() => download(`${dataset.id}.csv`, toCsv(dataset.rows), "text/csv")}>Download dataset CSV ↓</button></div></> : selectedResult?.state !== "ready" ? <p className="empty-state">{selectedResult?.error ?? "Click any canvas module to inspect its data."}</p> : selectedValues.map(({ label, data }) => <div key={label}><div className="result-tools"><span>{label}</span><button onClick={() => download(`${selected}-${label}.csv`, toCsv(dataRows(data)), "text/csv")}>CSV ↓</button></div><DataView data={data} mode={previewMode}/></div>)}</section>}
      <footer className="main-foot">Streamweave / numerical workbench <span>Time alignment is explicit. Synthetic examples demonstrate mechanics.</span></footer>
    </main>
    <div className="inspector-column">{selectedNode ? <><Inspector node={selectedNode} result={selectedResult} datasets={project.datasets} update={updateParam} rename={title => updateGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === selected ? { ...n, title } : n) }))} duplicate={() => duplicateNode(selectedNode)} remove={() => removeNode(selectedNode.id)}/><div className="connection-list"><span className="tiny-label">CONNECTIONS</span>{graph.edges.filter(e => e.target === selected || e.source === selected).map(e => <div key={e.id}><span>{graph.nodes.find(n => n.id === e.source)?.title} / {e.sourcePort}<br/>→ {graph.nodes.find(n => n.id === e.target)?.title} / {e.targetPort}</span><button aria-label={`Disconnect ${e.id}`} title="Disconnect" onClick={() => updateGraph(g => ({ ...g, edges: g.edges.filter(x => x.id !== e.id) }))}>×</button></div>)}<button className="text-button" onClick={() => { setView("inspect"); setDatasetPreview(null); }}>Inspect this module’s data ↓</button></div></> : <div className="inspector-placeholder"><span className="tiny-label">INSPECTOR</span><h2>Select a module</h2><p>Configure its parameters, inspect intermediate data, or duplicate it into another branch.</p></div>}</div>
  </div>;
}
