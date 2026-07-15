export function renderTemplate(
  template: string,
  row: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const val = row[key];
    return val === null || val === undefined ? "" : String(val);
  });
}
