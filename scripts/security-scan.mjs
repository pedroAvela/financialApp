import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Never print matches, snippets, hashes or credential values. No dotenv loading.
export function findingsIn(source) {
  const findings = [];
  const rules = [
    /sb_secret_[A-Za-z0-9_-]{12,}/g,
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g,
    /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})/g,
    /(?:sk|rk)_(?:live_|proj-)[A-Za-z0-9_-]{20,}/g,
    /(?:service_role_key|smtp_password|smtp_pass|client_secret|access_token|refresh_token|api_secret|database_password)\s*["']?\s*[:=]\s*["']([^"'\s]{16,})["']/gi,
    /(?:postgres(?:ql)?|smtps?):\/\/[^\s/:]+:[^\s/@]+@/gi,
    /^(?:[A-Z_]*(?:SERVICE_ROLE_KEY|SECRET_KEY|PRIVATE_KEY|SMTP_PASSWORD|SMTP_PASS|ACCESS_TOKEN|REFRESH_TOKEN|API_TOKEN))\s*=\s*([^\s"'#]{16,})/gm,
    /(?:password|token|api_key|private_key)\s*["']?\s*[:=]\s*["']([A-Za-z0-9_+/=-]{32,})["']/gi,
  ];
  for (const pattern of rules) for (const match of source.matchAll(pattern)) {
    // Symbolic env references and examples are not credentials.
    if (match[1] && /^(?:process\.env\.|env\(|\$\{|<|sb_publishable_)/.test(match[1])) continue;
    findings.push(source.slice(0, match.index).split("\n").length);
  }
  // Legacy Supabase JWT keys must be classified by payload, never displayed.
  for (const match of source.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], "base64url").toString());
      if (payload.role !== "anon") findings.push(source.slice(0, match.index).split("\n").length);
    } catch { findings.push(source.slice(0, match.index).split("\n").length); }
  }
  return [...new Set(findings)];
}
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : path.join(dir, e.name)))).flat();
}
export async function scan({ bundles = false } = {}) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const candidates = [...new Set([...tracked, ...execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean)])];
  const findings = [];
  const trackedEnv = tracked.filter((f) => /(^|\/)\.env(?:\.|$)/.test(f) && !f.endsWith(".env.example"));
  findings.push(...trackedEnv.map((file) => ({ file, line: 1 })));
  if (bundles) candidates.push(...await walk(".next/static")); // Missing build is an error, never a false PASS.
  for (const file of candidates) {
    // Ignored local credentials are never opened. Only versioned envs would be scanned.
    const source = await readFile(file, "utf8");
    for (const line of findingsIn(source)) findings.push({ file, line });
    if (file.replaceAll("\\", "/").startsWith(".next/static/")) {
      for (const match of source.matchAll(/SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_[A-Z_]*(?:SECRET|PRIVATE|PASSWORD|SERVICE_ROLE)/g)) {
        findings.push({ file, line: source.slice(0, match.index).split("\n").length });
      }
    }
  }
  for (const file of [".env.local", ".env.e2e.local", ".env.rls.local", ".env.production.local"]) {
    try { execFileSync("git", ["check-ignore", "--quiet", file]); }
    catch { findings.push({ file: ".gitignore", line: 1 }); }
  }
  return { files: candidates.length, findings };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await scan({ bundles: process.argv.includes("--bundles") });
    for (const finding of result.findings) console.log(`${finding.file}:${finding.line}`);
    console.log(`${result.findings.length ? "FAIL" : "PASS"}: ${result.files} arquivos; ${result.findings.length} indícios. Valores omitidos.`);
    process.exitCode = result.findings.length ? 1 : 0;
  } catch { console.error("NÃO EXECUTADO: não foi possível concluir a varredura local."); process.exitCode = 1; }
}
