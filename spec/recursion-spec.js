import {regex} from 'regex';
import {recursion} from '../src/index.js';

describe('recursion', () => {
  it('should throw for invalid and unsupported recursion depths', () => {
    const values = ['-2', '0', '1', '+2', '2.5', '101', 'a', null];
    for (const value of values) {
      expect(() => regex({plugins: [recursion]})({raw: [`a(?R=${value})?b`]})).toThrow();
      expect(() => regex({plugins: [recursion]})({raw: [`(?<r>a\\g<r&R=${value}>?b)`]})).toThrow();
    }
  });

  it('should allow recursion depths 2-100', () => {
    const values = ['2', '100'];
    for (const value of values) {
      expect(() => regex({plugins: [recursion]})({raw: [`a(?R=${value})?b`]})).not.toThrow();
      expect(() => regex({plugins: [recursion]})({raw: [`(?<r>a\\g<r&R=${value}>?b)`]})).not.toThrow();
    }
  });

  it('should match global recursion', () => {
    expect(regex({plugins: [recursion]})`a(?R=2)?b`.exec('aabb')?.[0]).toBe('aabb');
  });

  it('should match direct recursion', () => {
    expect('aabb').toMatch(regex({plugins: [recursion]})`^(?<r>a\g<r&R=2>?b)$`);
    expect('aab').not.toMatch(regex({plugins: [recursion]})`^(?<r>a\g<r&R=2>?b)$`);
  });

  it('should throw for multiple direct, overlapping recursions', () => {
    expect(() => regex({plugins: [recursion]})`a(?R=2)?(?<r>a\g<r&R=2>?)`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<r>a\g<r&R=2>?\g<r&R=2>?)`).toThrow();
  });

  it('should throw for multiple direct, nonoverlapping recursions', () => {
    // TODO: Has a bug and lets invalid JS syntax through
    expect(() => regex({plugins: [recursion]})`(?<r1>a\g<r1&R=2>?)(?<r2>a\g<r2&R=2>?)`).toThrow();
  });

  it('should throw for indirect recursion', () => {
    expect(() => regex({plugins: [recursion]})`(?<a>(?<b>a\g<a&R=2>?)\g<b&R=2>)`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<a>\g<b&R=2>(?<b>a\g<a&R=2>?))`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<a>\g<b&R=2>)(?<b>a\g<a&R=2>?)`).toThrow();
    expect(() => regex({plugins: [recursion]})`\g<a&R=2>(?<a>\g<b&R=2>)(?<b>a\g<a&R=2>?)`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<a>\g<b&R=2>)(?<b>\g<c&R=2>)(?<c>a\g<a&R=2>?)`).toThrow();
  });

  it('should not adjust named backreferences referring outside of the recursed expression', () => {
    expect('aababbabcc').toMatch(regex({plugins: [recursion]})`^(?<a>a)\k<a>(?<r>(?<b>b)\k<a>\k<b>\k<c>\g<r&R=2>?)(?<c>c)\k<c>$`);
  });

  // Just documenting current behavior; this could be supported in the future
  it('should throw for numbered backreferences in interpolated regexes when using recursion', () => {
    expect(() => regex({plugins: [recursion]})`a(?R=2)?b${/()\1/}`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<n>a|\g<n&R=2>${/()\1/})`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<n>a|\g<n&R=2>)${/()\1/}`).toThrow();
    expect(() => regex({plugins: [recursion]})`${/()\1/}a(?R=2)?b`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<n>${/()\1/}a|\g<n&R=2>)`).toThrow();
    expect(() => regex({plugins: [recursion]})`${/()\1/}(?<n>a|\g<n&R=2>)`).toThrow();
  });

  it('should throw for subroutine definition groups when using recursion', () => {
    expect(() => regex({plugins: [recursion]})`a(?R=2)?b(?(DEFINE))`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<n>a|\g<n&R=2>)(?(DEFINE))`).toThrow();
  });
});

describe('readme examples', () => {
  it('should match an equal number of two different subpatterns', () => {
    expect(regex({plugins: [recursion]})`a(?R=50)?b`.exec('test aaaaaabbb')[0]).toBe('aaabbb');
    expect('aAbb').toMatch(regex({flags: 'i', plugins: [recursion]})`a(?R=2)?b`);
  });

  it('should match an equal number of two different subpatterns, as the entire string', () => {
    const re = regex({plugins: [recursion]})`^
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
    const parens = regex({flags: 'g', plugins: [recursion]})`\(
      ( [^\(\)] | (?R=50) )*
    \)`;
    expect('test ) (balanced ((parens))) () ((a)) ( (b)'.match(parens)).toEqual(['(balanced ((parens)))', '()', '((a))', '(b)']);
  });

  it('should match balanced parentheses using an atomic group', () => {
    const parens = regex({flags: 'g', plugins: [recursion]})`\(
      ( (?> [^\(\)]+ ) | (?R=50) )*
    \)`;
    expect('test ) (balanced ((parens))) () ((a)) ( (b)'.match(parens)).toEqual(['(balanced ((parens)))', '()', '((a))', '(b)']);
  });

  it('should match palindromes', () => {
    const palindromes = regex({flags: 'gi', plugins: [recursion]})`(?<char>\w) ((?R=15)|\w?) \k<char>`;
    expect('Racecar, ABBA, and redivided'.match(palindromes)).toEqual(['Racecar', 'ABBA', 'edivide']);
  });

  it('should match palindromes as complete words', () => {
    const palindromeWords = regex({flags: 'gi', plugins: [recursion]})`\b
      (?<palindrome>
        (?<char> \w )
        # Recurse, or match a lone unbalanced char in the center
        ( \g<palindrome&R=15> | \w? )
        \k<char>
      )
    \b`;
    expect('Racecar, ABBA, and redivided'.match(palindromeWords)).toEqual(['Racecar', 'ABBA']);
  });
});
