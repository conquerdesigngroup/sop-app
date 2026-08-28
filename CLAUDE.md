# SOP App - AI Development Guidelines

## 🎨 UI CONSISTENCY RULES (MANDATORY)

### ALWAYS use the unified UI components from `src/components/ui/index.tsx`

```tsx
import {
  Button,
  IconButton,
  Card,
  Input,
  SearchInput,
  Select,
  Textarea,
  Badge,
  Modal,
  PageHeader,
  Section,
  Avatar,
  Divider,
  EmptyState,
  Spinner,
  // Icons
  SearchIcon,
  CloseIcon,
  PlusIcon,
  CheckIcon,
  EditIcon,
  TrashIcon,
  FilterIcon,
  CalendarIcon,
} from '../components/ui';
```

### Component Usage

#### Buttons
```tsx
// Primary action (submit, create, save)
<Button variant="primary">Create Task</Button>

// Secondary action (cancel, back)
<Button variant="secondary">Cancel</Button>

// Outline (less prominent actions)
<Button variant="outline">View Details</Button>

// Danger (delete, remove)
<Button variant="danger">Delete</Button>

// Ghost (subtle, inline actions)
<Button variant="ghost">Learn More</Button>

// With icons
<Button leftIcon={<PlusIcon />}>Add New</Button>

// Loading state
<Button loading>Saving...</Button>

// Sizes: sm, md (default), lg
<Button size="sm">Small</Button>
```

#### Cards
```tsx
// Standard card
<Card>Content here</Card>

// Card with hover effect (for clickable items)
<Card hover onClick={() => {}}>Clickable card</Card>

// Padding options: none, sm, md (default), lg
<Card padding="lg">More padding</Card>
```

#### Inputs
```tsx
// Standard input
<Input
  label="Email"
  placeholder="Enter email"
  error="Invalid email"
/>

// With icons
<Input
  leftIcon={<SearchIcon />}
  placeholder="Search..."
/>

// Search input (specialized)
<SearchInput
  placeholder="Search tasks..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  onClear={() => setSearch('')}
/>
```

#### Badges
```tsx
// Variants: default, primary, success, warning, danger, info
<Badge variant="success">Completed</Badge>
<Badge variant="danger">Overdue</Badge>
<Badge variant="warning">Pending</Badge>
```

#### Modal
```tsx
<Modal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="Edit Task"
  size="md" // sm, md, lg, xl
  footer={
    <>
      <Button variant="secondary" onClick={() => setShowModal(false)}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSave}>
        Save
      </Button>
    </>
  }
>
  {/* Modal content */}
</Modal>
```

#### Page Header
```tsx
<PageHeader
  title="Tasks"
  subtitle="Manage all your tasks"
  actions={
    <Button leftIcon={<PlusIcon />}>Create Task</Button>
  }
/>
```

---

## 📱 MOBILE VERIFICATION (MANDATORY BEFORE SHIPPING UI)

Most of this app is used on a phone. A layout that is only ever looked at on a
laptop will be broken on a phone and nobody will notice until a parent does.

**Run this before shipping any UI change:**

```bash
npm start                    # in another terminal
npm run audit:mobile
```

It checks every route at six screen sizes for horizontal overflow, elements
clipped off the top, and content sitting under the notch. Signed-in routes are
only covered if you give it a session:

```bash
AUDIT_EMAIL=you@example.com AUDIT_PASSWORD=... npm run audit:mobile
```

Without those it says so, loudly — a clean run without credentials has checked
four public routes and nothing else. That warning is not boilerplate: 15 of the
19 routes need a login, and all four bugs the first full run found were on
management-only pages — two of them super-admin-only. Every one had shipped.
Those are the pages where a layout bug survives longest, because the handful of
people who can see it are the same people who would have to report it.

**Six sizes, not four, and two of them are not phones.** 320 and 507 are there
because `theme.breakpoints.mobile` is 480px: every phone width sits below it, so
without a sample on the other side each route is only ever measured in one of
its two layouts. `/job-tasks` stacks its filter row into a column below 480 and
leaves it a nowrap flex row above — which does not fit again until roughly
660px. A select ran 164px off the right edge for that whole band while four
green phones said CLEAN. **Any breakpoint the app switches on needs a sample on
both sides of it.**

**Overflow findings print the ancestor chain**, as `via div,w:333,d:flex,
j:center < ...`. Read it. The element that reports an overflow is almost never
the one causing it — it is usually the innocent first child of a parent that
centres or right-aligns content it cannot fit. Guessing the parent from the
style file is slower and gets it wrong.

**Narrow the run while iterating** — both filters are opt-in, so a bare
`npm run audit:mobile` still means everything:

```bash
AUDIT_ROUTES=/hours,/task-library AUDIT_DEVICES='iPhone 15' npm run audit:mobile
```

Seconds instead of six minutes. Re-check the full sweep before you ship, though:
a filtered run proves one route, not the app.

It needs Playwright, which is deliberately not a dependency:
`npm install --no-save playwright && npx playwright install chromium`.

