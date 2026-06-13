interface PasswordStrengthIndicatorProps {
  password: string;
}

interface StrengthLevel {
  score: number;
  label: string;
  color: string;
}

const calculateStrength = (password: string): StrengthLevel => {
  if (!password) {
    return { score: 0, label: 'Enter a password', color: 'bg-gray-200' };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) {
    return { score: 1, label: 'Weak', color: 'bg-red-500' };
  }
  if (score <= 3) {
    return { score: 2, label: 'Fair', color: 'bg-accent' };
  }
  if (score <= 4) {
    return { score: 3, label: 'Good', color: 'bg-secondary' };
  }
  return { score: 4, label: 'Strong', color: 'bg-secondary-600' };
};

/** Visual password strength meter for registration. */
const PasswordStrengthIndicator = ({ password }: PasswordStrengthIndicatorProps) => {
  const strength = calculateStrength(password);
  const segments = 4;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {Array.from({ length: segments }).map((_, index) => (
          <div
            key={index}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              index < strength.score ? strength.color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-500">
        Password strength: <span className="font-medium">{strength.label}</span>
      </p>
    </div>
  );
};

export default PasswordStrengthIndicator;
