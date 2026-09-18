import { parseFile } from "../parser.js";
import { findTranscripts, resolveProjectsDir } from "../scan.js";
import type { ClientAdapter } from "../types.js";

export const claudeCodeAdapter: ClientAdapter = {
  name: "claude-code",
  async collect(opts, sink) {
    const files = await findTranscripts(resolveProjectsDir(opts.dir), opts);
    const stats = { filesScanned: 0, filesFailed: 0, linesSkipped: 0 };
    for (const file of files) {
      try {
        stats.linesSkipped += (await parseFile(file, sink)).linesSkipped;
        stats.filesScanned++;
      } catch {
        stats.filesFailed++;
      }
    }
    return stats;
  },
};
