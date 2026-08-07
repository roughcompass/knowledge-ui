import { Input } from '@salt-ds/core';
import { SearchIcon } from '@salt-ds/icons';
import { can, type Session } from '@knowledge-ui/auth';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Search, from anywhere.
 *
 * The product's whole claim is that a platform group's output is findable. Until
 * this existed, finding anything required first navigating to Catalog: the search
 * box lived inside the thing you were trying to search for. An engineer arriving
 * from a link to an operations screen, or from the dashboard, had to work out
 * where the catalog was before they could ask their actual question.
 *
 * ## It is a link, not a live search
 *
 * Submitting navigates to the catalog's existing search view rather than opening
 * a results popover. That view already owns filters, empty states, the retrieval
 * arms legend and — importantly — a URL that carries the query, so a result found
 * here can be pasted to a colleague. A popover would have to reimplement all of
 * it and would hand back a result nobody could link to.
 *
 * ## Gated, because search is a permission
 *
 * `catalog:search` is a real server gate. A session without it would get a 403
 * from the endpoint, so offering the field would be an invitation to a refusal.
 * The field is absent rather than disabled: a disabled search box in the banner
 * of every page is a permanent advertisement for something the reader cannot have.
 *
 * The session arrives as a prop rather than from `useSession`, because this is
 * shell chrome: it renders above the provider that the federated remotes are
 * given, so the hook has nothing to read.
 */
export function GlobalSearch({ session }: { session: Session }) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const allowed = can(session, 'catalog:search');

  /*
   * `/` focuses the field, which is the convention every search-first tool of the
   * last decade has taught. Guarded against firing while the reader is typing:
   * without the target check it swallowed the slash in a package coordinate and
   * yanked focus out of whatever field they were filling in.
   */
  useEffect(() => {
    if (!allowed) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }

      event.preventDefault();
      inputRef.current?.focus();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allowed]);

  if (!allowed) return null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    if (query.length === 0) return;
    navigate(`/catalog?q=${encodeURIComponent(query)}`);
  };

  return (
    <form onSubmit={onSubmit} role="search" aria-label="Search the catalog">
      <Input
        bordered
        inputRef={inputRef}
        value={value}
        placeholder="Search capabilities…   /"
        aria-label="Search capabilities"
        startAdornment={<SearchIcon aria-hidden />}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value)}
      />
    </form>
  );
}
