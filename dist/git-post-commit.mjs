#!/usr/bin/env node
#!/usr/bin/env node

// src/hook/git-post-commit.mjs
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
var TIMEOUT_MS = 5e3;
function findCloudConfig(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    const cloudPath = path.join(dir, ".vibe-focus", "cloud.json");
    if (fs.existsSync(cloudPath)) return cloudPath;
    dir = path.dirname(dir);
  }
  return null;
}
try {
  const cwd = process.cwd();
  const cloudPath = findCloudConfig(cwd);
  if (!cloudPath) process.exit(0);
  const cloud = JSON.parse(fs.readFileSync(cloudPath, "utf-8"));
  if (!cloud.apiUrl || !cloud.userId || !cloud.projectId) process.exit(0);
  const token = cloud.apiKey || cloud.accessToken;
  if (!token) process.exit(0);
  let commitMsg = "";
  let commitHash = "";
  let changedFiles = [];
  try {
    commitMsg = execSync("git log -1 --pretty=%B", { encoding: "utf-8", timeout: 3e3 }).trim();
    commitHash = execSync("git log -1 --pretty=%h", { encoding: "utf-8", timeout: 3e3 }).trim();
    changedFiles = execSync("git diff-tree --no-commit-id --name-only -r HEAD", { encoding: "utf-8", timeout: 3e3 }).trim().split("\n").filter(Boolean);
  } catch {
    process.exit(0);
  }
  const shortMsg = commitMsg.split("\n")[0].slice(0, 200);
  const activityMessage = `Committed ${commitHash}: "${shortMsg}" (${changedFiles.length} files)`;
  const activityPromise = fetch(`${cloud.apiUrl}/api/activity/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      project_id: cloud.projectId,
      type: "commit",
      message: activityMessage
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  }).catch(() => {
  });
  const heartbeatPromise = fetch(`${cloud.apiUrl}/api/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      user_id: cloud.userId,
      project_id: cloud.projectId,
      status: "active",
      active_files: changedFiles.slice(0, 50),
      focus_score: 90
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  }).catch(() => {
  });
  await Promise.allSettled([activityPromise, heartbeatPromise]);
} catch {
}
process.exit(0);
