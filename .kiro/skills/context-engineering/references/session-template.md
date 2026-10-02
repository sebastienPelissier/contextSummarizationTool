# Session Summary Template

**Fill this template BEFORE running /clear or /compact**

---

## Session Metadata

- **Date:** YYYY-MM-DD
- **Agent:** kiro | claude-code | cursor | other
- **Project:** project-name
- **Context usage at snapshot:** XX%
- **Summary mode:** conversational | agentic
- **Target token budget:** 1000 (conversational) | 2000 (agentic)

---

## Main Objective

<!-- The overall session objective - specific, minimum 3 words, never generic -->

_Describe what you were trying to accomplish in this session._

---

## Project State

**Current layer:** (e.g., domain, data, presentation, infrastructure)

**Completed tasks:**
- Task 1
- Task 2

**Pending tasks:**
- Task 1
- Task 2

---

## Decisions Made

<!-- All architectural/technical decisions with their reasoning -->
<!-- Format: decision + reason (NEVER omit the "why") -->

### Decision 1: [Title]
**What:** Brief description of the decision  
**Why:** The reasoning behind it (this is critical)  
**Files affected:**
- `path/to/file1.ts`
- `path/to/file2.ts`

### Decision 2: [Title]
**What:** Brief description  
**Why:** The reasoning  
**Files affected:**
- `path/to/file.ts`

---

## Active Conventions

<!-- Project/session-specific conventions complementary to project standards -->

**Naming:** (e.g., camelCase for functions, PascalCase for classes)

**File structure:** (e.g., feature-based under src/features/)

**Testing:** (e.g., vitest with TDD, integration tests in tests/)

**Patterns:**
- Pattern 1
- Pattern 2

---

## Modified Files

<!-- Important files created or modified in this session -->

### Created
- **`path/to/new-file.ts`** - Brief description of what it does

### Modified
- **`path/to/existing-file.ts`** - What changed and why

### To create next
- **`path/to/future-file.ts`** - What needs to be created

---

## Next Steps

<!-- Concrete next actions, not vague statements -->

1. Specific task 1
2. Specific task 2
3. Specific task 3

---

## Warnings

<!-- Pitfalls to avoid, errors encountered, edge cases discovered -->

- ⚠️ Warning 1: Description and why it matters
- ⚠️ Warning 2: Description and context
- 🐛 Known issue: Description and workaround if any

---

## Results & Tests

**Tests status:** ✅ passing | ❌ failing | 🟡 partial

**Test coverage:** (e.g., "unit: 85%, integration: 60%")

**Known issues:**
- Issue 1: Description
- Issue 2: Description

**Context tokens saved:** (e.g., "from 145k to 38k tokens after document-and-clear")

---

## Resume Here

<!-- THE MOST CRITICAL SECTION -->
<!-- Contains the exact first prompt to use in the next session -->
<!-- NEVER write "Continue where we left off" or similar hollow phrases -->

**First prompt for next session:**

```
[Write the specific, actionable prompt that will let you (or another agent) 
resume work immediately. Include context about what was just completed and 
what needs to happen next. Be specific about files, functions, or features.]
```

**Files to load first (tier 1 context):**
- `path/to/critical-file-1.ts`
- `path/to/critical-file-2.ts`

**Open questions to investigate:**
- Question 1: Why/context
- Question 2: Why/context

---

## Session Metadata (End)

- **Summary created:** YYYY-MM-DD HH:MM
- **Next session ID:** (will be filled after /clear)
- **Session continuity:** ✅ preserved | ⚠️ partial | ❌ lost
