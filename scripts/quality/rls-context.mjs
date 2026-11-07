// Postgres custom settings always have a dotted name (app.user_id), so these
// patterns match each statement or startup option that can write RLS context.
const gap = String.raw`(?:\s|--[^\n]*|/\*[\s\S]*?\*/)*`;
const customSetting = String.raw`(?:"[^"]*\.|"?[a-z_][\w$]*"?${gap}\.)`;
const contextWrite = new RegExp(
  [
    'set_config',
    String.raw`(?:^|;)${gap}set(?![\w$])${gap}(?:(?:session|local)(?![\w$])${gap})?${customSetting}`,
    String.raw`(?:^|[\s=])(?:-c(?:\s|%20)*|--)[a-z_][\w$]*\.`,
  ].join('|'),
  'i',
);

// A template or + chain reads as one string, with $1 for each runtime value.
function text(node) {
  if (node.type === 'Literal')
    return typeof node.value === 'string' ? node.value : '$1';
  if (node.type === 'TemplateLiteral')
    return node.quasis
      .map(
        (quasi, index) =>
          (quasi.value.cooked ?? quasi.value.raw) +
          (node.expressions[index] ? text(node.expressions[index]) : ''),
      )
      .join('');
  if (node.type === 'BinaryExpression' && node.operator === '+')
    return text(node.left) + text(node.right);
  return '$1';
}
const joined = (node) =>
  node.parent?.type === 'TemplateLiteral' ||
  (node.parent?.type === 'BinaryExpression' && node.parent.operator === '+');

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      write:
        'Set RLS context with setTransactionContext() from apps/api/src/db/transaction-context.ts. A session-level SET, set_config(..., false) or "-c app.*" connection option leaks one owner into the next request on a pooled connection.',
    },
  },
  create(context) {
    function check(node) {
      if (!joined(node) && contextWrite.test(text(node)))
        context.report({ node, messageId: 'write' });
    }
    return {
      Literal: check,
      TemplateLiteral: check,
      'BinaryExpression[operator="+"]': check,
    };
  },
};
