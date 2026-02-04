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

### Colors
```tsx
// Backgrounds
theme.colors.bg.primary    // #0D0D0D - Main background
theme.colors.bg.secondary  // #1A1A1A - Cards, elevated surfaces
theme.colors.bg.tertiary   // #242424 - Inputs, subtle areas

// Text
theme.colors.txt.primary   // #F2F2F2 - Main text
theme.colors.txt.secondary // #D0D0D0 - Secondary text
theme.colors.txt.tertiary  // #8B8B8B - Muted text

// Borders
theme.colors.bdr.primary   // #2A2A2A - Standard borders
theme.colors.bdr.secondary // #3A3A3A - Hover/active borders

// Status
theme.colors.status.success  // #10B981 - Green
theme.colors.status.warning  // #F59E0B - Amber
theme.colors.status.error    // #EF233C - Red
theme.colors.status.info     // #3B82F6 - Blue

// Brand
theme.colors.primary       // #EF233C - Crimson
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
