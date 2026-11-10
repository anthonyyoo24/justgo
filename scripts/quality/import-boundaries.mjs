import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const relative = (filename) =>
  path.relative(root, filename).split(path.sep).join('/');
const under = (value, directory) =>
  value === directory || value.startsWith(`${directory}/`);
const targetOf = (filename, specifier) =>
  specifier.startsWith('./') ||
  specifier.startsWith('../') ||
  path.isAbsolute(specifier)
    ? relative(path.resolve(path.dirname(filename), specifier))
    : specifier.replace(/^@justgo\/api\//, 'apps/api/');
const setsRlsContext = (target) =>
  target.replace(/\.[jt]s$/, '') === 'apps/api/src/db/transaction-context';
const featureData = [
  'activity/progress/progress',
  'activity/progress/useProgressReads',
  'backup/data-backup',
  'backup/journal-backup',
];
const featureDataTypes = [
  'activity/repository',
  'activity/persistence/deck-preferences',
];
const appProvider = 'apps/mobile/src/app-support/providers/AppProvider';
let composedByAppProvider;
const composedBy = () =>
  (composedByAppProvider ??= new Set(
    [
      ...readFileSync(path.join(root, `${appProvider}.tsx`), 'utf8').matchAll(
        /from '(\.{1,2}\/[^']+)'/g,
      ),
    ].map(([, specifier]) =>
      relative(path.resolve(root, path.dirname(appProvider), specifier)),
    ),
  ));
const passedRlsContext =
  'Import setTransactionContext() statically and call it there. Re-exporting, binding, loading at runtime, storing or passing it lets code outside identity set RLS context.';

function boundaryMessage(filename, specifier, kind, typeOnly) {
  const file = relative(filename);
  const target = targetOf(filename, specifier);
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
  const apiOpenApi =
    under(file, 'apps/api') && specifier === '@justgo/contracts/openapi';
  if (
    (under(file, 'apps/mobile') || under(file, 'apps/api')) &&
    contracts &&
    !apiOpenApi
  )
    return 'Import shared contracts through @justgo/contracts.';
  const apiSource = under(file, 'apps/api/src');
  if (apiSource && under(target, 'apps/api/tests'))
    return 'API source cannot import test code from apps/api/tests.';
  if (apiSource && ['module', 'node:module'].includes(specifier))
    return 'Load API modules with import, not createRequire(), so these boundaries stay checkable.';
  if (apiSource && setsRlsContext(target) && kind !== 'ImportDeclaration')
    return passedRlsContext;
  if (
    apiSource &&
    setsRlsContext(target) &&
    !under(file, 'apps/api/src/identity') &&
    file !== 'apps/api/src/access/guest.ts'
  )
    return 'Only identity services set RLS context, after verifying the bearer. Run owner work inside IdentityService.withSession.';
  const mobileTarget = target.startsWith('@justgo/mobile/src/')
    ? target.replace('@justgo/mobile/src/', 'apps/mobile/src/')
    : target;
  const mobileModule = mobileTarget.replace(/\.[jt]sx?$/, '');
  const mobileSource = under(file, 'apps/mobile/src');
  const testSource = /\.test\.[jt]sx?$/.test(file);
  if (
    under(file, 'apps/mobile') &&
    under(target, 'expo-secure-store') &&
    file !== 'apps/mobile/src/platform/auth/auth-storage.ts' &&
    !testSource
  )
    return 'Store managed sessions with createAuthStorage() from apps/mobile/src/platform/auth/auth-storage.ts, which keeps them in their own WHEN_UNLOCKED_THIS_DEVICE_ONLY keychain service.';
  if (
    under(file, 'apps/mobile') &&
    under(target, 'expo-crypto') &&
    kind !== 'ImportDeclaration' &&
    !testSource
  )
    return 'Import expo-crypto statically where you use it, so no-restricted-imports can see which functions you read. Generate secrets with randomSecretHex() from apps/mobile/src/app-support/identity/random-secret.ts.';
  if (
    mobileSource &&
    under(mobileTarget, 'apps/mobile/src/dev') &&
    !under(file, 'apps/mobile/src/dev') &&
    file !== 'apps/mobile/src/app/preview.tsx' &&
    !testSource
  )
    return 'Only the guarded preview route may load mobile developer code.';
  if (
    under(file, 'apps/mobile/src/features') &&
    under(mobileModule, 'apps/mobile/src/data') &&
    !testSource
  ) {
    const module = mobileModule.slice('apps/mobile/src/data/'.length);
    if (
      !featureData.includes(module) &&
      !(typeOnly && featureDataTypes.includes(module))
    )
      return 'Features cannot import data storage, sync or cloud internals, so they cannot save or upload around the data owners. Use AccountRepository or ActivityRuntime.';
  }
  if (
    mobileModule === appProvider &&
    (under(file, 'apps/mobile/src/app-support/providers') ||
      composedBy().has(file.replace(/\.[jt]sx?$/, ''))) &&
    !testSource
  )
    return 'Modules that AppProvider composes cannot import AppProvider, because that creates a module cycle. Pass the runtime as a prop or argument from the composing provider.';
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
      const typeOnly =
        node.importKind === 'type' ||
        node.exportKind === 'type' ||
        (node.specifiers?.length > 0 &&
          node.specifiers.every(
            (item) => item.importKind === 'type' || item.exportKind === 'type',
          ));
      const message = boundaryMessage(
        context.filename,
        specifier,
        node.type,
        typeOnly,
      );
      if (message)
        context.report({ node, messageId: 'boundary', data: { message } });
    }
    const callee = (node) =>
      node.parent.type === 'CallExpression' && node.parent.callee === node;
    // A namespace may call its member directly, as in ns.setTransactionContext().
    const called = (node, namespace) =>
      node.parent.type === 'TSTypeQuery' ||
      callee(node) ||
      (namespace &&
        node.parent.type === 'MemberExpression' &&
        node.parent.object === node &&
        callee(node.parent));
    return {
      ImportDeclaration: (node) => {
        check(node, node.source);
        if (
          !under(relative(context.filename), 'apps/api/src') ||
          !setsRlsContext(targetOf(context.filename, node.source.value))
        )
          return;
        for (const variable of context.sourceCode.getDeclaredVariables(node)) {
          const namespace =
            variable.defs[0]?.node.type === 'ImportNamespaceSpecifier';
          for (const { identifier } of variable.references)
            if (!called(identifier, namespace))
              context.report({
                node: identifier,
                messageId: 'boundary',
                data: { message: passedRlsContext },
              });
        }
      },
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
