/**
 * Split an email reply body into the NEW content and the QUOTED original so the
 * inbox can collapse the quote by default (like Gmail's "···"). Detects the
 * common quote boundaries: Gmail/Apple "On <date> … wrote:", Outlook
 * "-----Original Message-----" / underscore dividers, and the first `>`-quoted
 * line. If the whole body is quoted (no new text above the boundary), we keep it
 * all as `main` so nothing is hidden.
 */
export function splitQuotedText(text: string): { main: string; quoted: string } {
  const lines = (text ?? "").split(/\r?\n/);
  const isBoundary = (ln: string): boolean =>
    /^\s*On\b.*\bwrote:\s*$/i.test(ln) ||               // "On Fri, 12 Jun 2026 …, X wrote:"
    /^\s*-{2,}\s*Original Message\s*-{2,}/i.test(ln) ||  // Outlook
    /^\s*_{5,}\s*$/.test(ln) ||                          // Outlook underscore divider
    /^\s*>+/.test(ln);                                   // first quoted line

  for (let i = 0; i < lines.length; i++) {
    if (isBoundary(lines[i])) {
      const main = lines.slice(0, i).join("\n").replace(/\s+$/, "");
      if (!main.trim()) break;   // everything is quoted → don't hide it
      return { main, quoted: lines.slice(i).join("\n") };
    }
  }
  return { main: text ?? "", quoted: "" };
}
