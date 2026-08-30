# 📸 Screenshots Guide

This document explains the screenshots needed for the Daya-AI repository to look professional on GitHub.

## Required Screenshots

### 1. **Landing Page** (`screenshots/landing.png`)
**Dimensions:** 1200x600px (2:1 ratio)
**Content:**
- Hero section with "Daya-AI" title
- Main value proposition
- Call-to-action button (Get Started)
- Color scheme: Dark background with accent colors (blue/purple)
- Clean, modern design

### 2. **Login Page** (`screenshots/login.png`)
**Dimensions:** 600x700px
**Content:**
- Login form with email/password fields
- "Sign in with Google" option
- Daya-AI branding
- Professional UI with Tailwind CSS styling

### 3. **Register Page** (`screenshots/register.png`)
**Dimensions:** 600x700px
**Content:**
- Registration form
- Email, password, confirm password fields
- Accept terms checkbox
- Social signup option

### 4. **Pricing Page** (`screenshots/pricing.png`)
**Dimensions:** 1200x600px
**Content:**
- 3-4 pricing tiers (Free, Pro, Enterprise)
- Features list per tier
- Price points clearly displayed
- Feature comparison table style

### 5. **Daya Code (CLI)** (`screenshots/code.png`)
**Dimensions:** 1000x600px
**Content:**
- Terminal screenshot showing:
  - `daya-code "your task"` command
  - Agent working/thinking process
  - File operations display
  - Command execution output
- Dark terminal theme (Monaco/Consolas font)
- Example showing agent thinking, planning, and executing

## How to Create Professional Screenshots

### Option 1: Using the Actual Application
1. Run the development server: `npm run dev`
2. Navigate to each page
3. Use tools like:
   - **macOS:** Cmd+Shift+5 or CleanMyMac X
   - **Windows:** Snip & Sketch or Sharex
   - **Linux:** Flameshot or Gnome Screenshot
4. Crop to exact dimensions
5. Optimize with: TinyPNG, ImageOptim, or similar

### Option 2: Design Tools
- **Figma** (recommended)
- **Adobe XD**
- **Sketch**
- **Penpot** (open-source)

### Option 3: Screenshot Services
- **Screenshot.rocks** — Add device frames
- **Mockup.photos** — Professional mockups
- **Previewed.app** — Browser frame screenshots

## Image Optimization Tips

1. **Format:** PNG for screenshots (lossless)
2. **Compression:** Use ImageOptim, TinyPNG, or WebP
3. **Dimensions:** Keep at 1200px max width
4. **Quality:** Save at 2x resolution, scale down for 1:1 pixel ratio

### Recommended Process
```bash
# After capturing screenshots:
# 1. Open with ImageOptim (macOS)
# 2. Or use ImageMagick (cross-platform)
convert landing.png -strip -interlace Plane -quality 85 landing-optimized.png

# 3. Or use TinyPNG online:
# https://tinypng.com
```

## File Naming Convention

```
screenshots/
├── landing.png          # Hero/Landing page
├── login.png            # Login form
├── register.png         # Registration form
├── pricing.png          # Pricing plans
├── code.png             # Daya Code CLI terminal
├── chat.png             # Main chat interface (optional)
├── admin.png            # Admin panel (optional)
└── studio.png           # Image studio (optional)
```

## Adding to README

Once screenshots are created, they'll automatically render in the README.md:

```markdown
| **🏠 Landing Page** | ![Landing](screenshots/landing.png) |
| **🔐 Login** | ![Login](screenshots/login.png) |
```

## Brand Colors to Use

- **Primary:** `#3B82F6` (Blue)
- **Secondary:** `#8B5CF6` (Purple)
- **Accent:** `#06B6D4` (Cyan)
- **Dark BG:** `#0F172A` (Almost Black)
- **Light Text:** `#F1F5F9` (Off-white)

## Layout Recommendation

```
┌─────────────────────────────────────────┐
│           Daya-AI Logo & Title          │
├─────────────────────────────────────────┤
│                                         │
│      Main Content Area                  │
│      (Screenshot/UI Element)            │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

## Checklist

- [ ] Landing page screenshot
- [ ] Login page screenshot
- [ ] Register page screenshot
- [ ] Pricing page screenshot
- [ ] Daya Code CLI screenshot
- [ ] All images optimized (< 500KB each)
- [ ] All images in `screenshots/` folder
- [ ] README.md references all images correctly
- [ ] Images display properly on GitHub

## Next Steps

1. **Take/design the screenshots** using the guidelines above
2. **Add to `screenshots/` folder** in the repository
3. **Commit & push** to GitHub
4. **Verify** they render in the README on GitHub's website
5. **Update README** if any filenames differ from expected

---

**Questions?** Check the GitHub repo or open an issue!
