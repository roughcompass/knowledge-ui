import { FormField, FormFieldHelperText, FormFieldLabel } from '@salt-ds/core';
import type { ReactNode } from 'react';

/**
 * One labelled, validatable control in a form.
 *
 * `FilterField` looks like this and is deliberately not this. That component
 * requires a `basis` because a filter row lays controls out side by side and
 * `FormField` is `width: 100%`; it also has no notion of validation, because a
 * filter cannot be invalid — it either matches rows or it does not. A form needs
 * the opposite defaults: full width, and a place for the server to put a message.
 *
 * Exists in ui-kit rather than beside the first form because ESLint bans raw
 * `input`, `select` and `label` in `apps/**` and `remotes/**`, so every control has
 * to come from Salt or from here — and without this, each page would re-derive the
 * wiring between an error message and the field it belongs to.
 *
 * `error` is a plain string, taking one message rather than the array
 * `fieldErrors()` returns. A field with three simultaneous complaints is a field
 * whose first complaint should be fixed; showing all three is noise. The caller
 * joins or picks.
 *
 * ## Known gap: Salt sets no `aria-invalid`
 *
 * `validationStatus="error"` gets two of the three things an invalid field needs.
 * Salt marks the control visually and links the message through `aria-describedby`,
 * so a screen reader focusing the field does hear what is wrong. It does **not** set
 * `aria-invalid="true"` — verified against a rendered field, whose only attributes
 * are `aria-describedby`, `aria-labelledby` and `required`.
 *
 * The practical cost is that assistive technology cannot enumerate or jump between
 * invalid fields, only discover them one focus at a time. Not closed here because the
 * fix would mean `cloneElement`-ing an arbitrary child to inject the attribute, and
 * where Salt lands an unknown prop — the wrapper or the inner `input` — differs by
 * component. Left visible rather than papered over; worth raising upstream.
 */
export function FormRow({
  label,
  error,
  helperText,
  required = false,
  children,
}: {
  label: string;
  /** A server-side message for this field. Its presence sets the error status. */
  error?: string;
  /** Standing guidance, shown when there is no error to show instead. */
  helperText?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <FormField
      // Salt paints the control's border and the helper text from this, so passing
      // it is what makes an invalid field look invalid — the message alone would
      // leave the input itself unmarked.
      validationStatus={error === undefined ? undefined : 'error'}
      necessity={required ? 'required' : undefined}
    >
      <FormFieldLabel>{label}</FormFieldLabel>
      {children}
      {/*
        The error replaces the guidance rather than stacking under it. Once the
        server has said what is wrong, restating what *would* have been acceptable
        pushes the actual problem further from the control.
      */}
      {error !== undefined ? (
        <FormFieldHelperText>{error}</FormFieldHelperText>
      ) : helperText !== undefined ? (
        <FormFieldHelperText>{helperText}</FormFieldHelperText>
      ) : null}
    </FormField>
  );
}
