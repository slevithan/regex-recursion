# regex-recursion 🪆

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]

This is an official plugin for [Regex+](https://github.com/slevithan/regex) (it can also be used standalone) that adds support for recursive matching up to a specified max depth *N*, where *N* can be between 2 and 100. Generated regexes are native JavaScript `RegExp` instances.

> [!NOTE]
> Regex flavors vary on whether they offer infinite or fixed-depth recursion. For example, recursion in Oniguruma uses a default depth limit of 20.

Recursive matching is added to a regex via the following syntax. The recursion depth limit is provided in place of *N*.

- `(?R=N)` — Recursively match the entire regex at this position.
- `\g<name&R=N>` or `\g<number&R=N>` — Recursively match the contents of the group referenced by name or number at this position. The `\g<…>` subroutine must be *within* the referenced group.

Details:

- Multiple uses of recursion within the same pattern are supported if they're non-overlapping.
- Named captures and backreferences are supported within recursion and are independent per depth level. A match result's `groups.name` property holds the value captured by group `name` at the top level of the recursion stack. Subpatterns `groups.name_$2`, etc. are available for each level of nested subpattern matches.

## 📜 Contents

- [Install and use](#️-install-and-use)
- [Examples](#-examples)
- [Standalone use](#️-standalone-use)

## 🕹️ Install and use

```sh
npm install regex regex-recursion
```

```js
import {regex} from 'regex';
import {recursion} from 'regex-recursion';

const re = regex({plugins: [recursion]})`…`;
```

<details>
  <summary>Using CommonJS require</summary>

```js
const {regex} = require('regex');
const {recursion} = require('regex-recursion-cjs');

const re = regex({plugins: [recursion]})`…`;
```

> **Note:** [*regex-recursion-cjs*](https://www.npmjs.com/package/regex-recursion-cjs) is a third-party CommonJS wrapper for this library. It might not always be up to date with the latest version.
</details>

<details>
  <summary>Using a global name in browsers</summary>

```html
<script src="https://cdn.jsdelivr.net/npm/regex@6.0.1/dist/regex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/regex-recursion@6.0.2/dist/regex-recursion.min.js"></script>
<script>
  const {regex} = Regex;
  const {recursion} = Regex.plugins;

  const re = regex({plugins: [recursion]})`…`;
</script>
```
</details>

## 🪧 Examples

### Match an equal number of two different subpatterns

#### Anywhere within a string

```js
// Matches sequences of up to 20 'a' chars followed by the same number of 'b'
const re = regex({plugins: [recursion]})`a(?R=20)?b`;
re.exec('test aaaaaabbb')[0];
// → 'aaabbb'
```

#### As the entire string

Use `\g<name&R=N>` to recursively match just the specified group.

```js
const re = regex({plugins: [recursion]})`
  ^ (?<r> a \g<r&R=20>? b) $
`;
re.test('aaabbb'); // → true
re.test('aaabb'); // → false
```

### Match balanced parentheses

```js
// Matches all balanced parentheses up to depth 20
const parens = regex({flags: 'g', plugins: [recursion]})`
  \( ([^\(\)] | (?R=20))* \)
`;

'test ) (balanced ((parens))) () ((a)) ( (b)'.match(parens);
/* → [
  '(balanced ((parens)))',
  '()',
  '((a))',
  '(b)'
] */
```

Following is an alternative that matches the same strings, but adds a nested quantifier. It then uses an atomic group to prevent the nested quantifier from creating the potential for [catastrophic backtracking](https://www.regular-expressions.info/catastrophic.html). Since the example above doesn't *need* a nested quantifier, this isn't an improvement but merely an alternative that shows how to deal with the general problem of nested quantifiers that create multiple ways to divide matches of the same strings.

```js
// With an atomic group
const parens = regex({flags: 'g', plugins: [recursion]})`
  \( ((?> [^\(\)]+) | (?R=20))* \)
`;

// Same thing, but with a possessive quantifier
const parens = regex({flags: 'g', plugins: [recursion]})`
  \( ([^\(\)]++ | (?R=20))* \)
`;
```

The first example above matches sequences of non-parentheses in one step with the nested `+` quantifier, and avoids backtracking into these sequences by wrapping it with an atomic group `(?>…)`. Given that what the nested quantifier `+` matches overlaps with what the outer group can match with its `*` quantifier, the atomic group is important here. It avoids exponential backtracking when matching long strings with unbalanced parentheses.

In cases where you're repeating a single token within an atomic group, possessive quantifiers (in this case, `++`) provide syntax sugar for the same behavior.

Atomic groups and possessive quantifiers are [provided](https://github.com/slevithan/regex#atomic-groups) by the base Regex+ library.

### Match palindromes

#### Match palindromes anywhere within a string

```js
const palindromes = regex({flags: 'gi', plugins: [recursion]})`
  (?<char> \w)
  # Recurse, or match a lone unbalanced char in the middle
  ((?R=15) | \w?)
  \k<char>
`;

'Racecar, ABBA, and redivided'.match(palindromes);
// → ['Racecar', 'ABBA', 'edivide']
```

Palindromes are sequences that read the same backwards as forwards. In the example above, the max length of matched palindromes is 31. That's because it sets the max recursion depth to 15 with `(?R=15)`. So, depth 15 × 2 chars (left + right) for each depth level + 1 optional unbalanced char in the middle = 31. To match longer palindromes, the max recursion depth can be increased to a max of 100, which would enable matching palindromes up to 201 characters long.

#### Match palindromes as complete words

```js
const palindromeWords = regex({flags: 'gi', plugins: [recursion]})`
  \b
  (?<palindrome>
    (?<char> \w)
    (\g<palindrome&R=15> | \w?)
    \k<char>
  )
  \b
`;

'Racecar, ABBA, and redivided'.match(palindromeWords);
// → ['Racecar', 'ABBA']
```

## ⛓️‍💥 Standalone use

Following is an example of using this library standalone, without Regex+.

```js
import {recursion} from 'regex-recursion';

// Create a pattern that matches balanced parentheses
const pattern = String.raw`\(([^\(\)]|(?R=20))*\)`;
const processed = recursion(pattern);

// The processed pattern can be used as a standard RegExp
const re = new RegExp(processed.pattern);
re.exec('foo (bar (baz) blah) end')[0];
// → '(bar (baz) blah)'
```

All ES2025 regex syntax is supported, but because the generated pattern is used without Regex+, you can't include Regex+'s extended syntax like insignificant whitespace, atomic groups, possessive quantifiers, and non-recursive subroutines.

## 🏷️ About

Created by [Steven Levithan](https://github.com/slevithan).

### Sponsors and backers

[<img src="https://github.com/brc-dd.png" width="40" height="40">](https://github.com/brc-dd)
[<img src="https://github.com/roboflow.png" width="40" height="40">](https://github.com/roboflow)

### Past sponsors

[<img src="https://github.com/antfu.png" width="40" height="40">](https://github.com/antfu)

If you want to support this project, I'd love your help by contributing improvements, sharing it with others, or [sponsoring](https://github.com/sponsors/slevithan) ongoing development.

© 2024–present. MIT License.

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/regex-recursion?color=78C372
[npm-version-href]: https://npmjs.com/package/regex-recursion
[npm-downloads-src]: https://img.shields.io/npm/dm/regex-recursion?color=78C372
[npm-downloads-href]: https://npmjs.com/package/regex-recursion
[bundle-src]: https://img.shields.io/bundlejs/size/regex-recursion?color=78C372&label=minzip
[bundle-href]: https://bundlejs.com/?q=regex-recursion&treeshake=[*]
