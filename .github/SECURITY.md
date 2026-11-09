# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability**. You will get an answer within 7 days.

Please include:
- what is affected (API endpoint, web page, scraper, workflow),
- steps to reproduce,
- the impact you expect.

## Scope

In scope: the code in this repository, the REST API (`/v1/*`, `/health`) and the web app at
`www.boolean.page`.

Out of scope: denial-of-service or load testing against the live site, social engineering, and the
third-party job boards (Ashby, Greenhouse) whose public postings the scraper reads.

## Supported versions

Only the latest `main` is supported.
