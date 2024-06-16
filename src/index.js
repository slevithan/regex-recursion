import {regex} from 'regex';
import {Context, getGroupContents, hasUnescaped, replaceUnescaped} from 'regex-utilities';

export function rregex(first, ...values) {
  const postprocessors = (first?.postprocessors || []).concat(recursion);
  // Allow binding to other constructors
  const tag = this instanceof Function ? regex.bind(this) : regex;
  // Given a template
  if (Array.isArray(first?.raw)) {
    return tag({flags: '', postprocessors})(first, ...values);
  // Given flags
  } else if ((typeof first === 'string' || first === undefined) && !values.length) {
    return tag({flags: first, postprocessors});
  // Given an options object
  } else if ({}.toString.call(first) === '[object Object]' && !values.length) {
    return tag({...first, postprocessors});
  }
  throw new Error(`Unexpected arguments: ${JSON.stringify([first, ...values])}`);
}

const gRToken = String.raw`\\g<(?<gRName>[^>&]+)&R=(?<gRDepth>\d+)>`;
const recursiveToken = String.raw`\(\?R=(?<rDepth>\d+)\)|${gRToken}`;
const token = new RegExp(String.raw`\(\?<(?![=!])(?<capturingGroupName>[^>]+)>|${recursiveToken}|\\?.`, 'gsu');

/**
@param {string} pattern
@returns {string}
*/
export function recursion(pattern) {
  if (!hasUnescaped(pattern, recursiveToken, Context.DEFAULT)) {
    return pattern;
  }
  if (hasUnescaped(pattern, String.raw`\\[1-9]`, Context.DEFAULT)) {
    // Could allow this with extra effort but it's probably not worth it. To trigger this, the
    // regex must contain both recursion and an interpolated regex with a numbered backref (since
    // numbered backrefs outside regex interpolation are prevented by implicit flag n). Note that
    // some of `regex`'s built-in features (atomic groups and subroutines) can add numbered
    // backrefs. However, those work fine with recursion because postprocessors from extensions
    // (like `regex-recursion`) run before built-in postprocessors
    throw new Error(`Invalid decimal escape in interpolated regex; cannot be used with recursion`);
  }
  const groupContentsStartPos = new Map();
  let numCharClassesOpen = 0;
  let match;
  token.lastIndex = 0;
  while (match = token.exec(pattern)) {
    const {0: m, groups: {capturingGroupName, rDepth, gRName, gRDepth}} = match;
    if (m === '[') {
      numCharClassesOpen++;
    } else if (!numCharClassesOpen) {

      if (capturingGroupName) {
        groupContentsStartPos.set(capturingGroupName, token.lastIndex);
      // (?R=N)
      } else if (rDepth) {
        const maxDepth = +rDepth;
        assertMaxInBounds(maxDepth);
        const pre = pattern.slice(0, match.index);
        const post = pattern.slice(token.lastIndex);
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
        const recursiveGroupContents = getGroupContents(pattern, startPos);
        // Appears after/outside the referenced group
        if (!hasUnescaped(recursiveGroupContents, gRToken, Context.DEFAULT)) {
          throw new Error(outsideOwnGroupMsg)
        }
        const pre = pattern.slice(startPos, match.index);
        const post = recursiveGroupContents.slice(pre.length + m.length);
        assertNoFollowingRecursion(post);
        return pattern.slice(0, startPos) +
          makeRecursive(pre, post, maxDepth) +
          pattern.slice(startPos + recursiveGroupContents.length);
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

function assertNoFollowingRecursion(remainingPattern) {
  if (hasUnescaped(remainingPattern, recursiveToken, Context.DEFAULT)) {
    throw new Error('Cannot use recursion more than once in a pattern');
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
@param {string} pattern
@param {number} reps
@param {'forward' | 'backward'} [direction]
@returns {string}
 */
function repeatWithDepth(pattern, reps, direction = 'forward') {
  const startNum = 2;
  const depthNum = i => direction === 'backward' ? reps - i + startNum - 1 : i + startNum;
  let result = '';
  for (let i = 0; i < reps; i++) {
    const captureNum = depthNum(i);
    result += replaceUnescaped(
      pattern,
      String.raw`\(\?<(?<captureName>[^>]+)>|\\k<(?<backref>[^>]+)>`,
      ({groups: {captureName, backref}}) => {
        const suffix = `_$${captureNum}`;
        return captureName ? `(?<${captureName}${suffix}>` : `\\k<${backref}${suffix}>`;
      },
      Context.DEFAULT
    );
  }
  return result;
}
