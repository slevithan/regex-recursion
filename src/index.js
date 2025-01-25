import {Context, forEachUnescaped, getGroupContents, hasUnescaped, replaceUnescaped} from 'regex-utilities';

const r = String.raw;
const gRToken = r`\\g<(?<gRNameOrNum>[^>&]+)&R=(?<gRDepth>[^>]+)>`;
const recursiveToken = r`\(\?R=(?<rDepth>[^\)]+)\)|${gRToken}`;
const namedCapturingDelim = r`\(\?<(?![=!])(?<captureName>[^>]+)>`;
const token = new RegExp(r`${namedCapturingDelim}|${recursiveToken}|\(\?|\\?.`, 'gsu');
const overlappingRecursionMsg = 'Cannot use multiple overlapping recursions';

/**
@param {string} expression
@param {{
  flags?: string;
  hiddenCaptureNums?: Array<number> | null;
}} [data]
@returns {{
  hiddenCaptureNums: Array<number> | null;
  pattern: string;
}}
*/
function recursion(expression, data) {
  const hiddenCaptureNums = data?.hiddenCaptureNums ?? null;
  // Keep the initial fail-check (which avoids unneeded processing) as fast as possible by testing
  // without the accuracy improvement of using `hasUnescaped` with default `Context`
  if (!(new RegExp(recursiveToken, 'su').test(expression))) {
    return {
      hiddenCaptureNums,
      pattern: expression,
    };
  }
  if (hasUnescaped(expression, r`\(\?\(DEFINE\)`, Context.DEFAULT)) {
    throw new Error('DEFINE groups cannot be used with recursion');
  }

  const addedHiddenCaptureNums = [];
  const hasNumberedBackref = hasUnescaped(expression, r`\\[1-9]`, Context.DEFAULT);
  const groupContentsStartPos = new Map();
  const openGroups = [];
  let hasRecursed = false;
  let numCharClassesOpen = 0;
  let numCapturesPassed = 0;
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
        if (hasRecursed) {
          throw new Error(overlappingRecursionMsg);
        }
        if (hasNumberedBackref) {
          // Could add support for numbered backrefs with extra effort, but it's probably not worth
          // it. To trigger this error, the regex must include recursion and one of the following:
          // - An interpolated regex that contains a numbered backref (since other numbered
          //   backrefs are prevented by implicit flag n).
          // - A numbered backref, when flag n is explicitly disabled.
          // Note that Regex+'s extended syntax (atomic groups and sometimes subroutines) can also
          // add numbered backrefs, but those work fine because external plugins like this one run
          // *before* the transformation of built-in syntax extensions
          throw new Error('Numbered backrefs cannot be used with global recursion');
        }
        const pre = expression.slice(0, match.index);
        const post = expression.slice(token.lastIndex);
        if (hasUnescaped(post, recursiveToken, Context.DEFAULT)) {
          throw new Error(overlappingRecursionMsg);
        }
        expression = makeRecursive(pre, post, +rDepth, false, hiddenCaptureNums, addedHiddenCaptureNums, numCapturesPassed);
        // No need to parse further
        break;
      // `\g<name&R=N>`, `\g<number&R=N>`
      } else if (gRNameOrNum) {
        assertMaxInBounds(gRDepth);
        let isWithinReffedGroup = false;
        for (const g of openGroups) {
          if (g.name === gRNameOrNum || g.num === +gRNameOrNum) {
            isWithinReffedGroup = true;
            if (g.hasRecursedWithin) {
              throw new Error(overlappingRecursionMsg);
            }
            break;
          }
        }
        if (!isWithinReffedGroup) {
          throw new Error(r`Recursive \g cannot be used outside the referenced group "\g<${gRNameOrNum}&R=${gRDepth}>"`);
        }
        const startPos = groupContentsStartPos.get(gRNameOrNum);
        const groupContents = getGroupContents(expression, startPos);
        if (
          hasNumberedBackref &&
          hasUnescaped(groupContents, r`${namedCapturingDelim}|\((?!\?)`, Context.DEFAULT)
        ) {
          throw new Error('Numbered backrefs cannot be used with recursion of capturing groups');
        }
        const groupContentsPre = expression.slice(startPos, match.index);
        const groupContentsPost = groupContents.slice(groupContentsPre.length + m.length);
        const expansion = makeRecursive(
          groupContentsPre,
          groupContentsPost,
          +gRDepth,
          true,
          hiddenCaptureNums,
          addedHiddenCaptureNums,
          numCapturesPassed
        );
        const pre = expression.slice(0, startPos);
        const post = expression.slice(startPos + groupContents.length);
        // Modify the string we're looping over
        expression = `${pre}${expansion}${post}`;
        // Step forward for the next loop iteration
        token.lastIndex += expansion.length - m.length - groupContentsPre.length - groupContentsPost.length;
        openGroups.forEach(g => g.hasRecursedWithin = true);
        hasRecursed = true;
      } else if (captureName) {
        numCapturesPassed++;
        groupContentsStartPos.set(String(numCapturesPassed), token.lastIndex);
        groupContentsStartPos.set(captureName, token.lastIndex);
        openGroups.push({
          num: numCapturesPassed,
          name: captureName,
        });
      } else if (m.startsWith('(')) {
        const isUnnamedCapture = m === '(';
        if (isUnnamedCapture) {
          numCapturesPassed++;
          groupContentsStartPos.set(String(numCapturesPassed), token.lastIndex);
        }
        openGroups.push(isUnnamedCapture ? {num: numCapturesPassed} : {});
      } else if (m === ')') {
        openGroups.pop();
      }

    } else if (m === ']') {
      numCharClassesOpen--;
    }
  }

  if (hiddenCaptureNums) {
    hiddenCaptureNums.push(...addedHiddenCaptureNums);
  }

  return {
    hiddenCaptureNums,
    pattern: expression,
  };
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

