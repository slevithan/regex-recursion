import {recursion} from '../src/index.js';
import {regex} from 'regex';

describe('recursion', () => {
  it('should allow recursion depths 2-100', () => {
    const values = ['2', '100'];
    for (const value of values) {
      expect(() => regex({plugins: [recursion]})({raw: [`a(?R=${value})?b`]})).not.toThrow();
      expect(() => regex({plugins: [recursion]})({raw: [`(?<r>a\\g<r&R=${value}>?b)`]})).not.toThrow();
    }
  });

  it('should throw for invalid and unsupported recursion depths', () => {
    const values = ['-2', '0', '1', '02', '+2', '2.5', '101', 'a', 'null'];
    for (const value of values) {
      expect(() => regex({plugins: [recursion]})({raw: [`a(?R=${value})?b`]})).toThrow();
      expect(() => regex({plugins: [recursion]})({raw: [`(?<r>a\\g<r&R=${value}>?b)`]})).toThrow();
    }
  });

  // Documenting current behavior
  it('should throw for numbered backrefs if the recursed subpattern contains captures', () => {
    expect(() => regex({plugins: [recursion]})`a(?R=2)?b${/()\1/}`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<n>a|\g<n&R=2>${/()\1/})`).toThrow();
    expect(() => regex({plugins: [recursion]})`${/()\1/}a(?R=2)?b`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<n>${/()\1/}a|\g<n&R=2>)`).toThrow();
  });

  it('should allow numbered backrefs if the recursed subpattern contains no captures', () => {
    expect(() => regex({plugins: [recursion]})`(?<n>a|\g<n&R=2>)${/()\1/}`).not.toThrow();
    expect(() => regex({plugins: [recursion]})`${/()\1/}(?<n>a|\g<n&R=2>)`).not.toThrow();
  });

  it('should throw for subroutine definition groups when using recursion', () => {
    expect(() => regex({plugins: [recursion]})`a(?R=2)?b(?(DEFINE))`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<n>a|\g<n&R=2>)(?(DEFINE))`).toThrow();
  });

  it('should not modify escaped recursion operators', () => {
    expect(() => regex({plugins: [recursion]})`a\(?R=2)?b`).toThrow();
    expect('a\\g<r&R=2>b').toMatch(regex({plugins: [recursion]})`^(?<r>a\\g<r&R=2>?b)$`);
    expect('a\\a\\bb').toMatch(regex({plugins: [recursion]})`^(?<r>a\\\g<r&R=2>?b)$`);
  });

  it('should not modify recursion-like syntax in character classes', () => {
    expect(() => regex({plugins: [recursion]})`a[(?R=2)]b`).toThrow();
    expect(() => regex({plugins: [recursion]})`(?<r>a[\g<r&R=2>]b)`).toThrow();
  });

  describe('global', () => {
    it('should match global recursion', () => {
      expect(regex({plugins: [recursion]})`a(?R=2)?b`.exec('aabb')?.[0]).toBe('aabb');
    });

    it('should throw for overlapping global recursions', () => {
      expect(() => regex({plugins: [recursion]})`a(?R=2)?b(?R=2)?`).toThrow();
      expect(() => regex({plugins: [recursion]})`(a(?R=2)?)(b(?R=2)?)`).toThrow();
    });

    it('should have backrefs refer to their own recursion depth', () => {
      expect(regex({plugins: [recursion]})`(?<w>\w)0(?R=2)?1\k<w>`.exec('a0b01b1a')?.[0]).toBe('a0b01b1a');
      expect(regex({plugins: [recursion]})`(?<w>\w)0(?R=2)?1\k<w>`.test('a0b01a1b')).toBeFalse();
    });
  });

  describe('subpattern by name', () => {
    it('should match direct recursion', () => {
      expect('aabb').toMatch(regex({plugins: [recursion]})`^(?<r>a\g<r&R=2>?b)$`);
      expect('aab').not.toMatch(regex({plugins: [recursion]})`^(?<r>a\g<r&R=2>?b)$`);
    });

    it('should match multiple direct, nonoverlapping recursions', () => {
      expect('aabbcddee').toMatch(regex({plugins: [recursion]})`^(?<a>a\g<a&R=2>?b)c(?<b>d\g<b&R=2>?e)$`);
      expect('aabbcddee').toMatch(regex({plugins: [recursion]})`^(?<r>(?<a>a\g<a&R=2>?b)c(?<b>d\g<b&R=2>?e))$`);
      expect('aabbcddee').toMatch(regex({plugins: [recursion]})`^(?<r>(?<a>a\g<r&R=2>?b))c(?<b>d\g<b&R=2>?e)$`);
    });

    it('should throw for multiple direct, overlapping recursions', () => {
      expect(() => regex({plugins: [recursion]})`a(?R=2)?(?<r>a\g<r&R=2>?)`).toThrow();
      expect(() => regex({plugins: [recursion]})`(?<r>a\g<r&R=2>?\g<r&R=2>?)`).toThrow();
      expect(() => regex({plugins: [recursion]})`(?<a>(?<b>a\g<b&R=2>?)\g<a&R=2>)`).toThrow();
    });

    it('should throw for indirect recursion', () => {
      expect(() => regex({plugins: [recursion]})`(?<a>\g<b&R=2>)(?<b>a\g<a&R=2>?)`).toThrow();
      expect(() => regex({plugins: [recursion]})`\g<a&R=2>(?<a>\g<b&R=2>)(?<b>a\g<a&R=2>?)`).toThrow();
      expect(() => regex({plugins: [recursion]})`(?<a>\g<b&R=2>)(?<b>\g<c&R=2>)(?<c>a\g<a&R=2>?)`).toThrow();
      expect(() => regex({plugins: [recursion]})`(?<a>(?<b>a\g<a&R=2>?)\g<b&R=2>)`).toThrow();
      expect(() => regex({plugins: [recursion]})`(?<a>(?<b>a\g<b&R=2>?)\g<b&R=2>)`).toThrow();
      expect(() => regex({plugins: [recursion]})`(?<a>\g<b&R=2>(?<b>a\g<a&R=2>?))`).toThrow();
    });

    it('should have backrefs refer to their own recursion depth', () => {
      expect(regex({plugins: [recursion]})`<(?<n>(?<w>\w)0\g<n&R=2>?1\k<w>)>`.exec('<a0b01b1a>')?.[0]).toBe('<a0b01b1a>');
      expect(regex({plugins: [recursion]})`<(?<n>(?<w>\w)0\g<n&R=2>?1\k<w>)>`.test('<a0b01a1b>')).toBeFalse();
    });

    it('should not adjust named backrefs referring outside of the recursed subpattern', () => {
      expect('aababbabcc').toMatch(regex({plugins: [recursion]})`^(?<a>a)\k<a>(?<r>(?<b>b)\k<a>\k<b>\k<c>\g<r&R=2>?)(?<c>c)\k<c>$`);
    });

    it('should throw if referencing a non-ancestor group', () => {
      expect(() => regex({plugins: [recursion]})`(?<a>)\g<a&R=2>?`).toThrow();
      expect(() => regex({plugins: [recursion]})`\g<a&R=2>?(?<a>)`).toThrow();
      expect(() => regex({plugins: [recursion]})`(?<a>)(?<b>\g<a&R=2>?)`).toThrow();
      expect(() => regex({plugins: [recursion]})`(?<b>\g<a&R=2>?)(?<a>)`).toThrow();
    });
  });

  describe('subpattern by number', () => {
    it('should match direct recursion', () => {
      expect('aabb').toMatch(regex({plugins: [recursion]})`^(?<r>a\g<1&R=2>?b)$`);
      expect('aab').not.toMatch(regex({plugins: [recursion]})`^(?<r>a\g<1&R=2>?b)$`);
      expect(() => regex({plugins: [recursion]})`^(a\g<1&R=2>?b)$`).toThrow();
      expect('aabb').toMatch(regex({plugins: [recursion], disable: {n: true}})`^(a\g<1&R=2>?b)$`);
      expect('aab').not.toMatch(regex({plugins: [recursion], disable: {n: true}})`^(a\g<1&R=2>?b)$`);
    });

    it('should throw if referencing a non-ancestor group', () => {
      expect(() => regex({plugins: [recursion]})`(?<a>)\g<1&R=2>?`).toThrow();
      expect(() => regex({plugins: [recursion]})`\g<1&R=2>?(?<a>)`).toThrow();
      expect(() => regex({plugins: [recursion]})`(?<a>)(?<b>\g<1&R=2>?)`).toThrow();
      expect(() => regex({plugins: [recursion]})`(?<b>\g<2&R=2>?)(?<a>)`).toThrow();
    });
  });

  describe('subclass option', () => {
    it('should exclude duplicated numbered captures from result subpatterns', () => {
      // Subpattern recursion
      expect(regex({plugins: [recursion], subclass: false, disable: {n: true}})`((a)\g<1&R=2>?)`.exec('aa')).toHaveSize(4);
      expect(regex({plugins: [recursion], subclass: true, disable: {n: true}})`((a)\g<1&R=2>?)`.exec('aa')).toHaveSize(3);
      expect(regex({plugins: [recursion], subclass: true, disable: {n: true}})`((a)\g<1&R=2>?)(b)`.exec('aab')[3]).toBe('b');
      // Global recursion
      expect(regex({plugins: [recursion], subclass: false, disable: {n: true}})`(a)(?R=2)?`.exec('aa')).toHaveSize(3);
      expect(regex({plugins: [recursion], subclass: true, disable: {n: true}})`(a)(?R=2)?`.exec('aa')).toHaveSize(2);
      expect(regex({plugins: [recursion], subclass: true, disable: {n: true}})`(?R=2)?(.)`.exec('ab')[1]).toBe('b');
    });

    it('should exclude duplicated named captures from result subpatterns', () => {
      // Subpattern recursion
      expect(regex({plugins: [recursion], subclass: false})`(?<r>(?<d>a)\g<r&R=2>?)`.exec('aa')).toHaveSize(4);
      expect(regex({plugins: [recursion], subclass: true})`(?<r>(?<d>a)\g<r&R=2>?)`.exec('aa')).toHaveSize(3);
      // Global recursion
      expect(regex({plugins: [recursion], subclass: false})`(?<d>a)(?R=2)?`.exec('aa')).toHaveSize(3);
      expect(regex({plugins: [recursion], subclass: true})`(?<d>a)(?R=2)?`.exec('aa')).toHaveSize(2);
    });

    it('should handle recursion that contains emulation groups', () => {
      expect(recursion(String.raw`^((a)\g<1&R=2>?b)$`, {
        hiddenCaptureNums: [2],
      })).toEqual({
        pattern: '^((a)(?:(a)(?:)?b)?b)$',
        captureTransfers: new Map(),
        hiddenCaptureNums: [2, 3],
      });
      // Atomic groups are handled by Regex+ after external plugins like recursion, so this is
      // actually testing Regex+'s ability to preserve and add to emulation groups between plugins
      expect(regex({plugins: [recursion], subclass: true, disable: {n: true}})`^(((?>a))\g<1&R=2>?b)$`.exec('aabb')).toHaveSize(3);
      expect(regex({plugins: [recursion], subclass: true, disable: {n: true}})`^(((?>a)(?>x))\g<1&R=2>?b)$`.exec('axaxbb')).toHaveSize(3);
    });

    // Capture transfer is used by <github.com/slevithan/oniguruma-to-es>
    it('should handle recursion of emulation groups with capture transfer', () => {
      expect(recursion(String.raw`^()(()(a)()\g<2&R=2>?b)$`, {
        captureTransfers: new Map([[1, 4]]),
        hiddenCaptureNums: [4],
      })).toEqual({
        pattern: '^()(()(a)()(?:()(a)()(?:)?b)?b)$',
        captureTransfers: new Map([[1, 7]]),
        hiddenCaptureNums: [4, 6, 7, 8],
      });
      expect(recursion(String.raw`^()(a\g<2&R=2>?()(b)())$`, {
        captureTransfers: new Map([[1, 4]]),
        hiddenCaptureNums: [4],
      })).toEqual({
        pattern: '^()(a(?:a(?:)?()(b)())?()(b)())$',
        captureTransfers: new Map([[1, 7]]),
        hiddenCaptureNums: [7, 3, 4, 5],
      });
      expect(recursion(String.raw`^((a)\g<1&R=2>?(b))$`, {
        captureTransfers: new Map([[1, 3]]),
      })).toEqual({
        pattern: '^((a)(?:(a)(?:)?(b))?(b))$',
        captureTransfers: new Map([[1, 5]]),
        hiddenCaptureNums: [3, 4],
      });
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
});
