'use client';

import { Input } from '@/components/ui/input';
import HouseSelect from '@/components/house-select';
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
    return <HouseSelect className="location-select" disabled={disabled} ariaLabel={ariaLabel} value={selected} placeholder={`请选择${label}`} options={[...options]} onChange={onChange} />;
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
