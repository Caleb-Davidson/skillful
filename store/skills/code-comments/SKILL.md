---
name: code-comments
description: Add and maintain high-quality code documentation for public APIs and complex logic
license: MIT
compatibility: opencode
metadata:
  audience: developers
  domain: code-quality
  platform: universal
---
## Core Principles
- **Purpose over presence**: Every comment must provide value. Remove or fix anything that doesn't.
- **Explain "why" not "what"**: Code shows what; docs should explain purpose, context, and constraints.
- **Self-documenting code first**: If code needs explanation, consider refactoring before adding comments.
- **Consistency**: Apply the same standards across all files in a single edit operation.

---

## Your Workflow

### Phase 1: Audit Existing Comments
Before adding or changing anything, review all existing comments in the file:

- **DELETE** comments referencing code that no longer exists
- **REWRITE** comments that describe outdated behavior
- **REMOVE** trivial comments (e.g., `// Class1`, `// TODO: Add summary`, `// Gets the value`)
- **KEEP** comments that provide genuine context or explain non-obvious decisions

### Phase 2: Document Public Surfaces
Focus exclusively on API members that external consumers will use:

**Document these:**
- Public classes, interfaces, structs
- Public methods, properties, fields
- Constructor parameters
- Public constants and enums

**Skip these (unless they have special context):**
- Private or internal members
- Generated code (DTOs, serializers)
- Simple POCO/data classes (document the class itself, not each property)

**For interfaces:**
- Document the interface contract thoroughly
- Use `<inheritdoc>` on implementations unless implementation adds specific behavior

### Phase 3: Write Purpose-Driven Comments
For each member, answer these questions in your documentation:

| Member Type | Document This |
|-------------|----------------|
| Class/Interface | What is this? What role does it play? What problem does it solve? |
| Method | What does it do? What does it return? When should someone call it? |
| Parameters | What does this value represent? Any valid range or format requirements? |
| Return value | What does the return represent? Null conditions? |
| Properties | What does this represent? What's the expected format? |
| Complex logic | Why this approach? What edge cases exist? |
| Async methods | What I/O does this perform? What exceptions can occur? |

**Avoid:**
- Restating what the code does (e.g., `// Saves the file` above `SaveAsync()`)
- Generic fillers (`// The name`, `// Gets the value`)
- Type-only descriptions (`// The user ID (int)`)

### Phase 4: Inline Comments
Use sparingly and only when code cannot be made self-explanatory:

- **Appropriate**: Explaining why a specific algorithm was chosen, non-obvious workarounds, complex edge case handling
- **Inappropriate**: Explaining obvious operations, TODO placeholders, redundant information

---

## Quality Standards

1. **Line length**: Keep comments ≤ 160 characters per line
2. **Be concise**: Avoid verbose or filler language
3. **Stay accurate**: Bad documentation is worse than no documentation
4. **When in doubt**: Omit rather than mislead

---

## Single-File Edit Rule

**CRITICAL**: Consolidate ALL comment changes for a file into ONE edit operation. Do not make multiple sequential edits to the same file.

---

## Reference Examples

### Good Documentation ✓
```dart
/// Pokemon sprite loader that fetches from PokeAPI.
/// Caches results in memory to reduce network calls.
class SpriteService {
  /// The Pokemon's species ID (National Dex number).
  final int speciesId;

  /// Fetches sprite URL, returns null if species has no official art.
  /// Throws [SocketException] if network is unavailable.
  Future<String?> getSpriteUrl(int speciesId);
}
```

### Bad Documentation ✗
```dart
/// A sprite service.
/// Gets sprites.
class SpriteService {
  /// The ID.
  final int speciesId;

  /// Gets the sprite URL.
  Future<String?> getSpriteUrl(int speciesId);
}
```

---

## Output Format

When processing a file:
1. Audit all existing comments first
2. Apply all changes in a single pass
3. Return the complete updated file content
4. If no changes needed, state that explicitly

Begin processing your assigned file(s) with this workflow.