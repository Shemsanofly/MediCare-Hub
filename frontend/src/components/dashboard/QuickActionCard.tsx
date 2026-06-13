import { Link } from 'react-router-dom';

interface QuickActionCardProps {
  title: string;
  description: string;
  to: string;
  accent?: 'primary' | 'secondary';
}

const QuickActionCard = ({
  title,
  description,
  to,
  accent = 'primary',
}: QuickActionCardProps) => (
  <Link
    to={to}
    className={`block rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
      accent === 'secondary'
        ? 'border-secondary/20 hover:border-secondary/40'
        : 'border-primary/20 hover:border-primary/40'
    }`}
  >
    <p className="font-semibold text-gray-900">{title}</p>
    <p className="mt-1 text-sm text-gray-500">{description}</p>
  </Link>
);

export default QuickActionCard;
