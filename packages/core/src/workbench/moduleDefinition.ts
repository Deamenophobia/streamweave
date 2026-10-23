import type { Dataset, DataValue } from "./data.js";
import type { NodeResult, Port, WorkbenchNode } from "./contracts.js";
import { validateParameters, type ParameterDefinition, type Parameters } from "./parameters.js";

export type ModuleContext = {
  node: WorkbenchNode;
  inputs: NodeResult["inputs"];
  datasets: ReadonlyMap<string, Dataset>;
};
export interface ModuleDefinition {
  title: string;
  category: "Data" | "Process" | "Analyze" | "Output";
  description: string;
  inputs: Port[];
  outputs: Port[];
  parameters: ParameterDefinition[];
  defaults: Parameters;
  help?: string;
  evaluate: (context: ModuleContext) => Record<string, DataValue>;
}

export function defineModule(definition: Omit<ModuleDefinition, "defaults">): ModuleDefinition {
  return {
    ...definition,
    defaults: Object.fromEntries(definition.parameters.map((field) => [field.key, field.default])),
  };
}

export const input = (
  id: string,
  accepts: DataValue["kind"][],
  multiple = false,
  minimum = 1,
): Port => ({ id, label: id, accepts, multiple, minimum });
export const output = (id: string, kind: DataValue["kind"]): Port => ({
  id,
  label: id,
  accepts: [kind],
});

export function inputValue<K extends DataValue["kind"]>(
  context: ModuleContext,
  port: string,
  kinds: readonly K[],
): Extract<DataValue, { kind: K }> {
  const value = context.inputs.find(({ edge }) => edge.targetPort === port)?.data;
  if (!value || !kinds.some((kind) => kind === value.kind))
    throw new Error(`Expected ${kinds.join(" / ")} on ${port}.`);
  return value as Extract<DataValue, { kind: K }>;
}

function finiteValues(data: DataValue): boolean {
  const finite = (value: unknown) => typeof value !== "number" || Number.isFinite(value);
  if (data.kind === "series") return data.points.every((point) => finite(point.value));
  if (data.kind === "frame")
    return data.rows.every((row) => Object.values(row.values).every(finite));
  return data.rows.every((row) => Object.values(row).every(finite));
}

/** Shared contract checks keep module evaluators independent of graph scheduling. */
export function runModule(definition: ModuleDefinition, context: ModuleContext) {
  for (const port of definition.inputs) {
    const values = context.inputs.filter(({ edge }) => edge.targetPort === port.id);
    if (values.length < (port.minimum ?? 1))
      throw new Error(
        `Connect ${port.minimum ?? 1}${port.multiple ? " or more" : ""} ${port.accepts.join(" / ")} input${(port.minimum ?? 1) > 1 ? "s" : ""} to ${port.label}.`,
      );
    if (!port.multiple && values.length > 1)
      throw new Error(`${port.label} accepts one connection.`);
    if (values.some(({ data }) => !port.accepts.includes(data.kind)))
      throw new Error(`Incompatible data on ${port.label}.`);
  }
  validateParameters(definition.parameters, context.node.params);
  const outputs = definition.evaluate(context);
  for (const [key, data] of Object.entries(outputs)) {
    const port = definition.outputs.find((port) => port.id === key);
    if (!port || !port.accepts.includes(data.kind))
      throw new Error(`Invalid output contract on ${key}.`);
    if (!finiteValues(data))
      throw new Error("Non-finite calculation result. Rescale the input values.");
  }
  return outputs;
}
