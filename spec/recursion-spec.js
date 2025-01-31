import {recursion} from '../src/index.js';
import {regex} from 'regex';

const r = String.raw;

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

    it('should handle recursion that contains hidden captures', () => {
      expect(recursion(r`^((a)\g<1&R=2>?b)$`, {
        hiddenCaptures: [2],
      })).toEqual({
        pattern: '^((a)(?:(a)(?:)?b)?b)$',
        captureTransfers: new Map(),
        hiddenCaptures: [2, 3],
      });
      // Atomic groups are handled by Regex+ *after* external plugins like recursion, so this is
      // actually testing Regex+'s ability to preserve and add to hidden captures across plugins
      expect(regex({plugins: [recursion], subclass: true, disable: {n: true}})`^(((?>a))\g<1&R=2>?b)$`.exec('aabb')).toHaveSize(3);
      expect(regex({plugins: [recursion], subclass: true, disable: {n: true}})`^(((?>a)(?>x))\g<1&R=2>?b)$`.exec('axaxbb')).toHaveSize(3);
    });

    // Capture transfer is used by <github.com/slevithan/oniguruma-to-es>
    describe('with capture transfers', () => {
      it('should transfer with global recursion', () => {
        expect(recursion('(a)(?R=2)?(b)', {
          captureTransfers: new Map([[1, [2]]]),
        })).toEqual({
          pattern: '(a)(?:(a)(?:)?(b))?(b)',
          captureTransfers: new Map([[1, [3, 4]]]),
          hiddenCaptures: [2, 3],
        });
      });

      it('should transfer to capture that precedes the recursion', () => {
        expect(recursion(r`()(()(a)()\g<2&R=2>?b)`, {
          captureTransfers: new Map([[1, [4]]]),
          hiddenCaptures: [4],
        })).toEqual({
          pattern: '()(()(a)()(?:()(a)()(?:)?b)?b)',
          captureTransfers: new Map([[1, [4, 7]]]),
          hiddenCaptures: [4, 6, 7, 8],
        });
        expect(recursion(r`()(a\g<2&R=2>?()(b)())`, {
          captureTransfers: new Map([[1, [4]]]),
          hiddenCaptures: [4],
        })).toEqual({
          pattern: '()(a(?:a(?:)?()(b)())?()(b)())',
          captureTransfers: new Map([[1, [4, 7]]]),
          hiddenCaptures: [7, 3, 4, 5], // unsorted
        });
      });

      it('should transfer to capture of the recursed group', () => {
        expect(recursion(r`((a)\g<1&R=2>?(b))`, {
          captureTransfers: new Map([[1, [3]]]),
        })).toEqual({
          pattern: '((a)(?:(a)(?:)?(b))?(b))',
          captureTransfers: new Map([[1, [4, 5]]]),
          hiddenCaptures: [3, 4],
        });
      });

      it('should transfer across multiple recursions', () => {
        // Capture in left contents of recursions
        expect(recursion(r`(?<r>(a)\g<r&R=2>?b) ((a)\g<3&R=2>?b)`, {
          captureTransfers: new Map([[1, [3]], [2, [4]]]),
        })).toEqual({
          pattern: '(?<r>(a)(?:(a)(?:)?b)?b) ((a)(?:(a)(?:)?b)?b)',
          captureTransfers: new Map([[1, [4]], [2, [5, 6]]]),
          hiddenCaptures: [3, 6],
        });
        // Capture in right contents of recursions
        expect(recursion(r`(?<r>a\g<r&R=2>?(b)) (a\g<3&R=2>?(b))`, {
          captureTransfers: new Map([[1, [3]], [2, [4]]]),
        })).toEqual({
          pattern: '(?<r>a(?:a(?:)?(b))?(b)) (a(?:a(?:)?(b))?(b))',
          captureTransfers: new Map([[1, [4]], [3, [5, 6]]]),
          hiddenCaptures: [2, 5],
        });
        // Capture in left and right contents of recursions
        expect(recursion(r`(?<r>(a)\g<r&R=2>?(b)) ((a)\g<4&R=2>?(b))`, {
          captureTransfers: new Map([[1, [4]], [2, [5]], [3, [6]]]),
        })).toEqual({
          pattern: '(?<r>(a)(?:(a)(?:)?(b))?(b)) ((a)(?:(a)(?:)?(b))?(b))',
          captureTransfers: new Map([[1, [6]], [2, [7, 8]], [5, [9, 10]]]),
          hiddenCaptures: [3, 4, 8, 9],
        });
        // Triple recursion with capture transfer to middle (Oniguruma: `\g<a> (?<a>a\g<b>?b) (?<b>c\g<a>?d)`)
        expect(recursion(r`(a(c\g<1&R=2>?d)?b) (?<a>a(c\g<3&R=2>?d)?b) (?<b>c(a\g<5&R=2>?b)?d)`, {
          captureTransfers: new Map([[3, [6]]]),
          hiddenCaptures: [1, 2, 4, 6],
        })).toEqual({
          pattern: '(a(c(?:a(c(?:)?d)?b)?d)?b) (?<a>a(c(?:a(c(?:)?d)?b)?d)?b) (?<b>c(a(?:c(a(?:)?b)?d)?b)?d)',
          captureTransfers: new Map([[4, [8, 9]]]),
          hiddenCaptures: [1, 2, 5, 8, 3, 6, 9], // unsorted
        });
        // Same as above but with depth 3
        expect(recursion(r`(a(c\g<1&R=3>?d)?b) (?<a>a(c\g<3&R=3>?d)?b) (?<b>c(a\g<5&R=3>?b)?d)`, {
          captureTransfers: new Map([[3, [6]]]),
          hiddenCaptures: [1, 2, 4, 6],
        })).toEqual({
          pattern: '(a(c(?:a(c(?:a(c(?:)?d)?b)?d)?b)?d)?b) (?<a>a(c(?:a(c(?:a(c(?:)?d)?b)?d)?b)?d)?b) (?<b>c(a(?:c(a(?:c(a(?:)?b)?d)?b)?d)?b)?d)',
          captureTransfers: new Map([[5, [10, 11, 12]]]),
          hiddenCaptures: [1, 2, 6, 10, 3, 4, 7, 8, 11, 12], // unsorted
        });
      });

      it('should transfer between captures following recursion', () => {
        expect(recursion(r`((2)\g<1&R=2>?) (3) (4)`, {
          captureTransfers: new Map([[3, [4]]]),
        })).toEqual({
          pattern: '((2)(?:(2)(?:)?)?) (3) (4)',
          captureTransfers: new Map([[4, [5]]]),
          hiddenCaptures: [3],
        });
      });
    });
  });
});

