#!/usr/bin/env node
#!/usr/bin/env node

// src/hook/auto-track.mjs
import fs from "fs";
import path from "path";
var THROTTLE_MS = 3e4;
var TIMEOUT_MS = 5e3;
var input = "";
for await (const chunk of process.stdin) input += chunk;
var payload;
try {
  payload = JSON.parse(input);
} catch {
  process.exit(0);
}
var cwd = payload.cwd || process.cwd();
var cloudPath = path.join(cwd, ".vibe-focus", "cloud.json");
if (!fs.existsSync(cloudPath)) process.exit(0);
var cloud;
try {
  cloud = JSON.parse(fs.readFileSync(cloudPath, "utf-8"));
} catch {
  process.exit(0);
}
if (!cloud.apiUrl || !cloud.userId || !cloud.projectId) process.exit(0);
var token = cloud.apiKey || cloud.accessToken;
if (!token) process.exit(0);
var stampPath = path.join(cwd, ".vibe-focus", ".last-heartbeat");
try {
  const last = parseInt(fs.readFileSync(stampPath, "utf-8"), 10);
  if (Date.now() - last < THROTTLE_MS) process.exit(0);
} catch {
}
var activeFiles = [];
if (payload.tool_input?.file_path) {
  activeFiles.push(payload.tool_input.file_path);
}
var body = {
  user_id: cloud.userId,
  project_id: cloud.projectId,
  status: "coding",
  active_files: activeFiles,
  focus_score: 80
};
try {
  const res = await fetch(`${cloud.apiUrl}/api/heartbeat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (res.ok) {
    fs.writeFileSync(stampPath, String(Date.now()));
  }
} catch {
}
process.exit(0);
