---
name: pr-review
description: Structured pull request review with checklist and feedback
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: github
---

## What I do

- Review pull request diffs for correctness, style, and potential issues
- Apply a structured checklist covering common review criteria
- Provide inline-style feedback with file and line references
- Summarize the review with an overall assessment

## Review checklist

1. **Correctness**: Does the code do what it claims?
2. **Tests**: Are there adequate tests for the changes?
3. **Security**: Any new attack surfaces or vulnerabilities?
4. **Performance**: Any performance regressions?
5. **Readability**: Is the code clear and well-documented?
6. **Breaking changes**: Does this break the public API?
7. **Error handling**: Are errors handled gracefully?

## Feedback format

For each issue found, provide:
- Severity: `blocker` | `suggestion` | `nit`
- File and line reference
- What the issue is
- Suggested fix (if applicable)
