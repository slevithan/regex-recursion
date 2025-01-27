import {Context, forEachUnescaped, getGroupContents, hasUnescaped, replaceUnescaped} from 'regex-utilities';

const r = String.raw;
const gRToken = r`\\g<(?<gRNameOrNum>[^>&]+)&R=(?<gRDepth>[^>]+)>`;
const recursiveToken = r`\(\?R=(?<rDepth>[^\)]+)\)|${gRToken}`;
const namedCapturingDelim = r`\(\?<(?![=!])(?<captureName>[^>]+)>`;
const token = new RegExp(r`${namedCapturingDelim}|${recursiveToken}|\(\?|\\?.`, 'gsu');
const overlappingRecursionMsg = 'Cannot use multiple overlapping recursions';

/**
@param {string} pattern
@param {{
  flags?: string;
  captureTransfers?: Map<number | string, number>;
  hiddenCaptureNums?: Array<number>;
  mode?: 'plugin' | 'external';
}} [data]
@returns {{
  pattern: string;
  captureTransfers: Map<number | string, number>;
  hiddenCaptureNums: Array<number>;
}}
*/
function recursion(pattern, data) {
  const d = {
    captureTransfers: new Map(),
    hiddenCaptureNums: [],
    mode: 'plugin',
    ...data,
  };
  const {captureTransfers, hiddenCaptureNums} = d;
  // Keep the initial fail-check (which avoids unneeded processing) as fast as possible by testing
  // without the accuracy improvement of using `hasUnescaped` with `Context.DEFAULT`
  if (!(new RegExp(recursiveToken, 'su').test(pattern))) {
    return {
      pattern,
      captureTransfers,
      hiddenCaptureNums,
    };
  }
  if (d.mode === 'plugin' && hasUnescaped(pattern, r`\(\?\(DEFINE\)`, Context.DEFAULT)) {
    throw new Error('DEFINE groups cannot be used with recursion');
  }

  const addedHiddenCaptureNums = [];
  const hasNumberedBackref = hasUnescaped(pattern, r`\\[1-9]`, Context.DEFAULT);
  const groupContentsStartPos = new Map();
  const openGroups = [];
  let hasRecursed = false;
  let numCharClassesOpen = 0;
  let numCapturesPassed = 0;
  let match;
  token.lastIndex = 0;
  while ((match = token.exec(pattern))) {
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
          throw new Error(
            // When used in `external` mode by transpilers other than Regex+, backrefs might have
            // gone through conversion from named to numbered, so avoid a misleading error
            `${d.mode === 'external' ? 'Backrefs' : 'Numbered backrefs'} cannot be used with global recursion`
          );
        }
        const pre = pattern.slice(0, match.index);
        const post = pattern.slice(token.lastIndex);
        if (hasUnescaped(post, recursiveToken, Context.DEFAULT)) {
          throw new Error(overlappingRecursionMsg);
        }
        pattern = makeRecursive(
          pre,
          post,
          +rDepth,
          false,
          captureTransfers,
          hiddenCaptureNums,
          addedHiddenCaptureNums,
          numCapturesPassed
        );
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
          throw new Error(r`Recursive \g cannot be used outside the referenced group "${
            d.mode === 'external' ? gRNameOrNum : r`\g<${gRNameOrNum}&R=${gRDepth}>`
          }"`);
        }
        const startPos = groupContentsStartPos.get(gRNameOrNum);
        const groupContents = getGroupContents(pattern, startPos);
        if (
          hasNumberedBackref &&
          hasUnescaped(groupContents, r`${namedCapturingDelim}|\((?!\?)`, Context.DEFAULT)
        ) {
          throw new Error(
            // When used in `external` mode by transpilers other than Regex+, backrefs might have
            // gone through conversion from named to numbered, so avoid a misleading error
            `${d.mode === 'external' ? 'Backrefs' : 'Numbered backrefs'} cannot be used with recursion of capturing groups`
          );
        }
        const groupContentsPre = pattern.slice(startPos, match.index);
        const groupContentsPost = groupContents.slice(groupContentsPre.length + m.length);
        const expansion = makeRecursive(
          groupContentsPre,
          groupContentsPost,
          +gRDepth,
          true,
          captureTransfers,
          hiddenCaptureNums,
          addedHiddenCaptureNums,
          numCapturesPassed
        );
        const pre = pattern.slice(0, startPos);
        const post = pattern.slice(startPos + groupContents.length);
        // Modify the string we're looping over
        pattern = `${pre}${expansion}${post}`;
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
      } else if (m[0] === '(') {
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

  hiddenCaptureNums.push(...addedHiddenCaptureNums);

  return {
    pattern,
    captureTransfers,
    hiddenCaptureNums,
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
@param {Map<number | string, number>} captureTransfers
@param {Array<number>} hiddenCaptureNums
@param {Array<number>} addedHiddenCaptureNums
@param {number} numCapturesPassed
@returns {string}
*/
function makeRecursive(
  pre,
  post,
  maxDepth,
  isSubpattern,
  captureTransfers,
  hiddenCaptureNums,
  addedHiddenCaptureNums,
  numCapturesPassed
) {
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
    captureTransfers,
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
@param {string} pattern
@param {'forward' | 'backward'} direction
@param {number} reps
@param {Set<string> | null} namesInRecursed
@param {Map<number | string, number>} captureTransfers
@param {Array<number>} hiddenCaptureNums
@param {Array<number>} addedHiddenCaptureNums
@param {number} numCapturesPassed
@returns {string}
*/
function repeatWithDepth(
  pattern,
  direction,
  reps,
  namesInRecursed,
  captureTransfers,
  hiddenCaptureNums,
  addedHiddenCaptureNums,
  numCapturesPassed
) {
  const captureDelim = r`${namedCapturingDelim}|(?<unnamed>\()(?!\?)`;
  if (captureTransfers.size) {
    let numCapturesIn = 0;
    forEachUnescaped(pattern, captureDelim, () => numCapturesIn++, Context.DEFAULT);
    for (let i = 1; i <= numCapturesIn; i++) {
      // Captures already included in `numCapturesPassed` on the forward pass
      const numCapturesPassedPreRecursed = numCapturesPassed - (direction === 'forward' ? numCapturesIn : 0);
      setMapValueIfValueIs(
        captureTransfers,
        numCapturesPassedPreRecursed + i,
        numCapturesPassedPreRecursed + addedHiddenCaptureNums.length + ((reps + 1) * numCapturesIn) - (numCapturesIn - i)
      );
    }
  }

  const startNum = 2;
  const getDepthNum = i => direction === 'forward' ? (i + startNum) : (reps - i + startNum - 1);
  let result = '';
  for (let i = 0; i < reps; i++) {
    const depthNum = getDepthNum(i);
    result += replaceUnescaped(
      pattern,
      r`${captureDelim}|\\k<(?<backref>[^>]+)>`,
      ({0: m, groups: {captureName, unnamed, backref}}) => {
        if (backref && namesInRecursed && !namesInRecursed.has(backref)) {
          // Don't alter backrefs to groups outside the recursed subpattern
          return m;
        }
        const suffix = `_$${depthNum}`;
        if (unnamed || captureName) {
          const addedCaptureNum = numCapturesPassed + addedHiddenCaptureNums.length + 1;
          addedHiddenCaptureNums.push(addedCaptureNum);
          incrementIfAtLeast(hiddenCaptureNums, addedCaptureNum);
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

/**
@param {Map<number | string, number>} map
@param {number} oldValue
@param {number} newValue
*/
function setMapValueIfValueIs(map, oldValue, newValue) {
  map.forEach((value, key) => {
    if (value === oldValue) {
      map.set(key, newValue);
    }
  });
}

export {
  recursion,
};
