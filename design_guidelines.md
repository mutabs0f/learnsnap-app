# LearnSnap Design Guidelines

## Design Approach
**Reference-Based: Duolingo-Inspired Gamification**
Drawing from Duolingo's playful, encouraging design system with adaptations for Arabic RTL context. Secondary inspiration from Kahoot's energy and Quizizz's clean card interfaces.

## Core Design Principles
- **Encouraging & Playful**: Celebrate small wins, gentle feedback on mistakes
- **Progress-Oriented**: Visual progress indicators everywhere
- **Clear Hierarchy**: One primary action per screen
- **Mobile-First**: Touch-friendly targets (minimum 48px), thumb-zone optimization

---

## Typography System

**Primary Font**: Cairo (Google Fonts)
- Hero/Display: Cairo Bold, 32-40px
- Section Headings: Cairo SemiBold, 24-28px  
- Body Text: Cairo Regular, 16-18px
- Captions/Labels: Cairo Regular, 14px
- Button Text: Cairo SemiBold, 16px

**RTL Considerations**: All text right-aligned, reading flow right-to-left, icons mirror horizontally where directional

---

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, 8, 12, 16
- Card padding: p-6
- Section spacing: py-12 to py-16
- Component gaps: gap-4 to gap-6
- Icon-to-text spacing: gap-2

**Container Widths**:
- Mobile: Full width with px-4
- Desktop admin: max-w-7xl centered

---

## Component Library

### User-Facing Quiz App Components

**Quiz Cards**: 
- Rounded-xl corners with soft shadow
- Question text prominently displayed
- Answer options as full-width touchable cards (h-16)
- Spacing between options: gap-3
- Selected state with subtle scale and border treatment

**Progress Components**:
- Top-bar progress indicator (h-2 rounded-full)
- Streak counter with flame icon
- XP badges with circular backgrounds
- Lives/hearts display in top-right (RTL: top-left)

**Gamification Elements**:
- Celebration modals with confetti particle effect
- Achievement badges (circular, 64px diameter)
- Level-up animations
- Daily goal progress rings (120px diameter)

**Navigation**:
- Bottom tab bar (h-16) with 4-5 icons
- Minimal top navigation with back arrows (RTL: right-pointing)

### Admin Dashboard Components

**Layout Structure**:
- Sidebar navigation (w-64, right-side for RTL)
- Main content area with cards grid
- Top utility bar with search, notifications, profile

**Support Tools**:
- User lookup search bar (prominent, top-center)
- Ticket status cards (grid-cols-1 md:grid-cols-3)
- Activity timeline (vertical, right-aligned for RTL)
- Quick action buttons panel
- User detail modal with tabbed sections

**Data Display**:
- Stats cards with large numbers (48px Cairo Bold)
- Tables with alternating row treatment
- Filters sidebar with checkboxes and dropdowns
- Export/action buttons in top-right (RTL: top-left)

**Forms**:
- Single-column layouts
- Input fields with clear labels above
- Helper text below in smaller Cairo Regular
- Primary action buttons full-width on mobile

---

## Gradient System

**Primary Gradients** (Duolingo-inspired):
- Success: Light green to vibrant green (top-to-bottom)
- Primary: Soft blue to deep blue
- Warning: Warm yellow to orange
- Celebration: Multi-color playful gradient

**Application**:
- Hero sections: Diagonal gradients
- Cards: Subtle vertical gradients as backgrounds
- Buttons: Solid colors with gradient hover states
- Progress bars: Animated gradient fills

---

## Images

**Hero Image** (User App Landing):
- **Description**: Illustration of happy Arabic students using mobile devices with floating quiz cards, achievement badges, and progress stars around them. Colorful, playful, 2D illustration style matching Duolingo's friendly aesthetic
- **Placement**: Top of landing page, full-width mobile, overlaid with blurred-background button
- **Dimensions**: 375x500px mobile, 1440x600px desktop

**Feature Section Graphics**:
- Quiz card mockups showing RTL interface
- Progress dashboard screenshots
- Achievement badge collections

**Admin Dashboard**:
- No hero image
- Icon-based visualization for metrics
- User avatar placeholders (40px circular)

**Buttons on Images**: All CTAs over hero use backdrop-blur-md with semi-transparent backgrounds

---

## Animations

**Use Sparingly**:
- Correct answer: Gentle scale bounce + checkmark fade-in
- Level up: Confetti burst (one-time)
- Progress bar: Smooth width animation
- Card selections: Quick scale (0.98 to 1.02)

**Avoid**: Continuous animations, distracting parallax, excessive micro-interactions

---

## Mobile-First Specifics

**Touch Targets**: Minimum 48x48px, spacing between 8px
**Bottom Sheet Modals**: For secondary actions and details
**Swipe Gestures**: Next question (swipe left in RTL)
**Safe Areas**: Account for notches and home indicators (pb-safe)

---

## Admin Dashboard Specific

**Desktop-First Considerations**:
- Two-column layouts for forms
- Data tables with 6-8 visible columns
- Hover states on interactive elements
- Keyboard shortcuts displayed in tooltips

**Customer Service Tools**:
- Quick response templates sidebar
- User activity timeline (real-time updates)
- Flag/escalate buttons prominently placed
- Notes panel with markdown support