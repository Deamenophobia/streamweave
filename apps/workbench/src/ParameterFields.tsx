import { parameterMaximum, type ParameterDefinition } from "@streamweave/core";
import { parameterOptions, type ParameterContext } from "./parameterOptions";

type ControlProps = {
  field: ParameterDefinition;
  context: ParameterContext;
  update: (key: string, value: string | number) => void;
};

function ParameterControl({ field, context, update }: ControlProps) {
  const value = context.params[field.key];
  if (field.kind === "number") {
    const scale = field.displayScale ?? 1;
    return (
      <input
        aria-label={field.label}
        type="number"
        min={field.min / scale}
        max={parameterMaximum(field, context.params) / scale}
        step={field.integer ? 1 / scale : "any"}
        value={Number(value) / scale}
        onChange={(event) => update(field.key, Number(event.target.value) * scale)}
      />
    );
  }
  if (field.kind === "text")
    return (
      <input
        aria-label={field.label}
        maxLength={field.maxLength ?? 120}
        value={String(value ?? "")}
        onChange={(event) => update(field.key, event.target.value)}
      />
    );
  return (
    <select
      aria-label={field.label}
      value={String(value ?? "")}
      onChange={(event) => update(field.key, event.target.value)}
    >
      <option value="">Choose…</option>
      {parameterOptions(field, context).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function ParameterFields({
  fields,
  context,
  update,
}: Omit<ControlProps, "field"> & { fields: ParameterDefinition[] }) {
  return (
    <>
      {fields
        .filter((field) => !field.visibleWhen || field.visibleWhen(context.params))
        .map((field) => (
          <label className="field" key={field.key}>
            {field.label}
            <ParameterControl field={field} context={context} update={update} />
          </label>
        ))}
    </>
  );
}
