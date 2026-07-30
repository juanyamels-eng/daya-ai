# ui — Daya component kit

Fills the `components/ui` folder (which was empty) with reusable,
accessible, and editable primitives — the **shadcn philosophy ("open code": the code is yours)**
but with **your design tokens** and **without Radix or new dependencies**.

## Why this and not full shadcn
Your app already has a coherent design system (tokens in `globals.css`, fonts
Instrument Serif + Inter). Adopting shadcn would bring Radix + class-variance-authority
and rewrite your theme. Instead, this kit uses `--text-primary`, `--bg-surface`,
`--border-default`, etc. that you ALREADY have, so it inherits your theme automatically and
re-themes itself if you change the tokens.

It also solves a real problem: today there are loose `<button>`s repeated throughout
the frontend (25 in Sidebar, 16 in Settings, 14 in Chat…), each with its own style.
This unifies them.

## Components
- **Button** (`primary | secondary | ghost | danger`, sizes `sm/md/lg`, `loading`, icons)
- **IconButton** (icon only, with mandatory `aria-label`)
- **Card** + `CardHeader/Title/Description/Content/Footer`
- **Input**, **Textarea**
- **Badge** (`neutral | primary | success | danger | outline`)
- **Separator**, **Spinner**, **Kbd**
- **Dialog** (accessible modal: Escape, click-outside, scroll lock) + **ConfirmDialog**
- **Toast** (`ToastProvider` + `useToast()`): success/error/info notifications

Dependencies used: only `clsx` + `tailwind-merge` + `lucide-react`, which are ALREADY
in your `package.json`. Zero new packages.

## Usage
```tsx
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Badge } from '@/components/ui'

<Card>
  <CardHeader><CardTitle>My section</CardTitle></CardHeader>
  <CardContent>
    <Input placeholder="Type…" />
    <Button variant="primary" loading={saving} onClick={save}>Save</Button>
    <Badge variant="success">Active</Badge>
  </CardContent>
</Card>
```

### Dialog
```tsx
import { Dialog, ConfirmDialog } from '@/components/ui/Dialog'

<Dialog open={open} onClose={() => setOpen(false)} title="Edit profile" footer={<Button>Save</Button>}>
  …content…
</Dialog>

<ConfirmDialog open={ask} message="Delete this item?" danger
  onConfirm={doDelete} onCancel={() => setAsk(false)} />
```

### Toast
```tsx
// 1) in the root layout:
import { ToastProvider } from '@/components/ui/Toast'
<ToastProvider><App /></ToastProvider>

// 2) in any component:
import { useToast } from '@/components/ui/Toast'
const toast = useToast()
toast.success('Saved successfully')
toast.error('Could not upload file')
```

## Suggested migration (gradual, no rush)
Gradually replace `<button className="…">` with `<Button variant="…">` component by
component. No need to do it all at once: the kit coexists with your current code.

## Styles
Each component injects its CSS once (`daya-*` classes mapped to your
tokens). It does not use concrete Tailwind utilities, so it does not depend on your Tailwind
config and is 100% re-themeable from `globals.css`.

## License
New code. Remains under Daya's license.
