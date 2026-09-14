'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const EMPTY_VALUE = '__house_empty__';

export default function HouseSelect({
  value,
  placeholder,
  options,
  disabled,
  ariaLabel,
  className,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: Array<string | { value: string; label: string }>;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  const items = options.map((option) => typeof option === 'string'
    ? { value: option, label: option }
    : option);
  const selectedLabel = items.find((item) => item.value === value)?.label;
  return (
    <Select
      disabled={disabled}
      value={value || EMPTY_VALUE}
      onValueChange={(next) => onChange(next === EMPTY_VALUE ? '' : String(next))}
    >
      <SelectTrigger
        aria-label={ariaLabel || placeholder}
        className={cn('house-select-trigger', className)}
      >
        <span className="house-select-value">{selectedLabel || value || placeholder}</span>
      </SelectTrigger>
      <SelectContent className="house-select-content" align="end">
        <SelectItem value={EMPTY_VALUE}>{placeholder}</SelectItem>
        {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
