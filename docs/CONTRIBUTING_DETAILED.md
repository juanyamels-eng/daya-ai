# 🤝 Contributing to Daya-AI

Thank you for your interest in contributing to Daya-AI! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Code Style](#code-style)
- [Documentation](#documentation)

---

## Code of Conduct

This project adheres to the Contributor Covenant [code of conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

---

## Getting Started

### 1. Fork the Repository
```bash
# On GitHub, click "Fork" button on the repo
# Then clone your fork locally
git clone https://github.com/YOUR_USERNAME/daya-ai.git
cd daya-ai
```

### 2. Add Upstream Remote
```bash
# Keep your fork synchronized with the original repo
git remote add upstream https://github.com/kenii748k-cloud/daya-ai.git
```

### 3. Create a Feature Branch
```bash
# Always create a new branch for your work
git checkout -b feature/your-feature-name
# or for bug fixes
git checkout -b fix/issue-description
```

### 4. Set Up Development Environment
```bash
# Follow the GETTING_STARTED.md guide
# Backend
cd backend
npm install
cp .env.example .env
npx prisma migrate dev

# Frontend
cd frontend
npm install
cp .env.example .env.local

# CLI (optional)
cd cli
npm install
```

---

## Development Workflow

### Daily Workflow

```bash
# 1. Update your local main branch
git fetch upstream
git rebase upstream/main

# 2. Make sure everything still works
cd backend && npm test
cd ../frontend && npm test

# 3. Create/switch to your feature branch
git checkout feature/your-feature

# 4. Make your changes
# ... edit files ...

# 5. Test locally
npm run dev  # in respective folder

# 6. Commit changes
git add .
git commit -m "✨ Add feature description"

# 7. Push to your fork
git push origin feature/your-feature

# 8. Open a Pull Request on GitHub
```

### Commit Message Conventions

Use semantic prefixes in commit messages:

```bash
✨ feat:     New feature
🐛 fix:      Bug fix
📚 docs:     Documentation update
🎨 style:    Code style (formatting, etc)
♻️  refactor: Code refactoring
⚡ perf:     Performance improvement
🧪 test:     Adding or updating tests
🔧 chore:    Dependency updates, config changes
🚀 deploy:   Deployment-related changes
```

Examples:
```bash
git commit -m "✨ feat: Add web search tool"
git commit -m "🐛 fix: Resolve chat streaming issue"
git commit -m "📚 docs: Update API reference"
```

---

## Making Changes

### Backend Changes

**Location:** `/backend`

1. **File Structure**
   ```
   backend/src/
   ├── controllers/    # Request handlers
   ├── features/       # Feature modules
   ├── middleware/     # Auth, validation
   ├── routes/         # API endpoints
   ├── services/       # External APIs
   └── prisma/         # Database
   ```

2. **Add a New Feature**
   ```typescript
   // 1. Create file: src/features/myfeature/controller.ts
   export async function handleMyFeature(req, res) {
     // Implementation
   }

   // 2. Create file: src/features/myfeature/route.ts
   import { handleMyFeature } from './controller'
   router.post('/my-feature', handleMyFeature)

   // 3. Register in src/index.ts
   app.use('/api/myfeature', require('./features/myfeature/route'))

   // 4. Test
   npm test
   ```

3. **Database Changes**
   ```bash
   # Update schema.prisma
   # Then create migration
   npx prisma migrate dev --name add_my_field

   # Verify migration
   git add prisma/
   ```

### Frontend Changes

**Location:** `/frontend`

1. **Component Structure**
   ```
   frontend/src/
   ├── app/           # Pages (App Router)
   ├── components/    # React components
   ├── lib/           # Utilities
   ├── store/         # Zustand state
   └── types/         # TypeScript types
   ```

2. **Create New Component**
   ```typescript
   // src/components/MyComponent.tsx
   'use client';  // If using hooks

   import { useState } from 'react';

   export function MyComponent() {
     const [state, setState] = useState('');

     return (
       <div className="p-4">
         {/* Component JSX */}
       </div>
     );
   }
   ```

3. **Add to Store (Zustand)**
   ```typescript
   // src/store/myStore.ts
   import { create } from 'zustand';

   interface MyStore {
     count: number;
     increment: () => void;
   }

   export const useMyStore = create<MyStore>((set) => ({
     count: 0,
     increment: () => set((state) => ({ count: state.count + 1 })),
   }));
   ```

---

## Testing

### Backend Testing

```bash
cd backend

# Run all tests
npm test

# Run specific test file
npm test -- src/features/chat/__tests__/chat.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Frontend Testing

```bash
cd frontend

# Run all tests
npm test

# Run specific test
npm test -- MyComponent.test.tsx

# Coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Writing Tests

**Backend Example:**
```typescript
// src/features/chat/__tests__/chat.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { handleChat } from '../controller';

describe('Chat Controller', () => {
  it('should handle chat message', async () => {
    const req = {
      body: { content: 'Hello' },
      user: { id: 'user_123' },
    };
    const res = { json: () => {} };

    await handleChat(req, res);
    // Add assertions
  });
});
```

**Frontend Example:**
```typescript
// src/components/__tests__/MyComponent.test.tsx
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('should render', () => {
    render(<MyComponent />);
    expect(screen.getByText(/text/i)).toBeInTheDocument();
  });
});
```

---

## Submitting Changes

### Before Submitting

1. **Ensure tests pass**
   ```bash
   cd backend && npm test
   cd ../frontend && npm test
   ```

2. **Lint code**
   ```bash
   cd backend && npm run lint
   cd ../frontend && npm run lint
   ```

3. **Format code**
   ```bash
   cd backend && npm run format
   cd ../frontend && npm run format
   ```

4. **Update documentation**
   - Update README.md if adding features
   - Add API docs if adding endpoints
   - Update CHANGELOG.md

5. **Rebase on main**
   ```bash
   git fetch upstream
   git rebase upstream/main
   git push -f origin feature/your-feature
   ```

### Pull Request Template

```markdown
## Description
<!-- Brief description of your changes -->

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issues
Fixes #123

## Testing
<!-- Describe how you tested -->
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] Manual testing done

## Screenshots (if applicable)
<!-- Add screenshots for UI changes -->

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
```

### PR Submission Steps

1. **Push your branch**
   ```bash
   git push origin feature/your-feature
   ```

2. **Open PR on GitHub**
   - Go to https://github.com/kenii748k-cloud/daya-ai
   - Click "Compare & pull request"
   - Fill in PR template
   - Submit

3. **Wait for review**
   - Maintainers will review your code
   - Respond to feedback
   - Make requested changes
   - Push additional commits

4. **Merge**
   - Once approved, a maintainer will merge
   - Your work is now part of Daya-AI! 🎉

---

## Code Style

### TypeScript

- Use strict mode: `"strict": true` in tsconfig.json
- Type all function parameters
- Avoid `any` type
- Use interfaces over types for object shapes

```typescript
// ✅ Good
interface User {
  id: string;
  email: string;
  name: string;
}

function getUser(id: string): Promise<User> {
  // ...
}

// ❌ Bad
function getUser(id) {
  // ...
}
```

### React/JSX

- Use functional components with hooks
- Use `'use client'` for client components
- Props should be typed with interfaces
- Use meaningful component names

```typescript
// ✅ Good
'use client';

interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
}

export function Button({ onClick, children }: ButtonProps) {
  return <button onClick={onClick}>{children}</button>;
}

// ❌ Bad
export default function btn(props) {
  return <button onClick={props.click}>{props.kids}</button>;
}
```

### CSS/Tailwind

- Use utility classes
- Avoid inline styles
- Use consistent spacing
- Mobile-first approach

```tsx
// ✅ Good
<div className="bg-blue-500 p-4 rounded-lg shadow-md hover:shadow-lg transition-shadow">
  Content
</div>

// ❌ Bad
<div style={{ backgroundColor: 'blue', padding: '16px' }}>
  Content
</div>
```

### Express/Backend

- Use async/await
- Always validate input
- Return proper HTTP status codes
- Add error handling

```typescript
// ✅ Good
app.post('/api/users', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    if (!email || !name) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    
    const user = await db.user.create({ data: { email, name } });
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ❌ Bad
app.post('/api/users', (req, res) => {
  const user = db.user.create(req.body);
  res.json(user);
});
```

---

## Documentation

### Writing Documentation

- Use clear, concise language
- Add code examples
- Include usage scenarios
- Keep docs in sync with code

### Update README.md

```markdown
# Feature Name

Brief description of what it does.

## Usage

\`\`\`typescript
// Code example
\`\`\`

## API Reference

Document all functions/endpoints.

## Examples

Real-world usage examples.
```

### API Documentation

```markdown
### POST /api/endpoint
Description of what this endpoint does.

**Request:**
\`\`\`json
{ "field": "value" }
\`\`\`

**Response (200):**
\`\`\`json
{ "id": "123", "field": "value" }
\`\`\`
```

---

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/kenii748k-cloud/daya-ai/issues)
- **Discussions:** [GitHub Discussions](https://github.com/GrupoSH/daya-ia/discussions)
- **Email:** support@daya-ai.com

---

## Recognition

All contributors are recognized in:
- [CONTRIBUTORS.md](CONTRIBUTORS.md)
- GitHub contributors page
- Release notes

Thank you for contributing! 🎉
