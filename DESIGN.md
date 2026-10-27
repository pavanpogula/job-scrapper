---
name: B.O.O.L.E.A.N Design System
description: Direct applicant tracking system job directory design tokens and craft standards
colors:
  primary: "#111827"
  primary-dark: "#f0f6fc"
  accent: "#1d5fbf"
  accent-dark: "#58a6ff"
  neutral-bg: "#f3f5f8"
  neutral-bg-dark: "#0d1117"
  surface: "#ffffff"
  surface-dark: "#161b22"
  text-primary: "#111827"
  text-primary-dark: "#f0f6fc"
  text-secondary: "#4b5563"
  text-secondary-dark: "#8b949e"
  border: "#e5e7eb"
  border-dark: "#21262d"
  success: "#10b981"
  warning: "#f59e0b"
typography:
  display:
    fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 800
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontWeight: 700
    letterSpacing: "-0.02em"
  mono:
    fontFamily: "'Geist Mono', monospace"
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
  card-job:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
---

# B.O.O.L.E.A.N Design System

## Overview
B.O.O.L.E.A.N is an "Operate" surface mode directory for job seekers scanning direct, verified company ATS postings. The design language prioritizes information density, low latency, clear typographic hierarchy, uncropped brand imagery, and keyboard-first accessibility without decorative fluff.

## Colors
- **Primary & Neutral Ground**: Light mode uses a cool ledger ground (`#f3f5f8`) with clean card surfaces (`#ffffff`) and dark graphite typography (`#111827`). Dark mode uses an obsidian ground (`#0d1117`), container slate (`#161b22`), and crisp high-contrast text (`#f0f6fc`).
- **Accent**: Precision ATS blue (`#1d5fbf` light, `#58a6ff` dark). Used for wordmark accent, active filters, selected card border-left indicators, and primary direct application actions.
- **Semantic Accents**: Emerald (`#10b981`) for salary figures and active indicators; amber (`#f59e0b`) for closed postings.
- **Contrast Guarantee**: All text pairings meet WCAG AA requirements (4.5:1 minimum).

## Typography
- **Primary Interface**: `Geist` (weights 400, 500, 600, 700, 800). Modern neo-grotesque with tabular numerals and tight letter-spacing for dense listings.
- **Monospace & Data**: `Geist Mono` for the B.O.O.L.E.A.N brand wordmark, ATS slug references, metadata tags, and code blocks.

## Layout
- **Desktop (>= md)**: Two-pane master/detail ergonomics. Left column (`JobList`, 380px–460px) provides fast scrolling and selection; right column (`JobDetailPanel`) is sticky with full role overview, direct apply links, and company context.
- **Mobile (< md)**: Single column list view where job selection transitions to the dedicated `/jobs/:id` route. Filter pills move into an accessible bottom-sheet drawer with badge counters.
- **Company Pages**: Hero header with uncropped 80px avatar overlapping a subtle gradient band, followed by sticky tab navigation (`Overview` and `Jobs`).

## Elevation & Depth
- Flat, tonal layering. Depth is communicated through 1px border lines (`divider` tokens) and subtle hover background tints rather than heavy drop shadows.
- Active item indicator: 3px accent left border (`primary.main`) with 5% (light) / 14% (dark) tint background.

## Shapes
- **Avatars**: 48px square container with 8px radius (`object-fit: contain`, subtle border, neutral tile). Prevents any cropping of horizontal company wordmarks.
- **Buttons & Inputs**: 6px radius (`rounded.sm`) for compact, utilitarian feel.
- **Filter Pills**: Pill chips (`rounded.xl`) with solid filled state when active and outlined state when idle.

## Components
- **JobCard**: High-density posting summary displaying 48px company logo, job title, company link, location/workplace line, salary badge, and freshness tag (`<time>`). Free of bulky apply buttons or monospace URLs on list rows.
- **JobDetailPanel**: Full posting viewport including direct apply CTA, original post link, human-readable chips, compensation box, sanitized HTML overview, and "About <company>" profile summary card.
- **BrandMark**: `B.O.O.L.E.A.N` wordmark with prominent "B" badge and monospace tracking.

## Do's and Don'ts
- **DO** use human-readable labels (`Full-time`, `On-site`, `Remote`) via `frontend/src/lib/labels.ts`.
- **DO** use `CompanyAvatar` with `object-fit: contain` so company logos are never cropped.
- **DO** preserve URL state synchronization (`?q=`, `?jobId=`, `?company=`, `?postedWithin=`).
- **DON'T** put heavy "Apply" buttons or destination URLs on individual list cards.
- **DON'T** invent an expansion of the B.O.O.L.E.A.N acronym.
- **DON'T** introduce third-party styling frameworks (Tailwind) — use standard MUI 9 theme tokens.
