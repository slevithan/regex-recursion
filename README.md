# regex-recursion

[![build status](https://github.com/slevithan/regex-recursion/workflows/CI/badge.svg)](https://github.com/slevithan/regex-recursion/actions)
[![npm](https://img.shields.io/npm/v/regex-recursion)](https://www.npmjs.com/package/regex-recursion)
[![bundle size](https://deno.bundlejs.com/badge?q=regex-recursion&treeshake=[*])](https://bundlejs.com/?q=regex-recursion&treeshake=[*])

This is a plugin for the [`regex`](https://github.com/slevithan/regex) library that adds support for recursive matching up to a specified max depth *N*, where *N* must be between 2 and 100. Generated regexes are native `RegExp` instances, and support all JavaScript regular expression features.

Recursive matching is added to a regex via one of the following:

- `(?R=N)` — Recursively match the entire regex at this position.
- `\g<name&R=N>` — Recursively match the contents of group *name* at this position.
  - The `\g` subroutine must be called *within* the referenced group.

Recursive matching supports named captures/backreferences, and makes them independent per depth level. So e.g. `groups.name` on a match object is the value captured by group `name` at the top level of the recursion stack.

## Install and use

```sh
npm install regex regex-recursion
```

```js
import {regex} from 'regex';
import {recursion} from 'regex-recursion';

const re = regex({plugins: [recursion]})`…`;
```

In browsers (using a global name):

```html
<script src="https://cdn.jsdelivr.net/npm/regex@4.0.0/dist/regex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/regex-recursion@4.0.0/dist/regex-recursion.min.js"></script>
<script>
  const {regex} = Regex;
  const {recursion} = Regex.plugins;

  const re = regex({plugins: [recursion]})`…`;
</script>
```

## Examples

### Match an equal number of two different subpatterns

#### Anywhere within a string

```js
// Matches sequences of up to 50 'a' chars followed by the same number of 'b'
const re = regex({plugins: [recursion]})`a(?R=50)?b`;
re.exec('test aaaaaabbb')[0];
// → 'aaabbb'
```

#### As the entire string

```js
const re = regex({plugins: [recursion]})`^
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

Note the `^` and `$` anchors outside of the recursive subpattern.

### Match balanced parentheses

```js
// Matches all balanced parentheses up to depth 50
const parens = regex({flags: 'g', plugins: [recursion]})`\(
  ( [^\(\)] | (?R=50) )*
\)`;

'test ) (balanced ((parens))) () ((a)) ( (b)'.match(parens);
/* → [
  '(balanced ((parens)))',
  '()',
  '((a))',
  '(b)'
] */
```

Following is an alternative that matches the same strings, but adds a nested quantifier. It then uses an atomic group to prevent this nested quantifier from creating the potential for [catastrophic backtracking](https://www.regular-expressions.info/catastrophic.html).

```js
const parens = regex({flags: 'g', plugins: [recursion]})`\(
  ( (?> [^\(\)]+ ) | (?R=50) )*
\)`;
```

This matches sequences of non-parens in one step with the nested `+` quantifier, and avoids backtracking into these sequences by wrapping it with an atomic group `(?>…)`. Given that what the nested quantifier `+` matches overlaps with what the outer group can match with its `*` quantifier, the atomic group is important here. It avoids exponential backtracking when matching long strings with unbalanced parens.

Atomic groups are provided by the base `regex` library.

### Match palindromes

#### Match palindroms anywhere within a string

```js
const palindromes = regex({flags: 'gi', plugins: [recursion]})`
  (?<char> \w )
  # Recurse, or match a lone unbalanced char in the middle
  ( (?R=15) | \w? )
  \k<char>
`;

'Racecar, ABBA, and redivided'.match(palindromes);
// → ['Racecar', 'ABBA', 'edivide']
```

In the example above, the max length of matched palindromes is 31. That's because it sets the max recursion depth to 15 with `(?R=15)`. So, depth 15 × 2 chars (left + right) for each depth level + 1 optional unbalanced char in the middle = 31. To match longer palindromes, the max recursion depth can be increased to a max of 100, which would enable matching palindromes up to 201 characters long.

#### Match palindromes as complete words

```js
const palindromeWords = regex({flags: 'gi', plugins: [recursion]})`\b
  (?<palindrome>
    (?<char> \w )
    ( \g<palindrome&R=15> | \w? )
    \k<char>
  )
\b`;

'Racecar, ABBA, and redivided'.match(palindromeWords);
// → ['Racecar', 'ABBA']
```

Note the `\b` word boundaries outside of the recursive subpattern.
