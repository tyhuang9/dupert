# Mobile day-plan actions evidence

These screenshots were captured against the local demo trip at
`/trips/e9m3wxpf2s8a/d/2026-08-18` after signing in with the seeded demo account.

- `320x568.png` — short handset viewport; the date chooser and labelled action wrap to a separate 44px action row.
- `390x844.png` — standard handset viewport; the date chooser and action remain on one row.
- `768x820.png` — tablet viewport within the mobile breakpoint; controls align at the right of the day-plan header.

Manual verification steps:

1. Open the trip day route at each viewport above and select the **Plan** mobile tab.
2. Confirm the header says **Day plan** and the selected date appears only in the date chooser.
3. Confirm the labelled **Add Activity** target is at least 44px high, remains visible, and does not overlap the chooser or bottom navigation.
4. Use the date chooser to select another in-range date; verify the route and displayed date update.
5. Focus **Add Activity** with the keyboard and press Enter; verify the activity name field receives focus.
