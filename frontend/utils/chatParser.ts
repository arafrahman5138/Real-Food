/**
 * Chat message parsing utilities.
 *
 * Extracts structured recipe data, ingredient-swap lists, and plain-text
 * messages from the various formats the Healthify LLM may return (JSON,
 * markdown, loose key-value, mixed).
 */

// ── Types ──────────────────────────────────────────────────────────────

export type RecipeIngredient = {
  name: string;
  quantity?: string | number;
  unit?: string;
};

export type RecipeData = {
  id?: string;
  title: string;
  description?: string;
  ingredients: RecipeIngredient[];
  steps: string[];
  prep_time_min?: number;
  cook_time_min?: number;
  servings?: number;
};

export type NormalizedAssistantPayload = {
  message: string;
  recipe: RecipeData | null;
  swaps?: any[];
  nutrition?: any;
};

export type RecipeDraft = {
  title: string;
  description: string;
  servings: string;
  prepTime: string;
  cookTime: string;
  ingredientsText: string;
  stepsText: string;
};

// ── Helpers ────────────────────────────────────────────────────────────

export function toStringValue(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

export function extractJsonObject(text: string): any | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const altCodeBlockMatch = text.match(/'''(?:json)?\s*([\s\S]*?)'''/i);
  const candidate = (codeBlockMatch?.[1] || altCodeBlockMatch?.[1] || text).trim();

  const sanitize = (input: string) =>
    input
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/("quantity"\s*:\s*)(\d+\s*\/\s*\d+)(\s*[,}])/gi, '$1"$2"$3')
      .replace(/,\s*([}\]])/g, '$1');

  const normalizedCandidate = sanitize(candidate);

  try {
    return JSON.parse(normalizedCandidate);
  } catch {}

  try {
    return JSON.parse(candidate);
  } catch {}

  const start = normalizedCandidate.indexOf('{');
  const end = normalizedCandidate.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const sliced = normalizedCandidate.slice(start, end + 1);
    try {
      return JSON.parse(sliced);
    } catch {}
  }
  return null;
}

export function extractMessageFromLooseJson(text: string): string {
  const match = text.match(/"message"\s*:\s*"([\s\S]*?)"\s*,\s*"recipe"/i);
  if (!match?.[1]) return '';
  return match[1].replace(/\\n/g, '\n').trim();
}

