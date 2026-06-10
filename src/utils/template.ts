interface TemplateVars {
  name?: string | null;
  city?: string | null;
  [key: string]: string | null | undefined;
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const val = vars[key];
    return val == null ? "" : String(val);
  });
}