### The three rules it exists to enforce

1. **Never `100vh`. Always `100dvh`.** On iOS `100vh` is the *large* viewport —
   the height the page would have if the browser chrome collapsed — so a
   "full screen" container is taller than the screen, runs off the bottom, and
   drags its content up under the top edge. `100dvh` is the visible height.

2. **`viewport-fit=cover` is set in index.html, so safe-area padding is
   mandatory, not optional.** The page deliberately extends under the notch and
   the home indicator. `index.css` insets `body` left and right only. Any page
   that renders WITHOUT `Navigation` or `PortalLayout` — a login, a callback, an
   error screen — must add its own:

   ```tsx
   paddingTop: `calc(${theme.spacing.md} + env(safe-area-inset-top))`,
   paddingBottom: `calc(${theme.spacing.md} + env(safe-area-inset-bottom))`,
   paddingLeft: theme.spacing.md,
   paddingRight: theme.spacing.md,
   ```

   Longhand, not the `padding` shorthand — mixing the two in one style object is
   React's conflicting-style warning.

   Pages that DO render inside `Navigation` or `PortalLayout` must NOT add their
   own top inset; those components already do it and it would double.

3. **A flex row that centres must be able to wrap.** `justifyContent: 'center'`
   splits overflow **both** ways, so content wider than its box hangs off the
   left as well as the right — and there is no scrolling left. It is not merely
   ugly, it is unreachable.

   `/hours` rendered six employee legend chips, about 540px, in a 333px box with
   `justifyContent: 'center'` and no wrap. The first chip sat at `x=-45`: a
   teammate was simply missing from the legend on every phone, and nothing
   looked broken. Whenever you write `justifyContent: 'center'` on a row that
   holds a variable number of items, write `flexWrap: 'wrap'` with it.

   The same applies to the sibling failure: a flex item will not shrink below
   its content's min-content width, and a value like
   `["title","description"]` has nothing to break at. If a cell can hold
   arbitrary text, it needs `minWidth: 0` **and** `overflowWrap: 'anywhere'` —
   one without the other still overflows.

### What the audit cannot tell you

Chromium reports `env(safe-area-inset-*)` as `0` and gives no way to override
it, so the notch check is a proxy: it flags content in the status-bar band on
pages that apply no safe-area padding at all. It cannot confirm that padding you
did add is the right size. For that, look at a real phone.

It also cannot check a page it never reaches. Routes live in `PUBLIC_ROUTES` and
`AUTH_ROUTES` at the top of the script — add new ones there, or they are simply
not audited and the summary will still say CLEAN.

### If npm dies with `EPERM: operation not permitted, uv_cwd`

Nothing to do with npm or this project. The repo lives in iCloud Drive, macOS
treats that as protected, and npm crashes when it asks which directory it is in
and gets refused. Grant the terminal access: **System Settings → Privacy &
Security → Full Disk Access**, add Terminal, then **fully quit it (⌘Q)** — the
permission does not take effect until it restarts.

---

## 🚫 DO NOT

1. **DO NOT** create inline styles for buttons, cards, inputs - use the UI components
2. **DO NOT** use `theme.colors.background` (deprecated) - use `theme.colors.bg.primary`
3. **DO NOT** use `theme.colors.textPrimary` (deprecated) - use `theme.colors.txt.primary`
4. **DO NOT** use `theme.colors.border` (deprecated) - use `theme.colors.bdr.primary`
5. **DO NOT** hardcode colors like `#1A1A1A` - use theme values
6. **DO NOT** mix `1px` and `2px` borders inconsistently - cards use `2px`, subtle dividers use `1px`

---

## ✅ DO

1. **DO** import from `../components/ui` for all UI elements
2. **DO** use the theme for any custom styling: `theme.colors.bg.secondary`, `theme.spacing.md`
3. **DO** use the responsive hook: `const { isMobileOrTablet } = useResponsive()`
4. **DO** keep consistency in modal sizes:
   - `sm` (400px) - Confirmations, simple forms
   - `md` (560px) - Standard forms
   - `lg` (720px) - Complex forms, details
   - `xl` (900px) - Full editors, tables

---

## 📁 Project Structure

```
src/
├── components/
│   ├── ui/              # ← USE THESE FOR ALL UI
│   │   └── index.tsx    # Unified UI components
│   ├── FormComponents.tsx  # Legacy (migrate to ui/)
│   └── ...
├── contexts/            # React contexts
├── hooks/               # Custom hooks
├── pages/               # Page components
├── theme.ts             # Theme constants
└── types.ts             # TypeScript types
```

---

## 🎨 Theme Quick Reference

### How theming works (IMPORTANT)
`theme.colors.bg/txt/bdr/*` values are **CSS variables** (e.g. `var(--c-bg-primary, #0D0D0D)`),
not raw hex. ThemeProvider sets the variables on `<html>` when the user toggles
dark/light mode (see `applyThemeMode` in `src/theme.ts`), so every inline style
referencing these tokens re-themes automatically.

