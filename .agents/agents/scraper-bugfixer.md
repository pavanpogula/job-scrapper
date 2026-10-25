---
name: scraper-bugfixer
description: "Fixes actionable issues from a scrape error report using the self-healing protocol. Use when asked to fix scrape errors or given an error report path."
tools: [view_file, grep_search, run_command, replace_file_content]
model: inherit
commandExecutionPolicy: sandbox
skills: [fix-from-error-report, record-decision, release-notes, verify-change]
---
Read docs/agents/roles/scraper-bugfixer.md first and follow it exactly. Never push, never switch to main, never edit files outside the allowed scope listed there.
