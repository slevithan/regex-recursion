import {regex} from 'regex';
import {recursion, rregex} from '../src/index.js';

describe('recursion', () => {
  it('should match an equal number of two different patterns', () => {
    expect(rregex`a(?R=50)?b`.exec('test aaaaaabbb')[0]).toBe('aaabbb');
  });

  it('should match an equal number of two different patterns, as the entire string', () => {
    const re = rregex`^
      (?<balanced>
        a
        # Recursively match just the specified group
        \g<balanced&R=50>?
        b
      )
    $`;
    expect(re.test('aaabbb')).toBeTrue();
    expect(re.test('aaabb')).toBeFalse();
  });

  it('should match balanced parentheses', () => {
    const parens = rregex('g')`\(
      ( [^\(\)] | (?R=50) )*
    \)`;
    expect('test (balanced ((parens))) ) () ((a)) ((b)'.match(parens)).toEqual(['(balanced ((parens)))', '()', '((a))', '(b)']);
  });

  it('should match balanced parentheses using an atomic group', () => {
    const parens = rregex('g')`\(
      ( (?> [^\(\)]+ ) | (?R=50) )*
    \)`;
    expect('test (balanced ((parens))) ) () ((a)) ((b)'.match(parens)).toEqual(['(balanced ((parens)))', '()', '((a))', '(b)']);
  });

  it('should match palindromes', () => {
    const palindromes = rregex('gi')`(?<char>\w) ((?R=15)|\w?) \k<char>`;
    expect('Racecar, ABBA, and redivided'.match(palindromes)).toEqual(['Racecar', 'ABBA', 'edivide']);
  });

  it('should match palindromes as complete words', () => {
    const palindromeWords = rregex('gi')`\b
      (?<palindrome>
        (?<char> \w )
        # Recurse, or match a lone unbalanced char in the center
        ( \g<palindrome&R=15> | \w? )
        \k<char>
      )
    \b`;
    expect('Racecar, ABBA, and redivided'.match(palindromeWords)).toEqual(['Racecar', 'ABBA']);
  });

  it('should allow directly using recursion as a postprocessor with tag regex', () => {
    expect('aAbb').toMatch(regex({flags: 'i', postprocessors: [recursion]})`a(?R=2)?b`);
  });

  // Just documenting current behavior; this could be supported in the future
  it('should not allow numbered backreferences in interpolated regexes when using recursion', () => {
    expect(() => rregex`a(?R=2)?b${/()\1/}`).toThrow();
    expect(() => rregex`(?<n>a|\g<n&R=2>${/()\1/})`).toThrow();
    expect(() => rregex`(?<n>a|\g<n&R=2>)${/()\1/}`).toThrow();
    expect(() => rregex`${/()\1/}a(?R=2)?b`).toThrow();
    expect(() => rregex`(?<n>${/()\1/}a|\g<n&R=2>)`).toThrow();
    expect(() => rregex`${/()\1/}(?<n>a|\g<n&R=2>)`).toThrow();
  });
});
