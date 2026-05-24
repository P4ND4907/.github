# Repository Safety Checklist

Use this checklist when creating, cleaning, or reviewing a P4ND4907 repository.

## Code And Secrets

- No API keys, tokens, passwords, cookies, session files, `.env` files, private exports, or credentials are committed.
- `.gitignore` covers dependency folders, build outputs, local databases, logs, temp files, screenshots with private data, and generated archives.
- Example configuration uses `.env.example` or documented placeholders.
- Dangerous shell commands are documented and gated behind explicit user action.

## Runtime Safety

- Money, trading, payments, billing, and purchases default to paper, sandbox, test, mock, or dry-run mode.
- Email, social, browser, account-writing, and message-sending automation requires confirmation before sending or changing anything.
- Device, robot, driver, audio, file-delete, and system-write workflows require confirmation and show what will change.
- Production endpoints, live APIs, and paid services are opt-in.

## Tester Feedback

- Issues are enabled.
- The repo either has its own templates or inherits the default templates from `P4ND4907/.github`.
- Bugs, suggestions, tester feedback, and safety concerns have clear labels.
- Security reports avoid public secrets and follow `SECURITY.md`.

## Release And Docs

- README explains what the project does, current status, setup, and limitations.
- Releases or update notes summarize important changes.
- Archived or unfinished projects are labeled, documented, or tracked in `unfinished`.
