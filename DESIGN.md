# LinkGuard AI Design System

## Product Position

LinkGuard AI is a security utility. The UI should feel calm, precise, and trustworthy. The user arrives with a suspicious link and needs one primary action: paste the URL and check it before clicking.

## Visual Principles

- Put the URL input first. Decorative security visuals should support the action, never compete with it.
- Show verdicts in this order: status, score, required action, evidence.
- Use color with labels and icons. Never rely on red, yellow, or green alone.
- Keep result screens scannable. Summary first, evidence second, technical details third.
- Prefer compact operational panels over marketing card grids.

## Color Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#02060c` | App background |
| `--surface` | `rgba(4, 18, 32, 0.94)` | Main panels |
| `--surface-strong` | `rgba(8, 28, 48, 0.96)` | Elevated panels |
| `--surface-soft` | `rgba(13, 39, 65, 0.72)` | Subtle grouping |
| `--blue-bright` | `#00c8ff` | Primary action, neutral status |
| `--green` | `#30e0a5` | Safe |
| `--yellow` | `#f2bd39` | Caution |
| `--red` | `#ff505f` | Danger |

## Verdict System

| State | Tone | Label | Required Treatment |
| --- | --- | --- | --- |
| Safe | Green | `안전` | Check icon, calm copy, still remind users to verify sensitive pages |
| Caution | Yellow | `주의`, `의심`, `낮은 위험` | Warning icon, explain what needs manual confirmation |
| Danger | Red | `위험`, `높은 위험`, `악성` | Strong warning, block-click language, report CTA |
| Neutral | Blue | `대기`, `분석 중` | Progress or waiting state |

Every verdict component must include:

- Plain-language label.
- Numeric score when available.
- One recommended next action.
- Top evidence or data source.

## Components

### Home Hero

- Primary element: URL input and `분석하기` button.
- Supporting trust row: external reputation, redirect tracing, community reports.
- Security illustration should be smaller than the input area on desktop and secondary on mobile.

### Result Summary Bar

Place directly below the URL toolbar. It should summarize:

- Verdict.
- Risk score.
- Confidence.
- Reputation source.
- Redirect status.
- Primary action.

### Analysis Details

Recommended order:

1. Verdict summary.
2. Risk score and AI explanation.
3. Key evidence.
4. Recommended action and report CTA.
5. Redirect, content, community report, reputation.
6. Expert-only raw scoring.

### Mobile

At 760px and below:

- Summary bar appears before the score card.
- Recommended action appears before technical details.
- Technical data stacks into one column.
- Touch targets stay at least 44px high.
