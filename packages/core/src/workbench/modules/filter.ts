import { defineModule, input, output, inputValue } from "../moduleDefinition.js";
import { type Cell } from "../data.js";

export const filter = defineModule({
  title: "Filter rows",
  category: "Process",
  description: "Keep rows matching a column condition. Gaps remain explicit downstream.",
  inputs: [input("data", ["table"])],
  outputs: [output("data", "table")],
  parameters: [
    { key: "column", label: "Filter column", kind: "column", from: { input: "data" }, default: "" },
    {
      key: "operator",
      label: "Condition",
      kind: "choice",
      default: "gte",
      options: [
        { value: "gte", label: "Greater than or equal" },
        { value: "lte", label: "Less than or equal" },
        { value: "eq", label: "Equals" },
        { value: "present", label: "Is present" },
      ],
    },
    {
      key: "value",
      label: "Comparison value",
      kind: "text",
      default: "0",
      visibleWhen: (params) => params.operator !== "present",
    },
  ],
  evaluate(context) {
    const table = inputValue(context, "data", ["table"]);
    const { params } = context.node;
    const column = table.columns.find((column) => column.key === params.column);
    if (!column) throw new Error("Choose a filter column.");
    const numericComparison = params.operator === "gte" || params.operator === "lte";
    if (
      numericComparison &&
      (column.type !== "number" ||
        !String(params.value ?? "").trim() ||
        !Number.isFinite(Number(params.value)))
    )
      throw new Error("Numeric comparison needs a numeric column and value.");
    const rows = table.rows.filter((row) =>
      matches(row[column.key], String(params.operator), String(params.value ?? "")),
    );
    return { data: { ...table, rows } };
  },
});
function matches(value: Cell | undefined, operator: string, expected: string) {
  if (value == null) return false;
  switch (operator) {
    case "present":
      return true;
    case "eq":
      return String(value) === expected;
    case "gte":
      return Number(value) >= Number(expected);
    case "lte":
      return Number(value) <= Number(expected);
    default:
      return false;
  }
}