export function extractRecipeFromMarkdown(
  text: string,
): { message: string; recipe: any | null; swaps?: any[] } {
  const lines = (text || '').split('\n');
  let mode: 'message' | 'ingredients' | 'steps' | 'swaps' | 'nutrition' = 'message';
  let sawRecipe = false;

  const messageLines: string[] = [];
  const ingredients: Array<{ name: string; quantity?: string | number; unit?: string }> = [];
  const steps: string[] = [];
  const swaps: Array<{ original?: string; replacement?: string; reason?: string }> = [];
  let currentSwap: { original?: string; replacement?: string; reason?: string } | null = null;

  let title = '';
  let description = '';
  let prepTime: number | undefined;
  let cookTime: number | undefined;
  let servings: number | undefined;

  const cleanMd = (line: string) =>
    (line || '')
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/^#+\s*/, '')
      .trim();

  const parseIngredient = (line: string) => {
    let value = cleanMd(line)
      .replace(/^[-*•]\s*/, '')
      .replace(/^\d+[\).\s-]+/, '')
      .trim();
    if (!value) return null;

    if (value.includes(':')) {
      const [name, qty] = value.split(':', 2);
      return { name: name.trim(), quantity: qty.trim(), unit: '' };
    }

    const m = value.match(/^(\d+(?:\/\d+)?(?:\.\d+)?)(?:\s+([a-zA-Z]+))?\s+(.+)$/);
    if (m) {
      return {
        name: m[3].trim(),
        quantity: m[1].trim(),
        unit: (m[2] || '').trim(),
      };
    }
    return { name: value, quantity: '', unit: '' };
  };

  for (const raw of lines) {
    let line = (raw || '').trim();
    if (!line || line.startsWith('```') || line.startsWith("'''")) continue;

    line = cleanMd(line);

    const titleMatch = line.match(/^(?:recipe|title)\s*:\s*(.+)$/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
      sawRecipe = true;
      continue;
    }

    const descMatch = line.match(/^description\s*:\s*(.+)$/i);
    if (descMatch) {
      description = descMatch[1].trim();
      sawRecipe = true;
      continue;
    }

    if (/^ingredients?\s*:?$/i.test(line)) {
      mode = 'ingredients';
      sawRecipe = true;
      continue;
    }

    if (/^(instructions?|steps?|directions?)\s*:?$/i.test(line)) {
      mode = 'steps';
      sawRecipe = true;
      continue;
    }

    if (/^swaps?\s*:?$/i.test(line)) {
      mode = 'swaps';
      sawRecipe = true;
      continue;
    }

    if (/^nutrition(?:\s*comparison)?\s*:?$/i.test(line)) {
      mode = 'nutrition';
      continue;
    }

    const prepMatch = line.match(/^prep\s*time\s*:?\s*(\d+)/i);
    if (prepMatch) {
      prepTime = Number(prepMatch[1]);
      sawRecipe = true;
      continue;
    }
    const cookMatch = line.match(/^cook\s*time\s*:?\s*(\d+)/i);
    if (cookMatch) {
      cookTime = Number(cookMatch[1]);
      sawRecipe = true;
      continue;
    }
    const servingsMatch = line.match(/^servings?\s*:?\s*(\d+)/i);
    if (servingsMatch) {
      servings = Number(servingsMatch[1]);
      sawRecipe = true;
      continue;
    }

    if (mode === 'ingredients') {
      if (/^(instructions?|steps?|directions?)\s*:?$/i.test(line)) {
        mode = 'steps';
        sawRecipe = true;
        continue;
      }
      if (/^swaps?\s*:?$/i.test(line)) {
        mode = 'swaps';
        continue;
      }
      if (/^nutrition(?:\s*comparison)?\s*:?$/i.test(line)) {
        mode = 'nutrition';
        continue;
      }
      const ingredient = parseIngredient(raw);
      if (ingredient) {
        ingredients.push(ingredient);
        sawRecipe = true;
      }
      continue;
    }

    if (mode === 'steps') {
      if (/^swaps?\s*:?$/i.test(line)) {
        mode = 'swaps';
        continue;
      }
      if (/^nutrition(?:\s*comparison)?\s*:?$/i.test(line)) {
        mode = 'nutrition';
        continue;
      }
      const step = line.replace(/^\d+[\).\s-]+/, '').replace(/^[-*•]\s*/, '').trim();
      if (step) {
        steps.push(step);
        sawRecipe = true;
      }
      continue;
    }

    if (mode === 'swaps') {
      if (/^nutrition(?:\s*comparison)?\s*:?$/i.test(line)) {
        if (currentSwap && (currentSwap.original || currentSwap.replacement)) {
          swaps.push({
            ...currentSwap,
            reason: currentSwap.reason || 'healthier whole-food alternative',
          });
          currentSwap = null;
        }
        mode = 'nutrition';
        continue;
      }

      const normalizedLine = line.replace(/^\d+[\).\s-]+/, '').trim();

      const originalMatch = normalizedLine.match(/^original\s*:\s*(.+)$/i);
      if (originalMatch) {
        if (currentSwap && (currentSwap.original || currentSwap.replacement)) {
          swaps.push({
            ...currentSwap,
            reason: currentSwap.reason || 'healthier whole-food alternative',
          });
        }
        currentSwap = { original: originalMatch[1].trim() };
        sawRecipe = true;
        continue;
      }

      const replacementMatch = normalizedLine.match(/^replacement\s*:\s*(.+)$/i);
      if (replacementMatch) {
        currentSwap = { ...(currentSwap || {}), replacement: replacementMatch[1].trim() };
        sawRecipe = true;
        continue;
      }

      const reasonMatch = normalizedLine.match(/^reason\s*:\s*(.+)$/i);
      if (reasonMatch) {
        currentSwap = { ...(currentSwap || {}), reason: reasonMatch[1].trim() };
        if (currentSwap.original || currentSwap.replacement) {
          swaps.push({
            ...currentSwap,
            reason: currentSwap.reason || 'healthier whole-food alternative',
          });
          currentSwap = null;
        }
        sawRecipe = true;
        continue;
      }

      const arrowMatch = normalizedLine.match(/^(.+?)\s*(?:->|→)\s*(.+?)(?:\s*[—-]\s*(.+))?$/);
      if (arrowMatch) {
        swaps.push({
          original: arrowMatch[1].trim(),
          replacement: arrowMatch[2].trim(),
          reason: (arrowMatch[3] || 'healthier whole-food alternative').trim(),
        });
        sawRecipe = true;
      }
      continue;
    }

    messageLines.push(line);
  }

  if (!sawRecipe) {
    return { message: text, recipe: null };
  }

  if (currentSwap && (currentSwap.original || currentSwap.replacement)) {
    swaps.push({
      ...currentSwap,
      reason: currentSwap.reason || 'healthier whole-food alternative',
    });
  }

  const message =
    messageLines.filter(Boolean).join('\n').trim() ||
    'Here\u2019s a healthified version with cleaner ingredients.';
  return {
    message,
    recipe: {
      title: title || 'Healthified Recipe',
      description,
      ingredients,
      steps,
      prep_time_min: prepTime,
      cook_time_min: cookTime,
      servings,
    },
    swaps: swaps.length > 0 ? swaps : undefined,
  };
}

