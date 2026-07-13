# Mobile map-day visibility review evidence

Captured from the authenticated local Dupert app using the seeded Pacific
Northwest demo trip. The full mobile flow was used: Timeline → activity → Map
→ trip menu.

- [`320x568.png`](320x568.png)
- [`390x844.png`](390x844.png)
- [`768x820.png`](768x820.png)

The captures show the map-day controls in the left-attached drawer at each
target width. The drawer remains contained, the controls have at least 44px
targets, and the map and bottom navigation remain visually separated behind
the modal layer.

## Manual verification steps

1. Sign in locally as `alice@test.local`, open **README Demo: Pacific
   Northwest**, then select **Timeline**.
2. Select a scheduled activity, which opens its full-trip map, then open the
   trip menu.
3. Confirm all scheduled days are initially **Shown** and **Show all days** is
   disabled.
4. Toggle one day off. Confirm its marker and route segment disappear, the
   selected place for that day closes, and the timeline section remains
   expanded when returning to **Timeline**.
5. Select **Show all days**. Confirm the day, its markers, and route segment
   return. Repeat at 320×568, 390×844, and 768×820.
