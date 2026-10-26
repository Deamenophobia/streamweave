import type { Dataset } from "@streamweave/core";

export function DatasetSchema({ dataset }: { dataset: Dataset }) {
  return (
    <div className="data-view schema-table">
      <div className="data-scroll">
        <table>
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th>Unit</th>
              <th>Missing cells</th>
            </tr>
          </thead>
          <tbody>
            {dataset.columns.map((column) => (
              <tr key={column.key}>
                <td>{column.label}</td>
                <td>{column.type}</td>
                <td>{column.unit ?? "—"}</td>
                <td>
                  {dataset.rows.reduce((count, row) => count + Number(row[column.key] == null), 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="result-note">
        Assign a value column and unit on each source module. The imported dataset remains reusable.
      </p>
    </div>
  );
}
