export function hasWindowsDrivePrefix(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path)
}

export function hasLeadingBackslash(path: string) {
  return path.startsWith("\\")
}
