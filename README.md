# regex-recursion [![npm](https://img.shields.io/npm/v/regex-recursion)](https://www.npmjs.com/package/regex-recursion)

This is an extension for the [`regex`](https://github.com/slevithan/regex) package that adds support for recursive matching up to a specified max depth *N*, where *N* must be between 2 and 100. Generated regexes are native `RegExp` instances, and support all JavaScript regular expression features.

Recursive matching is added to a regex via one of the following:

- `(?R=N)` — Recursively match the entire regex at this position.
- `\g<name&R=N>` — Recursively match the contents of group *name* at this position. The `\g` subroutine must be called *within* the referenced group.

Recursive matching supports named captures/backreferences, and makes them independent per depth level. So e.g. `groups.name` on a match object is the value captured by group `name` at the top level of the recursion stack.

## Install and use

```sh
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

## Examples

### Match an equal number of two different subpatterns

#### Anywhere within a string

```js
// Matches sequences of up to 50 'a' chars followed by the same number of 'b'
rregex`a(?R=50)?b`.exec('test aaaaaabbb')[0];
// → 'aaabbb'
```

#### As the entire string

```js
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

### Match balanced parentheses

```js
// Matches all balanced parentheses up to depth 50
const parens = rregex('g')`\(
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

Here's an alternative that matches the same strings, but adds a nested quantifier. It then uses an atomic group to prevent this nested quantifier from creating the potential for runaway backtracking:

```js
const parens = rregex('g')`\(
  ( (?> [^\(\)]+ ) | (?R=50) )*
\)`;
```

This matches sequences of non-parens in one step with the nested `+` quantifier, and avoids backtracking into these sequences by wrapping it with an atomic group `(?>…)`. Given that what the nested quantifier `+` matches overlaps with what the outer group can match with its `*` quantifier, the atomic group is important here. It avoids runaway backtracking when matching long strings with unbalanced parens.

Atomic groups are provided by the base `regex` package.

### Match palindromes

#### Match palindroms anywhere within a string

```js
const palindromes = rregex('gi')`(?<char>\w) ((?R=15)|\w?) \k<char>`;

'Racecar, ABBA, and redivided'.match(palindromes);
// → ['Racecar', 'ABBA', 'edivide']
```

In this example, the max length of matched palindromes is 31. That's because it sets the max recursion depth to 15 with `(?R=15)`. So, depth 15 × 2 chars (left + right) for each depth level + 1 optional unbalanced char in the center = 31. To match longer palindromes, the max recursion depth can be increased to a max of 100, which would enable matching palindromes up to 201 characters long.

#### Match palindromes as complete words

```js
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
