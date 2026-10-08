# Provenance

- `SKILL.md` — vercel-labs/agent-skills, `skills/web-design-guidelines/SKILL.md`
- `web-interface-guidelines.md` — vercel-labs/web-interface-guidelines, `command.md`
- `LICENSE` — vercel-labs/web-interface-guidelines

The upstream SKILL.md fetches its rules at review time from
`raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.
That host is blocked by this project's cloud-session network policy and
WebFetch is non-functional in that environment, so the rules file is
vendored here and the review reads the local copy. Re-sync both files
together if the upstream rules change.
