# P4ND4907 Default Community Health Files

This repository provides default safety, contribution, issue, pull request, and tester-feedback templates for P4ND4907 projects.

## FRAGLINE

Playable idle esports manager lives in [`fragline/`](./fragline/README.md):

```bash
cd fragline
npm install
npm run dev
```

## Tester Feedback

Use the issue templates to report:

- bugs and crashes
- tester notes from real use
- product suggestions
- safety or risk concerns

Please do not paste secrets, API keys, passwords, tokens, private customer data, or real-money account details into issues, pull requests, screenshots, logs, or discussions.

## Safety Baseline

All P4ND4907 projects should default to:

- local-first behavior when privacy, hardware, or real-world testing matters
- paper/sandbox/test mode for money, markets, payments, accounts, and destructive actions
- explicit user approval before writing to devices, accounts, production data, or paid services
- clear setup notes, environment examples, and known limitations
- issue templates that make it easy for testers to give useful feedback
