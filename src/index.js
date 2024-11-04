import {Context, forEachUnescaped, getGroupContents, hasUnescaped, replaceUnescaped} from 'regex-utilities';

const gRToken = String.raw`\\g<(?<gRName>[^>&]+)&R=(?<gRDepth>[^>]+)>`;
const recursiveToken = String.raw`\(\?R=(?<rDepth>[^\)]+)\)|${gRToken}`;
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
    // Could add support for numbered backrefs with extra effort, but it's probably not worth it.
    // To trigger this error, the regex must include recursion and one of the following:
    // - An interpolated regex that contains a numbered backref (since other numbered backrefs are
    //   prevented by implicit flag n).
    // - A numbered backref, when flag n is explicitly disabled.
    // Note that `regex`'s extended syntax (atomic groups and sometimes subroutines) can also add
    // numbered backrefs, but those work fine because external plugins like this one run *before*
    // the transpilation of built-in syntax extensions.
    // To support numbered backrefs, they would need to be automatically adjusted when they're
    // duplicated by recursion and refer to a group inside the expression being recursed.
    // Additionally, numbered backrefs inside and outside of the recursed expression would need to
    // be adjusted based on any capturing groups added by recursion.
    throw new Error(`Numbered backrefs cannot be used with recursion; use named backref`);
  }
  if (hasUnescaped(expression, String.raw`\(\?\(DEFINE\)`, Context.DEFAULT)) {
    throw new Error(`DEFINE groups cannot be used with recursion`);
  }
  const groupContentsStartPos = new Map();
  let numCharClassesOpen = 0;
  let match;
  token.lastIndex = 0;
  while ((match = token.exec(expression))) {
    const {0: m, groups: {captureName, rDepth, gRName, gRDepth}} = match;
    if (m === '[') {
      numCharClassesOpen++;
    } else if (!numCharClassesOpen) {

      if (captureName) {
        groupContentsStartPos.set(captureName, token.lastIndex);
      // `(?R=N)`
      } else if (rDepth) {
        assertMaxInBounds(rDepth);
        const maxDepth = +rDepth;
        const pre = expression.slice(0, match.index);
        const post = expression.slice(token.lastIndex);
        assertNoFollowingRecursion(post);
        return makeRecursive(pre, post, maxDepth, false);
      // `\g<name&R=N>`
      } else if (gRName) {
        assertMaxInBounds(gRDepth);
        const maxDepth = +gRDepth;
        const outsideOwnGroupMsg = `Recursion via \\g<${gRName}&R=${gRDepth}> must be used within the referenced group`;
        // Appears before (outside) the referenced group
        if (!groupContentsStartPos.has(gRName)) {
          throw new Error(outsideOwnGroupMsg);
        }
        const startPos = groupContentsStartPos.get(gRName);
        const recursiveGroupContents = getGroupContents(expression, startPos);
        // Appears after (outside) the referenced group
        if (!hasUnescaped(recursiveGroupContents, gRToken, Context.DEFAULT)) {
          throw new Error(outsideOwnGroupMsg)
        }
        const pre = expression.slice(startPos, match.index);
        const post = recursiveGroupContents.slice(pre.length + m.length);
        assertNoFollowingRecursion(expression.slice(token.lastIndex));
        return expression.slice(0, startPos) +
          makeRecursive(pre, post, maxDepth, true) +
          expression.slice(startPos + recursiveGroupContents.length);
      }

    } else if (m === ']') {
      numCharClassesOpen--;
    }
  }
  throw new Error('Unexpected error; recursion was not processed');
}

/**
@param {string} max
*/
function assertMaxInBounds(max) {
  const errMsg = `Max depth must be integer between 2 and 100; used ${max}`;
  if (!/^[1-9]\d*$/.test(max)) {
    throw new Error(errMsg);
  }
  max = +max;
  if (max < 2 || max > 100) {
    throw new Error(errMsg);
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
@param {boolean} isSubpattern
@returns {string}
*/
function makeRecursive(pre, post, maxDepth, isSubpattern) {
  const namesInRecursed = new Set();
  // Avoid this work if not needed
  if (isSubpattern) {
    forEachUnescaped(pre + post, namedCapturingDelim, ({groups: {captureName}}) => {
      namesInRecursed.add(captureName);
    }, Context.DEFAULT);
  }
  const reps = maxDepth - 1;
  // Depth 2: 'pre(?:pre(?:)post)post'
  // Depth 3: 'pre(?:pre(?:pre(?:)post)post)post'
  return `${pre}${
    repeatWithDepth(`(?:${pre}`, reps, isSubpattern ? namesInRecursed: null)
  }(?:)${
    repeatWithDepth(`${post})`, reps, isSubpattern ? namesInRecursed: null, 'backward')
  }${post}`;
}

/**
@param {string} expression
@param {number} reps
@param {Set<string> | null} namesInRecursed
@param {'forward' | 'backward'} [direction]
@returns {string}
*/
function repeatWithDepth(expression, reps, namesInRecursed, direction = 'forward') {
  const startNum = 2;
  const depthNum = i => direction === 'backward' ? reps - i + startNum - 1 : i + startNum;
  let result = '';
  for (let i = 0; i < reps; i++) {
    const captureNum = depthNum(i);
    result += replaceUnescaped(
      expression,
      String.raw`${namedCapturingDelim}|\\k<(?<backref>[^>]+)>`,
      ({0: m, groups: {captureName, backref}}) => {
        if (backref && namesInRecursed && !namesInRecursed.has(backref)) {
          return m;
        }
        const suffix = `_$${captureNum}`;
        return captureName ? `(?<${captureName}${suffix}>` : `\\k<${backref}${suffix}>`;
      },
      Context.DEFAULT
    );
  }
  return result;
}
