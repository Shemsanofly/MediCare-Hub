interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: 'primary' | 'secondary' | 'accent';
}

const accentClasses = {
  primary: 'border-primary/20 bg-primary-50 text-primary',
  secondary: 'border-secondary/20 bg-secondary-50 text-secondary',
  accent: 'border-accent/20 bg-accent-50 text-accent',
};

const StatCard = ({ title, value, subtitle, icon, accent = 'primary' }: StatCardProps) => (
  <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
        {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
      </div>
      {icon && (
        <div className={`rounded-lg border p-2.5 ${accentClasses[accent]}`}>{icon}</div>
      )}
    </div>
  </div>
);

export default StatCard;
