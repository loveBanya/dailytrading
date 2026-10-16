import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "vendor", "notepad");

function resolveInside(rel: string): string | null {
  const decoded = rel.replace(/\\/g, "/");
  if (!decoded || decoded.includes("\0")) return null;
  const abs = path.resolve(ROOT, decoded);
  const diff = path.relative(ROOT, abs);
  if (!diff || diff.startsWith("..") || path.isAbsolute(diff)) return null;
  return abs;
}

function walk(
  dir: string,
  out: { path: string; name: string; group: string }[]
) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    const slash = rel.lastIndexOf("/");
    out.push({
      path: rel,
      name: entry.name,
      group: slash >= 0 ? rel.slice(0, slash) : "root",
    });
  }
}

/** GET /api/notepad 또는 /api/notepad?path= */
export async function GET(req: NextRequest) {
  try {
    if (!fs.existsSync(ROOT)) {
      return NextResponse.json({ files: [] });
    }
    const rel = req.nextUrl.searchParams.get("path");
    if (!rel) {
      const files: { path: string; name: string; group: string }[] = [];
      walk(ROOT, files);
      files.sort((a, b) => a.path.localeCompare(b.path, "ko"));
      return NextResponse.json({ files });
    }
    const abs = resolveInside(rel);
    if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      return NextResponse.json({ error: "스크립트를 찾지 못했습니다." }, { status: 404 });
    }
    const stat = fs.statSync(abs);
    if (stat.size > 800_000) {
      return NextResponse.json({ error: "스크립트가 너무 큽니다." }, { status: 413 });
    }
    const source = fs.readFileSync(abs, "utf8");
    return NextResponse.json({
      path: rel.replace(/\\/g, "/"),
      source,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "스크립트를 읽지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
