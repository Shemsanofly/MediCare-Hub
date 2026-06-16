import type { CSSProperties, ReactNode } from 'react';

export type ChartConfig = Record<
  string,
  {
    label: string;
    color: string;
  }
>;

interface ChartContainerProps {
  config: ChartConfig;
  className?: string;
  children: ReactNode;
}

export const ChartContainer = ({ config, className = '', children }: ChartContainerProps) => {
  const style = Object.entries(config).reduce<Record<string, string>>((vars, [key, item]) => {
    vars[`--color-${key}`] = item.color;
    return vars;
  }, {});

  return (
    <div
      className={`min-h-[240px] w-full text-xs text-gray-500 ${className}`}
      style={style as CSSProperties}
    >
      {children}
    </div>
  );
};

interface ChartPayloadItem {
  dataKey?: unknown;
  name?: unknown;
  value?: unknown;
  color?: string;
  fill?: string;
}

interface ChartTooltipContentProps {
  active?: boolean;
  payload?: readonly ChartPayloadItem[];
  label?: string | number;
  config: ChartConfig;
  valueFormatter?: (value: string | number) => string;
}

export const ChartTooltipContent = ({
  active,
  payload,
  label,
  config,
  valueFormatter,
}: ChartTooltipContentProps) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-36 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-lg">
      {label ? <p className="mb-1 font-medium text-gray-900">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? '');
          const chartItem = config[key];
          const value = item.value ?? 0;
          const displayValue = typeof value === 'string' || typeof value === 'number' ? value : String(value);
          const color = item.color ?? item.fill ?? chartItem?.color ?? '#1B4F8C';

          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-[2px]"
                  style={{ backgroundColor: color }}
                />
                <span className="text-gray-500">{chartItem?.label ?? key}</span>
              </div>
              <span className="font-medium text-gray-900">
                {valueFormatter ? valueFormatter(displayValue) : displayValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
