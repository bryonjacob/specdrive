const enabled = !process.env.NO_COLOR && (process.stdout.isTTY ?? false)

const code = (n: string) => (enabled ? `\x1b[${n}m` : '')

export const c = {
  reset: code('0'),
  bold: code('1'),
  dim: code('2'),
  red: code('31'),
  green: code('32'),
  yellow: code('33'),
  cyan: code('36'),
  boldRed: code('1;31'),
  boldGreen: code('1;32'),
}

/** Colorize text, auto-reset. */
export const fmt = {
  green: (s: string) => `${c.green}${s}${c.reset}`,
  red: (s: string) => `${c.red}${s}${c.reset}`,
  yellow: (s: string) => `${c.yellow}${s}${c.reset}`,
  cyan: (s: string) => `${c.cyan}${s}${c.reset}`,
  dim: (s: string) => `${c.dim}${s}${c.reset}`,
  bold: (s: string) => `${c.bold}${s}${c.reset}`,
  boldGreen: (s: string) => `${c.boldGreen}${s}${c.reset}`,
  boldRed: (s: string) => `${c.boldRed}${s}${c.reset}`,
}

/** Right-align number to given width. */
export function pad(n: number, width: number): string {
  return String(n).padStart(width)
}

/** Draw a box around lines. Each line is `  │  {content}  │` */
export function box(lines: string[], minWidth = 35): void {
  // Strip ANSI for width calculation
  const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
  const contentWidth = Math.max(minWidth, ...lines.map((l) => strip(l).length + 4))

  const top = `  ${c.dim}┌${'─'.repeat(contentWidth)}┐${c.reset}`
  const bot = `  ${c.dim}└${'─'.repeat(contentWidth)}┘${c.reset}`

  console.log(top)
  for (const line of lines) {
    const visible = strip(line).length
    const padding = contentWidth - visible - 4
    console.log(
      `  ${c.dim}│${c.reset}  ${line}${' '.repeat(Math.max(0, padding))}  ${c.dim}│${c.reset}`
    )
  }
  console.log(bot)
}
