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

The guide documents the live studio-code flow. If portal navigation, labels or
the access flow change, update the matching page here and re-print.
