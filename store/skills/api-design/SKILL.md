---
name: api-design
description: Design RESTful and GraphQL APIs with consistent conventions
license: MIT
compatibility: opencode
metadata:
  audience: backend-developers
  workflow: design
---

## What I do

- Help design API endpoints following REST conventions
- Define request/response schemas with proper typing
- Establish consistent naming, versioning, and error formats
- Generate OpenAPI/Swagger specifications

## REST conventions

- Use plural nouns for resources: `/users`, `/orders`
- Use HTTP methods correctly: GET (read), POST (create), PUT (replace), PATCH (update), DELETE (remove)
- Return appropriate status codes: 200, 201, 204, 400, 401, 403, 404, 409, 422, 500
- Use consistent pagination: `?page=1&limit=20` with Link headers
- Version via URL path: `/api/v1/users`

## Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

## When to use me

Use this skill when designing new APIs or reviewing existing API designs for consistency.
