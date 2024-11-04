import {Context, forEachUnescaped, getGroupContents, hasUnescaped, replaceUnescaped} from 'regex-utilities';

const gRToken = String.raw`\\g<(?<gRNameOrNum>[^>&]+)&R=(?<gRDepth>[^>]+)>`;
const recursiveToken = String.raw`\(\?R=(?<rDepth>[^\)]+)\)|${gRToken}`;
const namedCapturingDelim = String.raw`\(\?<(?![=!])(?<captureName>[^>]+)>`;
const token = new RegExp(String.raw`${namedCapturingDelim}|${recursiveToken}|\\?.`, 'gsu');

/**
@param {string} expression
@returns {string}
*/
export function recursion(expression) {
  // Keep the initial fail-check (which avoids unneeded processing) as fast as possible by testing
  // without the accuracy improvement of using `hasUnescaped` with default `Context`
  if (!(new RegExp(recursiveToken, 'su').test(expression))) {
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
  const openGroups = [];
  let numCharClassesOpen = 0;
  let numCaptures = 0;
  let match;
  token.lastIndex = 0;
  while ((match = token.exec(expression))) {
    const {0: m, groups: {captureName, rDepth, gRNameOrNum, gRDepth}} = match;
    if (m === '[') {
      numCharClassesOpen++;
    } else if (!numCharClassesOpen) {

      // `(?R=N)`
      if (rDepth) {
        assertMaxInBounds(rDepth);
        const pre = expression.slice(0, match.index);
        const post = expression.slice(token.lastIndex);
        assertNoFollowingRecursion(post);
        return makeRecursive(pre, post, +rDepth, false);
      // `\g<name&R=N>`, `\g<N&R=N>`
      } else if (gRNameOrNum) {
        assertMaxInBounds(gRDepth);
        assertNoFollowingRecursion(expression.slice(token.lastIndex));
        if (!openGroups.some(g => g.name === gRNameOrNum || g.num === +gRNameOrNum)) {
          throw new Error(`Recursion via \\g<${gRNameOrNum}&R=${gRDepth}> must be used within the referenced group`);
        }
        const startPos = groupContentsStartPos.get(gRNameOrNum);
        const recursiveGroupContents = getGroupContents(expression, startPos);
        const pre = expression.slice(startPos, match.index);
        const post = recursiveGroupContents.slice(pre.length + m.length);
        return expression.slice(0, startPos) +
          makeRecursive(pre, post, +gRDepth, true) +
          expression.slice(startPos + recursiveGroupContents.length);
      } else if (captureName) {
        numCaptures++;
        groupContentsStartPos.set(String(numCaptures), token.lastIndex);
        groupContentsStartPos.set(captureName, token.lastIndex);
        openGroups.push({
          num: numCaptures,
          name: captureName,
        });
      } else if (m.startsWith('(')) {
        const isUnnamedCapture = m === '(';
        if (isUnnamedCapture) {
          numCaptures++;
          groupContentsStartPos.set(String(numCaptures), token.lastIndex);
        }
        openGroups.push(isUnnamedCapture ? {num: numCaptures} : {});
      } else if (m === ')') {
        openGroups.pop();
      }

    } else if (m === ']') {
      numCharClassesOpen--;
    }
  }

  return expression;
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
    repeatWithDepth(`(?:${pre}`, reps, (isSubpattern ? namesInRecursed : null))
  }(?:)${
    repeatWithDepth(`${post})`, reps, (isSubpattern ? namesInRecursed : null), 'backward')
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
          // Don't alter backrefs to groups outside the recursed subpattern
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
