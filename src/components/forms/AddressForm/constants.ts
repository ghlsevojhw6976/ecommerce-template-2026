/**
 * Countries this shop delivers to. Mirrors `addresses.supportedCountries` in
 * src/plugins/index.ts — the two must agree, because the plugin validates the
 * stored country against ITS list while this one drives the form.
 *
 * With exactly one entry the form shows the country as fixed text instead of
 * a dropdown: a 40-country select on a US-only shop is forty chances to pick
 * the wrong one and zero chances to pick a right one the shop can ship to.
 *
 * Per-shop knob: a future EU deploy widens this list (and the plugin config)
 * and the dropdown comes back by itself.
 */
export const SUPPORTED_COUNTRIES: { label: string; value: string }[] = [
  { label: 'United States', value: 'US' },
]

/** US states need a `state` for carriers and AVS; other countries often not. */
export const STATE_REQUIRED_COUNTRIES = new Set(['US'])
