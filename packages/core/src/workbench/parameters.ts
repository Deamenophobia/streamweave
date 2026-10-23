import { numeric } from "./data.js";

export type Parameters = Record<string, string | number>;
type BaseParameter = {
  key: string;
  label: string;
  visibleWhen?: (params: Parameters) => boolean;
};
export type ColumnSource = { dataset: string } | { input: string };
export type ParameterDefinition = BaseParameter &
  (
    | {
        kind: "number";
        default: number;
        min: number;
        max: number | { parameter: string };
        integer?: boolean;
        displayScale?: number;
      }
    | { kind: "text"; default: string; maxLength?: number }
    | { kind: "choice"; default: string; options: { value: string; label: string }[] }
    | { kind: "dataset"; default: string }
    | { kind: "column"; default: string; from: ColumnSource; numericOnly?: boolean }
  );

export function parameterMaximum(
  field: Extract<ParameterDefinition, { kind: "number" }>,
  params: Parameters,
) {
  return typeof field.max === "number" ? field.max : Number(params[field.max.parameter]);
}

export function validateParameters(fields: ParameterDefinition[], params: Parameters) {
  for (const field of fields) {
    if (field.kind === "number") {
      const value = numeric(
        params[field.key],
        field.key,
        field.min,
        parameterMaximum(field, params),
      );
      if (field.integer && !Number.isSafeInteger(value))
        throw new Error(`${field.key} must be an integer.`);
    }
    if (
      field.kind === "choice" &&
      !field.options.some((option) => option.value === params[field.key])
    )
      throw new Error(`Unknown ${field.key}: ${String(params[field.key])}.`);
  }
}

export function valueSelection(from: ColumnSource): ParameterDefinition[] {
  return [
    { key: "column", label: "Value column", kind: "column", from, default: "", numericOnly: true },
    { key: "label", label: "Series label", kind: "text", default: "" },
    { key: "unit", label: "Unit", kind: "text", default: "" },
  ];
}

export function pairedColumns(): ParameterDefinition[] {
  return ["x", "y"].map((key) => ({
    key,
    label: `${key.toUpperCase()} column`,
    kind: "column",
    from: { input: "frame" },
    default: "",
    numericOnly: true,
  }));
}

export function windowParameters(
  window: number,
  minimum: number,
  lowerBound = 1,
): ParameterDefinition[] {
  return [
    {
      key: "window",
      label: "Window (observations)",
      kind: "number",
      default: window,
      min: Math.max(2, lowerBound),
      max: 1000,
      integer: true,
    },
    {
      key: "minimum",
      label: "Minimum valid samples",
      kind: "number",
      default: minimum,
      min: lowerBound,
      max: { parameter: "window" },
      integer: true,
    },
  ];
}
