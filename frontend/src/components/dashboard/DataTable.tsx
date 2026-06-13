interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T extends object> {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
}

const DataTable = <T extends object>({
  columns,
  rows,
  emptyMessage = 'No data available.',
}: DataTableProps<T>) => {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-gray-500">{emptyMessage}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 font-medium">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={String((row as { id?: string }).id ?? index)}
              className="border-t border-gray-100"
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-gray-800">
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
