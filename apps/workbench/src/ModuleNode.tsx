import { moduleIcons } from "./modulePresentation";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { WORKBENCH_MODULES, type WorkbenchNode } from "@streamweave/core";

export type VisualNode = Node<{ module: WorkbenchNode; state: string; detail: string }, "module">;

export function ModuleNode({ data, selected }: NodeProps<VisualNode>) {
  const node = data.module;
  const spec = WORKBENCH_MODULES[node.type];
  return (
    <div
      className={`flow-module category-${spec.category.toLowerCase()} ${selected ? "selected" : ""}`}
    >
      <div className="node-eyebrow">
        <span>{spec.category}</span>
        <i className={`node-state ${data.state}`} title={data.state} />
      </div>
      <div className="node-title">
        <span>{moduleIcons[node.type]}</span>
        <strong title={node.title}>{node.title}</strong>
      </div>
      <div className="node-detail" title={data.detail}>
        {data.detail}
      </div>
      {spec.inputs.map((port, index) => (
        <div key={port.id}>
          <Handle
            type="target"
            position={Position.Left}
            id={port.id}
            style={{ top: 94 + index * 21 }}
            aria-label={`${node.title} input ${port.id}`}
          />
          <span className="port-name input-port" style={{ top: 88 + index * 21 }}>
            {port.id}
            {port.multiple ? " +" : ""}
          </span>
        </div>
      ))}
      {spec.outputs.map((port, index) => (
        <div key={port.id}>
          <Handle
            type="source"
            position={Position.Right}
            id={port.id}
            style={{ top: 94 + index * 21 }}
            aria-label={`${node.title} output ${port.id}`}
          />
          <span className="port-name output-port" style={{ top: 88 + index * 21 }}>
            {port.id}
          </span>
        </div>
      ))}
    </div>
  );
}

export const nodeTypes = { module: ModuleNode };
