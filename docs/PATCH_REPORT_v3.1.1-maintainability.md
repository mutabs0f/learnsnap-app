# Patch Report: v3.1.1 Maintainability (Duplication Cleanup)

**Date**: January 10, 2026  
**Type**: Maintainability  
**Risk Level**: Minimal  
**Breaking Changes**: None

## Summary

This patch addresses repository duplication by archiving the duplicate `/learnsnap/` folder that was a snapshot of the canonical codebase at `/server/`, `/client/`, `/shared/`.

**Option Chosen**: B (Archive) - Due to file permission restrictions, the folder was moved to `/_archive/` instead of deleted.

## Discovery Evidence

### Step 0: Identify Entry Points

**package.json scripts**:
```json
"dev": "NODE_ENV=development tsx server/index.ts",
"build": "tsx script/build.ts",
"start": "NODE_ENV=production node dist/index.cjs"
```

All scripts reference root-level `/server/` and `/script/` - NOT `/learnsnap/`.

**Reference Search**:
```bash
$ rg -n "learnsnap/" . --type-not binary -g '!_archive/*'
# Result: No output (zero references)
```

**Railway Config Check**:
```bash
$ cat railway.toml railway.json | grep -i learnsnap
# Result: No learnsnap references in railway configs
```

**Conclusion**: The canonical source is the root-level `/server/`, `/client/`, `/shared/`. The `/learnsnap/` folder was a duplicate snapshot not used anywhere.

## Changes Made

### 1. Moved Duplicate to Archive

```bash
# Before
/learnsnap/
  ├── api/
  ├── client/
  ├── server/
  ├── shared/
  └── DEPRECATED_README.md

# After
/_archive/
  ├── README.md (new)
  └── learnsnap_DUPLICATE_SNAPSHOT/
      ├── api/
      ├── client/
      ├── server/
      ├── shared/
      └── DEPRECATED_README.md
```

### 2. Added CI Guardrail

**File**: `scripts/check-no-duplicate.cjs`

```javascript
const DUPLICATE_FOLDER = path.join(__dirname, '..', 'learnsnap');
if (fs.existsSync(DUPLICATE_FOLDER)) {
  console.error('ERROR: Duplicate folder /learnsnap detected!');
  process.exit(1);
}
```

**Wired into CI**: `.github/workflows/ci.yml`
```yaml
- name: Check for duplicate folders
  run: node scripts/check-no-duplicate.cjs
```

### 3. Archive Documentation

**File**: `_archive/README.md`

Documents that the archive contains deprecated snapshots not used for build/deploy.

## Files Changed

| Path | Action |
|------|--------|
| `/learnsnap/` | Moved to `/_archive/learnsnap_DUPLICATE_SNAPSHOT/` |
| `/_archive/README.md` | Created |
| `/scripts/check-no-duplicate.cjs` | Created |
| `/.github/workflows/ci.yml` | Modified (added guardrail step) |
| `/docs/PATCH_REPORT_v3.1.1-maintainability.md` | Created |

## Verification

### Build Test
```bash
$ npm run build
# Status: Success (no changes to build)
```

### CI Guardrail Test
```bash
$ node scripts/check-no-duplicate.cjs
INFO: Archived duplicate exists at /_archive/learnsnap_DUPLICATE_SNAPSHOT/ (OK)
OK: No duplicate /learnsnap folder at root level.
```

### Reference Check
```bash
$ rg -n "learnsnap/" . -g '!_archive/*'
# Result: No output (clean)
```

## Rollback Steps

If rollback is needed:

```bash
# Move archive back to root
mv _archive/learnsnap_DUPLICATE_SNAPSHOT learnsnap

# Remove CI guardrail (optional)
# Edit .github/workflows/ci.yml to remove "Check for duplicate folders" step
```

Or restore from git:
```bash
git checkout <commit-before-patch> -- learnsnap/
```

## Notes

- No functional changes to application
- No API contract changes
- No database changes
- Archive can be permanently deleted after 30 days if no issues arise
- CI guardrail prevents accidental recreation of duplicate folder

### Archive Location Notice

- `/_archive/` exists in the **Replit dev workspace only** as a historical snapshot
- **Production ZIP intentionally excludes `/_archive/`** — it is not shipped to Railway or any deployment target
- The archive serves only as a local reference for developers who need to consult the old structure

---

*v3.1.1 - January 10, 2026*
