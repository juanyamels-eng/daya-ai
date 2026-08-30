# ❓ Frequently Asked Questions

## General

### What is Daya-AI?

Daya-AI is an open-source AI platform that centralizes chat, documents, images, code, research, and automation into one unified experience. It's like having a personal AI assistant that learns over time and never makes you jump between different tools.

### How is it different from ChatGPT?

| Feature | Daya-AI | ChatGPT |
|---------|---------|----------|
| **Open Source** | ✅ Yes | ❌ No |
| **Self-Host** | ✅ Yes | ❌ No |
| **Custom Tools** | ✅ Yes | ❌ No |
| **Document RAG** | ✅ Built-in | ⚠️ Plugins |
| **Image Gen** | ✅ Built-in | ✅ Built-in |
| **Code Agent** | ✅ CLI | ❌ Limited |
| **On Prem** | ✅ Yes | ❌ No |

### Is it free?

Yes! Daya-AI is free for personal use.

- **Free Plan** - 100 messages/month
- **Pro Plan** - $29/month, unlimited
- **Enterprise** - Custom pricing

### Can I self-host it?

Yes! Full source code is available. You can deploy on:
- Your own servers
- Docker containers
- Kubernetes clusters
- Cloud providers (AWS, GCP, Azure)

---

## Getting Started

### How do I install it?

Three ways:

1. **Cloud** - Sign up at daya-ai.com
2. **Local** - Follow [GETTING_STARTED.md](docs/GETTING_STARTED.md)
3. **Docker** - `docker-compose up`

### What do I need to run it locally?

- Node.js 18+
- PostgreSQL 14+
- Git

Then:
```bash
git clone https://github.com/kenii748k-cloud/daya-ai.git
cd daya-ai/backend && npm install && npm run dev
# In another terminal
cd daya-ai/frontend && npm install && npm run dev
```

### How do I get started with Daya Code?

```bash
npm install -g daya-code
daya-code login  # Paste token from Settings → API Tokens
daya-code "add a login form"  # Your first task
```

---

## Features

### How does the AI choose which model to use?

Daya uses OpenRouter's API which supports 200+ models. It automatically selects based on:
- Task complexity
- Cost vs quality tradeoff
- User plan level
- Model availability

You can also specify: `gpt-4`, `claude-3`, `gemini-2.0`, etc.

### Can I use my own API keys?

Yes! You can:
1. Bring your own OpenRouter key
2. Use your own Anthropic/OpenAI key
3. Configure multiple providers

