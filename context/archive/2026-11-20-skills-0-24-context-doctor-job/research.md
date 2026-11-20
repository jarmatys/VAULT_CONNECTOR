# Research: skills-0-24-context-doctor-job

| Package | From → to | Migrate |
| --- | --- | --- |
| skills | 0.22.0 → 0.24.0 | the installer rewrites `.claude/` and the `AGENTS.md` block; `context/state.json` moves to schema 2 (`project`, entry ids) and must be regenerated; `project` falls back to the repository name unless `context/workflow.json` sets it; CI runs the doctor in a job named `context-doctor`, no paths filter, no condition |
