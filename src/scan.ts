import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export class ProjectsDirNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`No Claude Code transcripts found: ${path} does not exist. Use --dir to point at your Claude config directory.`);
    this.name = "ProjectsDirNotFoundError";
  }
}

export function resolveProjectsDir(dir?: string): string {
  return join(dir ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
}

/** Claude Code names project folders after the cwd with `\ / : .` replaced by `-`. Drive-letter case varies. */
export function slugify(path: string): string {
  return path.replace(/[\\/:.]/g, "-").toLowerCase();
}

/** Lists session and subagent transcripts, optionally limited to recent files and matching projects. */
export async function findTranscripts(
  projectsDir: string,
  opts: { since?: Date; project?: string } = {},
): Promise<string[]> {
  let projects;
  try {
    projects = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    throw new ProjectsDirNotFoundError(projectsDir);
  }
  const wanted = opts.project ? slugify(opts.project) : undefined;
  const sinceMs = opts.since?.getTime();
  const files: string[] = [];
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    if (wanted && !project.name.toLowerCase().includes(wanted)) continue;
    const root = join(projectsDir, project.name);
    for (const relative of await readdir(root, { recursive: true })) {
      if (!relative.endsWith(".jsonl")) continue;
      const file = join(root, relative);
      if (sinceMs !== undefined && (await stat(file)).mtimeMs < sinceMs) continue;
      files.push(file);
    }
  }
  return files.sort();
}
