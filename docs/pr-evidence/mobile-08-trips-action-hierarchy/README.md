# Mobile Trips action hierarchy evidence

Local visual snapshots of `/trips` with seeded demo-trip data:

- `320x568.png` — compact title and account trigger, with **New trip** beside **Your trips**.
- `390x844.png` — wider mobile layout with the same hierarchy and no overlapping controls.
- `768x820.png` — existing desktop header actions remain available.

Automated component coverage verifies opening the mobile account menu, initial focus,
Escape focus restoration, Account navigation, sign out, New trip navigation, and unchanged
desktop controls. The local browser capture used the running demo server; it did not include a
reliable authenticated keyboard trace because the headless session intermittently failed during
its local login redirect.

Manual verification steps:

1. Open `/trips` at 320×568 and 390×844 while signed in.
2. Confirm the header contains only **My trips** and the account icon; Account, Sign out, and
   New trip are not header actions.
3. Confirm **New trip** is aligned with **Your trips** below the search and role filters.
4. Activate the account icon with Enter, confirm Account receives focus, then press Escape and
   confirm focus returns to the icon.
5. Open the menu and verify Account opens Account Settings and Sign out ends the session.
6. At 768×820, confirm the original desktop New trip, Account, and Sign out actions remain in
   the header.
