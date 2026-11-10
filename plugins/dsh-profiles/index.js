/**
 * Host half of the Profiles panel bundle.
 *
 * The capability is entirely browser-side: the Client module registers the
 * left-sidebar entry and the central page that entry selects. This Host half
 * exists so the bundle owns a Loader row, which is what makes the Client module
 * part of the boot graph.
 *
 * Profile list configuration is intentionally a constant in `client.js` for
 * v0.1.0 (a client-only plugin cannot read a Loader row config without a Host
 * Remote). Edit PROFILES in `client.js` and reload the Web UI to change it.
 */
export function apply() {}
