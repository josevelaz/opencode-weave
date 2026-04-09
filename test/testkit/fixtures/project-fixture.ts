import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { dirname, join } from "path"

export interface ProjectFixture {
  directory: string
  writeFile(relativePath: string, contents: string): string
  writeProjectConfig(config: Record<string, unknown>): string
  writePlan(planName: string, contents: string | string[]): string
  cleanup(): void
}

export function createProjectFixture(prefix = "weave-test-"): ProjectFixture {
  const directory = mkdtempSync(join(tmpdir(), prefix))

  const writeFile = (relativePath: string, contents: string): string => {
    const filePath = join(directory, relativePath)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, contents, "utf-8")
    return filePath
  }

  return {
    directory,
    writeFile,
    writeProjectConfig(config) {
      return writeFile(".opencode/weave-opencode.json", JSON.stringify(config))
    },
    writePlan(planName, contents) {
      const body = Array.isArray(contents) ? contents.join("\n") : contents
      return writeFile(`.weave/plans/${planName}.md`, body)
    },
    cleanup() {
      rmSync(directory, { recursive: true, force: true })
    },
  }
}
