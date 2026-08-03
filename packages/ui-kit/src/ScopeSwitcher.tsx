import { Avatar, Dropdown, FlexLayout, Option, StackLayout, Text } from '@salt-ds/core';

import { popoverOverlayProps } from './FilterBar';
import styles from './ScopeSwitcher.module.css';

/**
 * The scope switcher that sits at the top of the navigation rail.
 *
 * Deliberately not a labelled form field. It used to be a bare `Dropdown` in the
 * rail footer, which rendered as a 231px-wide bordered select — correct for a form
 * and wrong for chrome, where the reference uses a borderless block with an avatar
 * and a chevron that fills on hover.
 *
 * Also moved from the footer to the header, because that is where the reference
 * puts the thing you are scoped *to*. The footer keeps the ambient session
 * readouts — connectivity and appearance — which are status, not identity.
 */

export interface ScopeOption {
  key: string;
  label: string;
  description?: string;
}

export function ScopeSwitcher({
  options,
  currentKey,
  onChange,
  label,
}: {
  options: readonly ScopeOption[];
  currentKey: string | undefined;
  onChange: (key: string) => void;
  /** Accessible name. There is no visible label — see the stylesheet. */
  label: string;
}) {
  if (options.length === 0) return null;

  const current = options.find((o) => o.key === currentKey);

  return (
    <div className={styles.switcher}>
      <Dropdown
        aria-label={label}
        value={current?.label ?? ''}
        onSelectionChange={(_event, selected) => {
          const key = selected?.[0];
          if (key && key !== currentKey) onChange(key);
        }}
        // The avatar is the reference's scope marker. `size` is a multiplier of
        // `--salt-size-base`, not a token name, so 0.6 gives roughly 22px at this
        // density — enough to read as an identity without crowding the label.
        startAdornment={<Avatar size={0.6} name={current?.label ?? label} />}
        // Neutral panel chrome. Salt outlines an open menu in the accent colour,
        // which on a scope switcher in the rail is the loudest thing on screen.
        OverlayProps={popoverOverlayProps}
      >
        {options.map((option) => (
          <Option key={option.key} value={option.key}>
            <StackLayout gap={0}>
              <Text>{option.label}</Text>
              {option.description !== undefined ? (
                <Text styleAs="notation" color="secondary">
                  {option.description}
                </Text>
              ) : null}
            </StackLayout>
          </Option>
        ))}
      </Dropdown>
    </div>
  );
}

/**
 * The rail's brand line: wordmark and a scope badge, on one row.
 *
 * Separate from the switcher so a build without a switchable scope still has a
 * header — the roster is empty in production, where `ScopeSwitcher` renders
 * nothing at all.
 */
export function RailBrand({ name, badge }: { name: string; badge?: React.ReactNode }) {
  return (
    <FlexLayout gap={2} align="center" justify="space-between">
      <Text styleAs="h4" as="span">
        {name}
      </Text>
      {badge}
    </FlexLayout>
  );
}
