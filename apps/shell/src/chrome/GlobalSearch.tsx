import { Input, StackLayout, Text } from '@salt-ds/core';
import { SearchIcon } from '@salt-ds/icons';
import { useSearch, type RegistryClient } from '@knowledge-ui/api-client';
import { can, type Session } from '@knowledge-ui/auth';
import { KLink, SuggestionField } from '@knowledge-ui/ui-kit';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

const RECENTS_KEY = 'kui:recent-searches';
const RECENTS_MAX = 5;

/**
 * Search, from anywhere, that answers before you leave the box.
 *
 * The product's whole claim is that a platform group's output is findable. Until this
 * existed, finding anything required first navigating to Catalog: the search box
 * lived inside the thing you were trying to search for.
 *
 * ## It is still a link, and now also a preview
 *
 * Submitting navigates to the catalog's search view, and that has not changed — that
 * view owns the filters, the empty states, the retrieval-arms legend, and a URL
 * carrying the query, so a result found here can be pasted to a colleague. A popover
 * that replaced it would hand back a result nobody could link to.
 *
 * What it adds is a preview: five hits while you type, each a real link. The
 * distinction that keeps this from being a second idiom is that the popover never
 * *answers* — it offers destinations, and the full answer stays one keystroke away
 * at a URL. A reader who knows what they want stops here; a reader who is exploring
 * presses enter.
 *
 * ## One control, two shortcuts, deliberately no palette
 *
 * `/` focuses it, and so does the command shortcut readers arrive expecting. A
 * separate command palette was the obvious thing to build and would have been a
 * second idiom for one job — find a capability — which is the rule this repo has
 * already broken twice. The same box answers both keystrokes.
 *
 * ## Recents are per-persona and per-browser
 *
 * Kept in local storage rather than on the server because no endpoint stores them,
 * and keyed by persona because switching identity changes what a reader can see —
 * a recent search that now returns nothing is worse than no recent at all.
 *
 * ## The panel is links, not a listbox
 *
 * No `aria-expanded`, no `aria-activedescendant`, no listbox roles. An `<input>` has
 * the textbox role, which does not support `aria-expanded` — asserting it is a real
 * accessibility violation, and the axe sweep caught it here on the first run. The
 * full contract belongs to a combobox, which Salt ships; implementing half of it by
 * hand claims semantics that are not delivered, which is worse for a screen reader
 * than a plain field followed by a short list of links. If this ever needs selection
 * semantics, it should become Salt's `ComboBox` rather than grow them.
 *
 * ## Gated, because search is a permission
 *
 * `catalog:search` is a real server gate, so offering the field without it would be
 * an invitation to a refusal. Absent rather than disabled: a disabled search box in
 * the banner of every page advertises something the reader cannot have.
 */
export function GlobalSearch({ session, client }: { session: Session; client: RegistryClient }) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<readonly string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const allowed = can(session, 'catalog:search');

  const storageKey = `${RECENTS_KEY}:${session.personaKey ?? 'unknown'}`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setRecents(JSON.parse(raw) as string[]);
    } catch {
      /* private browsing, or a hand-edited value — start empty */
    }
  }, [storageKey]);

  /*
   * Debounced, so a reader typing a package coordinate does not issue one request
   * per character. Two hundred milliseconds is below the threshold at which a
   * suggestion list feels like it is lagging behind the keyboard.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [value]);

  const suggestions = useSearch(
    client,
    { personaKey: session.personaKey ?? 'unknown', tenantSlug: session.tenantSlug },
    { q: debounced, topK: 5 },
    { enabled: allowed && debounced.length > 1 },
  );

  useEffect(() => {
    if (!allowed) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;

      // The command shortcut works while typing elsewhere; the slash does not,
      // because without that guard it swallowed the slash in a package coordinate
      // and yanked focus out of whatever field was being filled in.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
        return;
      }

      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }

      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || typing) return;
      event.preventDefault();
      inputRef.current?.focus();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allowed]);

  if (!allowed) return null;

  const remember = (query: string) => {
    const next = [query, ...recents.filter((entry) => entry !== query)].slice(0, RECENTS_MAX);
    setRecents(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* the history simply will not outlive the tab */
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    if (query.length === 0) return;
    remember(query);
    setOpen(false);
    navigate(`/catalog?q=${encodeURIComponent(query)}`);
  };

  const hits = (suggestions.data?.items ?? []).slice(0, 5);
  const showRecents = debounced.length <= 1 && recents.length > 0;
  const showPanel = open && (hits.length > 0 || showRecents);

  /*
   * One line about the state of the suggestions, for the moments the panel has no
   * links to offer. Silence after a keystroke is indistinguishable from broken, and
   * the three empty states are different facts needing different words: still
   * fetching, resolved to nothing, and failed. `isFetching` rather than `isPending`,
   * because a query disabled below two characters reports pending forever — a
   * loading line that never resolves would be the same lie as the silence was.
   * With no query and no recents, the field says what typing will do, so the
   * keyboard shortcut lands on an answer rather than on a bare focus ring.
   */
  let status: string | undefined;
  if (open) {
    if (debounced.length > 1) {
      if (suggestions.isError) status = 'Suggestions unavailable — press Enter to search';
      else if (suggestions.isFetching) status = 'Searching…';
      else if (suggestions.isSuccess && hits.length === 0)
        status = 'No capabilities match — press Enter for the full search';
    } else if (!showRecents) {
      status = 'Type to search the catalog';
    }
  }

  const panel = showPanel ? (
    <StackLayout gap={1}>
      <Text styleAs="notation" color="secondary">
        {showRecents ? 'Recent searches' : 'Capabilities'}
      </Text>

      {showRecents
        ? recents.map((entry) => (
            <KLink
              key={entry}
              to={`/catalog?q=${encodeURIComponent(entry)}`}
              underline="never"
              color="primary"
              onClick={() => {
                setValue(entry);
                setOpen(false);
              }}
            >
              {entry}
            </KLink>
          ))
        : hits.map((hit) => {
            const id = hit.entity_id;
            const name = hit.name || id;
            return (
              <KLink
                key={id}
                to={`/catalog/${encodeURIComponent(id)}`}
                underline="never"
                color="primary"
                onClick={() => {
                  remember(value.trim());
                  setOpen(false);
                }}
              >
                {name}
              </KLink>
            );
          })}

      {/*
        The full answer is always one keystroke away, and it is the one with a URL.
        The panel offers destinations; it never claims to be the result.
      */}
      {!showRecents ? (
        <Text styleAs="notation" color="secondary">
          Press Enter for all results
        </Text>
      ) : null}
    </StackLayout>
  ) : undefined;

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      aria-label="Search the catalog"
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        // Only when focus has genuinely left the whole control — otherwise clicking a
        // suggestion closes the panel before the click lands on it.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <SuggestionField panel={panel} status={status}>
        <Input
          bordered
          inputRef={inputRef}
          value={value}
          /*
            Not "Search capabilities…", which is word-for-word the catalog page's own
            filter placeholder — two identical boxes with different scopes is a
            coin-flip. This one keeps "search" because Enter genuinely submits the
            full catalog search rather than only jumping somewhere.
          */
          placeholder="Search from anywhere…   /"
          // Through `inputProps`, because Salt spreads top-level rest props onto
          // its wrapper div — a label there names nothing a screen reader visits.
          inputProps={{ 'aria-label': 'Search from anywhere' }}
          startAdornment={<SearchIcon aria-hidden />}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value)}
        />
      </SuggestionField>
    </form>
  );
}
