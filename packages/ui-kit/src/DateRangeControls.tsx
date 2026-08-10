import { Dropdown, Input, Option, StackLayout, Text } from '@salt-ds/core';
import type { ChangeEvent } from 'react';

import { FilterField, popoverOverlayProps } from './FilterBar';
import { PERIODS, customRangeProblem, periodLabel, todayAsDay } from './dateRange';
import type { PeriodId, WindowSelection } from './dateRange';

/**
 * The controls that change a window: a preset picker, plus two dates when the preset
 * is `custom`.
 *
 * One definition, two places. The page's filter row renders it and so does the
 * overlay behind every range in a section header, and they are the same markup bound
 * to the same state — so a reader who opens the overlay from a table header sees
 * exactly the control that sits at the top of the page, already showing what is
 * selected. Two hand-kept copies would be the thing that disagrees.
 *
 * Stateless on purpose. The page owns the selection because the window governs every
 * panel on it; a control holding its own copy is how one panel ends up on a different
 * window from its neighbour.
 */
export function DateRangeControls({
  value,
  onChange,
  layout = 'row',
}: {
  value: WindowSelection;
  onChange: (next: WindowSelection) => void;
  /**
   * `row` for the page's filter bar, `stack` inside the overlay, where the panel is
   * narrower than three controls side by side.
   */
  layout?: 'row' | 'stack';
}) {
  const today = todayAsDay();
  const problem =
    value.periodId === 'custom' ? customRangeProblem(value.custom.from, value.custom.to) : null;

  const selectPeriod = (next: PeriodId) => {
    /*
     * Switching to custom seeds the fields from the range on screen, so the control
     * opens on something valid rather than on two empty inputs and four panels with
     * nothing in them.
     */
    if (next === 'custom' && value.custom.from === '' && value.custom.to === '') {
      onChange({ periodId: next, custom: value.custom });
      return;
    }
    onChange({ ...value, periodId: next });
  };

  const setCustom = (part: Partial<{ from: string; to: string }>) =>
    onChange({ ...value, custom: { ...value.custom, ...part } });

  const fields = (
    <>
      <FilterField label="Window" basis={layout === 'row' ? '17rem' : '100%'}>
        <Dropdown
          bordered
          value={periodLabel(value.periodId)}
          onSelectionChange={(_e, chosen) => selectPeriod((chosen?.[0] as PeriodId) ?? '7d')}
          OverlayProps={popoverOverlayProps}
        >
          {PERIODS.map((period) => (
            <Option key={period.id} value={period.id}>
              {period.label}
            </Option>
          ))}
        </Dropdown>
      </FilterField>

      {/*
        The two date fields appear only for the custom period. A pair of inputs
        sitting permanently beside a preset control reads as two competing ways to say
        the same thing, and this console has one idiom per interaction.

        `Input` with a native date type rather than a date-picker component: this app
        installs only Salt's core package, and the browser's own picker brings
        keyboard handling, locale formatting and a calendar a hand-rolled one would
        have to reimplement. `max` is today because no service here has future days,
        and binding the pair to each other stops an inverted range being reachable
        through the calendar at all.
      */}
      {value.periodId === 'custom' ? (
        <>
          <FilterField label="Start date" basis={layout === 'row' ? '11rem' : '100%'}>
            <Input
              bordered
              value={value.custom.from}
              inputProps={{ type: 'date', max: value.custom.to === '' ? today : value.custom.to }}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setCustom({ from: event.target.value })
              }
            />
          </FilterField>
          <FilterField label="End date" basis={layout === 'row' ? '11rem' : '100%'}>
            <Input
              bordered
              value={value.custom.to}
              inputProps={{ type: 'date', min: value.custom.from, max: today }}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setCustom({ to: event.target.value })
              }
            />
          </FilterField>
        </>
      ) : null}
    </>
  );

  if (layout === 'row') return fields;

  return (
    <StackLayout gap={1}>
      {fields}
      {/*
        Stated inside the overlay as well as on the page. A reader who opened this
        from a table header, cleared a date and saw nothing change needs the reason
        where they are looking, not only at the top of the page.
      */}
      {problem !== null ? (
        <Text styleAs="notation" color="secondary">
          {`${problem} The panels still show the previous range.`}
        </Text>
      ) : null}
    </StackLayout>
  );
}
