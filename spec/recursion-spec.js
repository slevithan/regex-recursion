import {regex} from 'regex';
import {recursion} from '../src/index.js';

describe('recursion', () => {
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

  it('should not adjust named backreferences referring outside of the recursed expression', () => {
    expect('aababbabcc').toMatch(regex({plugins: [recursion]})`^(?<a>a)\k<a>(?<r>(?<b>b)\k<a>\k<b>\k<c>\g<r&R=2>?)(?<c>c)\k<c>$`);
  });

  // Just documenting current behavior; this could be supported in the future
  it('should not allow numbered backreferences in interpolated regexes when using recursion', () => {
    expect(() => regex({plugins: [recursion]})`a(?R=2)?b${/()\1/}`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<n>a|\g<n&R=2>${/()\1/})`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<n>a|\g<n&R=2>)${/()\1/}`).toThrow();
    expect(() => regex({plugins: [recursion]})`${/()\1/}a(?R=2)?b`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<n>${/()\1/}a|\g<n&R=2>)`).toThrow();
    expect(() => regex({plugins: [recursion]})`${/()\1/}(?<n>a|\g<n&R=2>)`).toThrow();
  });

  it('should not allow subroutine definition groups when using recursion', () => {
    expect(() => regex({plugins: [recursion]})`a(?R=2)?b(?(DEFINE))`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<n>a|\g<n&R=2>)(?(DEFINE))`).toThrow();
  });
});