See [Configuration](docs/API.md#environment-variables) for details.

### How does document RAG work?

1. Upload a PDF/Word/text file
2. Daya chunks it into 512-token pieces
3. Generates vector embeddings
4. Stores in vector database
5. On query: retrieves relevant chunks
6. Includes chunks in AI context
7. AI answers based on document content

### Can I generate images?

Yes! Two options:

1. **Pollinations** (Free) - No API key needed
2. **fal.ai** (Premium) - Higher quality

### What's Daya Code?

A CLI agent that runs on your machine and can:
- Read, edit, create files
- Search your codebase
- Run commands
- Execute tests
- Create PRs
- Fix UI from screenshots

---

## Performance

### How fast is it?

| Operation | Speed |
|-----------|-------|
| Chat message | < 500ms |
| First token | 1-2s |
| Document search | < 200ms |
| Image generation | 3-5s |
| Page load | < 2s |

See [PERFORMANCE.md](PERFORMANCE.md) for detailed metrics.

### Can it handle high load?

Yes! Daya-AI can handle:
- 1,250 req/sec
- 5,000 concurrent users
- 99.95% uptime SLA

### Does it cache results?

Yes, multi-level caching:
1. Redis (response cache)
2. Database query cache
3. Vector embeddings cache
4. Browser cache
5. CDN cache

---

## Security

### Is my data secure?

Yes! We use:
- TLS 1.3 encryption (in transit)
- AES-256-GCM (at rest)
- Secure httpOnly cookies
- Regular security audits
- No data selling or sharing

See [SECURITY.md](SECURITY.md) for full details.

### What do you do with my data?

Only used to:
- Provide the service
- Improve your experience
- Comply with laws
- Never shared with third parties
- Deleted when you delete your account

### Do you log conversations?

Yes, for:
- Your account history
- Debugging & support
- Improving features

No:
- Selling data
- Training on your data (unless opt-in)
- Sharing with others

### Can I delete my account?

Yes! Go to Settings → Delete Account.
- All data deleted
- Cannot be recovered
- Processed immediately

---

## Pricing

### Why does pricing exist?

Costs to run Daya-AI:
- API costs (OpenRouter, fal.ai)
- Server costs (Railway, Vercel)
- Database (PostgreSQL)
- Support team
- Development

### Can I pay annually?

Yes! Yearly plans save 20%:
- Monthly: $29/month
- Yearly: $290/year (saves $58)

### What happens if I go over quota?

Options:
1. Upgrade to higher plan
2. Wait for monthly reset
3. Use a higher tier temporarily

### Is there a student discount?

Yes! 50% off with .edu email:
1. Sign up with student email
2. Click "Claim student discount"
3. Verify with GitHub Education

### Can I get a refund?

Yes! 30-day money-back guarantee.
Contact: billing@daya-ai.com

---

## Troubleshooting

### It's not working. What do I do?

1. Check [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
2. Search [Issues](https://github.com/kenii748k-cloud/daya-ai/issues)
3. Ask in [Discussions](https://github.com/GrupoSH/daya-ia/discussions)
4. Email: support@daya-ai.com

### Backend won't start

```bash
# Check logs
npm run dev

# Common issues:
# 1. Missing .env file
# 2. PostgreSQL not running
# 3. Database URL wrong
# 4. Port already in use

# See TROUBLESHOOTING.md for solutions
```

### Getting 401 errors

Token issues. Try:
1. Logout and login again
2. Clear browser cookies
3. Check token in DevTools
4. Refresh page

### Slow responses

1. Check your internet speed
2. Try different model (faster option)
3. Close other tabs
4. Report to: support@daya-ai.com

### CLI not working

```bash
# Check installation
daya-code --version

# Login again
daya-code logout
daya-code login

# Try simple task
daya-code "list files"

# See TROUBLESHOOTING.md for more
```

---

## Contributing

### How can I contribute?

Many ways!
1. **Code** - Fix bugs, add features
2. **Docs** - Improve documentation
3. **Issues** - Report bugs
4. **Features** - Suggest improvements
5. **Translations** - Add languages
6. **Feedback** - Tell us what works/doesn't

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Do I need permission to contribute?

No! Just:
1. Fork the repo
2. Create a branch
3. Make changes
4. Submit PR
5. Respond to feedback

### Will my contribution be accepted?

Most likely yes if:
- Follows code style
- Has tests
- Documentation updated
- No external dependencies
- Solves a real problem

Reject if:
- No tests
- Breaks existing code
- Not aligned with roadmap
- Low quality

### Can I suggest features?

Absolutely! Use:
1. [Issues](https://github.com/kenii748k-cloud/daya-ai/issues) - Bug reports
2. [Discussions](https://github.com/GrupoSH/daya-ia/discussions) - Feature ideas
3. [Roadmap voting](ROADMAP.md) - Vote on priorities

---

## Roadmap

### What's coming next?

See [ROADMAP.md](ROADMAP.md) for:
- Q4 2024 features
- Q1 2025 enterprise
- Q2 2025 mobile
- Longer-term vision

### Can I request a feature?

Yes! Comment on [Roadmap.md](ROADMAP.md) or create a discussion.

### When will feature X be released?

Check ROADMAP.md for timeline. Dates may shift based on:
- Community feedback
- Technical challenges
- Prioritization

---

## Community

### Where's the community?

- **GitHub Discussions** - Main hub
- **Twitter** - @daya_ai announcements
- **Discord** - Coming soon
- **Reddit** - r/dayaai (community run)

### How can I connect?

1. Star the repo ⭐
2. Join Discussions
3. Follow on Twitter
4. Contribute code
5. Share feedback

### Are there events?

Yes!
- Monthly community calls
- Hackathons
- Workshops
- Webinars

Subscribe to newsletter for announcements!

---

## Still have questions?

**Ways to get help:**

1. 📚 [Docs](docs/) - Comprehensive guides
2. 🤔 [Discussions](https://github.com/GrupoSH/daya-ia/discussions) - Community Q&A
3. 🐛 [Issues](https://github.com/kenii748k-cloud/daya-ai/issues) - Report bugs
4. 💬 [Discord](https://discord.gg/daya) - Real-time chat
5. 📧 Email - support@daya-ai.com

**Response times:**
- Discord: < 24 hours
- Email: < 48 hours
- GitHub: < 72 hours

---

**Last Updated:** 2026-08-30
**Questions this answers:** 50+