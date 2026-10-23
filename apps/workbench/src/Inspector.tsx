import {
  WORKBENCH_MODULES,
  type WorkbenchNode,
  type Dataset,
  type NodeResult,
} from "@streamweave/core";
import { ParameterFields } from "./ParameterFields";

type Props = {
  node: WorkbenchNode;
  result?: NodeResult;
  datasets: Dataset[];
  update: (key: string, value: string | number) => void;
  rename: (value: string) => void;
  duplicate: () => void;
  remove: () => void;
};

export function Inspector({ node, result, datasets, update, rename, duplicate, remove }: Props) {
  const spec = WORKBENCH_MODULES[node.type];
  return (
    <aside className="node-inspector">
      <div className="section-caption">
        CONFIGURE MODULE <span>{node.type}</span>
      </div>
      <label className="field">
        Module name
        <input
          aria-label="Module name"
          maxLength={100}
          value={node.title}
          onChange={(e) => rename(e.target.value)}
        />
      </label>
      <p className="inspector-description">{spec.description}</p>
      {result?.error && (
        <div className="module-error" role="status">
          {result.error}
        </div>
      )}

      <ParameterFields
        fields={spec.parameters}
        context={{ params: node.params, datasets, result }}
        update={update}
      />
      {spec.help && <p className="field-help">{spec.help}</p>}
      <div className="inspector-actions">
        <button onClick={duplicate}>Duplicate module</button>
        <button className="danger-text" onClick={remove}>
          Remove
        </button>
      </div>
      <div className="port-contract">
        <span className="tiny-label">PORT CONTRACT</span>
        {spec.inputs.map((port) => (
          <p key={port.id}>
            ← {port.id}: {port.accepts.join(" / ")}
            {port.multiple ? " · multiple inputs" : ""}
          </p>
        ))}
        {spec.outputs.map((port) => (
          <p key={port.id}>
            → {port.id}: {port.accepts.join(" / ")}
          </p>
        ))}
      </div>
    </aside>
  );
}
