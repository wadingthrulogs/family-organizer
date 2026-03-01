# Security Policy

## Reporting a Vulnerability

If you discover a security issue in Family Organizer, please **do not open a public GitHub issue**. Instead, report it privately:

- **GitHub:** Use [GitHub Private Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) on this repository
- **Email:** Send details to the maintainer directly (see profile contact info)

Please include:
- A description of the issue and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested mitigations if you have them

You can expect an acknowledgment within **48 hours** and a status update within **7 days**.

---

## Scope

**In scope:**
- Authentication and session handling flaws
- Privilege escalation between user roles (ADMIN / MEMBER / VIEWER)
- Data exposure across household boundaries
- Input validation bypasses leading to unintended data modification

**Out of scope:**
- Issues requiring physical access to the host machine
- Self-hosted misconfiguration (e.g. exposing the app to the public internet without auth)
- Denial-of-service against a local LAN deployment
- Findings in third-party dependencies — please report those upstream

---

## Supported Versions

This project is in early development. Only the latest release on `main` receives security fixes.

---

## Disclosure Policy

Once a fix is available, the vulnerability will be disclosed publicly in the GitHub advisory and noted in `CHANGELOG.md`. We follow a **90-day coordinated disclosure** window.
