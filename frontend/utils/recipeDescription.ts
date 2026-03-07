export function cleanRecipeDescription(input?: string | null): string {
  if (!input) return '';

  return input
    .replace(/\s*Crafted with Real-Food standards:[^.]*\./gi, '')
    .replace(/\s*Includes\s+\d+\s+whole-food ingredient swap\(s\)\./gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
