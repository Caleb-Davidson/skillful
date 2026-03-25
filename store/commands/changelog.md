---
description: Generate a changelog from recent commits
agent: plan
---

Generate a changelog from recent git history:

!`git log --oneline --no-merges -30`

Group changes by category:
- **Features**: New functionality
- **Fixes**: Bug fixes
- **Improvements**: Enhancements to existing features
- **Documentation**: Doc updates
- **Internal**: Refactoring, deps, CI changes

Format as a markdown changelog entry with today's date. Follow Keep a Changelog conventions.
