import {regex} from 'regex';
import {Context, getGroupContents, hasUnescaped, replaceUnescaped} from 'regex-utilities';

export function rregex(first, ...values) {
  const plugins = (first?.plugins || []).concat(recursion);
  // Given a template
  if (Array.isArray(first?.raw)) {
    return regex({flags: '', plugins})(first, ...values);
  // Given flags
  } else if ((typeof first === 'string' || first === undefined) && !values.length) {
    return regex({flags: first, plugins});
  // Given an options object
  } else if ({}.toString.call(first) === '[object Object]' && !values.length) {
    return regex({...first, plugins});
  }
  throw new Error(`Unexpected arguments: ${JSON.stringify([first, ...values])}`);
}

const gRToken = String.raw`\\g<(?<gRName>[^>&]+)&R=(?<gRDepth>\d+)>`;
const recursiveToken = String.raw`\(\?R=(?<rDepth>\d+)\)|${gRToken}`;
const namedCapturingDelim = String.raw`\(\?<(?![=!])(?<captureName>[^>]+)>`;
const token = new RegExp(String.raw`${namedCapturingDelim}|${recursiveToken}|\\?.`, 'gsu');

/**
@param {string} expression
@returns {string}
*/
export function recursion(expression) {
  if (!hasUnescaped(expression, recursiveToken, Context.DEFAULT)) {
    return expression;
  }
  if (hasUnescaped(expression, String.raw`\\[1-9]`, Context.DEFAULT)) {
    // TODO: Add support for numbered backrefs by automatically adjusting them when they're
    // duplicated by recursion and refer to a group inside the expression being recursed. To
    // trigger this error, the regex must use recursion and include one of:
    // - An interpolated regex that contains a numbered backref (since other numbered backrefs are
    //   prevented by implicit flag n).
    // - A numbered backref, and flag n is explicitly disabled.
    // Note that `regex`'s extended syntax (atomic groups and sometimes subroutines) can add
    // numbered backrefs. However, those work fine because external plugins run *before* the
    // transpilation of built-in syntax extensions
    throw new Error(`Numbered backreferences cannot be used with recursion`);
  }
  if (hasUnescaped(expression, String.raw`\(\?\(DEFINE\)`, Context.DEFAULT)) {
    throw new Error(`DEFINE groups cannot be used with recursion`);
  }
  const groupContentsStartPos = new Map();
  let numCharClassesOpen = 0;
  let match;
  token.lastIndex = 0;
  while (match = token.exec(expression)) {
    const {0: m, groups: {captureName, rDepth, gRName, gRDepth}} = match;
    if (m === '[') {
      numCharClassesOpen++;
    } else if (!numCharClassesOpen) {

      if (captureName) {
        groupContentsStartPos.set(captureName, token.lastIndex);
      // (?R=N)
      } else if (rDepth) {
        const maxDepth = +rDepth;
        assertMaxInBounds(maxDepth);
        const pre = expression.slice(0, match.index);
        const post = expression.slice(token.lastIndex);
        assertNoFollowingRecursion(post);
        return makeRecursive(pre, post, maxDepth);
      // \g<name&R=N>
      } else if (gRName) {
        const maxDepth = +gRDepth;
        assertMaxInBounds(maxDepth);
        const outsideOwnGroupMsg = `Recursion via \\g<${gRName}&R=${gRDepth}> must be used within the referenced group`;
        // Appears before/outside the referenced group
        if (!groupContentsStartPos.has(gRName)) {
          throw new Error(outsideOwnGroupMsg);
        }
        const startPos = groupContentsStartPos.get(gRName);
        const recursiveGroupContents = getGroupContents(expression, startPos);
        // Appears after/outside the referenced group
        if (!hasUnescaped(recursiveGroupContents, gRToken, Context.DEFAULT)) {
          throw new Error(outsideOwnGroupMsg)
        }
        const pre = expression.slice(startPos, match.index);
        const post = recursiveGroupContents.slice(pre.length + m.length);
        assertNoFollowingRecursion(post);
        return expression.slice(0, startPos) +
          makeRecursive(pre, post, maxDepth) +
          expression.slice(startPos + recursiveGroupContents.length);
      }

    } else if (m === ']') {
      numCharClassesOpen--;
    }
  }
  throw new Error('Unexpected error; recursion was not processed');
}

/**
@param {number} max
*/
function assertMaxInBounds(max) {
  if (max < 2 || max > 100) {
    throw new Error(`Max depth must be between 2 and 100; used ${max}`);
  }
}

function assertNoFollowingRecursion(remainingExpression) {
  if (hasUnescaped(remainingExpression, recursiveToken, Context.DEFAULT)) {
    throw new Error('Recursion can only be used once per regex');
  }
}

/**
@param {string} pre
@param {string} post
@param {number} maxDepth
@returns {string}
*/
function makeRecursive(pre, post, maxDepth) {
  const reps = maxDepth - 1;
  // Depth 2: 'pre(?:pre(?:)post)post'
  // Depth 3: 'pre(?:pre(?:pre(?:)post)post)post'
  return `${pre}${repeatWithDepth(`(?:${pre}`, reps)}(?:)${repeatWithDepth(`${post})`, reps, 'backward')}${post}`;
}

/**
@param {string} expression
@param {number} reps
@param {'forward' | 'backward'} [direction]
@returns {string}
*/
function repeatWithDepth(expression, reps, direction = 'forward') {
  const startNum = 2;
  const depthNum = i => direction === 'backward' ? reps - i + startNum - 1 : i + startNum;
  let result = '';
  for (let i = 0; i < reps; i++) {
    const captureNum = depthNum(i);
    result += replaceUnescaped(
      expression,
      // FIXME: Don't change named backrefs that refer outside of the expression being recursed
      String.raw`${namedCapturingDelim}|\\k<(?<backref>[^>]+)>`,
      ({groups: {captureName, backref}}) => {
        const suffix = `_$${captureNum}`;
        return captureName ? `(?<${captureName}${suffix}>` : `\\k<${backref}${suffix}>`;
      },
      Context.DEFAULT
    );
  }
  return result;
}
