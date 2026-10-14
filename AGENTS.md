# Portfolio collaboration and releases

Preserve the creative direction and desktop behavior unless the user requests changes. Discuss meaningful adjustments before implementation. Keep incremental, recoverable Git checkpoints.

Explicit user instructions to commit, push and deploy the requested changes authorize the complete release workflow; do not ask for the same approval again. Run `npm test`, `npm run check:assets`, `npm run build`, and `git diff --check`. Push a descriptive `codex/` branch, create and attach a pull request, require successful GitHub checks before merging to `main`, then verify Vercel production and the live site. If deployment was not explicitly requested, keep changes local. Never force-push, erase working changes, or perform destructive operations without explicit authorization.

Command sandbox approvals remain separate from release authorization. Use narrowly scoped saved command permissions when available; never bypass sandbox protections or change global security settings to avoid prompts.
