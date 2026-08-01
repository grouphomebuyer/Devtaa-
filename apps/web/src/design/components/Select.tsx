import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../cn';
import { useFieldProps } from './FormField';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
  group?: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: readonly SelectOption[];
  invalid?: boolean;
  selectSize?: 'sm' | 'md';
  placeholder?: string;
}

/**
 * A native `<select>`, deliberately: it is keyboard- and screen-reader-correct
 * on every platform, and it is what a 55-year-old accountant expects. Rich
 * search-as-you-type pickers (MasterPicker) are a separate component.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, invalid, selectSize = 'md', placeholder, className, ...rest },
  ref,
) {
  // Adopts the id / aria-describedby / aria-invalid of an enclosing FormField.
  const field = useFieldProps();
  const isInvalid = invalid ?? field.invalid;
  const groups = new Map<string, SelectOption[]>();
  const ungrouped: SelectOption[] = [];
  for (const option of options) {
    if (option.group) {
      const bucket = groups.get(option.group) ?? [];
      bucket.push(option);
      groups.set(option.group, bucket);
    } else {
      ungrouped.push(option);
    }
  }

  return (
    <div className="relative">
      <select
        ref={ref}
        id={field.id}
        aria-describedby={field['aria-describedby']}
        aria-invalid={isInvalid || undefined}
        className={cn(
          'w-full appearance-none rounded border border-line-strong bg-surface pr-7 text-content',
          'transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/35',
          'disabled:cursor-not-allowed disabled:bg-surface-inset disabled:text-content-tertiary',
          selectSize === 'sm' ? 'h-7 pl-2 text-xs' : 'h-8 pl-2.5 text-dense',
          isInvalid && 'border-danger focus:border-danger focus:ring-danger/30',
          className,
        )}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {ungrouped.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {[...groups.entries()].map(([group, items]) => (
          <optgroup key={group} label={group}>
            {items.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary"
      />
    </div>
  );
});
