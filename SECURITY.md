# 🔒 Security Policy

## Introduction

Daya-AI takes security seriously. This document outlines our security practices and how to report vulnerabilities.

---

## Security Standards

### Encryption

- **In Transit:** TLS 1.3+ (all API endpoints)
- **At Rest:** AES-256-GCM (database encryption)
- **Token Storage:** Secure httpOnly cookies
- **Password Hashing:** bcrypt with salt rounds 12

### Authentication

- **JWT Tokens** - Stateless, signed with RS256
- **Token Expiry** - 24 hours for access, 30 days for refresh
- **Multi-factor** - 2FA available (TOTP)
- **OAuth** - Google/Supabase integration
- **Session** - Secure session management

### Authorization

- **RBAC** - Role-based access control
- **Roles** - user, moderator, admin, superadmin
- **Permissions** - Granular permission system
- **Resource Ownership** - User isolation
- **Rate Limiting** - Per-user, per-IP, per-endpoint

### Data Protection

- **Input Validation** - All inputs validated
- **SQL Injection** - Prisma parameterized queries
- **XSS Prevention** - React's built-in escaping
- **CSRF** - CSRF tokens on forms
- **NoSQL Injection** - Not applicable (relational DB)

### API Security

- **CORS** - Configured per environment
- **CSP** - Content Security Policy headers
- **HSTS** - HTTP Strict Transport Security
- **API Keys** - Hashed and salted
- **Rate Limiting** - 1000 req/hour (default)

### Database Security

- **Backups** - Daily automated backups
- **Encryption** - Column-level encryption for PII
- **Access Control** - Principle of least privilege
- **Audit Logs** - All changes logged
- **Monitoring** - 24/7 monitoring

---

## Compliance

### Standards

- ✅ **OWASP Top 10** - Mitigated all issues
- ✅ **CWE Top 25** - Addressed common weaknesses
- ✅ **NIST Cybersecurity Framework** - Aligned
- ⏳ **SOC 2 Type II** - In progress
- ⏳ **HIPAA** - Healthcare module in progress
- ⏳ **GDPR** - EU data handling compliant

### Certifications

```
Target 2025 Q1:
- SOC 2 Type II
- ISO 27001
- GDPR Certified

Target 2025 Q2:
- HIPAA (Healthcare)
- PCI-DSS (Payments)
- FedRAMP (Government)
```

---

## Vulnerability Management

### Scanning

- **SAST** - Static code analysis (weekly)
- **DAST** - Dynamic security testing (monthly)
- **Dependency Scanning** - Automated (daily)
- **Container Scanning** - Image scanning (weekly)
- **Penetration Testing** - Professional audits (quarterly)

### Tools

- **GitHub Security** - Automated scanning
- **Snyk** - Dependency vulnerability
- **SonarQube** - Code quality & security
- **OWASP ZAP** - Dynamic testing
- **Trivy** - Container scanning

### Response

1. **Detection** - Automated tools + manual review
2. **Assessment** - Severity & impact analysis
3. **Remediation** - Fix & test
4. **Verification** - Re-scanning
5. **Release** - Security patches
6. **Communication** - Advisories to users

---

## Reporting Security Issues

### Please DO NOT

❌ Post security issues on GitHub
❌ Share vulnerabilities publicly
❌ Test on production
❌ Access others' data

### Please DO

✅ Email: security@daya-ai.com
✅ Use PGP key (see below)
✅ Provide detailed steps to reproduce
✅ Allow 90 days for response
✅ Coordinate disclosure timing

### PGP Key

```
Public Key ID: D1234567
Fingerprint: AAAA BBBB CCCC DDDD EEEE FFFF 1111 2222 3333 4444
Download: https://daya-ai.com/security/pgp.key
```

### Responsible Disclosure

We follow coordinated vulnerability disclosure:

1. **Report** to security@daya-ai.com
2. **Wait** for acknowledgment (48 hours)
3. **Collaborate** with our team
4. **Fix** the issue (30-90 days)
5. **Release** security patch
6. **Publish** advisory after patch

---

## Security Incident Response

### Response Plan

