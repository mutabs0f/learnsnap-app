#!/usr/bin/env node
/**
 * CI Guardrail: Prevents accidental recreation of duplicate /learnsnap folder
 * 
 * Run: node scripts/check-no-duplicate.cjs
 * Exits with code 1 if /learnsnap exists at root level, 0 otherwise
 * 
 * Note: /_archive/learnsnap_DUPLICATE_SNAPSHOT/ is allowed (archived copy)
 * File uses .cjs extension for CommonJS compatibility with "type": "module" in package.json
 * 
 * Added in v3.1.1 (Maintainability Patch)
 */

const fs = require('fs');
const path = require('path');

const DUPLICATE_FOLDER = path.join(__dirname, '..', 'learnsnap');
const ARCHIVE_FOLDER = path.join(__dirname, '..', '_archive', 'learnsnap_DUPLICATE_SNAPSHOT');

if (fs.existsSync(DUPLICATE_FOLDER)) {
  console.error('ERROR: Duplicate folder /learnsnap detected at root level!');
  console.error('The canonical codebase is at /server, /client, /shared.');
  console.error('Remove /learnsnap or move to /_archive/ before committing.');
  process.exit(1);
}

if (fs.existsSync(ARCHIVE_FOLDER)) {
  console.log('INFO: Archived duplicate exists at /_archive/learnsnap_DUPLICATE_SNAPSHOT/ (OK)');
}

console.log('OK: No duplicate /learnsnap folder at root level.');
process.exit(0);
