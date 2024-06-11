# `regex-recursion`

This is an extension for the [`regex`](https://github.com/slevithan/regex) template tag that adds support for recursive patterns up to a specified max depth *N*, where *N* must be 2–100.

You can add recursion to a regex pattern via one of the following:

- `(?R=N)` — Recursively match the entire pattern at this position.
- `\g<name&R=N>` — Recursively match the contents of group *name* at this position. The `\g` subroutine must be used within the referenced group.

Backreferences are unique per depth level, so e.g. the value of `groups.name` on a `RegExp` match array always refers to the value captured by group `name` at the top level of the stack.

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
const re = rregex`
  ^
  (?<balanced>
    a
    # Recursively match just the specified group
    \g<balanced&R=50>?
    b
  )
  $
`;
re.test('aaabbb'); // → true
re.test('aaabb'); // → false
```

Match balanced parentheses:

```js
// Matches all balanced parentheses up to depth 10
const parens = rregex('g')`\(
  ( [^\(\)] | (?R=10) )*
\)`;

'test (balanced ((parens))) ) () ((a)) ((b)'.match(parens);
// → ['(balanced ((parens)))', '()', '((a))', '(b)']
```

Match palindromes:

```js
const palindromes = rregex('gi')`(?<char>\w) ((?R=15)|\w?) \k<char>`;
// Palindrome max length: 31 = 2 chars (left + right) × depth 15 + 1 in center

'Racecar, ABBA, and redivided'.match(palindromes);
// → ['Racecar', 'ABBA', 'edivide']
```

Match palindromes as complete words:

```js
const palindromeWords = rregex('gi')`
  \b
  (?<palindrome>
    (?<char> \w )
    # Recurse, or match a lone unbalanced char in the center
    ( \g<palindrome&R=15> | \w? )
    \k<char>
  )
  \b
`;

'Racecar, ABBA, and redivided'.match(palindromeWords);
// → ['Racecar', 'ABBA']
```

## Sugar free

Template tag `rregex` is sugar for using tag `regex` and applying recursion support via a postprocessor. You can also add recursion support the verbose way:

```js
import {regex} from 'regex';
import {recursion} from 'regex-recursion';

regex({flags: 'g', postprocessors: [recursion]})`a(?R=2)?b`;
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
  // Recommended
  const {rregex} = Regex.ext;
</script>
```