1. **Detect** - Monitoring + alerts
2. **Contain** - Isolate affected systems
3. **Investigate** - Root cause analysis
4. **Remediate** - Fix vulnerability
5. **Recover** - Restore services
6. **Review** - Post-mortem analysis

### Communication

- **Users** - Notification within 24 hours
- **Regulatory** - Compliance team notified
- **Partners** - API partners informed
- **Public** - Security advisory published

### SLA

| Severity | Response | Resolution |
|----------|----------|------------|
| Critical | 1 hour | 24 hours |
| High | 4 hours | 7 days |
| Medium | 24 hours | 30 days |
| Low | 72 hours | 90 days |

---

## Infrastructure Security

### Network

- **VPC** - Private network isolation
- **Firewall** - Inbound/outbound rules
- **WAF** - Web application firewall
- **DDoS** - CloudFlare protection
- **VPN** - Secure access

### Servers

- **OS Hardening** - CIS benchmarks
- **Patching** - Automatic security updates
- **Monitoring** - 24/7 intrusion detection
- **Logging** - Centralized log aggregation
- **Access** - SSH key-based only

### Deployment

- **CI/CD** - Automated testing before deploy
- **Review** - Code review required
- **Staging** - Test in staging first
- **Canary** - Gradual rollout
- **Rollback** - Quick rollback capability

---

## Data Security

### Classification

```
Public - User content, blog posts
Internal - Engineering docs, designs
Confidential - API keys, secrets
Restricted - PII, payment data, health info
```

### Handling

- **Public** - Normal storage
- **Internal** - Encrypted, team access
- **Confidential** - Secret manager (Vault)
- **Restricted** - Field-level encryption + minimal access

### Retention

- **Logs** - 90 days default
- **User Data** - Until account deletion
- **Backups** - 7 daily + 4 weekly + 12 monthly
- **Deleted** - Permanently after 30 days

### Deletion

Users can request data deletion:

```bash
POST /api/auth/delete-account
Body: { password: "confirm_password" }
```

Result:
- Personal data anonymized
- Content deleted
- Backups purged after 30 days

---

## Third-Party Security

### Dependencies

- **Audit** - npm audit weekly
- **Updates** - Automated with Dependabot
- **Review** - Manual review of major updates
- **Testing** - Full test suite on updates

### APIs

- **OpenRouter** - SOC 2 Type II compliant
- **Supabase** - Enterprise security
- **PayPal** - PCI-DSS compliant
- **Vercel** - SOC 2 Type II compliant
- **Railway** - Secure infrastructure

### Vendor Management

- **Assessment** - Security questionnaire
- **Monitoring** - Security status tracking
- **Agreements** - DPA (Data Processing Agreements)
- **Audit** - Annual vendor audits

---

## Security Checklist

Before production deployment:

- [ ] All environment secrets configured
- [ ] Database encryption enabled
- [ ] TLS certificate valid
- [ ] Rate limiting configured
- [ ] CORS origin verified
- [ ] CSRF protection active
- [ ] CSP headers set
- [ ] Security headers present
- [ ] Backup tested
- [ ] Monitoring active
- [ ] Logs centralized
- [ ] Secrets not in code
- [ ] Dependencies updated
- [ ] Security tests passing
- [ ] Code review completed

---

## Security Resources

### Internal

- **Security Guide** - docs/SECURITY_GUIDE.md
- **Incident Playbook** - docs/INCIDENT_RESPONSE.md
- **Password Policy** - docs/PASSWORD_POLICY.md
- **Access Control** - docs/ACCESS_CONTROL.md

### External

- **OWASP** - https://owasp.org
- **CWE** - https://cwe.mitre.org
- **NIST** - https://nist.gov/cybersecurity
- **CVE** - https://cve.mitre.org

---

## Security Team

- **Lead:** security@daya-ai.com
- **Response:** 24/7 on-call
- **Updates:** Monthly security digest
- **Contact:** [Security Form](https://daya-ai.com/security)

---

## Acknowledgments

We thank security researchers who responsibly report vulnerabilities.

**Hall of Fame:** Coming soon

---

**Last Reviewed:** 2026-08-30
**Next Review:** 2026-09-30

*Security is an ongoing process. This policy is updated regularly.*