Consequences:
1. **Never concatenate an alpha suffix** onto these tokens (`` `${theme.colors.bdr.primary}50` `` is broken — use `opacity` or rgba).
2. **Never pass them as SVG presentation attributes** (`stroke={theme.colors.txt.tertiary}` fails — attributes can't resolve var()). Use `style={{ stroke: ... }}` instead.
3. On crimson/primary surfaces, hardcode `color: '#FFFFFF'` — mode-dependent text tokens flip dark in light mode and break contrast.
4. `theme.colors.primary` and `theme.colors.status.*` remain literal hex (identical in both modes) and are safe everywhere.
5. Use the `useConfirm` hook (`src/hooks/useConfirm.tsx`) instead of `window.confirm`, and toast errors (`useToast`) instead of `alert()`.

### DIDC brand (source: public/brand/tokens.json)
- **Fonts** (Google Fonts, linked in public/index.html): Kanit ExtraBold Italic uppercase = headlines (`theme.fonts.display`, applied globally to h1–h3), Barlow = body/UI (`theme.fonts.primary`), JetBrains Mono = specs/tags (`theme.fonts.mono`).
- **Logos** live in `public/brand/logos/`. `didc-mark-3d.png` is now the mark **everywhere** — imported as `BRAND_MARK` from `src/theme.ts` and read by Navigation, PortalLayout, Login and the front door alike. **One file for both modes**, because it carries its own black keyline: do not reintroduce an `isDark` ternary for it, and do not hardcode the path. It is the only mark any screen should draw. (`didc-thrash-white.svg` / `didc-thrash-pink.svg` were the front door's own wordmark and swapped on `isDark`; `didc-outline*.svg` were the earlier header pair. All four are kept but unused — reach for `BRAND_MARK` instead of reviving one.) Never recolor, stretch, rotate, or add effects to the marks.
- Keep electric pink to ~5% of any view — accents (buttons, active states, focus), never fills or large surfaces.

### Colors (dark-mode values shown; light mode swaps automatically)
```tsx
// Backgrounds
theme.colors.bg.primary    // #0B0B0D "void" - Main background
theme.colors.bg.secondary  // #161618 "panel" - Cards, elevated surfaces
theme.colors.bg.tertiary   // #1E1E21 "panel2" - Inputs, subtle areas

// Text
theme.colors.txt.primary   // #F4F4F5 "chalk" - Main text
theme.colors.txt.secondary // #C9C9D1 - Secondary text
theme.colors.txt.tertiary  // #9A9AA4 "smoke" - Muted text

// Borders
theme.colors.bdr.primary   // #26262B - Standard borders
theme.colors.bdr.secondary // #36363D - Hover/active borders

// Status
theme.colors.status.success  // #10B981 - Green
theme.colors.status.warning  // #F59E0B - Amber
theme.colors.status.error    // #E2144F - Electric
theme.colors.status.info     // #3B82F6 - Blue

// Brand
theme.colors.primary       // #E2144F "electric" - DIDC brand accent (keep to ~5% of any view)
```

### Spacing
```tsx
theme.spacing.xs   // 4px
theme.spacing.sm   // 8px
theme.spacing.md   // 16px
theme.spacing.lg   // 24px
theme.spacing.xl   // 32px
theme.spacing.xxl  // 48px
```

### Border Radius
```tsx
theme.borderRadius.sm    // 4px
theme.borderRadius.md    // 8px
theme.borderRadius.lg    // 12px
theme.borderRadius.xl    // 16px
theme.borderRadius.full  // 9999px (pills/circles)
```

---

## 🔧 Tech Stack

- **React** with TypeScript
- **Supabase** for backend/database
- **Vercel** for deployment
- **Custom theme system** (no CSS framework)

---

## 📋 Common Patterns

### Page Layout
```tsx
const MyPage: React.FC = () => {
  const { isMobileOrTablet } = useResponsive();

  return (
    <div style={{
      padding: isMobileOrTablet ? '16px' : '40px',
      maxWidth: '1400px',
      margin: '0 auto',
    }}>
      <PageHeader
        title="Page Title"
        actions={<Button>Action</Button>}
      />

      <Section title="Section Name">
        <Card>Content</Card>
      </Section>
    </div>
  );
};
```

### Form Pattern
```tsx
<Card>
  <Input label="Name" value={name} onChange={...} />
  <Select label="Type" options={options} value={type} onChange={...} />
  <Textarea label="Description" value={desc} onChange={...} />
  <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
    <Button variant="secondary" onClick={onCancel}>Cancel</Button>
    <Button variant="primary" onClick={onSave}>Save</Button>
  </div>
</Card>
```

---

## ⚠️ Migration Notes

The following legacy components/patterns should be migrated to the new UI system:
- `FormButton` → `Button`
- `FormInput` → `Input`
- `FormSelect` → `Select`
- `FormTextarea` → `Textarea`
- Custom modal styles → `Modal` component
- Inline card styles → `Card` component

When editing existing pages, gradually replace old patterns with new UI components.
