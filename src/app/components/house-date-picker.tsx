'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { zhCN } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

function parseDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function dateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function HouseDatePicker({
  value,
  onChange,
  disabled,
  ariaLabel,
  placeholder = '请选择日期',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDate(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={ariaLabel || placeholder}
        className={cn('house-date-trigger', className)}
      >
        <span>{selected ? value.replaceAll('-', '/') : placeholder}</span>
        <CalendarDays aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="house-date-popover" align="end" sideOffset={8}>
        <Calendar
          mode="single"
          locale={zhCN}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(dateValue(date));
            setOpen(false);
          }}
        />
        <button className="house-date-clear" type="button" onClick={() => { onChange(''); setOpen(false); }}>
          清除日期
        </button>
      </PopoverContent>
    </Popover>
  );
}
