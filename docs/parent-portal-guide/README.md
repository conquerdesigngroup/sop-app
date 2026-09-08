# Parent Portal Guide (PDF packet)

Source for `DIDC-Parent-Portal-Guide.pdf` in the repo root — the printable
how-to packet handed to dance families. `packet.html` + `packet.css` are the
document (11 US-Letter pages, phone mockups drawn in HTML); Chromium prints it.

Regenerate after editing (uses the repo's Playwright):

```bash
cd docs/parent-portal-guide
PROJECT_DIR="$(git rev-parse --show-toplevel)" node print.js packet.html "../../DIDC-Parent-Portal-Guide.pdf"
```

Proof pages as PNGs (writes pgNN.png next to the HTML, flags any overflow):

```bash
PROJECT_DIR="$(git rev-parse --show-toplevel)" node proof.js packet.html .
```

The guide documents the **family-login** flow: sign up with your Enrollio email,
verify a 6-digit code, then log in. It was rewritten on 2026-09-07 when the
studio-code access gate was retired (`REACT_APP_CLIENT_AUTH_REQUIRED`, v30) and
`/portal` became a family dashboard rather than a program picker.

Twelve pages: p3 is making an account, p4 is the signed-in home screen, and the
map on p6 runs front door → log in → home screen → program section. Copy on
those pages was taken from the running app, not from memory — if you change
portal navigation, labels or the access flow, re-check them against the screens
and re-print.