export function toRecipeData(input: any): RecipeData | null {
  if (!input || typeof input !== 'object') return null;
  const ingredients = Array.isArray(input.ingredients) ? input.ingredients : [];
  const steps = Array.isArray(input.steps) ? input.steps : [];

  return {
    id: input.id ? toStringValue(input.id) : undefined,
    title: toStringValue(input.title || 'Healthified Recipe'),
    description: toStringValue(input.description || ''),
    ingredients: ingredients.map((ing: any) => ({
      name: toStringValue(ing?.name),
      quantity: ing?.quantity ?? '',
      unit: toStringValue(ing?.unit || ''),
    })),
    steps: steps.map((step: any) => toStringValue(step)).filter(Boolean),
    prep_time_min: Number.isFinite(Number(input.prep_time_min))
      ? Number(input.prep_time_min)
      : undefined,
    cook_time_min: Number.isFinite(Number(input.cook_time_min))
      ? Number(input.cook_time_min)
      : undefined,
    servings: Number.isFinite(Number(input.servings))
      ? Number(input.servings)
      : undefined,
  };
}

export function normalizeAssistantPayload(msg: {
  content: string;
  recipe?: any;
  swaps?: any[];
  nutrition?: any;
}): NormalizedAssistantPayload {
  const parsedFromContent = extractJsonObject(msg.content || '');
  const extractedMessage =
    parsedFromContent && typeof parsedFromContent === 'object'
      ? toStringValue(parsedFromContent.message || '')
      : '';

  if (msg.recipe) {
    const fallbackMessage =
      extractedMessage ||
      (msg.content?.trim().startsWith('```') || msg.content?.trim().startsWith('{')
        ? 'Here\u2019s a healthified version with cleaner ingredients.'
        : toStringValue(
            msg.content || 'Here\u2019s a healthified version with cleaner ingredients.',
          ));

    return {
      message: fallbackMessage,
      recipe: toRecipeData(msg.recipe),
      swaps: msg.swaps,
      nutrition: msg.nutrition,
    };
  }

  const parsed = parsedFromContent;
  if (parsed && typeof parsed === 'object') {
    return {
      message: toStringValue(parsed.message || ''),
      recipe: toRecipeData(parsed.recipe),
      swaps: Array.isArray(parsed.swaps) ? parsed.swaps : undefined,
      nutrition: parsed.nutrition,
    };
  }

  const looseMessage = extractMessageFromLooseJson(msg.content || '');
  if (looseMessage) {
    return {
      message: looseMessage,
      recipe: null,
      swaps: msg.swaps,
      nutrition: msg.nutrition,
    };
  }

  const markdownFallback = extractRecipeFromMarkdown(msg.content || '');
  if (markdownFallback.recipe) {
    return {
      message: markdownFallback.message,
      recipe: toRecipeData(markdownFallback.recipe),
      swaps: msg.swaps?.length ? msg.swaps : markdownFallback.swaps,
      nutrition: msg.nutrition,
    };
  }

  return {
    message: msg.content,
    recipe: null,
    swaps: msg.swaps,
    nutrition: msg.nutrition,
  };
}

export function parseIngredientLine(line: string): RecipeIngredient {
  const trimmed = line.trim();
  if (!trimmed) return { name: '' };
  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 1) return { name: trimmed };
  if (tokens.length === 2) return { quantity: tokens[0], name: tokens[1] };
  return {
    quantity: tokens[0],
    unit: tokens[1],
    name: tokens.slice(2).join(' '),
  };
}

export function recipeKeyFor(index: number): string {
  return `message-recipe-${index}`;
}
