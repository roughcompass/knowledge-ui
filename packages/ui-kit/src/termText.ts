/**
 * Acronyms the server writes in lowercase and a reader expects in caps.
 *
 * Deliberately short, and only for tokens this app actually renders. A general
 * dictionary would be a guess about words the registry has never sent, and the
 * first wrong guess — capitalising a word that was never an acronym — is
 * indistinguishable from a typo to the reader who meets it.
 */
const ACRONYMS: Record<string, string> = {
  adr: 'ADR',
  ga: 'GA',
  json: 'JSON',
  openapi: 'OpenAPI',
  rfc: 'RFC',
};

/**
 * A machine token as the term a reader sees on a control.
 *
 * The API's enumerations are wire values: `unread`, `release_notes`,
 * `l1_responder`. Rendering them verbatim in a `Dropdown` put lowercase
 * fragments of snake_case into a UI where every other control label is
 * sentence case — the notification filter offered "unread / read / all" beside
 * a field labelled "Show", and the connector picker offered "markdown_adr_rfc".
 *
 * Sentence case rather than Title Case, because these are values in a list and
 * not headings: capitalising every word is the convention for names, and a list
 * of statuses reads as prose. `ga` is the reason the acronym table exists at
 * all — "Ga" is not a lifecycle stage anyone has heard of.
 *
 * **Display only.** The token stays the token: `Option` keeps its `value`, the
 * request keeps its parameter, and this touches nothing the server will read
 * back. Applying it to a served *value* in a table would be the opposite trade —
 * there the text is the datum, and a reader comparing it against an API response
 * needs to see what the API said.
 */
export function termText(token: string): string {
  const words = token.split(/[_\-\s]+/).filter(Boolean);
  if (words.length === 0) return token;

  return words
    .map((word, index) => {
      const acronym = ACRONYMS[word.toLowerCase()];
      if (acronym !== undefined) return acronym;
      // Only the first word is lifted. `l1_responder` becomes "L1 responder"
      // without needing an entry of its own — the leading character is all that
      // separates the token from the term.
      return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(' ');
}
