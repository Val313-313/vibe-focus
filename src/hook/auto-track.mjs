#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook — auto-send heartbeat to vibeteamz
 * when files are edited, even without `vf start`.
 *
 * Throttled to max once per 30 seconds.
 * Reads .vibe-focus/cloud.json for auth + project info.
 */

import fs from 'node:fs';
import path from 'node:path';

const THROTTLE_MS = 30_000;
const TIMEOUT_MS = 5_000;

// Read stdin (hook payload)
let input = '';
for await (const chunk of process.stdin) input += chunk;

let payload;
try {
  payload = JSON.parse(input);
} catch {
  process.exit(0);
}

const cwd = payload.cwd || process.cwd();

// Find cloud config
const cloudPath = path.join(cwd, '.vibe-focus', 'cloud.json');
if (!fs.existsSync(cloudPath)) process.exit(0);

let cloud;
try {
  cloud = JSON.parse(fs.readFileSync(cloudPath, 'utf-8'));
} catch {
  process.exit(0);
}

if (!cloud.apiUrl || !cloud.userId || !cloud.projectId) process.exit(0);

const token = cloud.apiKey || cloud.accessToken;
if (!token) process.exit(0);

// Throttle: check timestamp file
const stampPath = path.join(cwd, '.vibe-focus', '.last-heartbeat');
try {
  const last = parseInt(fs.readFileSync(stampPath, 'utf-8'), 10);
  if (Date.now() - last < THROTTLE_MS) process.exit(0);
} catch {
  // No stamp yet, continue
}

// Extract edited file from tool output if available
const activeFiles = [];
if (payload.tool_input?.file_path) {
  activeFiles.push(payload.tool_input.file_path);
}

// Send heartbeat
const body = {
  user_id: cloud.userId,
  project_id: cloud.projectId,
  status: 'coding',
  active_files: activeFiles,
  focus_score: 80,
};

try {
  const res = await fetch(`${cloud.apiUrl}/api/heartbeat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (res.ok) {
    // Update throttle stamp
    fs.writeFileSync(stampPath, String(Date.now()));
  }
} catch {
  // Silent fail — don't break Claude's workflow
}

process.exit(0);