/**
@param {string} pre
@param {string} post
@param {number} maxDepth
@param {boolean} isSubpattern
@param {Array<number> | null} hiddenCaptureNums
@param {Array<number>} addedHiddenCaptureNums
@param {number} numCapturesPassed
@returns {string}
*/
function makeRecursive(pre, post, maxDepth, isSubpattern, hiddenCaptureNums, addedHiddenCaptureNums, numCapturesPassed) {
  const namesInRecursed = new Set();
  // Can skip this work if not needed
  if (isSubpattern) {
    forEachUnescaped(pre + post, namedCapturingDelim, ({groups: {captureName}}) => {
      namesInRecursed.add(captureName);
    }, Context.DEFAULT);
  }
  const rest = [
    maxDepth - 1, // reps
    isSubpattern ? namesInRecursed : null, // namesInRecursed
    hiddenCaptureNums,
    addedHiddenCaptureNums,
    numCapturesPassed,
  ];
  // Depth 2: 'pre(?:pre(?:)post)post'
  // Depth 3: 'pre(?:pre(?:pre(?:)post)post)post'
  // Empty group in the middle separates tokens and absorbs a following quantifier if present
  return `${pre}${
    repeatWithDepth(`(?:${pre}`, 'forward', ...rest)
  }(?:)${
    repeatWithDepth(`${post})`, 'backward', ...rest)
  }${post}`;
}

/**
@param {string} expression
@param {'forward' | 'backward'} direction
@param {number} reps
@param {Set<string> | null} namesInRecursed
@param {Array<number> | null} hiddenCaptureNums
@param {Array<number>} addedHiddenCaptureNums
@param {number} numCapturesPassed
@returns {string}
*/
function repeatWithDepth(expression, direction, reps, namesInRecursed, hiddenCaptureNums, addedHiddenCaptureNums, numCapturesPassed) {
  const startNum = 2;
  const getDepthNum = i => direction === 'backward' ? (reps - i + startNum - 1) : (i + startNum);
  let result = '';
  for (let i = 0; i < reps; i++) {
    const depthNum = getDepthNum(i);
    result += replaceUnescaped(
      expression,
      r`${namedCapturingDelim}|\\k<(?<backref>[^>]+)>${hiddenCaptureNums ? r`|(?<unnamed>\()(?!\?)` : ''}`,
      ({0: m, groups: {captureName, backref, unnamed}}) => {
        if (backref && namesInRecursed && !namesInRecursed.has(backref)) {
          // Don't alter backrefs to groups outside the recursed subpattern
          return m;
        }
        const suffix = `_$${depthNum}`;
        if (unnamed || captureName) {
          // The search only allowed matching unnamed capture start delims if using emulation groups
          if (hiddenCaptureNums) {
            const addedCaptureNum = numCapturesPassed + addedHiddenCaptureNums.length + 1;
            addedHiddenCaptureNums.push(addedCaptureNum);
            incrementIfAtLeast(hiddenCaptureNums, addedCaptureNum);
          }
          return unnamed ? m : `(?<${captureName}${suffix}>`;
        }
        return r`\k<${backref}${suffix}>`;
      },
      Context.DEFAULT
    );
  }
  return result;
}

/**
Updates the array in place by incrementing each value greater than or equal to the threshold.
@param {Array<number>} arr
@param {number} threshold
*/
function incrementIfAtLeast(arr, threshold) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] >= threshold) {
      arr[i]++;
    }
  }
}

export {
  recursion,
};
