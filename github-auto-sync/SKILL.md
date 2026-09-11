---
name: github-auto-sync
description: After completing a user-requested code change in a Git repository, validate it, commit only the task-related changes, and push the current branch to its configured GitHub remote. Use for coding tasks when automatic commit-and-push is the standing workflow.
---

# GitHub Auto Sync

Complete each code-changing task with one clean, verified commit and one normal push. Treat installation or activation of this skill as standing authorization for that task's ordinary `git commit` and `git push`; do not ask for routine confirmation unless a safety condition below requires a decision. If the user says not to commit or push, follow the user's latest instruction.

This workflow applies to code and directly related tests, configuration, migrations, lockfiles, and documentation. Do not create commits for read-only reviews, explanations, diagnostics, or tasks that make no file changes.

## Before editing

1. Confirm the workspace is inside a Git repository and identify its root.
2. Record the current branch, configured remotes, upstream branch, and initial working-tree state.
3. Preserve all pre-existing user changes. Track which files and hunks belong to the current task.
4. Ensure the branch is attached and a GitHub push remote is configured. Prefer `origin` when it exists; otherwise use the current branch's configured push remote.

If the repository, branch, or remote is missing or ambiguous, make the requested local code change but stop before committing or pushing. Explain the exact setup that is missing.

## Implement and verify

Finish the requested change before creating the commit. Run the narrowest relevant formatter, linter, type check, build, and tests available in the repository. Follow repository instructions such as `AGENTS.md` and existing project scripts.

Do not commit or push when a relevant check fails. Report the failure and leave the changes available for correction. A check that cannot run because of a clearly unrelated environment limitation may be reported as not run; use judgment and never describe it as passing.

## Protect the repository

- Never stage unrelated or pre-existing changes.
- Stage explicit task-related paths or hunks; do not use `git add .`, `git add -A`, or `git commit -am` in a dirty worktree.
- Before staging, inspect the final diff. After staging, inspect the staged diff and confirm every staged change belongs to the task.
- If task changes overlap pre-existing edits in the same hunk and cannot be separated safely, pause and ask the user how to proceed.
- Never commit secrets, credentials, tokens, private keys, `.env` files, database dumps, personal data, or unexpectedly large generated files. Stop and report the suspected file without exposing secret contents.
- Respect `.gitignore`; do not bypass it unless the user explicitly requests that exact file.
- Do not discard, stash, reset, overwrite, or rewrite the user's changes to obtain a clean tree.
- Never use force push, `--no-verify`, destructive reset, automatic conflict resolution, or history rewriting.

## Create the commit

Create one commit per completed user request unless the user asks for a different commit structure.

1. Stage only the verified task-related files or hunks.
2. Run `git diff --cached --check` and review `git diff --cached`.
3. If nothing is staged, do not create an empty commit.
4. Write a concise Conventional Commit message that describes the outcome, for example `fix(auth): handle returning Google users` or `feat(contract): add independent risk-list scrolling`.
5. Allow normal Git hooks to run. If a hook changes files or fails, review the result, rerun relevant checks, and retry only when the changes remain within scope.
6. Inspect the resulting commit and confirm it contains only intended files.

Do not amend an existing user commit. Amend the new, unpushed task commit only when a hook or immediate verification exposes an error in that same commit and doing so does not rewrite shared history.

## Push to GitHub

Push the current branch with a normal fast-forward push.

- If an upstream exists, use `git push`.
- If no upstream exists and the remote and branch are unambiguous, use `git push -u <remote> <current-branch>`.
- Never silently switch branches or create a different branch solely to make the push succeed.
- If the push is rejected, authentication fails, branch protection blocks it, or the remote contains divergent commits, stop. Do not automatically pull, merge, rebase, force push, or retry repeatedly.

## Report the result

At the end, state:

- which verification commands passed, failed, or could not run;
- the commit message and short commit hash;
- the pushed branch and remote;
- any task-related files intentionally left uncommitted;
- the precise blocker when commit or push did not complete.

Do not claim the code is on GitHub unless the push command succeeded.
