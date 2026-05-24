# Security Policy

## Supported Projects

Active and maintained projects are listed in the main profile catalog at <https://github.com/P4ND4907/P4ND4907/blob/main/PROJECTS.md>.

Archived and unfinished experiments may not receive security fixes unless they are revived.

## Reporting A Vulnerability

Please do not open a public issue with secret values, exploit steps that could harm users, private customer data, payment details, account credentials, API keys, screenshots containing tokens, or production logs.

Preferred reporting paths:

1. Use GitHub's private vulnerability reporting or security advisory flow if it is enabled on the affected repository.
2. If private reporting is not available, open a short public issue that says a private security report is needed, but leave out sensitive details.

## Safety Expectations

P4ND4907 projects should treat the following areas as high risk:

- real-money trading, betting, payments, billing, or purchases
- email, social, browser, or account-writing automation
- device control, audio driver changes, file deletion, and system writes
- customer data, personal data, logs, screenshots, and credentials
- generated code that runs commands, edits files, or talks to external services

High-risk behavior should be disabled by default, use dry-run or paper mode when possible, and require explicit confirmation before it changes real data, devices, accounts, or money.
