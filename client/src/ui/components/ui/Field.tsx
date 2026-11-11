import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentProps } from "react";

/**
 * The text field every form in the app is built from, wrapped once so Base UI is imported here and
 * nowhere else, and so two inputs on one screen can't end up a pixel apart.
 *
 * The class strings are exported for the one place that sets a note beside a field's own
 * description, outside any `Field.Root`.
 */
export const FIELD_LABEL = "block text-meta font-semibold text-tx2";
const FIELD_INPUT =
  "mt-[var(--sp-1)] block min-h-[var(--tap-row)] w-full rounded border border-line2 " +
  "bg-s1 px-[var(--sp-3)] text-body text-tx";
export const FIELD_DESCRIPTION = "mt-[var(--sp-1)] text-meta text-tx3";
const FIELD_ERROR = "mt-[var(--sp-1)] text-meta font-semibold text-dang";

type WithoutClass<P> = Omit<P, "className">;

export const FieldRoot = BaseField.Root;

export function FieldLabel(props: WithoutClass<ComponentProps<typeof BaseField.Label>>) {
  return <BaseField.Label {...props} className={FIELD_LABEL} />;
}

export function FieldControl(props: WithoutClass<ComponentProps<typeof BaseField.Control>>) {
  return <BaseField.Control {...props} className={FIELD_INPUT} />;
}

export function FieldDescription(props: WithoutClass<ComponentProps<typeof BaseField.Description>>) {
  return <BaseField.Description {...props} className={FIELD_DESCRIPTION} />;
}

export function FieldError(props: WithoutClass<ComponentProps<typeof BaseField.Error>>) {
  return <BaseField.Error {...props} className={FIELD_ERROR} />;
}
