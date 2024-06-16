# `regex-recursion`

This is an extension for the [`regex`](https://github.com/slevithan/regex) package that adds support for matching recursive patterns up to a specified max depth *N*, where *N* must be 2–100.

Recursive matching is added to a regex pattern via one of the following:

- `(?R=N)` — Recursively match the entire pattern at this position.
- `\g<name&R=N>` — Recursively match the contents of group *name* at this position. The `\g` subroutine must be called within the referenced group.

Recursive matching supports named captures and backreferences, and makes them independent per depth level. So e.g. `groups.name` on a `RegExp` match array is the value captured by group `name` at the top level of the recursion stack.

## Examples

Match an equal number of two different patterns:

```js
import {rregex} from 'regex-recursion';

// Matches sequences of up to 50 'a' chars followed by the same number of 'b'
rregex`a(?R=50)?b`.exec('test aaaaaabbb')[0];
// → 'aaabbb'
```

Match an equal number of two different patterns, as the entire string:

```js
import {rregex} from 'regex-recursion';

const re = rregex`^
  (?<balanced>
    a
    # Recursively match just the specified group
    \g<balanced&R=50>?
    b
  )
$`;
re.test('aaabbb'); // → true
re.test('aaabb'); // → false
```

Match balanced parentheses:

```js
import {rregex} from 'regex-recursion';

// Matches all balanced parentheses up to depth 50
const parens = rregex('g')`\(
  ( [^\(\)] | (?R=50) )*
\)`;

'test (balanced ((parens))) ) () ((a)) ((b)'.match(parens);
// → ['(balanced ((parens)))', '()', '((a))', '(b)']

// Here's an alternative that matches the same strings
const parens = rregex('g')`\(
  ( (?> [^\(\)]+ ) | (?R=50) )*
\)`;
// This matches stretches of non-parens in one step with the `+` quantifier,
// and avoids backtracking into sequences of non-parens using an atomic group
// `(?>…)`. Given the nested quantifier, the atomic group is important to avoid
// runaway backtracking when matching long strings with unbalanced parens.
// Atomic groups are provided by the base `regex` package
```

Match palindromes:

```js
import {rregex} from 'regex-recursion';

const palindromes = rregex('gi')`(?<char>\w) ((?R=15)|\w?) \k<char>`;
// Palindrome max length: 31 = 2 chars (left + right) × depth 15 + 1 in center

'Racecar, ABBA, and redivided'.match(palindromes);
// → ['Racecar', 'ABBA', 'edivide']
```

Match palindromes as complete words:

```js
import {rregex} from 'regex-recursion';

const palindromeWords = rregex('gi')`\b
  (?<palindrome>
    (?<char> \w )
    # Recurse, or match a lone unbalanced char in the center
    ( \g<palindrome&R=15> | \w? )
    \k<char>
  )
\b`;

'Racecar, ABBA, and redivided'.match(palindromeWords);
// → ['Racecar', 'ABBA']
```

## Sugar free

Template tag `rregex` is sugar for using the base `regex` tag and adding recursion support via a postprocessor. You can also add recursion support the verbose way:

```js
import {regex} from 'regex';
import {recursion} from 'regex-recursion';

regex({flags: 'i', postprocessors: [recursion]})`a(?R=2)?b`;
```

## Install and use

```bash
npm install regex-recursion
```

```js
import {rregex} from 'regex-recursion';
```

In browsers:

```html
<script src="https://cdn.jsdelivr.net/npm/regex-recursion/dist/regex-recursion.min.js"></script>
<script>
  const {rregex} = Regex.ext;
</script>
```
