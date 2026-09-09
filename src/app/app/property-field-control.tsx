'use client';

import { Input } from '@/components/ui/input';
import { DECORATION_OPTIONS, LIFT_OPTIONS, normalizedLift } from '@/lib/model';

export default function PropertyFieldControl({
  field,
  label,
  value,
  disabled,
  ariaLabel,
  onChange,
}: {
  field: string;
  label: string;
  value: string;
  disabled?: boolean;
  ariaLabel?: string;
  onChange: (value: string) => void;
}) {
  if (field === 'decoration' || field === 'lift') {
    const selected = field === 'lift' ? normalizedLift(value) : value;
    const options = field === 'decoration' ? DECORATION_OPTIONS : LIFT_OPTIONS;
    return (
      <select
        className="location-select"
        disabled={disabled}
        aria-label={ariaLabel}
        value={selected}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">请选择{label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Input
      disabled={disabled}
      aria-label={ariaLabel}
      value={value}
      inputMode={['area', 'unitPrice'].includes(field) ? 'decimal' : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
