# Faculty Management Design System

## Direction
- Professional university interface with a calm blue-and-white foundation.
- Spacious, editorial layout with strong hierarchy and generous breathing room.
- Rounded surfaces, soft shadows, and restrained motion.
- Data-heavy screens should feel organized, not dense.

## Core Tokens
- Primary: `#1D4ED8`
- Secondary: `#3B82F6`
- Accent: `#0F766E`
- Background: `#F8FAFC`
- Surface: `#FFFFFF`
- Border: `#D8E0EA`
- Text: `#0F172A`
- Muted text: `#475569`
- Success: `#059669`
- Warning: `#D97706`
- Danger: `#DC2626`

## Typography
- Use the existing Geist family as the project-wide standard.
- Headings should be semibold, compact, and clearly separated from supporting text.
- Body text should stay readable at small sizes and avoid low-contrast gray.

## Shape and Spacing
- Default radius: 14px.
- Use 8px spacing increments everywhere.
- Prefer `p-6`, `gap-6`, and `space-y-6` for sections; avoid cramped layouts.

## Surface Language
- Cards and panels should be white, bordered, and lightly elevated.
- Tables should sit in bordered, rounded containers with subtle row hover states.
- Forms should use clear labels, visible focus rings, and concise helper/error text.

## Motion
- Keep transitions in the 150-250ms range.
- Use motion for feedback only: hover, open/close, loading, and page entrance.
- Avoid large scale transforms or distracting animations.

## Reusable Patterns
- `page-header`: title, short description, and primary action.
- `summary-card`: icon, value, trend, and short supporting copy.
- `data-panel`: toolbar, table or list body, and footer actions.
- `empty-state`: icon, message, and one next-step action.
- `status-badge`: compact state indicator for active, warning, pending, and error states.

## Accessibility Rules
- Maintain WCAG AA contrast in all text and icon states.
- Every interactive element must have a visible focus state.
- Preserve keyboard navigation order and clickable area sizes.
- Loading and empty states must still communicate the screen purpose.

## Anti-Patterns to Avoid
- Heavy red accents as the default UI color.
- Flat, borderless surfaces.
- Overly tight tables and forms.
- Decorative motion that competes with content.
- Inconsistent corner radius or spacing across shared components.