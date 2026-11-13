import { Radio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import type { ReactNode } from "react";

export interface RadioOption<Value extends string> {
  readonly value: Value;
  readonly label: ReactNode;
}

export interface RadioGroupProps<Value extends string> {
  /** The group's accessible name. */
  readonly label: string;
  readonly options: readonly RadioOption<Value>[];
  readonly value: Value;
  readonly onValueChange: (value: Value) => void;
  /** Layout of the row or grid the options sit in. */
  readonly className?: string;
  /** Added to each option's box, for a size or a type scale. */
  readonly optionClassName?: string;
}

/**
 * One choice from a few, kept on this device. Tab enters the group once, and arrow keys move and
 * choose: nothing is written anywhere a stray arrow press could hurt, so trying each option with
 * the arrows is the point. One option is always chosen.
 */
export function RadioGroup<Value extends string>({
  label,
  options,
  value,
  onValueChange,
  className,
  optionClassName,
}: RadioGroupProps<Value>) {
  return (
    <BaseRadioGroup<Value> aria-label={label} value={value} onValueChange={onValueChange} className={className}>
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className={`flex min-h-[var(--tap-row)] items-center justify-center rounded border border-edge font-semibold text-tx2 select-none data-[checked]:border-accent data-[checked]:text-accent ${optionClassName ?? ""}`}
        >
          {option.label}
        </Radio.Root>
      ))}
    </BaseRadioGroup>
  );
}
