import {regex} from 'regex';
import {Context, hasUnescaped, replaceUnescaped} from 'regex-utilities';

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

export function recursion(pattern) {
  const groupContentsStartPos = {};
  let numCharClassesOpen = 0;
  let match;
  token.lastIndex = 0;
  while (match = token.exec(pattern)) {
    const {0: m, groups: {capturingGroupName, rDepth, gRName, gRDepth}} = match;
    if (m === '[') {
      numCharClassesOpen++;
    } else if (!numCharClassesOpen) {
      if (capturingGroupName) {
        groupContentsStartPos[capturingGroupName] = token.lastIndex;
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
        const outsideOwnGroupMsg = `Recursion via \\g<${gRName}> must be within the referenced group`;
        // Appears before/outside the referenced group
        if (!Object.hasOwn(groupContentsStartPos, gRName)) {
          throw new Error(outsideOwnGroupMsg);
        }
        const recursiveGroupContents = getContentsOfGroup(pattern, groupContentsStartPos[gRName]);
        // Appears after/outside the referenced group
        if (!hasUnescaped(recursiveGroupContents, gRToken, Context.DEFAULT)) {
          throw new Error(outsideOwnGroupMsg)
        }
        const pre = pattern.slice(groupContentsStartPos[gRName], match.index);
        const post = recursiveGroupContents.slice(pre.length + m.length);
        assertNoFollowingRecursion(post);
        return pattern.slice(0, groupContentsStartPos[gRName]) +
          makeRecursive(pre, post, maxDepth) +
          pattern.slice(groupContentsStartPos[gRName] + recursiveGroupContents.length);
      }
    } else if (m === ']') {
      numCharClassesOpen--;
    }
  }
  // No change
  return pattern;
}

const gRToken = String.raw`\\g<(?<gRName>[^>&]+)&R=(?<gRDepth>\d+)>`;
const recursiveToken = String.raw`\(\?R=(?<rDepth>\d+)\)|${gRToken}`;
const token = new RegExp(String.raw`\(\?<(?![=!])(?<capturingGroupName>[^>]+)>|${recursiveToken}|\\?.`, 'gsu');

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

function getContentsOfGroup(pattern, contentsStartPos) {
  const token = /(?<groupStart>\(\?[:=!<>A-Za-z\-])|\\?./gsu;
  token.lastIndex = contentsStartPos;
  let contentsEndPos = pattern.length;
  let numCharClassesOpen = 0;
  // Starting search within an open group, after the group's opening
  let numGroupsOpen = 1;
  let match;
  while (match = token.exec(pattern)) {
    const {0: m, groups: {groupStart}} = match;
    if (m === '[') {
      numCharClassesOpen++;
    } else if (!numCharClassesOpen) {
      if (groupStart) {
        numGroupsOpen++;
      } else if (m === ')') {
        numGroupsOpen--;
        if (!numGroupsOpen) {
          contentsEndPos = match.index;
          break;
        }
      }
    } else if (m === ']') {
      numCharClassesOpen--;
    }
  }
  return pattern.slice(contentsStartPos, contentsEndPos);
}

// Note: Not adjusting numbered backrefs to continue working given the additional capturing groups
// added (if any). This is mostly a non-issue since the implicit flag n from tag `regex` prevents
// unnamed capturing groups and numbered backrefs. However, numbered backrefs can appear in
// interpolated regexes. They could be adjusted with extra effort, by tracking the running number
// of named/unnamed captures added and rewriting each numbered backref encountered along the way
function makeRecursive(pre, post, maxDepth) {
  const reps = maxDepth - 1;
  // Depth 2: 'pre(?:pre(?:)post)post'
  // Depth 3: 'pre(?:pre(?:pre(?:)post)post)post'
  return `${pre}${repeatWithDepth(`(?:${pre}`, reps)}(?:)${repeatWithDepth(`${post})`, reps, 'backward')}${post}`;
}

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
