interface FilterOption {
  value: string;
  label: string;
}

interface AdminFilterBarProps {
  filters: Array<{
    id: string;
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
  }>;
}

const AdminFilterBar = ({ filters }: AdminFilterBarProps) => (
  <div className="flex flex-wrap gap-3">
    {filters.map((filter) => (
      <div key={filter.id} className="min-w-[160px]">
        <label htmlFor={filter.id} className="mb-1 block text-xs font-medium text-gray-500">
          {filter.label}
        </label>
        <select
          id={filter.id}
          value={filter.value}
          onChange={(event) => filter.onChange(event.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    ))}
  </div>
);

export default AdminFilterBar;