describe('readme examples', () => {
  it('should match an equal number of two different subpatterns', () => {
    const re = regex({plugins: [recursion]})`a(?R=20)?b`;
    expect(re.exec('test aaaaaabbb')[0]).toBe('aaabbb');
  });

  it('should match an equal number of two different subpatterns, as the entire string', () => {
    const re = regex({plugins: [recursion]})`
      ^ (?<r> a \g<r&R=20>? b) $
    `;
    expect(re.test('aaabbb')).toBeTrue();
    expect(re.test('aaabb')).toBeFalse();
  });

  it('should match balanced parentheses', () => {
    const parens = regex({flags: 'g', plugins: [recursion]})`
      \( ([^\(\)] | (?R=20))* \)
    `;
    expect('test ) (balanced ((parens))) () ((a)) ( (b)'.match(parens)).toEqual(['(balanced ((parens)))', '()', '((a))', '(b)']);
  });

  it('should match balanced parentheses using an atomic group', () => {
    const parens = regex({flags: 'g', plugins: [recursion]})`
      \( ((?> [^\(\)]+) | (?R=20))* \)
    `;
    expect('test ) (balanced ((parens))) () ((a)) ( (b)'.match(parens)).toEqual(['(balanced ((parens)))', '()', '((a))', '(b)']);
  });

  it('should match balanced parentheses using a possessive quantifier', () => {
    const parens = regex({flags: 'g', plugins: [recursion]})`
      \( ([^\(\)]++ | (?R=20))* \)
    `;
    expect('test ) (balanced ((parens))) () ((a)) ( (b)'.match(parens)).toEqual(['(balanced ((parens)))', '()', '((a))', '(b)']);
  });

  it('should match palindromes', () => {
    const palindromes = regex({flags: 'gi', plugins: [recursion]})`
      (?<char> \w)
      # Recurse, or match a lone unbalanced char in the middle
      ((?R=15) | \w?)
      \k<char>
    `;
    expect('Racecar, ABBA, and redivided'.match(palindromes)).toEqual(['Racecar', 'ABBA', 'edivide']);
  });

  it('should match palindromes as complete words', () => {
    const palindromeWords = regex({flags: 'gi', plugins: [recursion]})`
      \b
      (?<palindrome>
        (?<char> \w )
        # Recurse, or match a lone unbalanced char in the center
        ( \g<palindrome&R=15> | \w? )
        \k<char>
      )
      \b
    `;
    expect('Racecar, ABBA, and redivided'.match(palindromeWords)).toEqual(['Racecar', 'ABBA']);
  });
});
