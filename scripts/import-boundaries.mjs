import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relative = (filename) =>
  path.relative(root, filename).split(path.sep).join('/');
const under = (value, directory) =>
  value === directory || value.startsWith(`${directory}/`);

function boundaryMessage(filename, specifier) {
  const file = relative(filename);
  const target =
    specifier.startsWith('.') || path.isAbsolute(specifier)
      ? relative(path.resolve(path.dirname(filename), specifier))
      : specifier;
  const api = under(target, '@justgo/api') || under(target, 'apps/api');
  const mobile =
    under(target, '@justgo/mobile') || under(target, 'apps/mobile');
  const contracts =
    under(target, 'packages/contracts') ||
    target.startsWith('@justgo/contracts/');
  if (under(file, 'packages/contracts') && (api || mobile))
    return 'Shared contracts cannot import app implementation.';
  if (under(file, 'apps/api') && mobile)
    return 'The API cannot import mobile code.';
  if (under(file, 'apps/mobile') && api)
    return 'Mobile cannot import API implementation.';
  if ((under(file, 'apps/mobile') || under(file, 'apps/api')) && contracts)
    return 'Import shared contracts through @justgo/contracts.';
  const mobileTarget = target.startsWith('@justgo/mobile/src/')
    ? target.replace('@justgo/mobile/src/', 'apps/mobile/src/')
    : target;
  const mobileSource = under(file, 'apps/mobile/src');
  const testSource = /\.test\.[jt]sx?$/.test(file);
  if (
    mobileSource &&
    under(mobileTarget, 'apps/mobile/src/dev') &&
    !under(file, 'apps/mobile/src/dev') &&
    file !== 'apps/mobile/src/app/preview.tsx' &&
    !testSource
  )
    return 'Only the guarded preview route may load mobile developer code.';
  if (
    under(file, 'apps/mobile/src/app-support') &&
    under(mobileTarget, 'apps/mobile/src/app') &&
    !testSource
  )
    return 'Mobile app-support code cannot import route implementations.';
  if (
    under(file, 'apps/mobile/src/data') &&
    ['app', 'app-support', 'dev', 'features', 'components', 'theme'].some(
      (folder) => under(mobileTarget, `apps/mobile/src/${folder}`),
    )
  )
    return 'Mobile data code cannot import routes, app-support, developer or UI code.';
  if (
    /^apps\/mobile\/src\/(components|lib|theme|platform)\//.test(file) &&
    ['app', 'app-support', 'dev', 'features', 'data'].some((folder) =>
      under(mobileTarget, `apps/mobile/src/${folder}`),
    )
  )
    return 'Shared mobile code cannot import routes, app-support, developer, feature or data code.';
  return null;
}

// A single rule keeps static imports/re-exports and runtime loaders in agreement.
export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      boundary: '{{message}}',
      literal:
        'Use a literal module path so workspace boundaries can be checked.',
    },
  },
  create(context) {
    function check(node, source) {
      if (!source) return;
      const specifier =
        source.type === 'Literal' && typeof source.value === 'string'
          ? source.value
          : source.type === 'TemplateLiteral' && source.expressions.length === 0
            ? source.quasis[0].value.cooked
            : null;
      if (specifier === null) {
        context.report({ node, messageId: 'literal' });
        return;
      }
      const message = boundaryMessage(context.filename, specifier);
      if (message)
        context.report({ node, messageId: 'boundary', data: { message } });
    }
    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
      CallExpression: (node) => {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require')
          check(node, node.arguments[0]);
      },
      TSExternalModuleReference: (node) => check(node, node.expression),
    };
  },
};
