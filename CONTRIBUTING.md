# Contributing

Thanks for testing or suggesting improvements. The best feedback is specific, reproducible, and careful with private information.

## Before Opening An Issue

- Search existing issues first.
- Use the template that fits best.
- Include your OS, browser, app version, and the exact repo or screen involved.
- Add screenshots only after removing tokens, emails, personal data, customer data, payment info, and private account details.

## Pull Request Checklist

- Keep the change focused.
- Explain what changed and why.
- Include setup or test notes.
- Preserve safe defaults for money, accounts, devices, production data, and automation.
- Do not commit secrets, `.env` files, generated credentials, private exports, build outputs, or dependency folders.

## Safety Defaults

Code should fail closed when an operation could cost money, change a real account, write to hardware, delete data, place a trade, send messages, or affect production users. Use mocks, paper mode, local mode, dry runs, or explicit confirmation gates by default.
